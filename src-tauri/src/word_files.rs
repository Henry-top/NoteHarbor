use super::*;
use std::{
    fs::File,
    io::{Cursor, Read},
    thread,
    time::Duration as StdDuration,
};
use tauri_plugin_opener::OpenerExt;
use zip::ZipArchive;

const MAX_DOCX_COMPRESSED_BYTES: u64 = 50 * 1024 * 1024;
const MAX_DOCX_UNCOMPRESSED_BYTES: u64 = 250 * 1024 * 1024;
const MAX_DOCX_ENTRIES: usize = 10_000;
const SOURCE_STABILITY_DELAY: StdDuration = StdDuration::from_millis(150);
const SOURCE_WATCH_DEBOUNCE: StdDuration = StdDuration::from_millis(700);

#[derive(Debug, Clone)]
struct WordFileRecord {
    id: String,
    vault_id: String,
    vault_root: PathBuf,
    path: String,
    kind: LibraryItemKind,
    source_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryFileChanged {
    vault_id: String,
    path: String,
}

pub(super) fn init_library_files_schema(db: &Connection) -> AppResult<()> {
    db.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS library_files (
          id TEXT PRIMARY KEY,
          vault_id TEXT NOT NULL,
          path TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('docx', 'doc')),
          source_path TEXT,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          content_hash TEXT NOT NULL DEFAULT '',
          modified_at TEXT NOT NULL,
          modified_unix INTEGER NOT NULL,
          favorite INTEGER NOT NULL DEFAULT 0,
          pinned INTEGER NOT NULL DEFAULT 0,
          last_opened TEXT,
          last_synced_at TEXT,
          sync_status TEXT NOT NULL DEFAULT 'unlinked',
          sync_error TEXT,
          UNIQUE (vault_id, path),
          FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_library_files_modified
          ON library_files(modified_unix DESC);
        CREATE INDEX IF NOT EXISTS idx_library_files_source
          ON library_files(source_path);
        ",
    )
    .map_err(db_error)
}

pub(super) fn remove_vault_watchers(state: &AppState, vault_id: &str) -> AppResult<()> {
    let ids = {
        let db = state.db.lock().map_err(lock_error)?;
        let mut statement = db
            .prepare("SELECT id FROM library_files WHERE vault_id = ?1")
            .map_err(db_error)?;
        let ids = statement
            .query_map([vault_id], |row| row.get::<_, String>(0))
            .map_err(db_error)?
            .filter_map(Result::ok)
            .collect::<Vec<_>>();
        ids
    };
    let mut watchers = state.source_watchers.lock().map_err(lock_error)?;
    let mut debounce = state.source_debounce.lock().map_err(lock_error)?;
    for id in ids {
        watchers.remove(&id);
        debounce.remove(&id);
    }
    Ok(())
}

pub(super) fn index_scanned_word_file(
    state: &AppState,
    vault_id: &str,
    root: &Path,
    path: &Path,
) -> AppResult<()> {
    let kind = LibraryItemKind::from_word_path(path)
        .ok_or_else(|| app_error("UNSUPPORTED_FILE_TYPE", "只支持 DOCX 和 DOC 文档"))?;
    let relative = relative_string(root, path)?;
    let metadata = fs::metadata(path).map_err(io_error)?;
    if !metadata.is_file() {
        return Err(app_error("FILE_NOT_FOUND", "Word 文档不存在"));
    }
    let content_hash = hash_file(path)?;
    let db = state.db.lock().map_err(lock_error)?;
    db.execute(
        "INSERT INTO library_files (
           id, vault_id, path, kind, source_path, size_bytes, content_hash,
           modified_at, modified_unix, last_synced_at, sync_status
         ) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8, NULL, 'unlinked')
         ON CONFLICT(vault_id, path) DO UPDATE SET
           kind = excluded.kind,
           size_bytes = excluded.size_bytes,
           content_hash = excluded.content_hash,
           modified_at = excluded.modified_at,
           modified_unix = excluded.modified_unix,
           sync_status = CASE
             WHEN library_files.source_path IS NULL THEN 'unlinked'
             ELSE library_files.sync_status
           END",
        params![
            Uuid::new_v4().to_string(),
            vault_id,
            relative,
            kind.as_str(),
            metadata.len() as i64,
            content_hash,
            modified_iso(&metadata),
            modified_unix(&metadata),
        ],
    )
    .map_err(db_error)?;
    Ok(())
}

