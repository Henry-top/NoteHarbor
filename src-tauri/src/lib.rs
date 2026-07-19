use chrono::{DateTime, Duration, Utc};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tempfile::NamedTempFile;
use uuid::Uuid;
use walkdir::WalkDir;

mod word_files;

use word_files::{
    delete_library_file, import_word_documents, open_library_file, read_docx_preview,
    read_word_document, relink_library_file, rename_library_file, sync_library_file,
};

struct AppState {
    db: Mutex<Connection>,
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
    source_watchers: Mutex<HashMap<String, RecommendedWatcher>>,
    source_debounce: Mutex<HashMap<String, u64>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppError {
    code: String,
    message: String,
}

type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Vault {
    id: String,
    name: String,
    path: String,
    available: bool,
    note_count: i64,
    indexed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteSummary {
    vault_id: String,
    path: String,
    title: String,
    tags: Vec<String>,
    modified_at: String,
    is_favorite: bool,
    is_pinned: bool,
    last_opened: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum LibraryItemKind {
    Markdown,
    Docx,
    Doc,
}

impl LibraryItemKind {
    fn from_word_path(path: &Path) -> Option<Self> {
        match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
            "docx" => Some(Self::Docx),
            "doc" => Some(Self::Doc),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Markdown => "markdown",
            Self::Docx => "docx",
            Self::Doc => "doc",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryItemSummary {
    vault_id: String,
    path: String,
    title: String,
    kind: LibraryItemKind,
    tags: Vec<String>,
    modified_at: String,
    is_favorite: bool,
    is_pinned: bool,
    last_opened: Option<String>,
    source_path: Option<String>,
    size_bytes: u64,
    sync_status: String,
    last_synced_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteDocument {
    #[serde(flatten)]
    summary: NoteSummary,
    kind: LibraryItemKind,
    content: String,
    revision: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchHit {
    vault_id: String,
    path: String,
    title: String,
    snippet: String,
    tags: Vec<String>,
    score: f64,
    kind: LibraryItemKind,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Backlink {
    vault_id: String,
    path: String,
    title: String,
    context: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryEntry {
    id: i64,
    vault_id: String,
    path: String,
    created_at: String,
    byte_size: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileConflict {
    vault_id: String,
    path: String,
    expected_revision: String,
    actual_revision: String,
    disk_content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveResult {
    status: String,
    document: Option<NoteDocument>,
    conflict: Option<FileConflict>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexProgress {
    vault_id: String,
    scanned: usize,
    total: usize,
    finished: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultChanged {
    vault_id: String,
}

#[derive(Debug, Default, Deserialize)]
struct Frontmatter {
    #[serde(default)]
    tags: Vec<String>,
}

#[tauri::command]
fn list_vaults(app: AppHandle, state: State<AppState>) -> AppResult<Vec<Vault>> {
    let vaults = query_vaults(&state)?;
    for vault in &vaults {
        if vault.available {
            let _ = ensure_watcher(&app, &state, vault);
        }
    }
    Ok(vaults)
}

#[tauri::command]
fn register_vault(app: AppHandle, state: State<AppState>, path: String) -> AppResult<Vault> {
    let canonical = fs::canonicalize(&path)
        .map_err(|_| app_error("VAULT_NOT_FOUND", "选择的资料库不存在或无法访问"))?;
    if !canonical.is_dir() {
        return Err(app_error(
            "VAULT_NOT_DIRECTORY",
            "请选择一个文件夹作为资料库",
        ));
    }
    let canonical_string = canonical.to_string_lossy().to_string();
    let name = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("资料库")
        .to_string();

    let existing: Option<String> = state
        .db
        .lock()
        .map_err(lock_error)?
        .query_row(
            "SELECT id FROM vaults WHERE path = ?1",
            [&canonical_string],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    let id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
    {
        let db = state.db.lock().map_err(lock_error)?;
        db.execute(
            "INSERT INTO vaults (id, name, path, indexed_at)
             VALUES (?1, ?2, ?3, NULL)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, path = excluded.path",
            params![id, name, canonical_string],
        )
        .map_err(db_error)?;
    }
    let vault = get_vault(&state, &id)?;
    ensure_watcher(&app, &state, &vault)?;
    Ok(vault)
}

#[tauri::command]
fn remove_vault(state: State<AppState>, vault_id: String) -> AppResult<()> {
    word_files::remove_vault_watchers(&state, &vault_id)?;
    let db = state.db.lock().map_err(lock_error)?;
    db.execute("DELETE FROM notes_fts WHERE vault_id = ?1", [&vault_id])
        .map_err(db_error)?;
    db.execute("DELETE FROM notes WHERE vault_id = ?1", [&vault_id])
        .map_err(db_error)?;
    db.execute("DELETE FROM library_files WHERE vault_id = ?1", [&vault_id])
        .map_err(db_error)?;
    db.execute("DELETE FROM vaults WHERE id = ?1", [&vault_id])
        .map_err(db_error)?;
    drop(db);
    state.watchers.lock().map_err(lock_error)?.remove(&vault_id);
    Ok(())
}

#[tauri::command]
fn scan_vault(
    app: AppHandle,
    state: State<AppState>,
    vault_id: String,
) -> AppResult<Vec<LibraryItemSummary>> {
    let vault = get_vault(&state, &vault_id)?;
    if !vault.available {
        return Err(app_error("VAULT_UNAVAILABLE", "资料库当前不可访问"));
    }
    word_files::reconcile_word_files_for_vault(&app, &state, &vault_id)?;
    let root = PathBuf::from(&vault.path);
    let files: Vec<PathBuf> = WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| entry.into_path())
        .filter(|path| {
            path.extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| {
                    value.eq_ignore_ascii_case("md")
                        || value.eq_ignore_ascii_case("docx")
                        || value.eq_ignore_ascii_case("doc")
                })
        })
        .filter(|path| !is_ignored_path(path, &root))
        .collect();

    let total = files.len();
    let mut found_notes = HashSet::new();
    let mut found_word_files = HashSet::new();
    for (index, path) in files.iter().enumerate() {
        let relative = relative_string(&root, path)?;
        if path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("md"))
        {
            found_notes.insert(relative);
            index_file(&state, &vault_id, &root, path)?;
        } else {
            found_word_files.insert(relative);
            word_files::index_scanned_word_file(&state, &vault_id, &root, path)?;
        }
        if index % 25 == 0 || index + 1 == total {
            let _ = app.emit(
                "index://progress",
                IndexProgress {
                    vault_id: vault_id.clone(),
                    scanned: index + 1,
                    total,
                    finished: index + 1 == total,
                },
            );
        }
    }

    {
        let db = state.db.lock().map_err(lock_error)?;
        let mut statement = db
            .prepare("SELECT path FROM notes WHERE vault_id = ?1")
            .map_err(db_error)?;
        let existing = statement
            .query_map([&vault_id], |row| row.get::<_, String>(0))
            .map_err(db_error)?
            .filter_map(Result::ok)
            .collect::<Vec<_>>();
        drop(statement);
        for path in existing {
            if !found_notes.contains(&path) {
                delete_note_index(&db, &vault_id, &path)?;
            }
        }
        db.execute(
            "UPDATE vaults SET indexed_at = ?1 WHERE id = ?2",
            params![Utc::now().to_rfc3339(), vault_id],
        )
        .map_err(db_error)?;
    }
    word_files::prune_missing_word_files(&state, &vault_id, &found_word_files)?;

    ensure_watcher(&app, &state, &vault)?;
    list_library_items_inner(&state, Some(&vault_id))
}

#[tauri::command]
fn list_notes(state: State<AppState>, vault_id: Option<String>) -> AppResult<Vec<NoteSummary>> {
    list_notes_inner(&state, vault_id.as_deref())
}

#[tauri::command]
fn list_library_items(
    state: State<AppState>,
    vault_id: Option<String>,
) -> AppResult<Vec<LibraryItemSummary>> {
    list_library_items_inner(&state, vault_id.as_deref())
}

#[tauri::command]
fn create_note(state: State<AppState>, vault_id: String, kind: String) -> AppResult<NoteDocument> {
    let vault = get_vault(&state, &vault_id)?;
    let root = PathBuf::from(&vault.path);
    let (directory, base_name) = if kind == "daily" {
        ("Daily", Utc::now().format("%Y-%m-%d").to_string())
    } else {
        ("", "未命名笔记".to_string())
    };
    let folder = if directory.is_empty() {
        root.clone()
    } else {
        root.join(directory)
    };
    fs::create_dir_all(&folder).map_err(io_error)?;

    let mut counter = 0;
    let path = loop {
        let suffix = if counter == 0 {
            String::new()
        } else {
            format!(" {}", counter + 1)
        };
        let candidate = folder.join(format!("{base_name}{suffix}.md"));
        if !candidate.exists() || kind == "daily" {
            break candidate;
        }
        counter += 1;
    };

    if kind == "daily" && path.exists() {
        return read_note_inner(&state, &vault_id, &relative_string(&root, &path)?);
    }
    let now = Utc::now().to_rfc3339();
    let content = format!(
        "---\nid: {}\ncreated: {}\nupdated: {}\ntags: []\n---\n\n",
        Uuid::new_v4(),
        now,
        now
    );
    atomic_write(&path, &content)?;
    index_file(&state, &vault_id, &root, &path)?;
    read_note_inner(&state, &vault_id, &relative_string(&root, &path)?)
}

#[tauri::command]
fn read_note(state: State<AppState>, vault_id: String, path: String) -> AppResult<NoteDocument> {
    {
        let db = state.db.lock().map_err(lock_error)?;
        db.execute(
            "UPDATE notes SET last_opened = ?1 WHERE vault_id = ?2 AND path = ?3",
            params![Utc::now().to_rfc3339(), vault_id, path],
        )
        .map_err(db_error)?;
    }
    read_note_inner(&state, &vault_id, &path)
}

#[tauri::command]
fn save_note(
    state: State<AppState>,
    vault_id: String,
    path: String,
    content: String,
    expected_revision: String,
    force: bool,
) -> AppResult<SaveResult> {
    let vault = get_vault(&state, &vault_id)?;
    let root = PathBuf::from(&vault.path);
    let absolute = safe_note_path(&root, &path)?;
    let disk_content = fs::read_to_string(&absolute).map_err(io_error)?;
    let actual_revision = revision(&disk_content);
    if !force && !expected_revision.is_empty() && actual_revision != expected_revision {
        return Ok(SaveResult {
            status: "conflict".into(),
            document: None,
            conflict: Some(FileConflict {
                vault_id,
                path,
                expected_revision,
                actual_revision,
                disk_content,
            }),
        });
    }
    atomic_write(&absolute, &content)?;
    index_file(&state, &vault_id, &root, &absolute)?;
    Ok(SaveResult {
        status: "saved".into(),
        document: Some(read_note_inner(&state, &vault_id, &path)?),
        conflict: None,
    })
}

#[tauri::command]
fn save_copy(
    state: State<AppState>,
    vault_id: String,
    path: String,
    content: String,
) -> AppResult<NoteDocument> {
    let vault = get_vault(&state, &vault_id)?;
    let root = PathBuf::from(&vault.path);
    let original = safe_note_path(&root, &path)?;
    let parent = original
        .parent()
        .ok_or_else(|| app_error("INVALID_PATH", "笔记路径无效"))?;
    let stem = original
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("笔记");
    let mut counter = 1;
    let copy = loop {
        let suffix = if counter == 1 {
            " - 副本".to_string()
        } else {
            format!(" - 副本 {counter}")
        };
        let candidate = parent.join(format!("{stem}{suffix}.md"));
        if !candidate.exists() {
            break candidate;
        }
        counter += 1;
    };
    atomic_write(&copy, &content)?;
    index_file(&state, &vault_id, &root, &copy)?;
    read_note_inner(&state, &vault_id, &relative_string(&root, &copy)?)
}

#[tauri::command]
fn rename_note(
    state: State<AppState>,
    vault_id: String,
    path: String,
    new_name: String,
) -> AppResult<NoteDocument> {
    let cleaned = sanitize_note_name(&new_name)?;
    let vault = get_vault(&state, &vault_id)?;
    let root = PathBuf::from(&vault.path);
    let old_absolute = safe_note_path(&root, &path)?;
    let parent = old_absolute
        .parent()
        .ok_or_else(|| app_error("INVALID_PATH", "笔记路径无效"))?;
    let new_absolute = parent.join(format!("{cleaned}.md"));
    if new_absolute.exists() {
        return Err(app_error("NOTE_ALREADY_EXISTS", "同名笔记已经存在"));
    }
    let old_title = old_absolute
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let new_title = cleaned.clone();
    let old_relative = relative_string(&root, &old_absolute)?;
    let new_relative = relative_string(&root, &new_absolute)?;

    let all_files: Vec<PathBuf> = WalkDir::new(&root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| entry.into_path())
        .filter(|file| {
            file.extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("md"))
        })
        .collect();

    let mut changes = Vec::new();
    for file in all_files {
        let original = fs::read_to_string(&file).map_err(io_error)?;
        let updated = replace_links(
            &original,
            &file,
            &old_absolute,
            &new_absolute,
            &old_title,
            &new_title,
        );
        if updated != original {
            changes.push((file, original, updated));
        }
    }

    for (file, original, _) in &changes {
        let relative = relative_string(&root, file)?;
        create_snapshot_inner(&state, &vault_id, &relative, original)?;
    }
    fs::rename(&old_absolute, &new_absolute).map_err(io_error)?;

    let mut written: Vec<(PathBuf, String)> = Vec::new();
    for (file, original, updated) in &changes {
        let target = if file == &old_absolute {
            &new_absolute
        } else {
            file
        };
        if let Err(error) = atomic_write(target, updated) {
            for (changed_path, backup) in written.iter().rev() {
                let _ = atomic_write(changed_path, backup);
            }
            let _ = fs::rename(&new_absolute, &old_absolute);
            return Err(error);
        }
        written.push((target.clone(), original.clone()));
    }

    {
        let db = state.db.lock().map_err(lock_error)?;
        delete_note_index(&db, &vault_id, &old_relative)?;
    }
    index_file(&state, &vault_id, &root, &new_absolute)?;
    for (file, _, _) in &changes {
        let target = if file == &old_absolute {
            &new_absolute
        } else {
            file
        };
        index_file(&state, &vault_id, &root, target)?;
    }
    read_note_inner(&state, &vault_id, &new_relative)
}

#[tauri::command]
fn delete_note(state: State<AppState>, vault_id: String, path: String) -> AppResult<()> {
    let vault = get_vault(&state, &vault_id)?;
    let absolute = safe_note_path(Path::new(&vault.path), &path)?;
    trash::delete(&absolute)
        .map_err(|error| app_error("TRASH_FAILED", format!("无法移到废纸篓：{error}")))?;
    let db = state.db.lock().map_err(lock_error)?;
    delete_note_index(&db, &vault_id, &path)
}

#[tauri::command]
fn set_note_flag(
    state: State<AppState>,
    vault_id: String,
    path: String,
    flag: String,
    value: bool,
) -> AppResult<()> {
    let column = match flag.as_str() {
        "favorite" => "favorite",
        "pinned" => "pinned",
        _ => return Err(app_error("INVALID_FLAG", "不支持的笔记标记")),
    };
    let sql = format!("UPDATE notes SET {column} = ?1 WHERE vault_id = ?2 AND path = ?3");
    let changed = state
        .db
        .lock()
        .map_err(lock_error)?
        .execute(&sql, params![value as i64, vault_id, path])
        .map_err(db_error)?;
    if changed == 0 {
        word_files::set_word_flag(&state, &vault_id, &path, column, value)?;
    }
    Ok(())
}

#[tauri::command]
fn search_notes(
    state: State<AppState>,
    query: String,
    vault_ids: Option<Vec<String>>,
) -> AppResult<Vec<SearchHit>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let db = state.db.lock().map_err(lock_error)?;
    let fts_query = query
        .split_whitespace()
        .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ");
    let allowed = vault_ids.unwrap_or_default();
    let mut statement = db
        .prepare(
            "SELECT vault_id, path, title,
                    snippet(notes_fts, 4, '<mark>', '</mark>', ' … ', 18),
                    tags, bm25(notes_fts)
             FROM notes_fts
             WHERE notes_fts MATCH ?1
             ORDER BY bm25(notes_fts)
             LIMIT 100",
        )
        .map_err(db_error)?;
    let mut hits = statement
        .query_map([fts_query], |row| {
            let tags_json: String = row.get(4)?;
            Ok(SearchHit {
                vault_id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                snippet: row.get(3)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                score: row.get::<_, f64>(5)?.abs(),
                kind: LibraryItemKind::Markdown,
            })
        })
        .map_err(db_error)?
        .filter_map(Result::ok)
        .filter(|hit| allowed.is_empty() || allowed.contains(&hit.vault_id))
        .collect::<Vec<_>>();

    if hits.is_empty() {
        let pattern = format!("%{query}%");
        let mut fallback = db
            .prepare(
                "SELECT vault_id, path, title, substr(content, 1, 180), tags
                 FROM notes
                 WHERE title LIKE ?1 OR content LIKE ?1 OR tags LIKE ?1
                 ORDER BY modified_unix DESC
                 LIMIT 100",
            )
            .map_err(db_error)?;
        hits = fallback
            .query_map([pattern], |row| {
                let tags_json: String = row.get(4)?;
                Ok(SearchHit {
                    vault_id: row.get(0)?,
                    path: row.get(1)?,
                    title: row.get(2)?,
                    snippet: strip_frontmatter(&row.get::<_, String>(3)?).replace('\n', " "),
                    tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                    score: 1.0,
                    kind: LibraryItemKind::Markdown,
                })
            })
            .map_err(db_error)?
            .filter_map(Result::ok)
            .filter(|hit| allowed.is_empty() || allowed.contains(&hit.vault_id))
            .collect();
    }
    drop(statement);
    drop(db);
    hits.extend(word_files::search_word_items(&state, query, &allowed)?);
    let normalized_query = query.to_lowercase();
    hits.sort_by(|left, right| {
        let left_title = left.title.to_lowercase();
        let right_title = right.title.to_lowercase();
        let rank = |title: &str, kind: LibraryItemKind| {
            (
                title == normalized_query,
                title.starts_with(&normalized_query),
                title.contains(&normalized_query),
                kind != LibraryItemKind::Markdown,
            )
        };
        rank(&right_title, right.kind)
            .cmp(&rank(&left_title, left.kind))
            .then_with(|| {
                left.score
                    .partial_cmp(&right.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });
    hits.truncate(100);
    Ok(hits)
}

#[tauri::command]
fn get_backlinks(
    state: State<AppState>,
    vault_id: String,
    path: String,
) -> AppResult<Vec<Backlink>> {
    let title = Path::new(&path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let wiki_pattern = format!("[[{title}");
    let file_pattern = format!("{title}.md");
    let db = state.db.lock().map_err(lock_error)?;
    let mut statement = db
        .prepare(
            "SELECT path, title, content FROM notes
             WHERE vault_id = ?1 AND path <> ?2 AND (content LIKE ?3 OR content LIKE ?4)
             ORDER BY modified_unix DESC",
        )
        .map_err(db_error)?;
    let rows = statement
        .query_map(
            params![
                vault_id,
                path,
                format!("%{wiki_pattern}%"),
                format!("%{file_pattern}%")
            ],
            |row| {
                let source_path: String = row.get(0)?;
                let source_title: String = row.get(1)?;
                let content: String = row.get(2)?;
                Ok((source_path, source_title, content))
            },
        )
        .map_err(db_error)?;
    Ok(rows
        .filter_map(Result::ok)
        .map(|(source_path, source_title, content)| Backlink {
            vault_id: vault_id.clone(),
            path: source_path,
            title: source_title,
            context: link_context(&content, title),
        })
        .collect())
}

#[tauri::command]
fn import_attachment(
    state: State<AppState>,
    vault_id: String,
    original_name: String,
    bytes: Vec<u8>,
) -> AppResult<String> {
    if bytes.len() > 100 * 1024 * 1024 {
        return Err(app_error("ATTACHMENT_TOO_LARGE", "附件不能超过 100MB"));
    }
    let vault = get_vault(&state, &vault_id)?;
    let assets = Path::new(&vault.path).join("assets");
    fs::create_dir_all(&assets).map_err(io_error)?;
    let extension = Path::new(&original_name)
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| {
            value
                .chars()
                .all(|character| character.is_ascii_alphanumeric())
        })
        .unwrap_or("bin")
        .to_lowercase();
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let short_id = &Uuid::new_v4().simple().to_string()[..8];
    let file_name = format!("{timestamp}-{short_id}.{extension}");
    let target = assets.join(&file_name);
    let mut file = fs::File::create(&target).map_err(io_error)?;
    file.write_all(&bytes).map_err(io_error)?;
    file.sync_all().map_err(io_error)?;
    Ok(format!("assets/{file_name}"))
}

#[tauri::command]
fn create_history_snapshot(
    state: State<AppState>,
    vault_id: String,
    path: String,
    content: String,
) -> AppResult<()> {
    create_snapshot_inner(&state, &vault_id, &path, &content)
}

#[tauri::command]
fn list_history(
    state: State<AppState>,
    vault_id: String,
    path: String,
) -> AppResult<Vec<HistoryEntry>> {
    let db = state.db.lock().map_err(lock_error)?;
    let mut statement = db
        .prepare(
            "SELECT id, created_at, byte_size FROM history
             WHERE vault_id = ?1 AND path = ?2
             ORDER BY created_unix DESC LIMIT 50",
        )
        .map_err(db_error)?;
    let entries = statement
        .query_map(params![vault_id, path], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                vault_id: vault_id.clone(),
                path: path.clone(),
                created_at: row.get(1)?,
                byte_size: row.get(2)?,
            })
        })
        .map_err(db_error)?
        .filter_map(Result::ok)
        .collect();
    Ok(entries)
}

#[tauri::command]
fn restore_history(state: State<AppState>, history_id: i64) -> AppResult<NoteDocument> {
    let (vault_id, path, content): (String, String, String) = state
        .db
        .lock()
        .map_err(lock_error)?
        .query_row(
            "SELECT vault_id, path, content FROM history WHERE id = ?1",
            [history_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| app_error("HISTORY_NOT_FOUND", "历史版本不存在"))?;
    let vault = get_vault(&state, &vault_id)?;
    let root = PathBuf::from(&vault.path);
    let absolute = safe_note_path(&root, &path)?;
    let current = fs::read_to_string(&absolute).map_err(io_error)?;
    create_snapshot_inner(&state, &vault_id, &path, &current)?;
    atomic_write(&absolute, &content)?;
    index_file(&state, &vault_id, &root, &absolute)?;
    read_note_inner(&state, &vault_id, &path)
}

fn init_database(path: &Path) -> AppResult<Connection> {
    let db = Connection::open(path).map_err(db_error)?;
    db.pragma_update(None, "journal_mode", "WAL")
        .map_err(db_error)?;
    db.pragma_update(None, "foreign_keys", "ON")
        .map_err(db_error)?;
    db.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS vaults (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL UNIQUE,
          indexed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS notes (
          vault_id TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          content TEXT NOT NULL,
          revision TEXT NOT NULL,
          modified_at TEXT NOT NULL,
          modified_unix INTEGER NOT NULL,
          favorite INTEGER NOT NULL DEFAULT 0,
          pinned INTEGER NOT NULL DEFAULT 0,
          last_opened TEXT,
          PRIMARY KEY (vault_id, path),
          FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
          note_key UNINDEXED,
          vault_id UNINDEXED,
          path UNINDEXED,
          title,
          content,
          tags,
          tokenize = 'trigram'
        );
        CREATE TABLE IF NOT EXISTS history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vault_id TEXT NOT NULL,
          path TEXT NOT NULL,
          content TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          created_unix INTEGER NOT NULL,
          byte_size INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notes_modified ON notes(modified_unix DESC);
        CREATE INDEX IF NOT EXISTS idx_history_note ON history(vault_id, path, created_unix DESC);
        ",
    )
    .map_err(db_error)?;
    word_files::init_library_files_schema(&db)?;
    Ok(db)
}

fn query_vaults(state: &AppState) -> AppResult<Vec<Vault>> {
    let db = state.db.lock().map_err(lock_error)?;
    let mut statement = db
        .prepare(
            "SELECT v.id, v.name, v.path, v.indexed_at,
                    (SELECT COUNT(*) FROM notes n WHERE n.vault_id = v.id)
                    + (SELECT COUNT(*) FROM library_files f WHERE f.vault_id = v.id)
             FROM vaults v
             ORDER BY v.rowid",
        )
        .map_err(db_error)?;
    let vaults = statement
        .query_map([], |row| {
            let path: String = row.get(2)?;
            Ok(Vault {
                id: row.get(0)?,
                name: row.get(1)?,
                available: Path::new(&path).is_dir(),
                path,
                indexed_at: row.get(3)?,
                note_count: row.get(4)?,
            })
        })
        .map_err(db_error)?
        .filter_map(Result::ok)
        .collect();
    Ok(vaults)
}

fn get_vault(state: &AppState, id: &str) -> AppResult<Vault> {
    let db = state.db.lock().map_err(lock_error)?;
    db.query_row(
        "SELECT v.id, v.name, v.path, v.indexed_at,
                (SELECT COUNT(*) FROM notes n WHERE n.vault_id = v.id)
                + (SELECT COUNT(*) FROM library_files f WHERE f.vault_id = v.id)
         FROM vaults v WHERE v.id = ?1",
        [id],
        |row| {
            let path: String = row.get(2)?;
            Ok(Vault {
                id: row.get(0)?,
                name: row.get(1)?,
                available: Path::new(&path).is_dir(),
                path,
                indexed_at: row.get(3)?,
                note_count: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| app_error("VAULT_NOT_FOUND", "资料库不存在"))
}

fn list_notes_inner(state: &AppState, vault_id: Option<&str>) -> AppResult<Vec<NoteSummary>> {
    let db = state.db.lock().map_err(lock_error)?;
    let (sql, parameter): (&str, Option<&str>) = if vault_id.is_some() {
        (
            "SELECT vault_id, path, title, tags, modified_at, favorite, pinned, last_opened
             FROM notes WHERE vault_id = ?1
             ORDER BY pinned DESC, modified_unix DESC",
            vault_id,
        )
    } else {
        (
            "SELECT vault_id, path, title, tags, modified_at, favorite, pinned, last_opened
             FROM notes
             ORDER BY pinned DESC, modified_unix DESC",
            None,
        )
    };
    let mut statement = db.prepare(sql).map_err(db_error)?;
    let mapper = |row: &rusqlite::Row<'_>| -> rusqlite::Result<NoteSummary> {
        let tags: String = row.get(3)?;
        Ok(NoteSummary {
            vault_id: row.get(0)?,
            path: row.get(1)?,
            title: row.get(2)?,
            tags: serde_json::from_str(&tags).unwrap_or_default(),
            modified_at: row.get(4)?,
            is_favorite: row.get::<_, i64>(5)? != 0,
            is_pinned: row.get::<_, i64>(6)? != 0,
            last_opened: row.get(7)?,
        })
    };
    let notes = if let Some(id) = parameter {
        statement
            .query_map([id], mapper)
            .map_err(db_error)?
            .filter_map(Result::ok)
            .collect()
    } else {
        statement
            .query_map([], mapper)
            .map_err(db_error)?
            .filter_map(Result::ok)
            .collect()
    };
    Ok(notes)
}

fn list_library_items_inner(
    state: &AppState,
    vault_id: Option<&str>,
) -> AppResult<Vec<LibraryItemSummary>> {
    let vault_roots = query_vaults(state)?
        .into_iter()
        .map(|vault| (vault.id, PathBuf::from(vault.path)))
        .collect::<HashMap<_, _>>();
    let mut items = list_notes_inner(state, vault_id)?
        .into_iter()
        .map(|note| {
            let size_bytes = vault_roots
                .get(&note.vault_id)
                .and_then(|root| fs::metadata(root.join(&note.path)).ok())
                .map(|metadata| metadata.len())
                .unwrap_or(0);
            LibraryItemSummary {
                vault_id: note.vault_id,
                path: note.path,
                title: note.title,
                kind: LibraryItemKind::Markdown,
                tags: note.tags,
                modified_at: note.modified_at,
                is_favorite: note.is_favorite,
                is_pinned: note.is_pinned,
                last_opened: note.last_opened,
                source_path: None,
                size_bytes,
                sync_status: "unlinked".into(),
                last_synced_at: None,
            }
        })
        .collect::<Vec<_>>();
    items.extend(word_files::list_word_items_inner(state, vault_id)?);
    items.sort_by(|left, right| {
        right
            .is_pinned
            .cmp(&left.is_pinned)
            .then_with(|| right.modified_at.cmp(&left.modified_at))
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(items)
}

fn read_note_inner(state: &AppState, vault_id: &str, path: &str) -> AppResult<NoteDocument> {
    let vault = get_vault(state, vault_id)?;
    let absolute = safe_note_path(Path::new(&vault.path), path)?;
    let content = fs::read_to_string(&absolute).map_err(io_error)?;
    let metadata = fs::metadata(&absolute).map_err(io_error)?;
    let tags = parse_frontmatter(&content).tags;
    let flags: Option<(i64, i64, Option<String>)> = state
        .db
        .lock()
        .map_err(lock_error)?
        .query_row(
            "SELECT favorite, pinned, last_opened FROM notes WHERE vault_id = ?1 AND path = ?2",
            params![vault_id, path],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(db_error)?;
    let (favorite, pinned, last_opened) = flags.unwrap_or((0, 0, None));
    Ok(NoteDocument {
        summary: NoteSummary {
            vault_id: vault_id.to_string(),
            path: path.to_string(),
            title: title_from_path(Path::new(path)),
            tags,
            modified_at: modified_iso(&metadata),
            is_favorite: favorite != 0,
            is_pinned: pinned != 0,
            last_opened,
        },
        kind: LibraryItemKind::Markdown,
        revision: revision(&content),
        content,
    })
}

fn index_file(state: &AppState, vault_id: &str, root: &Path, path: &Path) -> AppResult<()> {
    let content = fs::read_to_string(path).map_err(io_error)?;
    let relative = relative_string(root, path)?;
    let title = title_from_path(path);
    let metadata = fs::metadata(path).map_err(io_error)?;
    let modified_unix = modified_unix(&metadata);
    let modified_at = modified_iso(&metadata);
    let tags = parse_frontmatter(&content).tags;
    let searchable_content = strip_frontmatter(&content);
    let tags_json = serde_json::to_string(&tags)
        .map_err(|error| app_error("SERIALIZE_FAILED", error.to_string()))?;
    let hash = revision(&content);
    let key = format!("{vault_id}:{relative}");
    let db = state.db.lock().map_err(lock_error)?;
    db.execute(
        "INSERT INTO notes (
           vault_id, path, title, tags, content, revision, modified_at, modified_unix, favorite, pinned, last_opened
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 0, NULL)
         ON CONFLICT(vault_id, path) DO UPDATE SET
           title = excluded.title,
           tags = excluded.tags,
           content = excluded.content,
           revision = excluded.revision,
           modified_at = excluded.modified_at,
           modified_unix = excluded.modified_unix",
        params![vault_id, relative, title, tags_json, content, hash, modified_at, modified_unix],
    )
    .map_err(db_error)?;
    db.execute("DELETE FROM notes_fts WHERE note_key = ?1", [&key])
        .map_err(db_error)?;
    db.execute(
        "INSERT INTO notes_fts (note_key, vault_id, path, title, content, tags)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            key,
            vault_id,
            relative,
            title,
            searchable_content,
            tags_json
        ],
    )
    .map_err(db_error)?;
    Ok(())
}

fn delete_note_index(db: &Connection, vault_id: &str, path: &str) -> AppResult<()> {
    let key = format!("{vault_id}:{path}");
    db.execute("DELETE FROM notes_fts WHERE note_key = ?1", [&key])
        .map_err(db_error)?;
    db.execute(
        "DELETE FROM notes WHERE vault_id = ?1 AND path = ?2",
        params![vault_id, path],
    )
    .map_err(db_error)?;
    Ok(())
}

fn ensure_watcher(app: &AppHandle, state: &State<AppState>, vault: &Vault) -> AppResult<()> {
    let mut watchers = state.watchers.lock().map_err(lock_error)?;
    if watchers.contains_key(&vault.id) {
        return Ok(());
    }
    let app_handle = app.clone();
    let vault_id = vault.id.clone();
    let callback_vault_id = vault_id.clone();
    let callback_root = PathBuf::from(&vault.path);
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else {
            return;
        };
        let state = app_handle.state::<AppState>();
        for path in &event.paths {
            let _ = index_changed_vault_path(&state, &callback_vault_id, &callback_root, path);
        }
        let _ = app_handle.emit(
            "vault://changed",
            VaultChanged {
                vault_id: callback_vault_id.clone(),
            },
        );
    })
    .map_err(|error| app_error("WATCHER_FAILED", format!("无法监听资料库：{error}")))?;
    watcher
        .watch(Path::new(&vault.path), RecursiveMode::Recursive)
        .map_err(|error| app_error("WATCHER_FAILED", format!("无法监听资料库：{error}")))?;
    watchers.insert(vault_id, watcher);
    Ok(())
}

fn index_changed_vault_path(
    state: &AppState,
    vault_id: &str,
    root: &Path,
    path: &Path,
) -> AppResult<()> {
    if path.strip_prefix(root).is_err() || is_ignored_path(path, root) {
        return Ok(());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case("md")
        && !extension.eq_ignore_ascii_case("docx")
        && !extension.eq_ignore_ascii_case("doc")
    {
        return Ok(());
    }
    if path.is_file() {
        if extension.eq_ignore_ascii_case("md") {
            index_file(state, vault_id, root, path)
        } else {
            word_files::index_scanned_word_file(state, vault_id, root, path)
        }
    } else {
        let relative = relative_string(root, path)?;
        if extension.eq_ignore_ascii_case("md") {
            let db = state.db.lock().map_err(lock_error)?;
            delete_note_index(&db, vault_id, &relative)
        } else {
            word_files::remove_scanned_word_path(state, vault_id, &relative)
        }
    }
}

fn create_snapshot_inner(
    state: &AppState,
    vault_id: &str,
    path: &str,
    content: &str,
) -> AppResult<()> {
    let hash = revision(content);
    let now = Utc::now();
    let mut db = state.db.lock().map_err(lock_error)?;
    let latest: Option<String> = db
        .query_row(
            "SELECT content_hash FROM history
             WHERE vault_id = ?1 AND path = ?2
             ORDER BY created_unix DESC LIMIT 1",
            params![vault_id, path],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    if latest.as_deref() == Some(&hash) {
        return Ok(());
    }
    let transaction = db.transaction().map_err(db_error)?;
    transaction
        .execute(
            "INSERT INTO history (
               vault_id, path, content, content_hash, created_at, created_unix, byte_size
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                vault_id,
                path,
                content,
                hash,
                now.to_rfc3339(),
                now.timestamp(),
                content.len() as i64
            ],
        )
        .map_err(db_error)?;
    transaction
        .execute(
            "DELETE FROM history
             WHERE id IN (
               SELECT id FROM history
               WHERE vault_id = ?1 AND path = ?2
               ORDER BY created_unix DESC LIMIT -1 OFFSET 50
             )",
            params![vault_id, path],
        )
        .map_err(db_error)?;
    transaction
        .execute(
            "DELETE FROM history WHERE created_unix < ?1",
            [now.checked_sub_signed(Duration::days(30))
                .unwrap_or(now)
                .timestamp()],
        )
        .map_err(db_error)?;
    let total: i64 = transaction
        .query_row(
            "SELECT COALESCE(SUM(byte_size), 0) FROM history",
            [],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if total > 1024 * 1024 * 1024 {
        let excess = total - 1024 * 1024 * 1024;
        transaction
            .execute(
                "DELETE FROM history WHERE id IN (
                   SELECT id FROM history ORDER BY created_unix ASC
                   LIMIT (
                     SELECT COUNT(*) FROM (
                       SELECT id, SUM(byte_size) OVER (ORDER BY created_unix ASC) running
                       FROM history
                     ) WHERE running <= ?1
                   )
                 )",
                [excess],
            )
            .map_err(db_error)?;
    }
    transaction.commit().map_err(db_error)?;
    Ok(())
}

fn replace_links(
    content: &str,
    source_file: &Path,
    old_target: &Path,
    new_target: &Path,
    old_title: &str,
    new_title: &str,
) -> String {
    let wiki = Regex::new(&format!(
        r"\[\[{}(?P<tail>\||\]\])",
        regex::escape(old_title)
    ))
    .ok();
    let mut updated = wiki
        .map(|pattern| {
            pattern
                .replace_all(content, format!("[[{new_title}$tail"))
                .to_string()
        })
        .unwrap_or_else(|| content.to_string());
    if let Some(parent) = source_file.parent() {
        if let (Some(old_relative), Some(new_relative)) = (
            pathdiff::diff_paths(old_target, parent),
            pathdiff::diff_paths(new_target, parent),
        ) {
            let old_link = old_relative.to_string_lossy().replace('\\', "/");
            let new_link = new_relative.to_string_lossy().replace('\\', "/");
            updated = updated.replace(&format!("]({old_link})"), &format!("]({new_link})"));
            updated = updated.replace(
                &format!("]({})", old_link.replace(' ', "%20")),
                &format!("]({})", new_link.replace(' ', "%20")),
            );
        }
    }
    updated
}

fn parse_frontmatter(content: &str) -> Frontmatter {
    let normalized = content.replace("\r\n", "\n");
    if !normalized.starts_with("---\n") {
        return Frontmatter::default();
    }
    let Some(end) = normalized[4..].find("\n---\n") else {
        return Frontmatter::default();
    };
    serde_yaml::from_str(&normalized[4..4 + end]).unwrap_or_default()
}

fn strip_frontmatter(content: &str) -> &str {
    if !content.starts_with("---\n") {
        return content;
    }
    content[4..]
        .find("\n---\n")
        .map(|end| &content[4 + end + 5..])
        .unwrap_or(content)
}

fn atomic_write(path: &Path, content: &str) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| app_error("INVALID_PATH", "文件路径无效"))?;
    fs::create_dir_all(parent).map_err(io_error)?;
    let permissions = fs::metadata(path)
        .ok()
        .map(|metadata| metadata.permissions());
    let mut temporary = NamedTempFile::new_in(parent).map_err(io_error)?;
    temporary.write_all(content.as_bytes()).map_err(io_error)?;
    temporary.as_file().sync_all().map_err(io_error)?;
    if let Some(permissions) = permissions {
        temporary
            .as_file()
            .set_permissions(permissions)
            .map_err(io_error)?;
    }
    temporary
        .persist(path)
        .map_err(|error| io_error(error.error))?;
    Ok(())
}

fn safe_note_path(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let path = Path::new(relative);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(app_error("INVALID_PATH", "笔记路径不能离开资料库"));
    }
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("md"))
    {
        return Err(app_error("INVALID_PATH", "笔记必须是 Markdown 文件"));
    }
    Ok(root.join(path))
}

fn sanitize_note_name(value: &str) -> AppResult<String> {
    let cleaned = value.trim().trim_end_matches(".md").trim();
    if cleaned.is_empty()
        || cleaned == "."
        || cleaned == ".."
        || cleaned
            .chars()
            .any(|character| ['/', '\\', ':', '\0'].contains(&character))
    {
        return Err(app_error(
            "INVALID_NOTE_NAME",
            "笔记名称不能为空，也不能包含路径字符",
        ));
    }
    Ok(cleaned.to_string())
}

fn is_ignored_path(path: &Path, root: &Path) -> bool {
    path.strip_prefix(root).ok().is_some_and(|relative| {
        relative.components().any(|component| {
            component.as_os_str().to_string_lossy().starts_with('.')
                || component.as_os_str() == "node_modules"
        })
    })
}

fn relative_string(root: &Path, path: &Path) -> AppResult<String> {
    path.strip_prefix(root)
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        .map_err(|_| app_error("INVALID_PATH", "文件不在资料库中"))
}

fn title_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("未命名笔记")
        .to_string()
}

fn revision(content: &str) -> String {
    hex::encode(Sha256::digest(content.as_bytes()))
}

fn modified_unix(metadata: &fs::Metadata) -> i64 {
    metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn modified_iso(metadata: &fs::Metadata) -> String {
    let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    DateTime::<Utc>::from(modified).to_rfc3339()
}

fn link_context(content: &str, target: &str) -> String {
    content
        .lines()
        .find(|line| line.contains(target))
        .unwrap_or("")
        .trim()
        .chars()
        .take(120)
        .collect()
}

fn app_error(code: impl Into<String>, message: impl Into<String>) -> AppError {
    AppError {
        code: code.into(),
        message: message.into(),
    }
}

fn db_error(error: rusqlite::Error) -> AppError {
    app_error("DATABASE_ERROR", format!("本地索引出现问题：{error}"))
}

fn io_error(error: std::io::Error) -> AppError {
    app_error("FILE_ERROR", format!("文件操作失败：{error}"))
}

fn lock_error<T>(_: std::sync::PoisonError<T>) -> AppError {
    app_error("STATE_ERROR", "应用内部状态暂时不可用")
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data)?;
            let db = init_database(&app_data.join("noteharbor.sqlite"))
                .map_err(|error| std::io::Error::other(error.message))?;
            app.manage(AppState {
                db: Mutex::new(db),
                watchers: Mutex::new(HashMap::new()),
                source_watchers: Mutex::new(HashMap::new()),
                source_debounce: Mutex::new(HashMap::new()),
            });
            let app_handle = app.handle().clone();
            std::thread::spawn(move || word_files::startup_reconcile(app_handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_vaults,
            register_vault,
            remove_vault,
            scan_vault,
            list_notes,
            list_library_items,
            create_note,
            read_note,
            save_note,
            save_copy,
            rename_note,
            delete_note,
            set_note_flag,
            search_notes,
            get_backlinks,
            import_attachment,
            create_history_snapshot,
            list_history,
            restore_history,
            import_word_documents,
            read_docx_preview,
            read_word_document,
            open_library_file,
            sync_library_file,
            relink_library_file,
            rename_library_file,
            delete_library_file
        ])
        .run(tauri::generate_context!())
        .expect("failed to run NoteHarbor");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn rejects_paths_outside_a_vault() {
        assert!(safe_note_path(Path::new("/tmp/vault"), "../secret.md").is_err());
        assert!(safe_note_path(Path::new("/tmp/vault"), "notes/ok.md").is_ok());
    }

    #[test]
    fn reads_tags_without_touching_plain_markdown() {
        let parsed = parse_frontmatter("---\nid: abc\ntags: [项目, 灵感]\n---\n# 标题");
        assert_eq!(parsed.tags, vec!["项目", "灵感"]);
        assert!(parse_frontmatter("# 普通笔记").tags.is_empty());
    }

    #[test]
    fn updates_wiki_and_relative_links() {
        let source = Path::new("/vault/notes/source.md");
        let old = Path::new("/vault/notes/旧名.md");
        let new = Path::new("/vault/notes/新名.md");
        let content = "[[旧名]]\n[链接](旧名.md)";
        let updated = replace_links(content, source, old, new, "旧名", "新名");
        assert!(updated.contains("[[新名]]"));
        assert!(updated.contains("](新名.md)"));
    }

    #[test]
    fn sanitizes_note_names() {
        assert_eq!(sanitize_note_name("新笔记.md").unwrap(), "新笔记");
        assert!(sanitize_note_name("../坏名称").is_err());
    }

    #[test]
    fn indexes_and_reads_standard_markdown() {
        let temporary = tempfile::tempdir().unwrap();
        let vault_root = temporary.path().join("vault");
        fs::create_dir_all(&vault_root).unwrap();
        let database = temporary.path().join("test.sqlite");
        let state = AppState {
            db: Mutex::new(init_database(&database).unwrap()),
            watchers: Mutex::new(HashMap::new()),
            source_watchers: Mutex::new(HashMap::new()),
            source_debounce: Mutex::new(HashMap::new()),
        };
        state
            .db
            .lock()
            .unwrap()
            .execute(
                "INSERT INTO vaults (id, name, path) VALUES (?1, ?2, ?3)",
                params!["vault", "测试资料库", vault_root.to_string_lossy()],
            )
            .unwrap();
        let note_path = vault_root.join("想法.md");
        fs::write(
            &note_path,
            "---\nid: note\ntags: [灵感, 项目]\n---\n# 一个想法\n\n保持简单。",
        )
        .unwrap();
        index_file(&state, "vault", &vault_root, &note_path).unwrap();

        let notes = list_notes_inner(&state, Some("vault")).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].title, "想法");
        assert_eq!(notes[0].tags, vec!["灵感", "项目"]);
        let document = read_note_inner(&state, "vault", "想法.md").unwrap();
        assert!(document.content.contains("保持简单"));
    }

    #[test]
    fn watcher_index_helper_adds_and_removes_markdown_and_word_files() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("vault");
        fs::create_dir_all(root.join("documents")).unwrap();
        let state = AppState {
            db: Mutex::new(init_database(&temporary.path().join("watcher.sqlite")).unwrap()),
            watchers: Mutex::new(HashMap::new()),
            source_watchers: Mutex::new(HashMap::new()),
            source_debounce: Mutex::new(HashMap::new()),
        };
        state
            .db
            .lock()
            .unwrap()
            .execute(
                "INSERT INTO vaults (id, name, path) VALUES ('vault', '测试', ?1)",
                [root.to_string_lossy().as_ref()],
            )
            .unwrap();

        let markdown = root.join("运行期.md");
        fs::write(&markdown, "# 运行期加入").unwrap();
        index_changed_vault_path(&state, "vault", &root, &markdown).unwrap();
        assert_eq!(list_notes_inner(&state, Some("vault")).unwrap().len(), 1);

        let word = root.join("documents/运行期.doc");
        fs::write(&word, b"legacy doc").unwrap();
        index_changed_vault_path(&state, "vault", &root, &word).unwrap();
        assert_eq!(
            word_files::list_word_items_inner(&state, Some("vault"))
                .unwrap()
                .len(),
            1
        );

        fs::remove_file(&markdown).unwrap();
        fs::remove_file(&word).unwrap();
        index_changed_vault_path(&state, "vault", &root, &markdown).unwrap();
        index_changed_vault_path(&state, "vault", &root, &word).unwrap();
        assert!(list_library_items_inner(&state, Some("vault"))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn fts_search_stays_fast_with_ten_thousand_notes() {
        let temporary = tempfile::tempdir().unwrap();
        let mut db = init_database(&temporary.path().join("performance.sqlite")).unwrap();
        let transaction = db.transaction().unwrap();
        {
            let mut insert = transaction
                .prepare(
                    "INSERT INTO notes_fts (note_key, vault_id, path, title, content, tags)
                     VALUES (?1, 'vault', ?2, ?3, ?4, '[]')",
                )
                .unwrap();
            for index in 0..10_000 {
                let content = if index == 9_999 {
                    "这是需要找到的港湾灵感"
                } else {
                    "普通的个人笔记内容"
                };
                insert
                    .execute(params![
                        format!("vault:{index}"),
                        format!("{index}.md"),
                        format!("笔记 {index}"),
                        content
                    ])
                    .unwrap();
            }
        }
        transaction.commit().unwrap();

        let started = Instant::now();
        let count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM notes_fts WHERE notes_fts MATCH ?1",
                ["\"港湾灵感\""],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
        assert!(
            started.elapsed().as_millis() < 200,
            "10,000 篇笔记中的搜索超过 200ms"
        );
    }
}
