use super::*;
use std::io::{Read, Write};

const MAX_ATTACHMENT_BYTES: u64 = 100 * 1024 * 1024;
const MAX_PDF_PREVIEW_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultFolder {
    vault_id: String,
    path: String,
    name: String,
    protected: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DroppedPathInfo {
    path: String,
    name: String,
    is_directory: bool,
    kind: Option<LibraryItemKind>,
    size_bytes: u64,
    accepted: bool,
    reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportBatchResult {
    imported: Vec<LibraryItemSummary>,
    inserted_links: Vec<String>,
    rejected: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileReference {
    vault_id: String,
    source_path: String,
    source_title: String,
    target_path: String,
    raw_target: String,
    link_type: String,
    resolved: bool,
    reference_count: i64,
    role: String,
    kind: LibraryItemKind,
}

#[tauri::command]
pub(crate) fn inspect_dropped_paths(paths: Vec<String>) -> AppResult<Vec<DroppedPathInfo>> {
    paths
        .into_iter()
        .map(|path| {
            let source = PathBuf::from(&path);
            let metadata = fs::metadata(&source)
                .map_err(|_| app_error("FILE_NOT_FOUND", format!("文件不存在：{path}")))?;
            let name = source
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("未命名文件")
                .to_string();
            let kind = if metadata.is_file() {
                LibraryItemKind::from_path(&source)
            } else {
                None
            };
            let dangerous = metadata.is_file() && is_dangerous_path(&source);
            Ok(DroppedPathInfo {
                path,
                name,
                is_directory: metadata.is_dir(),
                kind,
                size_bytes: metadata.len(),
                accepted: metadata.is_dir()
                    || (metadata.is_file() && !dangerous && metadata.len() <= MAX_ATTACHMENT_BYTES),
                reason: if dangerous {
                    Some("出于安全考虑，不支持导入可执行文件、安装包或脚本".into())
                } else if metadata.is_file() && metadata.len() > MAX_ATTACHMENT_BYTES {
                    Some("单个文件不能超过 100MB".into())
                } else {
                    None
                },
            })
        })
        .collect()
}

#[tauri::command]
pub(crate) fn list_vault_folders(
    state: State<AppState>,
    vault_id: String,
) -> AppResult<Vec<VaultFolder>> {
    let vault = get_vault(&state, &vault_id)?;
    let root = fs::canonicalize(&vault.path).map_err(io_error)?;
    let mut folders = WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_dir() && entry.path() != root)
        .filter(|entry| !is_ignored_path(entry.path(), &root))
        .filter_map(|entry| {
            let path = relative_string(&root, entry.path()).ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            Some(VaultFolder {
                vault_id: vault_id.clone(),
                protected: path == "assets" || path == "documents",
                path,
                name,
            })
        })
        .collect::<Vec<_>>();
    folders.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(folders)
}

#[tauri::command]
pub(crate) fn create_vault_folder(
    state: State<AppState>,
    vault_id: String,
    parent_path: String,
    name: String,
) -> AppResult<VaultFolder> {
    let name = sanitize_folder_name(&name)?;
    let vault = get_vault(&state, &vault_id)?;
    let root = fs::canonicalize(&vault.path).map_err(io_error)?;
    let parent = safe_vault_directory(&root, &parent_path, true)?;
    let target = parent.join(&name);
    if target.exists() {
        return Err(app_error("FOLDER_ALREADY_EXISTS", "同名文件夹已经存在"));
    }
    fs::create_dir(&target).map_err(io_error)?;
    let path = relative_string(&root, &target)?;
    Ok(VaultFolder {
        vault_id,
        path: path.clone(),
        name,
        protected: path == "assets" || path == "documents",
    })
}

#[tauri::command]
pub(crate) fn reveal_vault_folder(
    app: AppHandle,
    state: State<AppState>,
    vault_id: String,
    path: String,
) -> AppResult<()> {
    let vault = get_vault(&state, &vault_id)?;
    let root = fs::canonicalize(&vault.path).map_err(io_error)?;
    let folder = safe_vault_directory(&root, &path, false)?;
    app.opener()
        .reveal_item_in_dir(&folder)
        .map_err(|error| app_error("REVEAL_FAILED", format!("无法在文件管理器中显示：{error}")))
}

#[tauri::command]
pub(crate) fn delete_vault_folder(
    state: State<AppState>,
    vault_id: String,
    path: String,
) -> AppResult<()> {
    ensure_mutable_folder(&path)?;
    let vault = get_vault(&state, &vault_id)?;
    let root = fs::canonicalize(&vault.path).map_err(io_error)?;
    let folder = safe_vault_directory(&root, &path, false)?;
    trash::delete(&folder)
        .map_err(|error| app_error("TRASH_FAILED", format!("无法移到系统废纸篓：{error}")))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn rename_vault_folder(
    state: State<AppState>,
    vault_id: String,
    path: String,
    new_name: String,
) -> AppResult<Vec<LibraryItemSummary>> {
    ensure_mutable_folder(&path)?;
    let new_name = sanitize_folder_name(&new_name)?;
    let vault = get_vault(&state, &vault_id)?;
    let root = fs::canonicalize(&vault.path).map_err(io_error)?;
    let old = safe_vault_directory(&root, &path, false)?;
    let parent = old
        .parent()
        .ok_or_else(|| app_error("INVALID_PATH", "文件夹路径无效"))?;
    let new = parent.join(new_name);
    if new.exists() {
        return Err(app_error("FOLDER_ALREADY_EXISTS", "同名文件夹已经存在"));
    }
    let old_prefix = format!("{}/", path.trim_end_matches('/'));
    let new_relative = relative_string(&root, &new)?;
    let new_prefix = format!("{new_relative}/");
    let mut rewrites = Vec::new();
    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter(|entry| LibraryItemKind::from_path(entry.path()).is_some_and(|kind| kind.is_text()))
    {
        let original = fs::read_to_string(entry.path()).map_err(io_error)?;
        let updated = rewrite_folder_targets(&original, entry.path(), &old, &new);
        if original != updated {
            let source_relative = relative_string(&root, entry.path())?;
            create_snapshot_inner(&state, &vault_id, &source_relative, &original)?;
            rewrites.push((entry.into_path(), original, updated));
        }
    }
    fs::rename(&old, &new).map_err(io_error)?;
    let mut written: Vec<(PathBuf, String)> = Vec::new();
    for (source, original, updated) in &rewrites {
        let target = if source.starts_with(&old) {
            new.join(source.strip_prefix(&old).unwrap_or(source))
        } else {
            source.clone()
        };
        if let Err(error) = atomic_write(&target, updated) {
            for (file, backup) in written.iter().rev() {
                let _ = atomic_write(file, backup);
            }
            let _ = fs::rename(&new, &old);
            return Err(error);
        }
        written.push((target, original.clone()));
    }
    let mut db = state.db.lock().map_err(lock_error)?;
    let transaction = db.transaction().map_err(db_error)?;
    transaction
        .execute(
            "UPDATE notes SET path = ?1 || substr(path, ?2)
             WHERE vault_id = ?3 AND path LIKE ?4",
            params![
                new_prefix,
                old_prefix.len() as i64 + 1,
                vault_id,
                format!("{old_prefix}%")
            ],
        )
        .map_err(db_error)?;
    transaction
        .execute("DELETE FROM notes_fts WHERE vault_id = ?1", [&vault_id])
        .map_err(db_error)?;
    transaction
        .execute(
            "UPDATE library_files SET path = ?1 || substr(path, ?2)
             WHERE vault_id = ?3 AND path LIKE ?4",
            params![
                new_prefix,
                old_prefix.len() as i64 + 1,
                vault_id,
                format!("{old_prefix}%")
            ],
        )
        .map_err(db_error)?;
    transaction
        .execute(
            "UPDATE history SET path = ?1 || substr(path, ?2)
             WHERE vault_id = ?3 AND path LIKE ?4",
            params![
                new_prefix,
                old_prefix.len() as i64 + 1,
                vault_id,
                format!("{old_prefix}%")
            ],
        )
        .map_err(db_error)?;
    transaction.commit().map_err(db_error)?;
    drop(db);
    // A scan rebuilds the text index and relative-reference index with the new paths.
    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
    {
        if LibraryItemKind::from_path(entry.path()).is_some_and(|kind| kind.is_text()) {
            index_file(&state, &vault_id, &root, entry.path())?;
        }
    }
    list_library_items_inner(&state, Some(&vault_id))
}

#[tauri::command]
pub(crate) fn import_text_documents(
    state: State<AppState>,
    vault_id: String,
    target_directory: String,
    source_paths: Vec<String>,
) -> AppResult<ImportBatchResult> {
    let vault = get_vault(&state, &vault_id)?;
    let root = fs::canonicalize(&vault.path).map_err(io_error)?;
    let target = safe_vault_directory(&root, &target_directory, true)?;
    let mut imported = Vec::new();
    let mut rejected = Vec::new();
    for raw in source_paths {
        let source = fs::canonicalize(&raw).map_err(io_error)?;
        let kind = LibraryItemKind::from_path(&source);
        if !kind.is_some_and(|value| value.is_text()) {
            rejected.push(raw);
            continue;
        }
        let mut content = String::new();
        fs::File::open(&source)
            .and_then(|mut file| file.read_to_string(&mut content))
            .map_err(|_| app_error("TEXT_NOT_UTF8", "Markdown/TXT 文件必须使用 UTF-8 编码"))?;
        let destination = unique_destination(&target, &source)?;
        atomic_copy(&source, &destination)?;
        index_file(&state, &vault_id, &root, &destination)?;
        imported.push(summary_for_text(
            &state,
            &vault_id,
            &relative_string(&root, &destination)?,
        )?);
    }
    Ok(ImportBatchResult {
        imported,
        inserted_links: Vec::new(),
        rejected,
    })
}

#[tauri::command]
pub(crate) fn import_library_files(
    state: State<AppState>,
    vault_id: String,
    target_directory: String,
    source_paths: Vec<String>,
) -> AppResult<ImportBatchResult> {
    import_files(
        &state,
        &vault_id,
        &target_directory,
        source_paths,
        "library",
        None,
    )
}

#[tauri::command]
pub(crate) fn import_attachments_from_paths(
    app: AppHandle,
    state: State<AppState>,
    vault_id: String,
    note_path: String,
    source_paths: Vec<String>,
) -> AppResult<ImportBatchResult> {
    let vault = get_vault(&state, &vault_id)?;
    let root = fs::canonicalize(&vault.path).map_err(io_error)?;
    let note = safe_note_path(&root, &note_path)?;
    let note_parent = note
        .parent()
        .ok_or_else(|| app_error("INVALID_PATH", "笔记路径无效"))?;
    let mut external_word_paths = Vec::new();
    let mut remaining = Vec::new();
    for source in source_paths {
        let canonical = fs::canonicalize(&source).map_err(io_error)?;
        if !canonical.starts_with(&root)
            && LibraryItemKind::from_path(&canonical).is_some_and(|kind| kind.is_word())
        {
            external_word_paths.push(source);
        } else {
            remaining.push(source);
        }
    }
    let mut result = import_files(
        &state,
        &vault_id,
        "assets",
        remaining,
        "attachment",
        Some(note_parent),
    )?;
    if !external_word_paths.is_empty() {
        let imported = word_files::import_word_documents(
            app,
            state.clone(),
            vault_id.clone(),
            external_word_paths,
        )?;
        for item in imported {
            state
                .db
                .lock()
                .map_err(lock_error)?
                .execute(
                    "UPDATE library_files SET role = 'attachment'
                     WHERE vault_id = ?1 AND path = ?2",
                    params![vault_id, item.path],
                )
                .map_err(db_error)?;
            let destination = root.join(&item.path);
            let link = pathdiff::diff_paths(&destination, note_parent)
                .unwrap_or_else(|| PathBuf::from(&item.path))
                .to_string_lossy()
                .replace('\\', "/")
                .replace(' ', "%20");
            let label = destination
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("Word 文档");
            result.inserted_links.push(format!("[{label}]({link})"));
            result
                .imported
                .push(generic_file_summary(&state, &vault_id, &item.path)?);
        }
    }
    Ok(result)
}

#[tauri::command]
pub(crate) fn promote_attachment(
    state: State<AppState>,
    vault_id: String,
    path: String,
) -> AppResult<LibraryItemSummary> {
    let vault = get_vault(&state, &vault_id)?;
    resolve_any_vault_file(Path::new(&vault.path), &path)?;
    let db = state.db.lock().map_err(lock_error)?;
    let changed = db
        .execute(
            "UPDATE library_files SET role = 'library' WHERE vault_id = ?1 AND path = ?2",
            params![vault_id, path],
        )
        .map_err(db_error)?;
    drop(db);
    if changed == 0 {
        return Err(app_error("LIBRARY_FILE_NOT_FOUND", "没有找到这个附件"));
    }
    generic_file_summary(&state, &vault_id, &path)
}

#[tauri::command]
pub(crate) fn list_file_references(
    state: State<AppState>,
    vault_id: String,
    source_path: Option<String>,
    target_path: Option<String>,
) -> AppResult<Vec<FileReference>> {
    let db = state.db.lock().map_err(lock_error)?;
    let mut statement = db
        .prepare(
            "SELECT r.vault_id, r.source_path, n.title, r.target_path, r.raw_target,
                    r.link_type, r.resolved,
                    (SELECT COUNT(DISTINCT source_path) FROM file_references x
                     WHERE x.vault_id = r.vault_id AND x.target_path = r.target_path),
                    COALESCE(f.role, 'attachment'), COALESCE(f.kind, 'file')
             FROM file_references r
             JOIN notes n ON n.vault_id = r.vault_id AND n.path = r.source_path
             LEFT JOIN library_files f ON f.vault_id = r.vault_id AND f.path = r.target_path
             WHERE r.vault_id = ?1
               AND (?2 IS NULL OR r.source_path = ?2)
               AND (?3 IS NULL OR r.target_path = ?3)
             ORDER BY r.source_path, r.target_path",
        )
        .map_err(db_error)?;
    let rows = statement
        .query_map(params![vault_id, source_path, target_path], |row| {
            let kind: String = row.get(9)?;
            Ok(FileReference {
                vault_id: row.get(0)?,
                source_path: row.get(1)?,
                source_title: row.get(2)?,
                target_path: row.get(3)?,
                raw_target: row.get(4)?,
                link_type: row.get(5)?,
                resolved: row.get::<_, i64>(6)? != 0,
                reference_count: row.get(7)?,
                role: row.get(8)?,
                kind: LibraryItemKind::from_db(&kind),
            })
        })
        .map_err(db_error)?
        .filter_map(Result::ok)
        .collect();
    Ok(rows)
}

#[tauri::command]
pub(crate) fn read_pdf_preview(
    state: State<AppState>,
    vault_id: String,
    path: String,
) -> AppResult<Vec<u8>> {
    let vault = get_vault(&state, &vault_id)?;
    let absolute = resolve_any_vault_file(Path::new(&vault.path), &path)?;
    if !absolute
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("pdf"))
    {
        return Err(app_error("UNSUPPORTED_FILE_TYPE", "这不是 PDF 文件"));
    }
    let metadata = fs::metadata(&absolute).map_err(io_error)?;
    if metadata.len() > MAX_PDF_PREVIEW_BYTES {
        return Err(app_error(
            "PDF_TOO_LARGE",
            "PDF 超过 50MB，请使用本地默认软件打开",
        ));
    }
    fs::read(absolute).map_err(io_error)
}

#[tauri::command]
pub(crate) fn open_vault_path(
    app: AppHandle,
    state: State<AppState>,
    vault_id: String,
    path: String,
) -> AppResult<()> {
    let vault = get_vault(&state, &vault_id)?;
    let absolute = resolve_any_vault_file(Path::new(&vault.path), &path)?;
    app.opener()
        .open_path(absolute.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| app_error("OPEN_FAILED", format!("无法使用默认软件打开：{error}")))
}

#[tauri::command]
pub(crate) fn move_vault_file(
    state: State<AppState>,
    vault_id: String,
    path: String,
    target_directory: String,
) -> AppResult<LibraryItemSummary> {
    let vault = get_vault(&state, &vault_id)?;
    let root = fs::canonicalize(&vault.path).map_err(io_error)?;
    let old = resolve_any_vault_file(&root, &path)?;
    let target_folder = safe_vault_directory(&root, &target_directory, true)?;
    let destination = unique_destination(&target_folder, &old)?;
    let new_path = relative_string(&root, &destination)?;
    let references = reference_sources(&state, &vault_id, &path)?;
    let mut rewrites = Vec::new();
    for source_path in references {
        let source = safe_note_path(&root, &source_path)?;
        let original = fs::read_to_string(&source).map_err(io_error)?;
        let updated = rewrite_relative_target(&original, &source, &old, &destination);
        if original != updated {
            create_snapshot_inner(&state, &vault_id, &source_path, &original)?;
            rewrites.push((source, original, updated));
        }
    }
    fs::rename(&old, &destination).map_err(io_error)?;
    let mut written: Vec<(PathBuf, String)> = Vec::new();
    for (source, original, updated) in &rewrites {
        if let Err(error) = atomic_write(source, updated) {
            for (file, backup) in written.iter().rev() {
                let _ = atomic_write(file, backup);
            }
            let _ = fs::rename(&destination, &old);
            return Err(error);
        }
        written.push((source.clone(), original.clone()));
    }
    {
        let db = state.db.lock().map_err(lock_error)?;
        db.execute(
            "UPDATE library_files SET path = ?1 WHERE vault_id = ?2 AND path = ?3",
            params![new_path, vault_id, path],
        )
        .map_err(db_error)?;
    }
    for (source, _, _) in rewrites {
        index_file(&state, &vault_id, &root, &source)?;
    }
    generic_file_summary(&state, &vault_id, &new_path)
}

pub(super) fn index_file_references(
    state: &AppState,
    vault_id: &str,
    root: &Path,
    source_path: &Path,
    content: &str,
) -> AppResult<()> {
    let source_relative = relative_string(root, source_path)?;
    let link_pattern =
        Regex::new(r#"(?P<image>!)?\[[^\]]*\]\((?P<target>[^)\s]+)(?:\s+["'][^"']*["'])?\)"#)
            .map_err(|error| app_error("LINK_PARSE_FAILED", error.to_string()))?;
    let mut parsed = Vec::new();
    for captures in link_pattern.captures_iter(content) {
        let raw = captures
            .name("target")
            .map(|value| value.as_str())
            .unwrap_or("");
        let decoded = raw.replace("%20", " ");
        if decoded.starts_with('#')
            || decoded.starts_with('/')
            || decoded.contains("://")
            || decoded.starts_with("mailto:")
        {
            continue;
        }
        let Some(parent) = source_path.parent() else {
            continue;
        };
        let candidate = normalize_path(&parent.join(&decoded));
        if !candidate.starts_with(root) {
            continue;
        }
        let target = relative_string(root, &candidate)?;
        parsed.push((
            target,
            raw.to_string(),
            if captures.name("image").is_some() {
                "image"
            } else {
                "link"
            },
            candidate.is_file(),
        ));
    }
    let mut db = state.db.lock().map_err(lock_error)?;
    let transaction = db.transaction().map_err(db_error)?;
    transaction
        .execute(
            "DELETE FROM file_references WHERE vault_id = ?1 AND source_path = ?2",
            params![vault_id, source_relative],
        )
        .map_err(db_error)?;
    for (target, raw, link_type, resolved) in parsed {
        transaction
            .execute(
                "INSERT OR IGNORE INTO file_references
                 (vault_id, source_path, target_path, raw_target, link_type, resolved)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    vault_id,
                    source_relative,
                    target,
                    raw,
                    link_type,
                    resolved as i64
                ],
            )
            .map_err(db_error)?;
    }
    transaction.commit().map_err(db_error)?;
    Ok(())
}

pub(super) fn reconcile_asset_records(
    state: &AppState,
    vault_id: &str,
    root: &Path,
) -> AppResult<()> {
    let targets = {
        let db = state.db.lock().map_err(lock_error)?;
        let mut statement = db
            .prepare(
                "SELECT DISTINCT target_path FROM file_references
                 WHERE vault_id = ?1 AND target_path LIKE 'assets/%'",
            )
            .map_err(db_error)?;
        let targets = statement
            .query_map([vault_id], |row| row.get::<_, String>(0))
            .map_err(db_error)?
            .filter_map(Result::ok)
            .collect::<Vec<_>>();
        targets
    };
    for path in targets {
        let absolute = root.join(&path);
        if absolute.is_file() {
            register_generic_file(state, vault_id, root, &absolute, "attachment")?;
        }
    }
    Ok(())
}

pub(super) fn register_scanned_library_file(
    state: &AppState,
    vault_id: &str,
    root: &Path,
    path: &Path,
) -> AppResult<()> {
    register_generic_file(state, vault_id, root, path, "library")
}

pub(super) fn rename_generic_library_file(
    state: &AppState,
    vault_id: &str,
    path: &str,
    new_name: &str,
) -> AppResult<LibraryItemSummary> {
    let vault = get_vault(state, vault_id)?;
    let root = fs::canonicalize(&vault.path).map_err(io_error)?;
    let old = resolve_any_vault_file(&root, path)?;
    let cleaned = new_name.trim();
    if cleaned.is_empty()
        || cleaned == "."
        || cleaned == ".."
        || cleaned
            .chars()
            .any(|character| ['/', '\\', ':', '\0'].contains(&character))
    {
        return Err(app_error("INVALID_FILE_NAME", "文件名称无效"));
    }
    let extension = old
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let suffix = if extension.is_empty() {
        String::new()
    } else {
        format!(".{extension}")
    };
    let stem = if !suffix.is_empty()
        && cleaned
            .to_ascii_lowercase()
            .ends_with(&suffix.to_ascii_lowercase())
    {
        &cleaned[..cleaned.len() - suffix.len()]
    } else {
        cleaned
    };
    let destination = old
        .parent()
        .ok_or_else(|| app_error("INVALID_PATH", "文件路径无效"))?
        .join(format!("{stem}{suffix}"));
    if destination.exists() {
        return Err(app_error("FILE_ALREADY_EXISTS", "同名文件已经存在"));
    }
    let references = reference_sources(state, vault_id, path)?;
    let mut rewrites = Vec::new();
    for source_path in references {
        let source = safe_note_path(&root, &source_path)?;
        let original = fs::read_to_string(&source).map_err(io_error)?;
        let updated = rewrite_relative_target(&original, &source, &old, &destination);
        if original != updated {
            create_snapshot_inner(state, vault_id, &source_path, &original)?;
            rewrites.push((source, original, updated));
        }
    }
    fs::rename(&old, &destination).map_err(io_error)?;
    let mut written: Vec<(PathBuf, String)> = Vec::new();
    for (source, original, updated) in &rewrites {
        if let Err(error) = atomic_write(source, updated) {
            for (file, backup) in written.iter().rev() {
                let _ = atomic_write(file, backup);
            }
            let _ = fs::rename(&destination, &old);
            return Err(error);
        }
        written.push((source.clone(), original.clone()));
    }
    let new_path = relative_string(&root, &destination)?;
    state
        .db
        .lock()
        .map_err(lock_error)?
        .execute(
            "UPDATE library_files SET path = ?1, original_name = ?2
             WHERE vault_id = ?3 AND path = ?4",
            params![
                new_path,
                destination.file_name().and_then(|value| value.to_str()),
                vault_id,
                path
            ],
        )
        .map_err(db_error)?;
    for (source, _, _) in rewrites {
        index_file(state, vault_id, &root, &source)?;
    }
    generic_file_summary(state, vault_id, &new_path)
}

pub(super) fn delete_generic_library_file(
    state: &AppState,
    vault_id: &str,
    path: &str,
) -> AppResult<()> {
    let vault = get_vault(state, vault_id)?;
    let absolute = resolve_any_vault_file(Path::new(&vault.path), path)?;
    trash::delete(&absolute)
        .map_err(|error| app_error("TRASH_FAILED", format!("无法移到系统废纸篓：{error}")))?;
    state
        .db
        .lock()
        .map_err(lock_error)?
        .execute(
            "DELETE FROM library_files WHERE vault_id = ?1 AND path = ?2",
            params![vault_id, path],
        )
        .map_err(db_error)?;
    Ok(())
}

fn import_files(
    state: &AppState,
    vault_id: &str,
    target_directory: &str,
    source_paths: Vec<String>,
    role: &str,
    note_parent: Option<&Path>,
) -> AppResult<ImportBatchResult> {
    let vault = get_vault(state, vault_id)?;
    let root = fs::canonicalize(&vault.path).map_err(io_error)?;
    let target = safe_vault_directory(&root, target_directory, true)?;
    let mut imported = Vec::new();
    let mut inserted_links = Vec::new();
    let mut rejected = Vec::new();
    for raw in source_paths {
        let source = fs::canonicalize(&raw).map_err(io_error)?;
        let metadata = fs::metadata(&source).map_err(io_error)?;
        if !metadata.is_file()
            || metadata.len() > MAX_ATTACHMENT_BYTES
            || is_dangerous_path(&source)
        {
            rejected.push(raw);
            continue;
        }
        if note_parent.is_some()
            && LibraryItemKind::from_path(&source).is_some_and(|kind| kind.is_text())
        {
            let mut content = String::new();
            fs::File::open(&source)
                .and_then(|mut file| file.read_to_string(&mut content))
                .map_err(|_| app_error("TEXT_NOT_UTF8", "Markdown/TXT 文件必须使用 UTF-8 编码"))?;
            inserted_links.push(content);
            continue;
        }
        let canonical_root = &root;
        let destination = if source.starts_with(canonical_root) {
            source
        } else {
            let destination = unique_destination(&target, &source)?;
            atomic_copy(&source, &destination)?;
            destination
        };
        register_generic_file(state, vault_id, &root, &destination, role)?;
        let relative = relative_string(&root, &destination)?;
        let summary = generic_file_summary(state, vault_id, &relative)?;
        if let Some(parent) = note_parent {
            let link = pathdiff::diff_paths(&destination, parent)
                .unwrap_or_else(|| PathBuf::from(&relative))
                .to_string_lossy()
                .replace('\\', "/")
                .replace(' ', "%20");
            let is_image = is_image_path(&destination);
            let label = destination
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("附件");
            inserted_links.push(if is_image {
                format!("![{label}]({link})")
            } else {
                format!("[{label}]({link})")
            });
        }
        imported.push(summary);
    }
    Ok(ImportBatchResult {
        imported,
        inserted_links,
        rejected,
    })
}

pub(super) fn register_generic_file(
    state: &AppState,
    vault_id: &str,
    root: &Path,
    path: &Path,
    role: &str,
) -> AppResult<()> {
    let metadata = fs::metadata(path).map_err(io_error)?;
    let relative = relative_string(root, path)?;
    let kind = LibraryItemKind::from_path(path).unwrap_or(LibraryItemKind::File);
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    let original_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned);
    let content_hash = hash_file(path)?;
    state
        .db
        .lock()
        .map_err(lock_error)?
        .execute(
            "INSERT INTO library_files (
               id, vault_id, path, kind, role, original_name, extension, mime_type,
               size_bytes, content_hash, modified_at, modified_unix, sync_status
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'unlinked')
             ON CONFLICT(vault_id, path) DO UPDATE SET
               kind = excluded.kind, role = CASE
                 WHEN library_files.role = 'library' THEN 'library' ELSE excluded.role END,
               original_name = excluded.original_name, extension = excluded.extension,
               mime_type = excluded.mime_type, size_bytes = excluded.size_bytes,
               content_hash = excluded.content_hash, modified_at = excluded.modified_at,
               modified_unix = excluded.modified_unix",
            params![
                Uuid::new_v4().to_string(),
                vault_id,
                relative,
                kind.as_str(),
                role,
                original_name,
                extension,
                mime_for_path(path),
                metadata.len() as i64,
                content_hash,
                modified_iso(&metadata),
                modified_unix(&metadata),
            ],
        )
        .map_err(db_error)?;
    Ok(())
}

