//! Building the project file tree and guessing the main document.

use crate::error::{AppError, AppResult};
use crate::latex::engine::BUILD_DIR;
use crate::models::{FileKind, FileNode};
use crate::paths;
use std::fs;
use std::path::Path;

/// Directories never shown in the explorer.
const HIDDEN_DIRECTORIES: &[&str] = &[
    BUILD_DIR,
    ".git",
    ".svn",
    ".hg",
    ".idea",
    ".vscode",
    "node_modules",
    "__pycache__",
    ".inktex",
];

/// Guard against pathological trees; deeper nesting than this is not a LaTeX
/// project we can usefully display.
const MAX_DEPTH: usize = 16;

/// Cap on entries per directory, so one folder holding 100k generated files
/// cannot stall the UI.
const MAX_ENTRIES_PER_DIRECTORY: usize = 5_000;

/// Classify a path for iconography and editor behaviour.
pub fn classify(path: &Path) -> FileKind {
    if path.is_dir() {
        return FileKind::Directory;
    }
    match paths::extension_of(path).as_str() {
        "tex" | "ltx" | "latex" => FileKind::Tex,
        "bib" | "bst" => FileKind::Bib,
        "sty" | "cls" | "clo" | "def" | "cfg" => FileKind::Style,
        "pdf" => FileKind::Pdf,
        "png" | "jpg" | "jpeg" | "gif" | "bmp" | "svg" | "eps" | "webp" | "tif" | "tiff" => {
            FileKind::Image
        }
        "txt" | "md" | "markdown" | "json" | "yaml" | "yml" | "toml" | "csv" | "tsv" | "log"
        | "gitignore" | "latexmkrc" => FileKind::Text,
        _ => {
            // Extensionless dotfiles such as `.latexmkrc` are still text.
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            if name.starts_with('.') || !name.contains('.') {
                FileKind::Text
            } else {
                FileKind::Binary
            }
        }
    }
}

fn is_hidden_directory(name: &str) -> bool {
    HIDDEN_DIRECTORIES.contains(&name) || (name.starts_with('.') && name.len() > 1)
}

/// Build a [`FileNode`] for a single path, without recursing into it.
pub fn node_for(root: &Path, path: &Path) -> AppResult<FileNode> {
    let metadata = fs::metadata(path).map_err(|e| AppError::from_io(&e, path))?;
    let is_directory = metadata.is_dir();

    Ok(FileNode {
        path: paths::relative_to(root, path),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string_lossy().into_owned()),
        kind: if is_directory {
            FileKind::Directory
        } else {
            classify(path)
        },
        is_directory,
        size: if is_directory { 0 } else { metadata.len() },
        modified: crate::commands::fs_ops::modified_millis(path),
        children: is_directory.then(Vec::new),
    })
}

/// Recursively build the tree rooted at `dir`.
///
/// `counter` accumulates the number of files encountered so the caller can
/// report project size without a second traversal.
fn build_directory(
    root: &Path,
    dir: &Path,
    depth: usize,
    counter: &mut usize,
) -> AppResult<Vec<FileNode>> {
    if depth >= MAX_DEPTH {
        return Ok(Vec::new());
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        // An unreadable subdirectory should not abort the whole tree; it simply
        // shows up empty.
        Err(_) => return Ok(Vec::new()),
    };

    let mut nodes = Vec::new();

    for entry in entries.flatten().take(MAX_ENTRIES_PER_DIRECTORY) {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();

        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_dir() {
            if is_hidden_directory(&name) {
                continue;
            }
            let children = build_directory(root, &path, depth + 1, counter)?;
            nodes.push(FileNode {
                path: paths::relative_to(root, &path),
                name,
                kind: FileKind::Directory,
                is_directory: true,
                size: 0,
                modified: crate::commands::fs_ops::modified_millis(&path),
                children: Some(children),
            });
        } else if file_type.is_file() {
            // Hide dotfiles, but keep the ones LaTeX users actually edit.
            if name.starts_with('.') && !matches!(name.as_str(), ".latexmkrc" | ".gitignore") {
                continue;
            }
            *counter += 1;
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            nodes.push(FileNode {
                path: paths::relative_to(root, &path),
                name,
                kind: classify(&path),
                is_directory: false,
                size,
                modified: crate::commands::fs_ops::modified_millis(&path),
                children: None,
            });
        }
        // Symlinks are skipped: following them can escape the project root and
        // introduce cycles.
    }

    sort_nodes(&mut nodes);
    Ok(nodes)
}