pub(super) fn prune_missing_word_files(
    state: &AppState,
    vault_id: &str,
    found: &HashSet<String>,
) -> AppResult<()> {
    let rows = {
        let db = state.db.lock().map_err(lock_error)?;
        let mut statement = db
            .prepare("SELECT id, path, source_path FROM library_files WHERE vault_id = ?1")
            .map_err(db_error)?;
        let rows = statement
            .query_map([vault_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(db_error)?
            .filter_map(Result::ok)
            .collect::<Vec<_>>();
        rows
    };
    let db = state.db.lock().map_err(lock_error)?;
    for (id, path, source_path) in rows {
        if found.contains(&path) {
            continue;
        }
        if source_path.is_some() {
            db.execute(
                "UPDATE library_files SET sync_status = 'outOfSync',
                 sync_error = '资料库副本不存在' WHERE id = ?1",
                [&id],
            )
            .map_err(db_error)?;
        } else {
            db.execute("DELETE FROM library_files WHERE id = ?1", [&id])
                .map_err(db_error)?;
        }
    }
    Ok(())
}

pub(super) fn remove_scanned_word_path(
    state: &AppState,
    vault_id: &str,
    path: &str,
) -> AppResult<()> {
    let row = state
        .db
        .lock()
        .map_err(lock_error)?
        .query_row(
            "SELECT id, source_path FROM library_files WHERE vault_id = ?1 AND path = ?2",
            params![vault_id, path],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .optional()
        .map_err(db_error)?;
    let Some((id, source_path)) = row else {
        return Ok(());
    };
    let db = state.db.lock().map_err(lock_error)?;
    if source_path.is_some() {
        db.execute(
            "UPDATE library_files SET sync_status = 'outOfSync',
             sync_error = '资料库副本不存在' WHERE id = ?1",
            [&id],
        )
        .map_err(db_error)?;
    } else {
        db.execute("DELETE FROM library_files WHERE id = ?1", [&id])
            .map_err(db_error)?;
    }
    Ok(())
}

pub(super) fn list_word_items_inner(
    state: &AppState,
    vault_id: Option<&str>,
) -> AppResult<Vec<LibraryItemSummary>> {
    refresh_source_availability(state, vault_id)?;
    let db = state.db.lock().map_err(lock_error)?;
    let sql = if vault_id.is_some() {
        "SELECT vault_id, path, kind, modified_at, favorite, pinned, last_opened,
                source_path, size_bytes, sync_status, last_synced_at
         FROM library_files WHERE vault_id = ?1"
    } else {
        "SELECT vault_id, path, kind, modified_at, favorite, pinned, last_opened,
                source_path, size_bytes, sync_status, last_synced_at
         FROM library_files"
    };
    let mut statement = db.prepare(sql).map_err(db_error)?;
    let mapper = |row: &rusqlite::Row<'_>| -> rusqlite::Result<LibraryItemSummary> {
        let path: String = row.get(1)?;
        let kind_text: String = row.get(2)?;
        let kind = if kind_text == "doc" {
            LibraryItemKind::Doc
        } else {
            LibraryItemKind::Docx
        };
        Ok(LibraryItemSummary {
            vault_id: row.get(0)?,
            title: title_from_path(Path::new(&path)),
            path,
            kind,
            tags: Vec::new(),
            modified_at: row.get(3)?,
            is_favorite: row.get::<_, i64>(4)? != 0,
            is_pinned: row.get::<_, i64>(5)? != 0,
            last_opened: row.get(6)?,
            source_path: row.get(7)?,
            size_bytes: row.get::<_, i64>(8)?.max(0) as u64,
            sync_status: row.get(9)?,
            last_synced_at: row.get(10)?,
        })
    };
    let items = if let Some(id) = vault_id {
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
    Ok(items)
}

pub(super) fn search_word_items(
    state: &AppState,
    query: &str,
    allowed_vaults: &[String],
) -> AppResult<Vec<SearchHit>> {
    let pattern = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
    let db = state.db.lock().map_err(lock_error)?;
    let mut statement = db
        .prepare(
            "SELECT vault_id, path, kind FROM library_files
             WHERE path LIKE ?1 ESCAPE '\\'
             ORDER BY modified_unix DESC LIMIT 100",
        )
        .map_err(db_error)?;
    let hits = statement
        .query_map([pattern], |row| {
            let vault_id: String = row.get(0)?;
            let path: String = row.get(1)?;
            let kind: String = row.get(2)?;
            Ok(SearchHit {
                vault_id,
                title: title_from_path(Path::new(&path)),
                snippet: path.clone(),
                path,
                tags: Vec::new(),
                score: 1.0,
                kind: if kind == "doc" {
                    LibraryItemKind::Doc
                } else {
                    LibraryItemKind::Docx
                },
            })
        })
        .map_err(db_error)?
        .filter_map(Result::ok)
        .filter(|hit| allowed_vaults.is_empty() || allowed_vaults.contains(&hit.vault_id))
        .collect();
    Ok(hits)
}

pub(super) fn set_word_flag(
    state: &AppState,
    vault_id: &str,
    path: &str,
    column: &str,
    value: bool,
) -> AppResult<bool> {
    let sql = format!("UPDATE library_files SET {column} = ?1 WHERE vault_id = ?2 AND path = ?3");
    let changed = state
        .db
        .lock()
        .map_err(lock_error)?
        .execute(&sql, params![value as i64, vault_id, path])
        .map_err(db_error)?;
    Ok(changed > 0)
}

#[tauri::command]
pub(crate) fn import_word_documents(
    app: AppHandle,
    state: State<AppState>,
    vault_id: String,
    source_paths: Vec<String>,
) -> AppResult<Vec<LibraryItemSummary>> {
    if source_paths.is_empty() {
        return Ok(Vec::new());
    }
    let vault = get_vault(&state, &vault_id)?;
    if !vault.available {
        return Err(app_error("VAULT_UNAVAILABLE", "资料库当前不可访问"));
    }
    let root = fs::canonicalize(&vault.path).map_err(io_error)?;
    let documents = root.join("documents");
    fs::create_dir_all(&documents).map_err(io_error)?;

    let mut validated = Vec::with_capacity(source_paths.len());
    for source in source_paths {
        let canonical = fs::canonicalize(&source)
            .map_err(|_| app_error("SOURCE_NOT_FOUND", "选择的原文件不存在或无法访问"))?;
        let metadata = fs::metadata(&canonical).map_err(io_error)?;
        if !metadata.is_file() {
            return Err(app_error("SOURCE_NOT_FILE", "只能导入普通文件"));
        }
        let kind = LibraryItemKind::from_word_path(&canonical)
            .ok_or_else(|| app_error("UNSUPPORTED_FILE_TYPE", "只支持 .docx 和 .doc 文件"))?;
        if canonical.starts_with(&root) {
            return Err(app_error(
                "SOURCE_INSIDE_VAULT",
                "资料库内的文件无需导入，可直接扫描使用",
            ));
        }
        validated.push((canonical, kind));
    }

    let mut created: Vec<(String, PathBuf)> = Vec::new();
    let mut imported = Vec::new();
    for (source, kind) in validated {
        let original_name = source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| app_error("INVALID_FILE_NAME", "文件名不是有效文本"))?;
        let target = unique_import_target(&state, &vault_id, &root, &documents, original_name)?;
        let (size, hash) = match copy_source_atomically(&source, &target) {
            Ok(value) => value,
            Err(error) => {
                rollback_imports(&state, &created);
                return Err(error);
            }
        };
        let relative = relative_string(&root, &target)?;
        let metadata = fs::metadata(&target).map_err(io_error)?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let insert_result = state.db.lock().map_err(lock_error)?.execute(
            "INSERT INTO library_files (
               id, vault_id, path, kind, source_path, size_bytes, content_hash,
               modified_at, modified_unix, last_synced_at, sync_status, sync_error
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'synced', NULL)
             ON CONFLICT(vault_id, path) DO UPDATE SET
               id = excluded.id,
               kind = excluded.kind,
               source_path = excluded.source_path,
               size_bytes = excluded.size_bytes,
               content_hash = excluded.content_hash,
               modified_at = excluded.modified_at,
               modified_unix = excluded.modified_unix,
               last_synced_at = excluded.last_synced_at,
               sync_status = 'synced',
               sync_error = NULL",
            params![
                id,
                vault_id,
                relative,
                kind.as_str(),
                source.to_string_lossy(),
                size as i64,
                hash,
                modified_iso(&metadata),
                modified_unix(&metadata),
                now,
            ],
        );
        if let Err(error) = insert_result {
            let _ = fs::remove_file(&target);
            rollback_imports(&state, &created);
            return Err(db_error(error));
        }
        created.push((id.clone(), target));
        if let Err(error) = ensure_source_watcher(&app, &state, &id, &source) {
            rollback_imports(&state, &created);
            return Err(error);
        }
        imported.push(word_summary_by_id(&state, &id)?);
    }
    Ok(imported)
}

#[tauri::command]
pub(crate) fn read_docx_preview(
    state: State<AppState>,
    vault_id: String,
    path: String,
) -> AppResult<Vec<u8>> {
    read_docx_preview_inner(&state, &vault_id, &path)
}

#[tauri::command]
pub(crate) fn read_word_document(
    state: State<AppState>,
    vault_id: String,
    path: String,
) -> AppResult<Vec<u8>> {
    read_docx_preview_inner(&state, &vault_id, &path)
}

fn read_docx_preview_inner(state: &AppState, vault_id: &str, path: &str) -> AppResult<Vec<u8>> {
    let record = registered_word_record(state, vault_id, path)?;
    if record.kind != LibraryItemKind::Docx {
        return Err(app_error(
            "DOC_PREVIEW_UNSUPPORTED",
            "旧式 .doc 文件暂不支持软件内预览，请使用本地默认软件打开",
        ));
    }
    let absolute = registered_vault_copy_path(&record, true)?;
    let metadata = fs::metadata(&absolute).map_err(io_error)?;
    if metadata.len() > MAX_DOCX_COMPRESSED_BYTES {
        return Err(app_error(
            "DOCX_TOO_LARGE",
            "DOCX 文件超过 50MB，请使用本地默认软件打开",
        ));
    }
    let bytes = fs::read(&absolute).map_err(io_error)?;
    validate_docx_archive(&bytes)?;
    state
        .db
        .lock()
        .map_err(lock_error)?
        .execute(
            "UPDATE library_files SET last_opened = ?1 WHERE id = ?2",
            params![Utc::now().to_rfc3339(), record.id],
        )
        .map_err(db_error)?;
    Ok(bytes)
}

#[tauri::command]
pub(crate) fn open_library_file(
    app: AppHandle,
    state: State<AppState>,
    vault_id: String,
    path: String,
) -> AppResult<()> {
    let record = registered_word_record(&state, &vault_id, &path)?;
    let selected = preferred_open_path(&record)?;
    app.opener()
        .open_path(selected.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| app_error("OPEN_FAILED", format!("无法使用本地默认软件打开：{error}")))?;
    state
        .db
        .lock()
        .map_err(lock_error)?
        .execute(
            "UPDATE library_files SET last_opened = ?1 WHERE id = ?2",
            params![Utc::now().to_rfc3339(), record.id],
        )
        .map_err(db_error)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn sync_library_file(
    app: AppHandle,
    state: State<AppState>,
    vault_id: String,
    path: String,
) -> AppResult<LibraryItemSummary> {
    let record = registered_word_record(&state, &vault_id, &path)?;
    let summary = sync_word_record(&state, &record)?;
    if let Some(source) = record.source_path.as_deref() {
        let _ = ensure_source_watcher(&app, &state, &record.id, Path::new(source));
    }
    Ok(summary)
}

#[tauri::command]
pub(crate) fn relink_library_file(
    app: AppHandle,
    state: State<AppState>,
    vault_id: String,
    path: String,
    source_path: String,
) -> AppResult<LibraryItemSummary> {
    let record = registered_word_record(&state, &vault_id, &path)?;
    let source = fs::canonicalize(&source_path)
        .map_err(|_| app_error("SOURCE_NOT_FOUND", "选择的原文件不存在或无法访问"))?;
    if !fs::metadata(&source).map_err(io_error)?.is_file() {
        return Err(app_error("SOURCE_NOT_FILE", "只能关联普通文件"));
    }
    let source_kind = LibraryItemKind::from_word_path(&source)
        .ok_or_else(|| app_error("UNSUPPORTED_FILE_TYPE", "只支持 .docx 和 .doc 文件"))?;
    if source_kind != record.kind {
        return Err(app_error(
            "FILE_TYPE_MISMATCH",
            "重新关联的文件类型必须与当前文档一致",
        ));
    }
    let canonical_root = fs::canonicalize(&record.vault_root).map_err(io_error)?;
    if source.starts_with(&canonical_root) {
        return Err(app_error(
            "SOURCE_INSIDE_VAULT",
            "不能把资料库副本设为外部原文件",
        ));
    }
    state
        .db
        .lock()
        .map_err(lock_error)?
        .execute(
            "UPDATE library_files SET source_path = ?1, sync_status = 'outOfSync',
             sync_error = NULL WHERE id = ?2",
            params![source.to_string_lossy(), record.id],
        )
        .map_err(db_error)?;
    state
        .source_watchers
        .lock()
        .map_err(lock_error)?
        .remove(&record.id);
    ensure_source_watcher(&app, &state, &record.id, &source)?;
    let updated = registered_word_record(&state, &vault_id, &path)?;
    sync_word_record(&state, &updated)
}

#[tauri::command]
pub(crate) fn rename_library_file(
    state: State<AppState>,
    vault_id: String,
    path: String,
    new_name: String,
) -> AppResult<LibraryItemSummary> {
    let record = registered_word_record(&state, &vault_id, &path)?;
    let cleaned = sanitize_word_name(&new_name, record.kind)?;
    let old_absolute = registered_vault_copy_path(&record, true)?;
    let parent = old_absolute
        .parent()
        .ok_or_else(|| app_error("INVALID_PATH", "文档路径无效"))?;
    let extension = record.kind.as_str();
    let new_absolute = parent.join(format!("{cleaned}.{extension}"));
    if new_absolute.exists() {
        return Err(app_error("FILE_ALREADY_EXISTS", "同名文档已经存在"));
    }
    let new_relative = relative_string(&record.vault_root, &new_absolute)?;
    let update = state.db.lock().map_err(lock_error)?.execute(
        "UPDATE library_files SET path = ?1 WHERE id = ?2",
        params![new_relative, record.id],
    );
    if let Err(error) = update {
        return Err(db_error(error));
    }
    if let Err(error) = fs::rename(&old_absolute, &new_absolute) {
        let _ = state.db.lock().map(|db| {
            db.execute(
                "UPDATE library_files SET path = ?1 WHERE id = ?2",
                params![record.path, record.id],
            )
        });
        return Err(io_error(error));
    }
    word_summary_by_id(&state, &record.id)
}

#[tauri::command]
pub(crate) fn delete_library_file(
    state: State<AppState>,
    vault_id: String,
    path: String,
) -> AppResult<()> {
    let record = registered_word_record(&state, &vault_id, &path)?;
    let absolute = registered_vault_copy_path(&record, false)?;
    if absolute.exists() {
        trash::delete(&absolute)
            .map_err(|error| app_error("TRASH_FAILED", format!("无法移到废纸篓：{error}")))?;
    }
    state
        .db
        .lock()
        .map_err(lock_error)?
        .execute("DELETE FROM library_files WHERE id = ?1", [&record.id])
        .map_err(db_error)?;
    state
        .source_watchers
        .lock()
        .map_err(lock_error)?
        .remove(&record.id);
    state
        .source_debounce
        .lock()
        .map_err(lock_error)?
        .remove(&record.id);
    Ok(())
}

pub(super) fn reconcile_word_files_for_vault(
    app: &AppHandle,
    state: &AppState,
    vault_id: &str,
) -> AppResult<()> {
    let records = word_records(state, Some(vault_id))?;
    for record in records {
        let _ = sync_word_record(state, &record);
        if let Some(source) = record.source_path.as_deref() {
            let _ = ensure_source_watcher(app, state, &record.id, Path::new(source));
        }
    }
    Ok(())
}

pub(super) fn startup_reconcile(app: AppHandle) {
    let state = app.state::<AppState>();
    let records = match word_records(&state, None) {
        Ok(records) => records,
        Err(_) => return,
    };
    for record in records {
        let _ = sync_word_record(&state, &record);
        if let Some(source) = record.source_path.as_deref() {
            let _ = ensure_source_watcher(&app, &state, &record.id, Path::new(source));
        }
    }
}

fn sync_word_record(state: &AppState, record: &WordFileRecord) -> AppResult<LibraryItemSummary> {
    let Some(source_path) = record.source_path.as_deref() else {
        update_sync_status(state, &record.id, "unlinked", None)?;
        return word_summary_by_id(state, &record.id);
    };
    let source = Path::new(source_path);
    let source_metadata = match fs::metadata(source) {
        Ok(metadata) if metadata.is_file() => metadata,
        _ => {
            update_sync_status(state, &record.id, "sourceMissing", Some("外部原文件不可用"))?;
            return word_summary_by_id(state, &record.id);
        }
    };
    let target = registered_vault_copy_path(record, false)?;
    let current_hash = if target.is_file() {
        hash_file(&target).ok()
    } else {
        None
    };
    let source_hash = hash_file(source)?;
    let (size, hash) = if current_hash.as_deref() == Some(&source_hash) {
        (source_metadata.len(), source_hash)
    } else {
        match copy_source_atomically(source, &target) {
            Ok(value) => value,
            Err(error) => {
                update_sync_status(state, &record.id, "syncError", Some(&error.message))?;
                return Err(error);
            }
        }
    };
    let metadata = fs::metadata(&target).map_err(io_error)?;
    state
        .db
        .lock()
        .map_err(lock_error)?
        .execute(
            "UPDATE library_files SET size_bytes = ?1, content_hash = ?2,
             modified_at = ?3, modified_unix = ?4, last_synced_at = ?5,
             sync_status = 'synced', sync_error = NULL WHERE id = ?6",
            params![
                size as i64,
                hash,
                modified_iso(&metadata),
                modified_unix(&metadata),
                Utc::now().to_rfc3339(),
                record.id,
            ],
        )
        .map_err(db_error)?;
    word_summary_by_id(state, &record.id)
}

fn update_sync_status(
    state: &AppState,
    id: &str,
    status: &str,
    error: Option<&str>,
) -> AppResult<()> {
    state
        .db
        .lock()
        .map_err(lock_error)?
        .execute(
            "UPDATE library_files SET sync_status = ?1, sync_error = ?2 WHERE id = ?3",
            params![status, error, id],
        )
        .map_err(db_error)?;
    Ok(())
}

fn refresh_source_availability(state: &AppState, vault_id: Option<&str>) -> AppResult<()> {
    let records = word_records(state, vault_id)?;
    for record in records {
        let Some(source) = record.source_path.as_deref() else {
            continue;
        };
        if !Path::new(source).is_file() {
            update_sync_status(state, &record.id, "sourceMissing", Some("外部原文件不可用"))?;
        }
    }
    Ok(())
}

fn registered_word_record(
    state: &AppState,
    vault_id: &str,
    path: &str,
) -> AppResult<WordFileRecord> {
    if !is_safe_relative_word_path(path) {
        return Err(app_error("INVALID_PATH", "文档路径不能离开资料库"));
    }
    let db = state.db.lock().map_err(lock_error)?;
    db.query_row(
        "SELECT f.id, f.vault_id, v.path, f.path, f.kind, f.source_path
         FROM library_files f JOIN vaults v ON v.id = f.vault_id
         WHERE f.vault_id = ?1 AND f.path = ?2",
        params![vault_id, path],
        map_word_record,
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| app_error("LIBRARY_FILE_NOT_FOUND", "资料库中没有登记这个 Word 文档"))
}

fn word_records(state: &AppState, vault_id: Option<&str>) -> AppResult<Vec<WordFileRecord>> {
    let db = state.db.lock().map_err(lock_error)?;
    let sql = if vault_id.is_some() {
        "SELECT f.id, f.vault_id, v.path, f.path, f.kind, f.source_path
         FROM library_files f JOIN vaults v ON v.id = f.vault_id WHERE f.vault_id = ?1"
    } else {
        "SELECT f.id, f.vault_id, v.path, f.path, f.kind, f.source_path
         FROM library_files f JOIN vaults v ON v.id = f.vault_id"
    };
    let mut statement = db.prepare(sql).map_err(db_error)?;
    let records = if let Some(id) = vault_id {
        statement
            .query_map([id], map_word_record)
            .map_err(db_error)?
            .filter_map(Result::ok)
            .collect()
    } else {
        statement
            .query_map([], map_word_record)
            .map_err(db_error)?
            .filter_map(Result::ok)
            .collect()
    };
    Ok(records)
}

fn map_word_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<WordFileRecord> {
    let kind: String = row.get(4)?;
    Ok(WordFileRecord {
        id: row.get(0)?,
        vault_id: row.get(1)?,
        vault_root: PathBuf::from(row.get::<_, String>(2)?),
        path: row.get(3)?,
        kind: if kind == "doc" {
            LibraryItemKind::Doc
        } else {
            LibraryItemKind::Docx
        },
        source_path: row.get(5)?,
    })
}

fn word_summary_by_id(state: &AppState, id: &str) -> AppResult<LibraryItemSummary> {
    let db = state.db.lock().map_err(lock_error)?;
    db.query_row(
        "SELECT vault_id, path, kind, modified_at, favorite, pinned, last_opened,
                source_path, size_bytes, sync_status, last_synced_at
         FROM library_files WHERE id = ?1",
        [id],
        |row| {
            let path: String = row.get(1)?;
            let kind: String = row.get(2)?;
            Ok(LibraryItemSummary {
                vault_id: row.get(0)?,
                title: title_from_path(Path::new(&path)),
                path,
                kind: if kind == "doc" {
                    LibraryItemKind::Doc
                } else {
                    LibraryItemKind::Docx
                },
                tags: Vec::new(),
                modified_at: row.get(3)?,
                is_favorite: row.get::<_, i64>(4)? != 0,
                is_pinned: row.get::<_, i64>(5)? != 0,
                last_opened: row.get(6)?,
                source_path: row.get(7)?,
                size_bytes: row.get::<_, i64>(8)?.max(0) as u64,
                sync_status: row.get(9)?,
                last_synced_at: row.get(10)?,
            })
        },
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| app_error("LIBRARY_FILE_NOT_FOUND", "Word 文档记录不存在"))
}

fn registered_vault_copy_path(record: &WordFileRecord, must_exist: bool) -> AppResult<PathBuf> {
    if !is_safe_relative_word_path(&record.path) {
        return Err(app_error("INVALID_PATH", "文档路径不能离开资料库"));
    }
    let root = fs::canonicalize(&record.vault_root)
        .map_err(|_| app_error("VAULT_UNAVAILABLE", "资料库当前不可访问"))?;
    let target = root.join(&record.path);
    if must_exist {
        let canonical = fs::canonicalize(&target)
            .map_err(|_| app_error("LIBRARY_COPY_MISSING", "资料库副本不存在"))?;
        if !canonical.starts_with(&root) || !canonical.is_file() {
            return Err(app_error("INVALID_PATH", "文档路径不能离开资料库"));
        }
        Ok(canonical)
    } else {
        let parent = target
            .parent()
            .ok_or_else(|| app_error("INVALID_PATH", "文档路径无效"))?;
        fs::create_dir_all(parent).map_err(io_error)?;
        let canonical_parent = fs::canonicalize(parent).map_err(io_error)?;
        if !canonical_parent.starts_with(&root) {
            return Err(app_error("INVALID_PATH", "文档路径不能离开资料库"));
        }
        Ok(target)
    }
}

fn preferred_open_path(record: &WordFileRecord) -> AppResult<PathBuf> {
    if let Some(source) = record.source_path.as_deref() {
        if let Ok(canonical) = fs::canonicalize(source) {
            if canonical.is_file() {
                return Ok(canonical);
            }
        }
    }
    registered_vault_copy_path(record, true)
}

fn is_safe_relative_word_path(value: &str) -> bool {
    let path = Path::new(value);
    !path.is_absolute()
        && !path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
        && LibraryItemKind::from_word_path(path).is_some()
}

#[cfg(test)]
fn unique_word_target(directory: &Path, original_name: &str) -> AppResult<PathBuf> {
    let original = Path::new(original_name);
    let stem = original
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| app_error("INVALID_FILE_NAME", "Word 文档名称无效"))?;
    let extension = original
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| app_error("UNSUPPORTED_FILE_TYPE", "Word 文档扩展名无效"))?;
    let mut counter = 1;
    loop {
        let name = if counter == 1 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem} ({counter}).{extension}")
        };
        let candidate = directory.join(name);
        if !candidate.exists() {
            return Ok(candidate);
        }
        counter += 1;
    }
}