fn generic_file_summary(
    state: &AppState,
    vault_id: &str,
    path: &str,
) -> AppResult<LibraryItemSummary> {
    state
        .db
        .lock()
        .map_err(lock_error)?
        .query_row(
            "SELECT path, kind, modified_at, favorite, pinned, last_opened, source_path,
                    size_bytes, sync_status, last_synced_at, role, mime_type, original_name
             FROM library_files WHERE vault_id = ?1 AND path = ?2",
            params![vault_id, path],
            |row| {
                let path: String = row.get(0)?;
                let kind: String = row.get(1)?;
                Ok(LibraryItemSummary {
                    vault_id: vault_id.to_string(),
                    title: title_from_path(Path::new(&path)),
                    path,
                    kind: LibraryItemKind::from_db(&kind),
                    tags: Vec::new(),
                    modified_at: row.get(2)?,
                    is_favorite: row.get::<_, i64>(3)? != 0,
                    is_pinned: row.get::<_, i64>(4)? != 0,
                    last_opened: row.get(5)?,
                    source_path: row.get(6)?,
                    size_bytes: row.get::<_, i64>(7)?.max(0) as u64,
                    sync_status: row.get(8)?,
                    last_synced_at: row.get(9)?,
                    role: row.get(10)?,
                    mime_type: row.get(11)?,
                    original_name: row.get(12)?,
                })
            },
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| app_error("LIBRARY_FILE_NOT_FOUND", "没有找到这个资料库文件"))
}

