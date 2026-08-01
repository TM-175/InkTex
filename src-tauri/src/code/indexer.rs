//! The code-asset indexer.
//!
//! Walks the project for source files and records the metadata the Code Assets
//! browser needs: language extension, size, and line count.
//!
//! Two things keep this usable on a large repository:
//!
//! * The extension whitelist comes from the frontend's language registry, so
//!   only files that could ever become a listing are opened at all.
//! * Indexing is incremental — [`index_paths`] re-reads a named subset, which
//!   is what the file watcher calls, so editing one file does not re-walk
//!   thousands of others.

use crate::commands::fs_ops::modified_millis;
use crate::latex::engine::BUILD_DIR;
use crate::models::CodeAsset;
use crate::paths;
use std::fs;
use std::path::Path;

/// Directories never worth indexing. Mirrors the explorer's hidden set, plus
/// the dependency and build directories of the language ecosystems most likely
/// to appear next to a LaTeX project.
const SKIP_DIRECTORIES: &[&str] = &[
    BUILD_DIR,
    ".git",
    ".svn",
    ".hg",
    ".idea",
    ".vscode",
    ".inktex",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "target",
    "build",
    "dist",
    "out",
    "vendor",
    ".next",
    ".cache",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
];

/// Files above this size are indexed but not line-counted: reading a 32 MB
/// generated file to display a line count is not worth the stall.
const MAX_SCAN_BYTES: u64 = 4 * 1024 * 1024;

/// Depth limit, matching the file tree.
const MAX_DEPTH: usize = 16;

/// Count lines without allocating a `String` for the whole file.
///
/// Returns `None` when the bytes are not text, so binaries that happen to
/// carry a source extension are excluded rather than shown with a nonsense
/// line count.
fn count_lines(bytes: &[u8]) -> Option<usize> {
    // A NUL byte in the first block is the usual signal for binary content.
    if bytes.iter().take(8_000).any(|byte| *byte == 0) {
        return None;
    }

    if bytes.is_empty() {
        return Some(0);
    }

    let newlines = bytes.iter().filter(|byte| **byte == b'\n').count();

    // A trailing newline terminates the last line rather than starting a new
    // one, so only count an extra line when the file does not end with one.
    Some(if bytes.last() == Some(&b'\n') {
        newlines
    } else {
        newlines + 1
    })
}

/// Build the [`CodeAsset`] for one file, or `None` if it should be skipped.
fn describe(root: &Path, path: &Path, allowed: &[String]) -> Option<CodeAsset> {
    let extension = paths::extension_of(path);
    let name = path.file_name()?.to_string_lossy().into_owned();

    // Extensionless files (Makefile, Dockerfile) are matched by name instead.
    let matches = if extension.is_empty() {
        allowed
            .iter()
            .any(|entry| entry.eq_ignore_ascii_case(&name))
    } else {
        allowed
            .iter()
            .any(|entry| entry.eq_ignore_ascii_case(&extension))
    };
    if !matches {
        return None;
    }

    let metadata = fs::metadata(path).ok()?;
    let size = metadata.len();

    let (lines, truncated) = if size > MAX_SCAN_BYTES {
        (0, true)
    } else {
        match fs::read(path) {
            // `?` here: `None` from `count_lines` means binary content, which
            // is not a code asset.
            Ok(bytes) => (count_lines(&bytes)?, false),
            Err(_) => (0, true),
        }
    };

    Some(CodeAsset {
        path: paths::relative_to(root, path),
        name,
        extension,
        size,
        lines,
        truncated,
        modified: modified_millis(path),
    })
}

fn is_skipped_directory(name: &str) -> bool {
    SKIP_DIRECTORIES.contains(&name) || (name.starts_with('.') && name.len() > 1)
}