fn unique_import_target(
    state: &AppState,
    vault_id: &str,
    root: &Path,
    directory: &Path,
    original_name: &str,
) -> AppResult<PathBuf> {
    let original = Path::new(original_name);
    let stem = original
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| app_error("INVALID_FILE_NAME", "Word 文档名称无效"))?;
    let extension = original
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| app_error("UNSUPPORTED_FILE_TYPE", "Word 文档扩展名无效"))?;
    let db = state.db.lock().map_err(lock_error)?;
    let mut counter = 1;
    loop {
        let name = if counter == 1 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem} ({counter}).{extension}")
        };
        let candidate = directory.join(name);
        let relative = relative_string(root, &candidate)?;
        let registered = db
            .query_row(
                "SELECT 1 FROM library_files WHERE vault_id = ?1 AND path = ?2",
                params![vault_id, relative],
                |_| Ok(()),
            )
            .optional()
            .map_err(db_error)?
            .is_some();
        if !candidate.exists() && !registered {
            return Ok(candidate);
        }
        counter += 1;
    }
}

fn sanitize_word_name(value: &str, kind: LibraryItemKind) -> AppResult<String> {
    let trimmed = value.trim();
    let suffix = format!(".{}", kind.as_str());
    let cleaned = if trimmed.to_ascii_lowercase().ends_with(&suffix) {
        &trimmed[..trimmed.len() - suffix.len()]
    } else {
        trimmed
    }
    .trim();
    if cleaned.is_empty()
        || cleaned == "."
        || cleaned == ".."
        || cleaned
            .chars()
            .any(|character| ['/', '\\', ':', '\0'].contains(&character))
    {
        return Err(app_error(
            "INVALID_FILE_NAME",
            "文档名称不能为空，也不能包含路径字符",
        ));
    }
    Ok(cleaned.to_string())
}