fn summary_for_text(state: &AppState, vault_id: &str, path: &str) -> AppResult<LibraryItemSummary> {
    let note = read_note_inner(state, vault_id, path)?;
    let vault = get_vault(state, vault_id)?;
    let size_bytes = fs::metadata(Path::new(&vault.path).join(path))
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    Ok(LibraryItemSummary {
        vault_id: note.summary.vault_id,
        path: note.summary.path,
        title: note.summary.title,
        kind: note.kind,
        tags: note.summary.tags,
        modified_at: note.summary.modified_at,
        is_favorite: note.summary.is_favorite,
        is_pinned: note.summary.is_pinned,
        last_opened: note.summary.last_opened,
        source_path: None,
        size_bytes,
        sync_status: "unlinked".into(),
        last_synced_at: None,
        role: "library".into(),
        mime_type: Some(
            if note.kind == LibraryItemKind::Txt {
                "text/plain"
            } else {
                "text/markdown"
            }
            .into(),
        ),
        original_name: None,
    })
}

fn reference_sources(state: &AppState, vault_id: &str, target: &str) -> AppResult<Vec<String>> {
    let db = state.db.lock().map_err(lock_error)?;
    let mut statement = db
        .prepare(
            "SELECT DISTINCT source_path FROM file_references
             WHERE vault_id = ?1 AND target_path = ?2",
        )
        .map_err(db_error)?;
    let sources = statement
        .query_map(params![vault_id, target], |row| row.get(0))
        .map_err(db_error)?
        .filter_map(Result::ok)
        .collect();
    Ok(sources)
}

