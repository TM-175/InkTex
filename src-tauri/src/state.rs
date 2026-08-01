//! Process-wide mutable state, managed by Tauri and injected into commands.

use crate::error::{AppError, AppResult, ErrorKind};
use crate::latex::engine::RunContext;
use crate::watcher::WatcherState;
use std::path::PathBuf;
use std::sync::Mutex;

/// Tracks the single in-flight compilation.
///
/// InkTex deliberately allows only one build at a time: concurrent latexmk runs
/// against the same output directory corrupt each other's auxiliary files.
#[derive(Default)]
pub struct CompileState {
    running: Mutex<Option<RunContext>>,
}

impl CompileState {
    /// Claim the compile slot, or report who already holds it.
    pub fn begin(&self, context: RunContext) -> AppResult<()> {
        let mut guard = self.running.lock().expect("compile lock");
        if guard.is_some() {
            return Err(
                AppError::new(ErrorKind::CompileBusy, "A compilation is already running.")
                    .with_hint("Wait for it to finish, or cancel it first."),
            );
        }
        *guard = Some(context);
        Ok(())
    }

    /// Release the slot once a build finishes, however it ended.
    pub fn finish(&self) {
        *self.running.lock().expect("compile lock") = None;
    }

    /// Signal the running build to stop. Returns false if nothing was running.
    pub fn cancel(&self) -> bool {
        let guard = self.running.lock().expect("compile lock");
        match guard.as_ref() {
            Some(context) => {
                context.cancel();
                true
            }
            None => false,
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.lock().expect("compile lock").is_some()
    }
}

/// The project the frontend currently has open.
///
/// Filesystem commands resolve their paths against this root, which is what
/// confines them to the project (see [`crate::paths::resolve_within`]).
#[derive(Default)]
pub struct ProjectState {
    root: Mutex<Option<PathBuf>>,
}

impl ProjectState {
    pub fn set(&self, root: PathBuf) {
        *self.root.lock().expect("project lock") = Some(root);
    }

    pub fn clear(&self) {
        *self.root.lock().expect("project lock") = None;
    }

    pub fn get(&self) -> Option<PathBuf> {
        self.root.lock().expect("project lock").clone()
    }

    /// The active root, or a friendly error when no project is open.
    pub fn require(&self) -> AppResult<PathBuf> {
        self.get().ok_or_else(|| {
            AppError::new(ErrorKind::InvalidProject, "No project is currently open.")
                .with_hint("Open or create a project first.")
        })
    }
}

/// Aggregate of everything Tauri manages for the app.
#[derive(Default)]
pub struct AppState {
    pub project: ProjectState,
    pub compile: CompileState,
    pub watcher: WatcherState,
}