fn copy_source_atomically(source: &Path, target: &Path) -> AppResult<(u64, String)> {
    let parent = target
        .parent()
        .ok_or_else(|| app_error("INVALID_PATH", "文档路径无效"))?;
    fs::create_dir_all(parent).map_err(io_error)?;
    for _ in 0..3 {
        let before = source_signature(source)?;
        thread::sleep(SOURCE_STABILITY_DELAY);
        if source_signature(source)? != before {
            continue;
        }
        let mut input = File::open(source).map_err(io_error)?;
        let mut temporary = NamedTempFile::new_in(parent).map_err(io_error)?;
        let mut hasher = Sha256::new();
        let mut size = 0_u64;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let read = input.read(&mut buffer).map_err(io_error)?;
            if read == 0 {
                break;
            }
            temporary.write_all(&buffer[..read]).map_err(io_error)?;
            hasher.update(&buffer[..read]);
            size += read as u64;
        }
        temporary.as_file().sync_all().map_err(io_error)?;
        if source_signature(source)? != before {
            continue;
        }
        temporary
            .persist(target)
            .map_err(|error| io_error(error.error))?;
        return Ok((size, hex::encode(hasher.finalize())));
    }
    Err(app_error("SOURCE_BUSY", "外部原文件仍在写入，请稍后再同步"))
}