fn rewrite_relative_target(content: &str, source: &Path, old: &Path, new: &Path) -> String {
    let Some(parent) = source.parent() else {
        return content.to_string();
    };
    let Some(old_relative) = pathdiff::diff_paths(old, parent) else {
        return content.to_string();
    };
    let Some(new_relative) = pathdiff::diff_paths(new, parent) else {
        return content.to_string();
    };
    let old_link = old_relative.to_string_lossy().replace('\\', "/");
    let new_link = new_relative.to_string_lossy().replace('\\', "/");
    content
        .replace(&format!("]({old_link})"), &format!("]({new_link})"))
        .replace(
            &format!("]({})", old_link.replace(' ', "%20")),
            &format!("]({})", new_link.replace(' ', "%20")),
        )
}

fn rewrite_folder_targets(
    content: &str,
    source: &Path,
    old_folder: &Path,
    new_folder: &Path,
) -> String {
    let pattern = match Regex::new(r#"(?P<prefix>!?\[[^\]]*\]\()(?P<target>[^)\s]+)(?P<suffix>\))"#)
    {
        Ok(pattern) => pattern,
        Err(_) => return content.to_string(),
    };
    pattern
        .replace_all(content, |captures: &regex::Captures<'_>| {
            let raw = captures
                .name("target")
                .map(|value| value.as_str())
                .unwrap_or("");
            if raw.starts_with('#') || raw.starts_with('/') || raw.contains("://") {
                return captures
                    .get(0)
                    .map(|value| value.as_str())
                    .unwrap_or("")
                    .to_string();
            }
            let Some(parent) = source.parent() else {
                return captures
                    .get(0)
                    .map(|value| value.as_str())
                    .unwrap_or("")
                    .to_string();
            };
            let decoded = raw.replace("%20", " ");
            let target = normalize_path(&parent.join(decoded));
            if !target.starts_with(old_folder) {
                return captures
                    .get(0)
                    .map(|value| value.as_str())
                    .unwrap_or("")
                    .to_string();
            }
            let mapped = new_folder.join(target.strip_prefix(old_folder).unwrap_or(&target));
            let moved_source = if source.starts_with(old_folder) {
                new_folder.join(source.strip_prefix(old_folder).unwrap_or(source))
            } else {
                source.to_path_buf()
            };
            let new_parent = moved_source.parent().unwrap_or(parent);
            let new_raw = pathdiff::diff_paths(mapped, new_parent)
                .unwrap_or_default()
                .to_string_lossy()
                .replace('\\', "/");
            format!(
                "{}{}{}",
                captures
                    .name("prefix")
                    .map(|value| value.as_str())
                    .unwrap_or(""),
                new_raw,
                captures
                    .name("suffix")
                    .map(|value| value.as_str())
                    .unwrap_or("")
            )
        })
        .to_string()
}

