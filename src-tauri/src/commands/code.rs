//! Commands backing the code-listings system.

use crate::code::{import, indexer, regions};
use crate::error::AppResult;
use crate::models::{
    CodeAsset, CodeRegion, ImportMode, ImportedCode, SourceLinkQuery, SourceLinkResult,
};
use crate::paths;
use crate::state::AppState;
use std::fs;
use std::path::Path;
use tauri::State;

/// Index every source file in the project.
///
/// `extensions` comes from the frontend's language registry, which is the one
/// place a language is defined; the backend stays language-agnostic.
#[tauri::command]
pub async fn index_code_assets(
    window: tauri::Window,
    state: State<'_, AppState>,
    extensions: Vec<String>,
) -> AppResult<Vec<CodeAsset>> {
    let root = state.for_window(window.label()).project.require()?;

    // Walking a large repository is I/O-bound; keep it off the IPC thread.
    tauri::async_runtime::spawn_blocking(move || indexer::index_all(&root, &extensions))
        .await
        .map_err(|e| crate::error::AppError::internal(format!("Indexing failed: {e}")))
}

/// Re-index a named subset after a filesystem change.
///
/// Called by the watcher so editing one file does not re-walk the project.
#[tauri::command]
pub fn index_code_paths(
    window: tauri::Window,
    state: State<'_, AppState>,
    extensions: Vec<String>,
    paths: Vec<String>,
) -> AppResult<Vec<CodeAsset>> {
    let root = state.for_window(window.label()).project.require()?;
    Ok(indexer::index_paths(&root, &extensions, &paths))
}

/// Named regions inside one source file.
#[tauri::command]
pub fn detect_code_regions(
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
) -> AppResult<Vec<CodeRegion>> {
    let root = state.for_window(window.label()).project.require()?;
    let absolute = paths::resolve_within(&root, Path::new(&path))?;

    let bytes = fs::read(&absolute).map_err(|e| crate::error::AppError::from_io(&e, &absolute))?;

    Ok(regions::detect(&String::from_utf8_lossy(&bytes)))
}

/// Extract a snippet from a source file for insertion as a listing.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn import_code(
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
    mode: ImportMode,
    first_line: Option<usize>,
    last_line: Option<usize>,
    region: Option<String>,
    dedent: bool,
) -> AppResult<ImportedCode> {
    let root = state.for_window(window.label()).project.require()?;

    import::import(
        &root,
        &path,
        mode,
        first_line,
        last_line,
        region.as_deref(),
        dedent,
    )
}

/// Report, for each linked listing, whether its source has drifted.
#[tauri::command]
pub fn check_source_links(
    window: tauri::Window,
    state: State<'_, AppState>,
    links: Vec<SourceLinkQuery>,
) -> AppResult<Vec<SourceLinkResult>> {
    let root = state.for_window(window.label()).project.require()?;
    Ok(import::check_links(&root, &links))
}
