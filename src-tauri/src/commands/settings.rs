//! Preference and session persistence commands.

use crate::error::AppResult;
use crate::store::{self, Session};
use serde_json::Value;
use tauri::AppHandle;

/// Load the stored preference document.
///
/// Returns `null` when nothing has been saved yet; the frontend then applies
/// its defaults (see `src/services/settingsService.ts`).
#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppResult<Value> {
    store::load_settings(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Value) -> AppResult<()> {
    store::save_settings(&app, &settings)
}

#[tauri::command]
pub fn get_session(app: AppHandle) -> AppResult<Session> {
    store::load_session(&app)
}

#[tauri::command]
pub fn save_session(app: AppHandle, session: Session) -> AppResult<()> {
    store::save_session(&app, &session)
}