fn source_signature(path: &Path) -> AppResult<(u64, Option<SystemTime>)> {
    let metadata =
        fs::metadata(path).map_err(|_| app_error("SOURCE_NOT_FOUND", "外部原文件不可用"))?;
    if !metadata.is_file() {
        return Err(app_error("SOURCE_NOT_FILE", "外部原文件不是普通文件"));
    }
    Ok((metadata.len(), metadata.modified().ok()))
}

fn hash_file(path: &Path) -> AppResult<String> {
    let mut file = File::open(path).map_err(io_error)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(io_error)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn validate_docx_archive(bytes: &[u8]) -> AppResult<()> {
    if bytes.len() as u64 > MAX_DOCX_COMPRESSED_BYTES {
        return Err(app_error("DOCX_TOO_LARGE", "DOCX 文件超过 50MB"));
    }
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| app_error("DOCX_INVALID", "文件不是有效的 DOCX 文档"))?;
    if archive.len() > MAX_DOCX_ENTRIES {
        return Err(app_error("DOCX_TOO_COMPLEX", "DOCX 内部文件数量过多"));
    }
    let mut total = 0_u64;
    let mut has_content_types = false;
    let mut has_document = false;
    let external_relationship =
        Regex::new(r#"(?is)<Relationship\b[^>]*TargetMode\s*=\s*[\"']External[\"'][^>]*/?>"#)
            .map_err(|error| app_error("DOCX_VALIDATION_FAILED", error.to_string()))?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|_| app_error("DOCX_INVALID", "无法读取 DOCX 内部文件"))?;
        if entry.enclosed_name().is_none() {
            return Err(app_error("DOCX_INVALID", "DOCX 包含不安全的内部路径"));
        }
        total = total
            .checked_add(entry.size())
            .ok_or_else(|| app_error("DOCX_TOO_LARGE", "DOCX 解压内容超过 250MB"))?;
        if total > MAX_DOCX_UNCOMPRESSED_BYTES {
            return Err(app_error("DOCX_TOO_LARGE", "DOCX 解压内容超过 250MB"));
        }
        let name = entry.name().replace('\\', "/").to_ascii_lowercase();
        has_content_types |= name == "[content_types].xml";
        has_document |= name == "word/document.xml";
        if name.starts_with("word/afchunk")
            || name.ends_with(".html")
            || name.ends_with(".htm")
            || name.ends_with(".xhtml")
            || name.ends_with(".mht")
        {
            return Err(app_error(
                "DOCX_EXTERNAL_CONTENT",
                "DOCX 包含不支持的外部 HTML 内容",
            ));
        }
        if name.ends_with(".rels") && entry.size() <= 2 * 1024 * 1024 {
            let mut xml = String::new();
            entry
                .read_to_string(&mut xml)
                .map_err(|_| app_error("DOCX_INVALID", "DOCX 关系文件格式无效"))?;
            for relationship in external_relationship.find_iter(&xml) {
                if !relationship
                    .as_str()
                    .to_ascii_lowercase()
                    .contains("/hyperlink")
                {
                    return Err(app_error(
                        "DOCX_EXTERNAL_RESOURCE",
                        "DOCX 引用了外部网络资源，已阻止软件内预览",
                    ));
                }
            }
        }
    }
    if !has_content_types || !has_document {
        return Err(app_error("DOCX_INVALID", "文件缺少 DOCX 必需内容"));
    }
    Ok(())
}