/// Folders first, then case-insensitive alphabetical — the ordering every file
/// explorer uses.
fn sort_nodes(nodes: &mut [FileNode]) {
    nodes.sort_by(|a, b| {
        b.is_directory.cmp(&a.is_directory).then_with(|| {
            a.name
                .to_ascii_lowercase()
                .cmp(&b.name.to_ascii_lowercase())
        })
    });
}

/// Build the full tree for a project, returning it alongside the file count.
pub fn build(root: &Path) -> AppResult<(FileNode, usize)> {
    if !root.is_dir() {
        return Err(AppError::invalid_project(format!(
            "“{}” is not a folder.",
            root.display()
        )));
    }

    let mut counter = 0usize;
    let children = build_directory(root, root, 0, &mut counter)?;

    let node = FileNode {
        path: String::new(),
        name: root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| root.to_string_lossy().into_owned()),
        kind: FileKind::Directory,
        is_directory: true,
        size: 0,
        modified: crate::commands::fs_ops::modified_millis(root),
        children: Some(children),
    };

    Ok((node, counter))
}

/// Build a tree containing only `file`, not the rest of its directory.
///
/// Used when the user opened a single file rather than a folder: the file's
/// parent directory still has to be the project root, since `\input` and
/// relative asset paths resolve against it — but the explorer must not show
/// every other file living in a folder the user never chose to open, such as
/// `~/Downloads` or `~/Desktop`.
pub fn build_single_file(root: &Path, file: &Path) -> AppResult<(FileNode, usize)> {
    let node = node_for(root, file)?;
    if node.is_directory {
        return Err(AppError::invalid_project(format!(
            "“{}” is a folder, not a file.",
            file.display()
        )));
    }

    let root_node = FileNode {
        path: String::new(),
        name: root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| root.to_string_lossy().into_owned()),
        kind: FileKind::Directory,
        is_directory: true,
        size: 0,
        modified: crate::commands::fs_ops::modified_millis(root),
        children: Some(vec![node]),
    };

    Ok((root_node, 1))
}

/// Collect every `.tex` path in the tree, breadth-first.
fn collect_tex_files(node: &FileNode, out: &mut Vec<String>) {
    if let Some(children) = &node.children {
        for child in children {
            if child.is_directory {
                collect_tex_files(child, out);
            } else if child.kind == FileKind::Tex {
                out.push(child.path.clone());
            }
        }
    }
}

/// Guess which file should be compiled.
///
/// Priority, highest first:
/// 1. An explicit `% !TeX root = …` magic comment in any source file.
/// 2. A file containing `\documentclass` *and* `\begin{document}`, preferring
///    conventional names and shallow paths.
/// 3. Any `.tex` file at all.
pub fn detect_main_document(root: &Path, tree: &FileNode) -> Option<String> {
    let mut candidates = Vec::new();
    collect_tex_files(tree, &mut candidates);

    if candidates.is_empty() {
        return None;
    }

    // Conventional root-document names, best first.
    const PREFERRED: &[&str] = &[
        "main.tex",
        "root.tex",
        "document.tex",
        "thesis.tex",
        "paper.tex",
        "report.tex",
        "index.tex",
        "master.tex",
        "resume.tex",
        "cv.tex",
    ];

    let mut best: Option<(i32, String)> = None;

    for relative in &candidates {
        let absolute = root.join(relative);
        // Reading only the head keeps this fast on large documents; the
        // preamble is always near the top.
        let head = read_head(&absolute, 16 * 1024).unwrap_or_default();

        // A magic comment is authoritative — return immediately.
        if let Some(declared) = parse_tex_root(&head) {
            let resolved = absolute
                .parent()
                .map(|p| p.join(&declared))
                .unwrap_or_else(|| root.join(&declared));
            if let Ok(inside) = paths::resolve_within(root, &resolved) {
                if inside.is_file() {
                    return Some(paths::relative_to(root, &inside));
                }
            }
        }

        let mut score = 0;
        if head.contains("\\documentclass") {
            score += 100;
        }
        if head.contains("\\begin{document}") {
            score += 100;
        }
        // Files that are clearly fragments are poor candidates.
        if head.contains("\\endinput") {
            score -= 40;
        }

        let name = relative
            .rsplit('/')
            .next()
            .unwrap_or(relative)
            .to_ascii_lowercase();
        if let Some(rank) = PREFERRED.iter().position(|p| *p == name) {
            score += 50 - (rank as i32 * 3);
        }
        // Prefer documents nearer the project root.
        score -= relative.matches('/').count() as i32 * 5;

        // `map_or` rather than `is_none_or`, which would raise this crate's MSRV.
        #[allow(clippy::unnecessary_map_or)]
        if best.as_ref().map_or(true, |(top, _)| score > *top) {
            best = Some((score, relative.clone()));
        }
    }

    best.map(|(_, path)| path)
}

