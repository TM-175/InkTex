//! Filesystem watching for the open project.
//!
//! A single recursive watcher is attached to the project root. Events are
//! debounced (a save from Monaco plus the editor's own metadata updates can
//! produce several events for one logical change) and filtered so that build
//! artefacts never trigger a UI refresh — otherwise every compile would cause
//! the file tree to churn.

use crate::error::{AppError, AppResult};
use crate::latex::engine::{AUX_EXTENSIONS, BUILD_DIR};
use crate::models::{FsChange, FsChangeEvent, FsChangeKind};
use crate::paths;
use notify::{EventKind, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// How long to wait for a burst of events to settle.
const DEBOUNCE: Duration = Duration::from_millis(250);

/// Directories that never contain anything the user edits.
const IGNORED_DIRECTORIES: &[&str] = &[
    BUILD_DIR,
    ".git",
    ".svn",
    ".hg",
    "node_modules",
    ".DS_Store",
    ".inktex",
];

/// Owns the active watcher. Dropping the debouncer stops the watch thread, so
/// replacing the value is all that is needed to switch projects.
#[derive(Default)]
pub struct WatcherState {
    // The concrete debouncer type is verbose and internal; box it away.
    active: Mutex<Option<ActiveWatch>>,
}

struct ActiveWatch {
    root: PathBuf,
    // Held purely for its Drop impl, which shuts the watcher down.
    _debouncer: Box<dyn std::any::Any + Send>,
}

impl WatcherState {
    /// Begin watching `root`, replacing any previous watch.
    pub fn watch(&self, app: AppHandle, root: &Path) -> AppResult<()> {
        // Drop the previous watcher before creating the new one so we never
        // hold two recursive watches on overlapping trees.
        self.stop();

        let root_owned = root.to_path_buf();
        let emit_root = root.to_path_buf();
        let app_for_events = app.clone();

        let mut debouncer =
            new_debouncer(
                DEBOUNCE,
                None,
                move |result: DebounceEventResult| match result {
                    Ok(events) => {
                        let mut changes: Vec<FsChange> = Vec::new();

                        for event in events {
                            let kind = match event.kind {
                                EventKind::Create(_) => FsChangeKind::Created,
                                EventKind::Remove(_) => FsChangeKind::Removed,
                                EventKind::Modify(notify::event::ModifyKind::Name(_)) => {
                                    FsChangeKind::Renamed
                                }
                                EventKind::Modify(_) => FsChangeKind::Modified,
                                _ => continue,
                            };

                            for path in event.paths.iter() {
                                if is_ignored(&emit_root, path) {
                                    continue;
                                }
                                let relative = paths::relative_to(&emit_root, path);
                                if relative.is_empty() {
                                    continue;
                                }
                                // Collapse duplicates from the same burst.
                                if changes.iter().any(|c| c.path == relative && c.kind == kind) {
                                    continue;
                                }
                                changes.push(FsChange {
                                    kind,
                                    path: relative,
                                    is_directory: path.is_dir(),
                                });
                            }
                        }

                        if changes.is_empty() {
                            return;
                        }

                        let affects_sources = changes
                            .iter()
                            .any(|c| !c.is_directory && is_source_like(&c.path));

                        let _ = app_for_events.emit(
                            "project://fs-changed",
                            FsChangeEvent {
                                root: emit_root.to_string_lossy().into_owned(),
                                changes,
                                affects_sources,
                            },
                        );
                    }
                    Err(errors) => {
                        // Watch errors are usually transient (a directory vanished
                        // mid-scan). Surface them without tearing the watch down.
                        for error in errors {
                            let _ = app.emit("project://watch-error", error.to_string());
                        }
                    }
                },
            )
            .map_err(|e| AppError::internal(format!("Could not start the file watcher: {e}")))?;

        debouncer
            .watch(&root_owned, RecursiveMode::Recursive)
            .map_err(|e| {
                AppError::internal(format!(
                    "Could not watch “{}” for changes: {e}",
                    root_owned.display()
                ))
            })?;

        *self.active.lock().expect("watcher lock") = Some(ActiveWatch {
            root: root_owned,
            _debouncer: Box::new(debouncer),
        });

        Ok(())
    }

    /// Stop watching, if anything is being watched.
    pub fn stop(&self) {
        *self.active.lock().expect("watcher lock") = None;
    }

    /// The root currently being watched.
    pub fn current_root(&self) -> Option<PathBuf> {
        self.active
            .lock()
            .expect("watcher lock")
            .as_ref()
            .map(|w| w.root.clone())
    }
}

/// Should this path be excluded from change notifications?
fn is_ignored(root: &Path, path: &Path) -> bool {
    // Anything inside an ignored directory.
    if let Ok(relative) = path.strip_prefix(root) {
        for component in relative.components() {
            let name = component.as_os_str().to_string_lossy();
            if IGNORED_DIRECTORIES.contains(&name.as_ref()) {
                return true;
            }
        }
    }

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();

    // Build artefacts written in place, and editor swap files.
    if AUX_EXTENSIONS
        .iter()
        .any(|ext| name.ends_with(&format!(".{ext}")))
    {
        return true;
    }
    name.ends_with('~')
        || name.ends_with(".swp")
        || name.ends_with(".tmp")
        || name.starts_with(".#")
}

/// Files whose change should prompt the editor to check open tabs for
/// external modifications.
fn is_source_like(relative: &str) -> bool {
    let lower = relative.to_ascii_lowercase();
    [
        ".tex", ".bib", ".sty", ".cls", ".txt", ".md", ".json", ".yaml", ".yml",
    ]
    .iter()
    .any(|ext| lower.ends_with(ext))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_output_is_ignored() {
        let root = Path::new("/p");
        assert!(is_ignored(root, &root.join(BUILD_DIR).join("main.pdf")));
        assert!(is_ignored(root, &root.join("main.aux")));
        assert!(is_ignored(root, &root.join(".git").join("HEAD")));
        assert!(!is_ignored(root, &root.join("main.tex")));
    }

    #[test]
    fn editor_temp_files_are_ignored() {
        let root = Path::new("/p");
        assert!(is_ignored(root, &root.join("main.tex~")));
        assert!(is_ignored(root, &root.join(".#main.tex")));
    }

    #[test]
    fn source_detection_covers_tex_and_bib() {
        assert!(is_source_like("chapters/intro.tex"));
        assert!(is_source_like("refs.bib"));
        assert!(!is_source_like("figures/plot.png"));
    }
}
