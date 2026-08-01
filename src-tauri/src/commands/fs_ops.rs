//! Filesystem commands.
//!
//! Every path argument arrives from the webview and is therefore untrusted. All
//! of them are resolved through [`paths::resolve_within`] against the open
//! project root, so a malformed or malicious path cannot read or write outside
//! the project.

use crate::error::{AppError, AppResult, ErrorKind};
use crate::models::{FileContent, FileNode};
use crate::paths;
use crate::state::AppState;
use crate::tree;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;
use tauri::State;

/// Refuse to load anything larger than this into the text editor. Monaco
/// becomes unusable well before this point, and the message is friendlier than
/// a frozen window.
const MAX_TEXT_FILE_BYTES: u64 = 16 * 1024 * 1024;

/// Modification time in Unix-epoch milliseconds, or 0 when unavailable.
pub fn modified_millis(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn read_text_file(state: State<'_, AppState>, path: String) -> AppResult<FileContent> {
    let root = state.project.require()?;
    let target = paths::resolve_within(&root, Path::new(&path))?;

    let metadata = fs::metadata(&target).map_err(|e| AppError::from_io(&e, &target))?;
    if metadata.is_dir() {
        return Err(AppError::invalid_path(format!(
            "“{path}” is a folder, not a file."
        )));
    }
    if metadata.len() > MAX_TEXT_FILE_BYTES {
        return Err(AppError::new(
            ErrorKind::Io,
            format!(
                "“{path}” is {:.1} MB, which is too large to open in the editor.",
                metadata.len() as f64 / 1_048_576.0
            ),
        )
        .with_hint("Open it in an external editor instead."));
    }

    let bytes = fs::read(&target).map_err(|e| AppError::from_io(&e, &target))?;

    // Decode leniently: a stray Latin-1 byte in a .bib file should not make the
    // file unopenable, but the UI warns before saving over the original bytes.
    let (content, lossy) = match String::from_utf8(bytes) {
        Ok(text) => (text, false),
        Err(err) => (String::from_utf8_lossy(err.as_bytes()).into_owned(), true),
    };

    Ok(FileContent {
        path: paths::relative_to(&root, &target),
        content,
        modified: modified_millis(&target),
        lossy,
    })
}

/// Write text to a file, creating it if necessary. Returns the new mtime so the
/// frontend can distinguish its own write from an external change.
#[tauri::command]
pub fn write_text_file(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> AppResult<u64> {
    let root = state.project.require()?;
    let target = paths::resolve_within(&root, Path::new(&path))?;

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::from_io(&e, parent))?;
    }

    fs::write(&target, content).map_err(|e| AppError::from_io(&e, &target))?;
    Ok(modified_millis(&target))
}

/// Read a file as raw bytes.
///
/// Returns a [`tauri::ipc::Response`] so the payload crosses the IPC boundary
/// as binary rather than a JSON array of numbers — the difference between a
/// few milliseconds and several seconds for a large PDF.
#[tauri::command]
pub fn read_binary_file(
    state: State<'_, AppState>,
    path: String,
) -> AppResult<tauri::ipc::Response> {
    let root = state.project.require()?;
    let target = paths::resolve_within(&root, Path::new(&path))?;

    let bytes = fs::read(&target).map_err(|e| AppError::from_io(&e, &target))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Read a PDF from anywhere on disk that InkTex itself produced.
///
/// The build directory may sit outside the project root when the user has
/// configured an absolute output path, so this bypasses the project scope but
/// only ever accepts `.pdf` files.
#[tauri::command]
pub fn read_pdf_file(path: String) -> AppResult<tauri::ipc::Response> {
    let target = Path::new(&path);

    if paths::extension_of(target) != "pdf" {
        return Err(AppError::invalid_path(
            "Only PDF files can be read this way.",
        ));
    }
    let bytes = fs::read(target).map_err(|e| AppError::from_io(&e, target))?;

    if bytes.len() < 5 || &bytes[..5] != b"%PDF-" {
        return Err(
            AppError::new(ErrorKind::Io, "The output file is not a valid PDF.")
                .with_hint("The compiler may have been interrupted. Try compiling again."),
        );
    }

    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn create_file(
    state: State<'_, AppState>,
    parent: String,
    name: String,
) -> AppResult<FileNode> {
    let root = state.project.require()?;
    paths::validate_file_name(&name)?;

    let parent_dir = paths::resolve_within(&root, Path::new(&parent))?;
    fs::create_dir_all(&parent_dir).map_err(|e| AppError::from_io(&e, &parent_dir))?;

    let target = paths::resolve_within(&root, &parent_dir.join(name.trim()))?;
    if target.exists() {
        return Err(AppError::already_exists(&target));
    }

    fs::write(&target, "").map_err(|e| AppError::from_io(&e, &target))?;
    tree::node_for(&root, &target)
}

#[tauri::command]
pub fn create_directory(
    state: State<'_, AppState>,
    parent: String,
    name: String,
) -> AppResult<FileNode> {
    let root = state.project.require()?;
    paths::validate_file_name(&name)?;

    let parent_dir = paths::resolve_within(&root, Path::new(&parent))?;
    let target = paths::resolve_within(&root, &parent_dir.join(name.trim()))?;

    if target.exists() {
        return Err(AppError::already_exists(&target));
    }

    fs::create_dir_all(&target).map_err(|e| AppError::from_io(&e, &target))?;
    tree::node_for(&root, &target)
}

/// Rename a file or folder in place. Returns the new project-relative path.
#[tauri::command]
pub fn rename_entry(
    state: State<'_, AppState>,
    path: String,
    new_name: String,
) -> AppResult<String> {
    let root = state.project.require()?;
    paths::validate_file_name(&new_name)?;

    let source = paths::resolve_within(&root, Path::new(&path))?;
    if !source.exists() {
        return Err(AppError::not_found(format!("“{path}”")));
    }
    if source == root {
        return Err(AppError::invalid_path(
            "The project folder itself cannot be renamed from here.",
        ));
    }

    let parent = source
        .parent()
        .ok_or_else(|| AppError::invalid_path("That item has no parent folder."))?;
    let destination = paths::resolve_within(&root, &parent.join(new_name.trim()))?;

    // A case-only rename ("notes.tex" -> "Notes.tex") is a no-op collision on
    // case-insensitive filesystems, so allow it explicitly.
    if destination.exists() && destination != source {
        return Err(AppError::already_exists(&destination));
    }

    fs::rename(&source, &destination).map_err(|e| AppError::from_io(&e, &source))?;
    Ok(paths::relative_to(&root, &destination))
}

/// Move an entry into another folder. Returns the new project-relative path.
#[tauri::command]
pub fn move_entry(
    state: State<'_, AppState>,
    path: String,
    destination_parent: String,
) -> AppResult<String> {
    let root = state.project.require()?;

    let source = paths::resolve_within(&root, Path::new(&path))?;
    let parent = paths::resolve_within(&root, Path::new(&destination_parent))?;

    if !parent.is_dir() {
        return Err(AppError::invalid_path("The destination is not a folder."));
    }
    // Moving a folder inside itself would detach the subtree.
    if parent.starts_with(&source) {
        return Err(AppError::invalid_path(
            "A folder cannot be moved inside itself.",
        ));
    }

    let name = source
        .file_name()
        .ok_or_else(|| AppError::invalid_path("That item cannot be moved."))?;
    let destination = parent.join(name);

    if destination.exists() {
        return Err(AppError::already_exists(&destination));
    }

    fs::rename(&source, &destination).map_err(|e| AppError::from_io(&e, &source))?;
    Ok(paths::relative_to(&root, &destination))
}

#[tauri::command]
pub fn delete_entry(state: State<'_, AppState>, path: String) -> AppResult<()> {
    let root = state.project.require()?;
    let target = paths::resolve_within(&root, Path::new(&path))?;

    if target == root {
        return Err(AppError::invalid_path(
            "The project folder itself cannot be deleted from here.",
        ));
    }
    if !target.exists() {
        return Err(AppError::not_found(format!("“{path}”")));
    }

    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|e| AppError::from_io(&e, &target))?;
    } else {
        fs::remove_file(&target).map_err(|e| AppError::from_io(&e, &target))?;
    }
    Ok(())
}

