//! Persistence of user preferences, recent projects and last session.
//!
//! Everything lives in the platform application-config directory as plain JSON
//! so it can be inspected or edited by hand:
//!
//! * macOS — `~/Library/Application Support/dev.inktex.app/`
//! * Linux — `~/.config/dev.inktex.app/`
//! * Windows — `%APPDATA%\dev.inktex.app\`
//!
//! Settings are stored as an opaque JSON document rather than a mirrored Rust
//! struct. The backend never interprets a preference — the frontend owns the
//! schema, its defaults and its migrations (see `src/services/settingsService.ts`).
//! Duplicating the twenty-odd fields here would add no type safety at the
//! boundary, only a second definition to keep in sync.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";
const RECENT_FILE: &str = "recent-projects.json";
const SESSION_FILE: &str = "session.json";
const OVERRIDES_FILE: &str = "project-overrides.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub path: String,
    pub name: String,
    /// Unix-epoch milliseconds.
    pub last_opened: u64,
    /// Recomputed on read — a recent entry whose folder was deleted is shown
    /// greyed out rather than silently dropped.
    #[serde(default)]
    pub exists: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    /// Absolute path of the project open when the app last closed.
    pub last_project: Option<String>,
    /// Project-relative paths of the tabs that were open.
    #[serde(default)]
    pub open_files: Vec<String>,
    pub active_file: Option<String>,
}

/// Resolve (and create) the configuration directory.
fn config_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::internal(format!("No writable config directory: {e}")))?;

    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| AppError::from_io(&e, &dir))?;
    }
    Ok(dir)
}

/// Write a JSON file atomically: a crash mid-write must not truncate the
/// user's settings, so we write a sibling temp file and rename over the target.
fn write_json(path: &Path, value: &impl Serialize) -> AppResult<()> {
    let serialized =
        serde_json::to_string_pretty(value).map_err(|e| AppError::internal(e.to_string()))?;

    let temp = path.with_extension("json.tmp");
    fs::write(&temp, serialized).map_err(|e| AppError::from_io(&e, &temp))?;
    fs::rename(&temp, path).map_err(|e| AppError::from_io(&e, path))?;
    Ok(())
}

/// Read a JSON file, returning `None` when absent or unreadable.
///
/// A corrupt preferences file must not prevent the app from starting, so parse
/// failures fall back to defaults rather than propagating.
fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let contents = fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

pub fn load_settings(app: &AppHandle) -> AppResult<Value> {
    let path = config_dir(app)?.join(SETTINGS_FILE);
    Ok(read_json::<Value>(&path).unwrap_or(Value::Null))
}

pub fn save_settings(app: &AppHandle, settings: &Value) -> AppResult<()> {
    let path = config_dir(app)?.join(SETTINGS_FILE);
    write_json(&path, settings)
}

// ---------------------------------------------------------------------------
// Recent projects
// ---------------------------------------------------------------------------

pub fn load_recent(app: &AppHandle) -> AppResult<Vec<RecentProject>> {
    let path = config_dir(app)?.join(RECENT_FILE);
    let mut entries: Vec<RecentProject> = read_json(&path).unwrap_or_default();

    for entry in &mut entries {
        entry.exists = Path::new(&entry.path).is_dir();
    }
    // Most recently opened first.
    entries.sort_by_key(|entry| std::cmp::Reverse(entry.last_opened));
    Ok(entries)
}

/// Record a project as recently opened, moving it to the front of the list.
pub fn push_recent(
    app: &AppHandle,
    project_path: &str,
    name: &str,
    limit: usize,
) -> AppResult<Vec<RecentProject>> {
    let mut entries = load_recent(app)?;

    entries.retain(|e| e.path != project_path);
    entries.insert(
        0,
        RecentProject {
            path: project_path.to_string(),
            name: name.to_string(),
            last_opened: crate::latex::engine::epoch_millis(),
            exists: true,
        },
    );
    entries.truncate(limit.clamp(1, 50));

    let path = config_dir(app)?.join(RECENT_FILE);
    write_json(&path, &entries)?;
    Ok(entries)
}

pub fn remove_recent(app: &AppHandle, project_path: &str) -> AppResult<Vec<RecentProject>> {
    let mut entries = load_recent(app)?;
    entries.retain(|e| e.path != project_path);

    let path = config_dir(app)?.join(RECENT_FILE);
    write_json(&path, &entries)?;
    Ok(entries)
}

pub fn clear_recent(app: &AppHandle) -> AppResult<()> {
    let path = config_dir(app)?.join(RECENT_FILE);
    write_json(&path, &Vec::<RecentProject>::new())
}

// ---------------------------------------------------------------------------
// Per-project overrides
// ---------------------------------------------------------------------------

/// Settings that belong to one project rather than the app as a whole.
///
/// These live in the app config directory keyed by absolute project path, not
/// inside the project itself — InkTex should never add stray files to a folder
/// the user may have under version control.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOverrides {
    pub main_document: Option<String>,
}

type OverrideMap = std::collections::HashMap<String, ProjectOverrides>;

fn load_overrides(app: &AppHandle) -> OverrideMap {
    config_dir(app)
        .ok()
        .map(|dir| dir.join(OVERRIDES_FILE))
        .and_then(|path| read_json(&path))
        .unwrap_or_default()
}

/// The main document the user pinned for `project_path`, if any.
pub fn main_document_for(app: &AppHandle, project_path: &str) -> Option<String> {
    load_overrides(app)
        .get(project_path)
        .and_then(|o| o.main_document.clone())
}

pub fn set_main_document(app: &AppHandle, project_path: &str, main: &str) -> AppResult<()> {
    let mut overrides = load_overrides(app);
    overrides
        .entry(project_path.to_string())
        .or_default()
        .main_document = Some(main.to_string());

    let path = config_dir(app)?.join(OVERRIDES_FILE);
    write_json(&path, &overrides)
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

pub fn load_session(app: &AppHandle) -> AppResult<Session> {
    let path = config_dir(app)?.join(SESSION_FILE);
    Ok(read_json(&path).unwrap_or_default())
}

pub fn save_session(app: &AppHandle, session: &Session) -> AppResult<()> {
    let path = config_dir(app)?.join(SESSION_FILE);
    write_json(&path, session)
}
