//! Application-wide error type.
//!
//! Every error that can reach the frontend is classified into a [`ErrorKind`]
//! so the UI can react structurally (e.g. show an "install TeX" call to action)
//! instead of pattern-matching on English prose. Each variant also carries an
//! optional `hint` — a short, actionable next step shown beneath the message.

use serde::{Serialize, Serializer};
use std::fmt;
use std::io;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    NotFound,
    PermissionDenied,
    InvalidPath,
    InvalidProject,
    TexNotFound,
    CompilerFailed,
    CompileBusy,
    Canceled,
    AlreadyExists,
    Io,
    Internal,
}

/// An error with a machine-readable kind plus human-readable text.
#[derive(Debug, Clone)]
pub struct AppError {
    pub kind: ErrorKind,
    pub message: String,
    pub hint: Option<String>,
}

impl AppError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            hint: None,
        }
    }

    /// Attach a short suggestion describing how the user can resolve this.
    pub fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }

    pub fn not_found(what: impl fmt::Display) -> Self {
        Self::new(ErrorKind::NotFound, format!("{what} could not be found."))
    }

    pub fn invalid_path(msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::InvalidPath, msg)
    }

    pub fn invalid_project(msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::InvalidProject, msg)
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::Internal, msg)
    }

    pub fn already_exists(path: &Path) -> Self {
        Self::new(
            ErrorKind::AlreadyExists,
            format!("“{}” already exists.", display_name(path)),
        )
        .with_hint("Choose a different name.")
    }

    /// Convert an [`io::Error`] into a user-facing message naming the path that
    /// failed, since a bare "permission denied" is rarely actionable.
    pub fn from_io(err: &io::Error, path: &Path) -> Self {
        let name = display_name(path);
        match err.kind() {
            io::ErrorKind::NotFound => Self::new(
                ErrorKind::NotFound,
                format!("“{name}” no longer exists on disk."),
            )
            .with_hint("It may have been moved or deleted outside InkTex."),
            io::ErrorKind::PermissionDenied => Self::new(
                ErrorKind::PermissionDenied,
                format!("InkTex does not have permission to access “{name}”."),
            )
            .with_hint(
                "Check the file's permissions, or grant InkTex access to this \
                 folder in System Settings › Privacy & Security › Files and Folders.",
            ),
            io::ErrorKind::AlreadyExists => Self::already_exists(path),
            _ => Self::new(ErrorKind::Io, format!("Could not access “{name}”: {err}")),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for AppError {}

impl From<io::Error> for AppError {
    fn from(err: io::Error) -> Self {
        Self::new(ErrorKind::Io, err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        Self::new(ErrorKind::Internal, format!("Malformed data: {err}"))
    }
}

impl From<tauri::Error> for AppError {
    fn from(err: tauri::Error) -> Self {
        Self::new(ErrorKind::Internal, err.to_string())
    }
}

/// Serialize as a structured object rather than a bare string so the frontend
/// receives `{ kind, message, hint }` on the rejected promise.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 3)?;
        state.serialize_field("kind", &self.kind)?;
        state.serialize_field("message", &self.message)?;
        state.serialize_field("hint", &self.hint)?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

/// Last path component, falling back to the full path for roots.
fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string())
}
