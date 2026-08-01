//! Process-wide mutable state, managed by Tauri and injected into commands.
//!
//! Every piece of state is scoped to a **window**, not to the process. Each
//! InkTex window is an independent workspace with its own open project, its own
//! compile slot and its own file watcher, so opening a second project in a new
//! window cannot change what the first one is pointing at.

use crate::error::{AppError, AppResult, ErrorKind};
use crate::latex::engine::RunContext;
use crate::watcher::WatcherState;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Tracks the single in-flight compilation for one window.
///
/// InkTex deliberately allows only one build per window: concurrent latexmk
/// runs against the same output directory corrupt each other's auxiliary files.
#[derive(Default)]
pub struct CompileState {
    running: Mutex<Option<RunContext>>,
}

impl CompileState {
    /// Claim the compile slot, or report that it is already held.
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

/// The project one window currently has open.
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

/// Everything one window owns.
#[derive(Default)]
pub struct WindowState {
    pub project: ProjectState,
    pub compile: CompileState,
    pub watcher: WatcherState,
}

/// The state Tauri manages: one [`WindowState`] per window label.
#[derive(Default)]
pub struct AppState {
    windows: Mutex<HashMap<String, Arc<WindowState>>>,
}

impl AppState {
    /// State for `label`, created on first use.
    pub fn for_window(&self, label: &str) -> Arc<WindowState> {
        let mut windows = self.windows.lock().expect("windows lock");
        Arc::clone(windows.entry(label.to_string()).or_default())
    }

    /// Tear down a window's state when it closes: stop its watcher and cancel
    /// any build it left running, so neither outlives the window.
    pub fn remove_window(&self, label: &str) {
        let removed = self.windows.lock().expect("windows lock").remove(label);

        if let Some(state) = removed {
            state.watcher.stop();
            state.compile.cancel();
        }
    }

    /// Number of live windows, used to pick the next window label.
    pub fn window_count(&self) -> usize {
        self.windows.lock().expect("windows lock").len()
    }
}