fn unique_destination(directory: &Path, source: &Path) -> AppResult<PathBuf> {
    let name = source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| app_error("INVALID_FILE_NAME", "文件名无效"))?;
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(name);
    let extension = source.extension().and_then(|value| value.to_str());
    let mut counter = 1;
    loop {
        let candidate_name = if counter == 1 {
            name.to_string()
        } else if let Some(extension) = extension {
            format!("{stem} ({counter}).{extension}")
        } else {
            format!("{stem} ({counter})")
        };
        let candidate = directory.join(candidate_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
        counter += 1;
    }
}

fn atomic_copy(source: &Path, destination: &Path) -> AppResult<()> {
    let parent = destination
        .parent()
        .ok_or_else(|| app_error("INVALID_PATH", "目标路径无效"))?;
    fs::create_dir_all(parent).map_err(io_error)?;
    let mut source_file = fs::File::open(source).map_err(io_error)?;
    let mut temporary = NamedTempFile::new_in(parent).map_err(io_error)?;
    std::io::copy(&mut source_file, &mut temporary).map_err(io_error)?;
    temporary.as_file_mut().flush().map_err(io_error)?;
    temporary.as_file().sync_all().map_err(io_error)?;
    temporary
        .persist(destination)
        .map_err(|error| io_error(error.error))?;
    Ok(())
}