fn ensure_source_watcher(
    app: &AppHandle,
    state: &AppState,
    id: &str,
    source: &Path,
) -> AppResult<()> {
    let mut watchers = state.source_watchers.lock().map_err(lock_error)?;
    if watchers.contains_key(id) {
        return Ok(());
    }
    let parent = source
        .parent()
        .ok_or_else(|| app_error("INVALID_SOURCE_PATH", "外部原文件路径无效"))?;
    let watched_source = source.to_path_buf();
    let callback_id = id.to_string();
    let app_handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else {
            return;
        };
        let touches_source = event.paths.is_empty()
            || event.paths.iter().any(|path| {
                path == &watched_source
                    || (path.file_name().is_some()
                        && path.file_name() == watched_source.file_name())
            });
        if !touches_source {
            return;
        }
        let generation = {
            let state = app_handle.state::<AppState>();
            let Ok(mut debounce) = state.source_debounce.lock() else {
                return;
            };
            let value = debounce.entry(callback_id.clone()).or_insert(0);
            *value = value.wrapping_add(1);
            *value
        };
        let delayed_app = app_handle.clone();
        let delayed_id = callback_id.clone();
        thread::spawn(move || {
            thread::sleep(SOURCE_WATCH_DEBOUNCE);
            let state = delayed_app.state::<AppState>();
            let is_latest = state
                .source_debounce
                .lock()
                .ok()
                .and_then(|debounce| debounce.get(&delayed_id).copied())
                == Some(generation);
            if !is_latest {
                return;
            }
            let Ok(record) = word_record_by_id(&state, &delayed_id) else {
                return;
            };
            let _ = sync_word_record(&state, &record);
            let _ = delayed_app.emit(
                "library-file://changed",
                LibraryFileChanged {
                    vault_id: record.vault_id.clone(),
                    path: record.path,
                },
            );
            let _ = delayed_app.emit(
                "vault://changed",
                VaultChanged {
                    vault_id: record.vault_id,
                },
            );
        });
    })
    .map_err(|error| app_error("WATCHER_FAILED", format!("无法监听外部原文件：{error}")))?;
    watcher
        .watch(parent, RecursiveMode::NonRecursive)
        .map_err(|error| app_error("WATCHER_FAILED", format!("无法监听外部原文件：{error}")))?;
    watchers.insert(id.to_string(), watcher);
    Ok(())
}