/// Recursively collect assets under `dir`.
fn walk(root: &Path, dir: &Path, allowed: &[String], depth: usize, out: &mut Vec<CodeAsset>) {
    if depth >= MAX_DEPTH {
        return;
    }

    let Ok(entries) = fs::read_dir(dir) else {
        // An unreadable directory contributes nothing; it must not abort the
        // whole index.
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_dir() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !is_skipped_directory(&name) {
                walk(root, &path, allowed, depth + 1, out);
            }
        } else if file_type.is_file() {
            if let Some(asset) = describe(root, &path, allowed) {
                out.push(asset);
            }
        }
        // Symlinks are skipped: they can escape the project and form cycles.
    }
}

/// Index every source file in the project.
pub fn index_all(root: &Path, allowed: &[String]) -> Vec<CodeAsset> {
    let mut assets = Vec::new();
    walk(root, root, allowed, 0, &mut assets);

    assets.sort_by_key(|asset| asset.path.to_lowercase());
    assets
}

/// Re-index a named subset, for incremental updates from the file watcher.
///
/// Paths that no longer exist, or that are not indexable, are simply absent
/// from the result — the caller treats a missing entry as a removal.
pub fn index_paths(root: &Path, allowed: &[String], relative_paths: &[String]) -> Vec<CodeAsset> {
    relative_paths
        .iter()
        .filter_map(|relative| {
            let absolute = paths::resolve_within(root, Path::new(relative)).ok()?;
            if !absolute.is_file() {
                return None;
            }
            describe(root, &absolute, allowed)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn sandbox(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("inktex-indexer-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn allowed() -> Vec<String> {
        ["rs", "py", "Makefile"]
            .iter()
            .map(|s| s.to_string())
            .collect()
    }

    #[test]
    fn counts_lines_correctly() {
        assert_eq!(count_lines(b""), Some(0));
        assert_eq!(count_lines(b"one"), Some(1));
        assert_eq!(count_lines(b"one\n"), Some(1));
        assert_eq!(count_lines(b"one\ntwo"), Some(2));
        assert_eq!(count_lines(b"one\ntwo\n"), Some(2));
        // Binary content is rejected.
        assert_eq!(count_lines(b"bin\0ary"), None);
    }

    #[test]
    fn indexes_only_whitelisted_extensions() {
        let root = sandbox("filter");
        fs::write(root.join("main.rs"), "fn main() {}\n").unwrap();
        fs::write(root.join("script.py"), "print(1)\nprint(2)\n").unwrap();
        fs::write(root.join("notes.txt"), "ignored").unwrap();
        fs::write(root.join("Makefile"), "all:\n\techo hi\n").unwrap();

        let assets = index_all(&root, &allowed());
        let names: Vec<&str> = assets.iter().map(|a| a.name.as_str()).collect();

        assert!(names.contains(&"main.rs"));
        assert!(names.contains(&"script.py"));
        assert!(names.contains(&"Makefile"), "extensionless names match too");
        assert!(!names.contains(&"notes.txt"));

        let python = assets.iter().find(|a| a.name == "script.py").unwrap();
        assert_eq!(python.lines, 2);

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn skips_dependency_and_build_directories() {
        let root = sandbox("skip");
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::write(root.join("node_modules/dep.rs"), "fn dep() {}").unwrap();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/lib.rs"), "fn lib() {}").unwrap();

        let assets = index_all(&root, &allowed());
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].path, "src/lib.rs");

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn incremental_index_covers_only_named_paths() {
        let root = sandbox("incremental");
        fs::write(root.join("a.rs"), "fn a() {}\n").unwrap();
        fs::write(root.join("b.rs"), "fn b() {}\nfn c() {}\n").unwrap();

        let updated = index_paths(&root, &allowed(), &["b.rs".into(), "gone.rs".into()]);
        assert_eq!(updated.len(), 1, "missing files are omitted, not errors");
        assert_eq!(updated[0].path, "b.rs");
        assert_eq!(updated[0].lines, 2);

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn binary_files_with_source_extensions_are_excluded() {
        let root = sandbox("binary");
        fs::write(root.join("blob.rs"), [0x00, 0x01, 0x02, 0x03]).unwrap();

        assert!(index_all(&root, &allowed()).is_empty());

        fs::remove_dir_all(&root).ok();
    }
}