fn hash_file(path: &Path) -> AppResult<String> {
    let mut file = fs::File::open(path).map_err(io_error)?;
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

pub(super) fn safe_vault_directory(
    root: &Path,
    relative: &str,
    create: bool,
) -> AppResult<PathBuf> {
    let path = Path::new(relative);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(app_error("INVALID_PATH", "文件夹路径不能离开资料库"));
    }
    let candidate = root.join(path);
    if create {
        let mut existing = candidate.as_path();
        while !existing.exists() {
            existing = existing
                .parent()
                .ok_or_else(|| app_error("INVALID_PATH", "文件夹路径无效"))?;
        }
        let canonical_existing = fs::canonicalize(existing).map_err(io_error)?;
        if !canonical_existing.starts_with(root) {
            return Err(app_error("INVALID_PATH", "文件夹路径不能离开资料库"));
        }
        fs::create_dir_all(&candidate).map_err(io_error)?;
    }
    let canonical = fs::canonicalize(&candidate).map_err(io_error)?;
    if !canonical.starts_with(root) || !canonical.is_dir() {
        return Err(app_error("INVALID_PATH", "文件夹路径不能离开资料库"));
    }
    Ok(canonical)
}

fn resolve_any_vault_file(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let root = fs::canonicalize(root).map_err(io_error)?;
    let path = Path::new(relative);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(app_error("INVALID_PATH", "文件路径不能离开资料库"));
    }
    let absolute = fs::canonicalize(root.join(path)).map_err(io_error)?;
    if !absolute.starts_with(&root) || !absolute.is_file() {
        return Err(app_error("INVALID_PATH", "文件路径不能离开资料库"));
    }
    Ok(absolute)
}