fn word_record_by_id(state: &AppState, id: &str) -> AppResult<WordFileRecord> {
    let db = state.db.lock().map_err(lock_error)?;
    db.query_row(
        "SELECT f.id, f.vault_id, v.path, f.path, f.kind, f.source_path
         FROM library_files f JOIN vaults v ON v.id = f.vault_id WHERE f.id = ?1",
        [id],
        map_word_record,
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| app_error("LIBRARY_FILE_NOT_FOUND", "Word 文档记录不存在"))
}

fn rollback_imports(state: &AppState, created: &[(String, PathBuf)]) {
    if let Ok(db) = state.db.lock() {
        for (id, path) in created {
            let _ = fs::remove_file(path);
            let _ = db.execute("DELETE FROM library_files WHERE id = ?1", [id]);
        }
    }
    if let Ok(mut watchers) = state.source_watchers.lock() {
        for (id, _) in created {
            watchers.remove(id);
        }
    }
    if let Ok(mut debounce) = state.source_debounce.lock() {
        for (id, _) in created {
            debounce.remove(id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

    fn test_state(temporary: &tempfile::TempDir) -> (AppState, PathBuf) {
        let root = temporary.path().join("vault");
        fs::create_dir_all(root.join("documents")).unwrap();
        let state = AppState {
            db: Mutex::new(init_database(&temporary.path().join("word-test.sqlite")).unwrap()),
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
        (state, root)
    }

    fn docx_with_relationship(relationship: Option<&str>) -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut archive = ZipWriter::new(cursor);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        archive.start_file("[Content_Types].xml", options).unwrap();
        archive
            .write_all(br#"<?xml version="1.0"?><Types/>"#)
            .unwrap();
        archive.start_file("word/document.xml", options).unwrap();
        archive
            .write_all(br#"<?xml version="1.0"?><w:document/>"#)
            .unwrap();
        if let Some(value) = relationship {
            archive
                .start_file("word/_rels/document.xml.rels", options)
                .unwrap();
            archive.write_all(value.as_bytes()).unwrap();
        }
        archive.finish().unwrap().into_inner()
    }

    #[test]
    fn accepts_minimal_docx_and_rejects_external_images() {
        validate_docx_archive(&docx_with_relationship(None)).unwrap();
        let external_image = r#"<Relationships><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.com/a.png" TargetMode="External"/></Relationships>"#;
        let error =
            validate_docx_archive(&docx_with_relationship(Some(external_image))).unwrap_err();
        assert_eq!(error.code, "DOCX_EXTERNAL_RESOURCE");
        assert_eq!(
            validate_docx_archive(b"not a zip").unwrap_err().code,
            "DOCX_INVALID"
        );
    }

    #[test]
    fn copies_without_changing_bytes_and_uses_numbered_collisions() {
        let temporary = tempfile::tempdir().unwrap();
        let source = temporary.path().join("source.docx");
        let target_dir = temporary.path().join("documents");
        fs::create_dir_all(&target_dir).unwrap();
        let bytes = docx_with_relationship(None);
        fs::write(&source, &bytes).unwrap();
        let target = unique_word_target(&target_dir, "学习笔记.docx").unwrap();
        let (size, source_hash) = copy_source_atomically(&source, &target).unwrap();
        assert_eq!(size, bytes.len() as u64);
        assert_eq!(fs::read(&target).unwrap(), bytes);
        assert_eq!(source_hash, hash_file(&target).unwrap());
        assert_eq!(
            unique_word_target(&target_dir, "学习笔记.docx")
                .unwrap()
                .file_name()
                .unwrap(),
            "学习笔记 (2).docx"
        );
    }

    #[test]
    fn syncs_one_way_and_keeps_the_copy_when_source_disappears() {
        let temporary = tempfile::tempdir().unwrap();
        let (state, root) = test_state(&temporary);
        let source = temporary.path().join("external.doc");
        let target = root.join("documents/external.doc");
        fs::write(&source, b"authoritative source").unwrap();
        fs::write(&target, b"old mirror").unwrap();
        index_scanned_word_file(&state, "vault", &root, &target).unwrap();
        state
            .db
            .lock()
            .unwrap()
            .execute(
                "UPDATE library_files SET source_path = ?1, sync_status = 'outOfSync'",
                [source.to_string_lossy().as_ref()],
            )
            .unwrap();
        let record = registered_word_record(&state, "vault", "documents/external.doc").unwrap();
        let synced = sync_word_record(&state, &record).unwrap();
        assert_eq!(synced.sync_status, "synced");
        assert_eq!(fs::read(&target).unwrap(), b"authoritative source");
        assert_eq!(
            preferred_open_path(&record).unwrap(),
            fs::canonicalize(&source).unwrap()
        );

        fs::remove_file(&source).unwrap();
        let missing = sync_word_record(&state, &record).unwrap();
        assert_eq!(missing.sync_status, "sourceMissing");
        assert_eq!(fs::read(&target).unwrap(), b"authoritative source");
        assert_eq!(
            preferred_open_path(&record).unwrap(),
            fs::canonicalize(&target).unwrap()
        );
    }

    #[test]
    fn scanned_word_files_are_listed_and_paths_cannot_escape() {
        let temporary = tempfile::tempdir().unwrap();
        let (state, root) = test_state(&temporary);
        let target = root.join("documents/方案.v2.doc");
        fs::write(&target, b"legacy word bytes").unwrap();
        index_scanned_word_file(&state, "vault", &root, &target).unwrap();
        let items = list_word_items_inner(&state, Some("vault")).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].kind, LibraryItemKind::Doc);
        assert_eq!(items[0].sync_status, "unlinked");
        assert!(registered_word_record(&state, "vault", "../secret.doc").is_err());
        assert_eq!(
            sanitize_word_name("方案.v3.doc", LibraryItemKind::Doc).unwrap(),
            "方案.v3"
        );
    }

    #[test]
    fn optional_acceptance_sample_is_read_only_and_previewable() {
        let Ok(sample_path) = std::env::var("NOTEHARBOR_DOCX_SAMPLE") else {
            return;
        };
        let sample = Path::new(&sample_path);
        if !sample.is_file() {
            return;
        }
        let original_hash = hash_file(sample).unwrap();
        let temporary = tempfile::tempdir().unwrap();
        let copied = temporary.path().join("sample.docx");
        copy_source_atomically(sample, &copied).unwrap();
        let bytes = fs::read(&copied).unwrap();
        validate_docx_archive(&bytes).unwrap();
        assert_eq!(original_hash, hash_file(sample).unwrap());
        assert_eq!(original_hash, hash_file(&copied).unwrap());
    }
}
