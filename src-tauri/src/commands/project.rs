//! Opening, creating and inspecting projects.

use crate::error::{AppError, AppResult};
use crate::models::{FileNode, ProjectInfo};
use crate::paths;
use crate::state::AppState;
use crate::store::{self, RecentProject};
use crate::tree;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};

/// One file in a new project, as produced by a template.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewProjectFile {
    /// Path relative to the new project root; may contain `/` to nest.
    pub path: String,
    pub content: String,
}

/// Assemble the [`ProjectInfo`] payload for an already-validated root.
///
/// `only_file` scopes the tree to that one file when the project was opened as
/// a single file rather than a folder.
fn describe(app: &AppHandle, root: &Path, only_file: Option<&Path>) -> AppResult<ProjectInfo> {
    let (tree_root, file_count) = match only_file {
        Some(file) => tree::build_single_file(root, file)?,
        None => tree::build(root)?,
    };

    let opened_file = only_file.map(|file| paths::relative_to(root, file));

    // A main document the user picked explicitly beats the heuristic, but only
    // while the file still exists. A single-file project has only one possible
    // document, so there is nothing to guess.
    let main_document = match &opened_file {
        Some(file) => Some(file.clone()),
        None => {
            let stored = store::main_document_for(app, &root.to_string_lossy())
                .filter(|relative| root.join(relative).is_file());
            stored.or_else(|| tree::detect_main_document(root, &tree_root))
        }
    };

    Ok(ProjectInfo {
        root: root.to_string_lossy().into_owned(),
        name: root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| root.to_string_lossy().into_owned()),
        main_document,
        opened_file,
        tree: tree_root,
        file_count,
    })
}

/// Open a folder as a project: validate it, start watching it, and record it in
/// the recent list.
#[tauri::command]
pub fn open_project(
    app: AppHandle,
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
    recent_limit: usize,
) -> AppResult<ProjectInfo> {
    let ws = state.for_window(window.label());
    let target = PathBuf::from(&path);

    if !target.exists() {
        return Err(
            AppError::invalid_project(format!("“{path}” no longer exists."))
                .with_hint("It may have been moved or deleted. Remove it from Recent Projects?"),
        );
    }

    // Opening a single file is supported: its containing folder becomes the
    // project, and the file itself becomes the document to open and compile.
    let (root, single_file) = if target.is_dir() {
        (target, None)
    } else {
        let parent = target.parent().map(Path::to_path_buf).ok_or_else(|| {
            AppError::invalid_project("That file is not inside a folder InkTex can open.")
        })?;
        (parent, Some(target))
    };

    // Canonicalise so the same project reached by different paths (symlinks,
    // relative segments) has one identity in recents and in path scoping.
    let root = root
        .canonicalize()
        .map_err(|e| AppError::from_io(&e, &root))?;

    // Confirm we can actually read it before committing to the switch.
    fs::read_dir(&root).map_err(|e| AppError::from_io(&e, &root))?;

    // A single file's path also needs to survive the same canonicalisation as
    // the root, so both agree about symlinks and relative segments.
    let single_file = single_file
        .map(|file| file.canonicalize().map_err(|e| AppError::from_io(&e, &file)))
        .transpose()?;

    let info = describe(&app, &root, single_file.as_deref())?;

    match &single_file {
        Some(file) => ws.project.set_single_file(root.clone(), file.clone()),
        None => ws.project.set(root.clone()),
    }

    // A watch failure is not fatal — the project is usable, it just will not
    // auto-refresh — so it is reported to the UI rather than propagated.
    if let Err(err) =
        ws.watcher
            .watch(app.clone(), window.label(), &root, single_file.as_deref())
    {
        let _ = tauri::Emitter::emit_to(&app, window.label(), "project://watch-error", err.message);
    }

    store::push_recent(&app, &info.root, &info.name, recent_limit)?;

    Ok(info)
}

/// Create a new project folder populated from a template, then open it.
#[tauri::command]
pub fn create_project(
    app: AppHandle,
    window: tauri::Window,
    state: State<'_, AppState>,
    parent_directory: String,
    name: String,
    files: Vec<NewProjectFile>,
    recent_limit: usize,
) -> AppResult<ProjectInfo> {
    paths::validate_file_name(&name)?;

    let parent = PathBuf::from(&parent_directory);
    if !parent.is_dir() {
        return Err(AppError::invalid_path(format!(
            "“{parent_directory}” is not a folder."
        )));
    }

    let root = parent.join(name.trim());
    if root.exists() {
        return Err(AppError::already_exists(&root)
            .with_hint("Pick a different project name, or open the existing folder."));
    }

    fs::create_dir_all(&root).map_err(|e| AppError::from_io(&e, &root))?;

    // Write template files, scoping each one to the new root so a malformed
    // template cannot write outside it.
    for file in &files {
        let target = paths::resolve_within(&root, Path::new(&file.path))?;
        if let Some(dir) = target.parent() {
            fs::create_dir_all(dir).map_err(|e| AppError::from_io(&e, dir))?;
        }
        fs::write(&target, &file.content).map_err(|e| AppError::from_io(&e, &target))?;
    }

    open_project(
        app,
        window,
        state,
        root.to_string_lossy().into_owned(),
        recent_limit,
    )
}

/// Re-read the tree from disk. Called after external filesystem changes.
#[tauri::command]
pub fn refresh_tree(window: tauri::Window, state: State<'_, AppState>) -> AppResult<FileNode> {
    let ws = state.for_window(window.label());
    let root = ws.project.require()?;
    let (node, _) = match ws.project.only_file() {
        Some(file) => tree::build_single_file(&root, &file)?,
        None => tree::build(&root)?,
    };
    Ok(node)
}

/// Re-read the whole project description, including the main-document guess.
#[tauri::command]
pub fn reload_project(
    app: AppHandle,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> AppResult<ProjectInfo> {
    let ws = state.for_window(window.label());
    let root = ws.project.require()?;
    describe(&app, &root, ws.project.only_file().as_deref())
}

/// Record the user's explicit choice of main document for this project.
#[tauri::command]
pub fn set_main_document(
    app: AppHandle,
    window: tauri::Window,
    state: State<'_, AppState>,
    path: String,
) -> AppResult<()> {
    let ws = state.for_window(window.label());
    let root = ws.project.require()?;
    let target = paths::resolve_within(&root, Path::new(&path))?;

    if !target.is_file() {
        return Err(AppError::not_found(format!("“{path}”")));
    }

    store::set_main_document(
        &app,
        &root.to_string_lossy(),
        &paths::relative_to(&root, &target),
    )
}

#[tauri::command]
pub fn close_project(window: tauri::Window, state: State<'_, AppState>) -> AppResult<()> {
    let ws = state.for_window(window.label());
    ws.watcher.stop();
    ws.project.clear();
    Ok(())
}

#[tauri::command]
pub fn get_recent_projects(app: AppHandle) -> AppResult<Vec<RecentProject>> {
    store::load_recent(&app)
}

#[tauri::command]
pub fn remove_recent_project(app: AppHandle, path: String) -> AppResult<Vec<RecentProject>> {
    store::remove_recent(&app, &path)
}

#[tauri::command]
pub fn clear_recent_projects(app: AppHandle) -> AppResult<()> {
    store::clear_recent(&app)
}