fn ensure_mutable_folder(path: &str) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(app_error(
            "PROTECTED_FOLDER",
            "资料库根目录不能重命名或删除",
        ));
    }
    let normalized = path.trim_matches('/');
    if normalized == "assets" || normalized == "documents" {
        return Err(app_error(
            "PROTECTED_FOLDER",
            "assets 和 documents 是受保护的系统文件夹",
        ));
    }
    Ok(())
}

fn sanitize_folder_name(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty()
        || value == "."
        || value == ".."
        || value
            .chars()
            .any(|character| ['/', '\\', ':', '\0'].contains(&character))
    {
        return Err(app_error("INVALID_FOLDER_NAME", "文件夹名称无效"));
    }
    Ok(value.to_string())
}

fn is_dangerous_path(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .is_some_and(|extension| {
            matches!(
                extension.as_str(),
                "app"
                    | "exe"
                    | "msi"
                    | "dmg"
                    | "pkg"
                    | "bat"
                    | "cmd"
                    | "com"
                    | "ps1"
                    | "sh"
                    | "zsh"
                    | "bash"
                    | "command"
                    | "js"
                    | "vbs"
                    | "jar"
            )
        })
}

fn is_image_path(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .is_some_and(|extension| {
            matches!(
                extension.as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "heic"
            )
        })
}