/// Read at most `limit` bytes from a file, decoded leniently.
fn read_head(path: &Path, limit: usize) -> Option<String> {
    use std::io::Read;
    let mut file = fs::File::open(path).ok()?;
    let mut buffer = vec![0u8; limit];
    let read = file.read(&mut buffer).ok()?;
    buffer.truncate(read);
    Some(String::from_utf8_lossy(&buffer).into_owned())
}

/// Parse `% !TeX root = main.tex` (and the `%!TEX root` variant).
fn parse_tex_root(contents: &str) -> Option<String> {
    for line in contents.lines().take(20) {
        let trimmed = line.trim();
        if !trimmed.starts_with('%') {
            continue;
        }
        let lowered = trimmed.to_ascii_lowercase();
        let Some(marker) = lowered.find("!tex root") else {
            continue;
        };
        // Take the original-case remainder after the `=`.
        let remainder = &trimmed[marker + "!tex root".len()..];
        let value = remainder.trim_start_matches([' ', '=', ':']).trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_project(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("inktex-tree-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn classifies_by_extension() {
        assert_eq!(classify(Path::new("a/main.tex")), FileKind::Tex);
        assert_eq!(classify(Path::new("a/refs.bib")), FileKind::Bib);
        assert_eq!(classify(Path::new("a/logo.png")), FileKind::Image);
        assert_eq!(classify(Path::new("a/out.pdf")), FileKind::Pdf);
        assert_eq!(classify(Path::new("a/custom.sty")), FileKind::Style);
    }

    #[test]
    fn parses_tex_root_magic_comment() {
        assert_eq!(
            parse_tex_root("% !TeX root = ../main.tex\n").as_deref(),
            Some("../main.tex")
        );
        assert_eq!(
            parse_tex_root("%!TEX root = book.tex").as_deref(),
            Some("book.tex")
        );
        assert_eq!(parse_tex_root("\\documentclass{article}"), None);
    }

    #[test]
    fn builds_tree_and_hides_build_output() {
        let root = temp_project("build");
        fs::write(
            root.join("main.tex"),
            "\\documentclass{article}\\begin{document}x\\end{document}",
        )
        .unwrap();
        fs::create_dir_all(root.join(BUILD_DIR)).unwrap();
        fs::write(root.join(BUILD_DIR).join("main.aux"), "").unwrap();
        fs::create_dir_all(root.join("chapters")).unwrap();
        fs::write(root.join("chapters").join("one.tex"), "text").unwrap();

        let (tree, count) = build(&root).unwrap();
        let children = tree.children.as_ref().unwrap();

        assert!(children.iter().all(|c| c.name != BUILD_DIR));
        // main.tex + chapters/one.tex
        assert_eq!(count, 2);
        // Directories sort first.
        assert!(children[0].is_directory);

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn single_file_tree_excludes_siblings() {
        let root = temp_project("single-file");
        fs::write(root.join("notes.tex"), "\\documentclass{article}").unwrap();
        // A sibling that must not show up: opening one file must not open the
        // rest of a folder that might hold thousands of unrelated files.
        fs::write(root.join("unrelated.tex"), "\\documentclass{article}").unwrap();
        fs::create_dir_all(root.join("other-project")).unwrap();

        let (tree, count) = build_single_file(&root, &root.join("notes.tex")).unwrap();
        let children = tree.children.as_ref().unwrap();

        assert_eq!(count, 1);
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].name, "notes.tex");
        assert_eq!(children[0].path, "notes.tex");

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn detects_main_document_by_preamble() {
        let root = temp_project("main");
        fs::write(root.join("appendix.tex"), "Some fragment text\\endinput").unwrap();
        fs::write(
            root.join("paper.tex"),
            "\\documentclass{article}\n\\begin{document}\nhi\n\\end{document}",
        )
        .unwrap();

        let (tree, _) = build(&root).unwrap();
        assert_eq!(
            detect_main_document(&root, &tree).as_deref(),
            Some("paper.tex")
        );

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn magic_comment_overrides_heuristics() {
        let root = temp_project("magic");
        fs::write(
            root.join("book.tex"),
            "\\documentclass{book}\\begin{document}\\end{document}",
        )
        .unwrap();
        fs::write(
            root.join("chapter.tex"),
            "% !TeX root = book.tex\nchapter body",
        )
        .unwrap();

        let (tree, _) = build(&root).unwrap();
        assert_eq!(
            detect_main_document(&root, &tree).as_deref(),
            Some("book.tex")
        );

        fs::remove_dir_all(&root).ok();
    }
}