/// Copy an external file into the project — used by drag-and-drop image import.
///
/// The source is intentionally *not* scoped to the project (it comes from
/// elsewhere on disk); the destination is.
#[tauri::command]
pub fn import_file(
    state: State<'_, AppState>,
    source_path: String,
    destination_parent: String,
) -> AppResult<FileNode> {
    let root = state.project.require()?;
    let source = Path::new(&source_path);

    if !source.is_file() {
        return Err(AppError::not_found(format!("“{source_path}”")));
    }

    let parent = paths::resolve_within(&root, Path::new(&destination_parent))?;
    fs::create_dir_all(&parent).map_err(|e| AppError::from_io(&e, &parent))?;

    let file_name = source
        .file_name()
        .ok_or_else(|| AppError::invalid_path("That file has no name."))?;

    // Never clobber an existing asset; disambiguate with a numeric suffix.
    let mut destination = parent.join(file_name);
    if destination.exists() {
        let stem = source
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "file".into());
        let extension = source
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();

        for index in 1..1000 {
            let candidate = parent.join(format!("{stem}-{index}{extension}"));
            if !candidate.exists() {
                destination = candidate;
                break;
            }
        }
    }

    let destination = paths::resolve_within(&root, &destination)?;
    fs::copy(source, &destination).map_err(|e| AppError::from_io(&e, &destination))?;
    tree::node_for(&root, &destination)
}

/// Metadata about an arbitrary path on disk.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathKind {
    pub path: String,
    pub exists: bool,
    pub is_directory: bool,
}

/// Classify paths that arrived from a drag-and-drop.
///
/// Dropping a folder should open it as a project while dropping files should
/// import them, and the webview only ever receives opaque path strings. This is
/// read-only metadata, so it is deliberately not scoped to the project.
#[tauri::command]
pub fn inspect_paths(paths: Vec<String>) -> Vec<PathKind> {
    paths
        .into_iter()
        .map(|path| {
            let target = Path::new(&path);
            PathKind {
                exists: target.exists(),
                is_directory: target.is_dir(),
                path,
            }
        })
        .collect()
}

#[tauri::command]
pub fn path_exists(state: State<'_, AppState>, path: String) -> AppResult<bool> {
    let root = state.project.require()?;
    match paths::resolve_within(&root, Path::new(&path)) {
        Ok(target) => Ok(target.exists()),
        Err(_) => Ok(false),
    }
}

/// Copy the compiled PDF to a location the user chose in a save dialog.
#[tauri::command]
pub fn export_pdf(source_path: String, destination_path: String) -> AppResult<()> {
    let source = Path::new(&source_path);
    let destination = Path::new(&destination_path);

    if !source.is_file() {
        return Err(AppError::not_found("The compiled PDF")
            .with_hint("Compile the document before exporting."));
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::from_io(&e, parent))?;
    }

    fs::copy(source, destination).map_err(|e| AppError::from_io(&e, destination))?;
    Ok(())
}