fn mime_for_path(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(
        match extension.as_str() {
            "pdf" => "application/pdf",
            "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "doc" => "application/msword",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            "txt" => "text/plain",
            "md" => "text/markdown",
            _ => "application/octet-stream",
        }
        .to_string(),
    )
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                result.pop();
            }
            other => result.push(other.as_os_str()),
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_executable_and_script_extensions() {
        assert!(is_dangerous_path(Path::new("setup.exe")));
        assert!(is_dangerous_path(Path::new("run.ps1")));
        assert!(!is_dangerous_path(Path::new("资料.pdf")));
    }

    #[test]
    fn numbered_collisions_keep_the_original_extension() {
        let temporary = tempfile::tempdir().unwrap();
        fs::write(temporary.path().join("报告.pdf"), b"one").unwrap();
        let next = unique_destination(temporary.path(), Path::new("报告.pdf")).unwrap();
        assert_eq!(next.file_name().unwrap(), "报告 (2).pdf");
    }

    #[test]
    fn moving_a_folder_rewrites_links_from_inside_and_outside() {
        let root = Path::new("/vault");
        let old = root.join("旧目录");
        let new = root.join("新目录");
        let outside = root.join("索引.md");
        let inside = old.join("说明.md");
        assert_eq!(
            rewrite_folder_targets("[附件](旧目录/文件.pdf)", &outside, &old, &new),
            "[附件](新目录/文件.pdf)"
        );
        assert_eq!(
            rewrite_folder_targets("[附件](文件.pdf)", &inside, &old, &new),
            "[附件](文件.pdf)"
        );
    }

    #[test]
    fn removing_dot_segments_never_preserves_parent_components() {
        assert_eq!(
            normalize_path(Path::new("/vault/notes/../assets/a.png")),
            PathBuf::from("/vault/assets/a.png")
        );
    }
}
