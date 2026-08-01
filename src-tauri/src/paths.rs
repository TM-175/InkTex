//! Path normalisation and containment checks.
//!
//! Every filesystem command the frontend can reach is scoped to the currently
//! open project. These helpers turn an untrusted, possibly relative path into
//! an absolute one and prove it does not escape the project root — including
//! via `..` segments or a symlink pointing outside the tree.

use crate::error::{AppError, AppResult, ErrorKind};
use std::path::{Component, Path, PathBuf};

/// Lexically resolve `.` and `..` without touching the filesystem.
///
/// Unlike [`std::fs::canonicalize`] this works for paths that do not exist yet,
/// which is required when creating a new file or folder.
pub fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => match out.components().next_back() {
                // Cancel out the segment it refers to.
                Some(Component::Normal(_)) => {
                    out.pop();
                }
                // `..` at a filesystem root refers to the root itself. Pushing
                // it would produce `/..`, which could later escape the project
                // scope, so it is discarded.
                Some(Component::RootDir) => {}
                // A relative path with nothing to cancel (`../foo`, `../..`)
                // must keep the segment.
                _ => out.push(component.as_os_str()),
            },
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Canonicalize the deepest ancestor of `path` that exists, then re-append the
/// remaining segments. This resolves symlinks for the real part of the path
/// while tolerating a not-yet-created leaf.
fn canonicalize_lenient(path: &Path) -> PathBuf {
    let mut remainder: Vec<&std::ffi::OsStr> = Vec::new();
    let mut cursor = path;

    loop {
        if let Ok(resolved) = cursor.canonicalize() {
            let mut out = resolved;
            for segment in remainder.iter().rev() {
                out.push(segment);
            }
            return out;
        }
        match (cursor.file_name(), cursor.parent()) {
            (Some(name), Some(parent)) => {
                remainder.push(name);
                cursor = parent;
            }
            // Reached a root that cannot be canonicalized; fall back to the
            // lexical form.
            _ => return normalize(path),
        }
    }
}

/// Resolve `candidate` against `root` and guarantee the result stays inside it.
///
/// `candidate` may be absolute or relative to the project root. Returns the
/// absolute, symlink-resolved path on success.
pub fn resolve_within(root: &Path, candidate: &Path) -> AppResult<PathBuf> {
    let root_abs = canonicalize_lenient(root);

    let joined = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root_abs.join(candidate)
    };

    let resolved = canonicalize_lenient(&normalize(&joined));

    if !resolved.starts_with(&root_abs) {
        return Err(AppError::new(
            ErrorKind::InvalidPath,
            format!(
                "“{}” is outside the current project and cannot be accessed.",
                candidate.display()
            ),
        )
        .with_hint("InkTex only reads and writes files within the open project folder."));
    }

    Ok(resolved)
}

/// Path of `path` relative to `root`, using forward slashes.
///
/// The frontend keys tabs, the file tree and diagnostics on this form so the
/// same file always has one identity regardless of how it was reached.
pub fn relative_to(root: &Path, path: &Path) -> String {
    let root_abs = canonicalize_lenient(root);
    let path_abs = canonicalize_lenient(path);

    path_abs
        .strip_prefix(&root_abs)
        .unwrap_or(&path_abs)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

/// Reject names that would traverse directories or break on common filesystems.
pub fn validate_file_name(name: &str) -> AppResult<()> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err(AppError::invalid_path("Name cannot be empty."));
    }
    if trimmed == "." || trimmed == ".." {
        return Err(AppError::invalid_path("That name is reserved."));
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(AppError::invalid_path(
            "Name cannot contain slashes. Create a folder instead to nest files.",
        ));
    }
    if trimmed.contains('\0') {
        return Err(AppError::invalid_path(
            "Name contains an invalid character.",
        ));
    }
    // Reserved on Windows, and confusing everywhere else.
    if trimmed
        .chars()
        .any(|c| matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
    {
        return Err(AppError::invalid_path(
            r#"Name cannot contain any of : * ? " < > |"#,
        ));
    }
    Ok(())
}

/// Lowercase file extension without the dot.
pub fn extension_of(path: &Path) -> String {
    path.extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_collapses_traversal() {
        assert_eq!(normalize(Path::new("/a/b/../c")), PathBuf::from("/a/c"));
        assert_eq!(normalize(Path::new("/a/./b")), PathBuf::from("/a/b"));
        assert_eq!(normalize(Path::new("/a/b/../../..")), PathBuf::from("/"));
        // Relative paths have nothing to cancel against, so `..` is preserved.
        assert_eq!(normalize(Path::new("../x")), PathBuf::from("../x"));
        assert_eq!(normalize(Path::new("a/../../x")), PathBuf::from("../x"));
    }

    #[test]
    fn resolve_rejects_escape() {
        let tmp = std::env::temp_dir().join("inktex-paths-test");
        std::fs::create_dir_all(&tmp).unwrap();
        assert!(resolve_within(&tmp, Path::new("../../etc/passwd")).is_err());
        assert!(resolve_within(&tmp, Path::new("main.tex")).is_ok());
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn file_names_are_validated() {
        assert!(validate_file_name("main.tex").is_ok());
        assert!(validate_file_name("").is_err());
        assert!(validate_file_name("../evil").is_err());
        assert!(validate_file_name("a:b").is_err());
    }
}
