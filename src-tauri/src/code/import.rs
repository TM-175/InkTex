//! Extracting a snippet from a source file, and deciding whether a listing
//! that was imported earlier is still in sync with it.
//!
//! Hashing lives here rather than in the frontend so that "is this listing
//! stale?" is answered by one implementation. The frontend only ever compares
//! two opaque strings.

use crate::code::regions;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::models::{
    ImportMode, ImportedCode, SourceLinkQuery, SourceLinkResult, SourceLinkStatus,
};
use crate::paths;
use std::fs;
use std::path::Path;

/// Refuse to import anything larger than this in one go.
const MAX_IMPORT_BYTES: u64 = 8 * 1024 * 1024;

/// FNV-1a (64-bit), rendered as hex.
///
/// Chosen over a cryptographic hash because this only needs to detect honest
/// edits, not resist forgery — and it is a dozen lines with no dependency.
fn fingerprint(content: &str) -> String {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0000_0100_0000_01b3;

    let mut hash = OFFSET;
    // Hash the normalised form so a CRLF/LF change alone is not a "change".
    for byte in content.replace("\r\n", "\n").as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(PRIME);
    }
    format!("{hash:016x}")
}

/// Remove the whitespace prefix common to every non-blank line.
///
/// A region nested inside a class arrives indented by two levels; keeping that
/// indentation in a listing wastes horizontal space and reads badly in a PDF.
fn dedent(text: &str) -> String {
    let indent_of = |line: &str| line.len() - line.trim_start().len();

    let common = text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(indent_of)
        .min()
        .unwrap_or(0);

    if common == 0 {
        return text.to_string();
    }

    text.lines()
        .map(|line| {
            if line.len() >= common {
                &line[common..]
            } else {
                line.trim_start()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Trim blank lines from both ends without touching interior spacing.
fn trim_blank_edges(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();

    let start = lines.iter().position(|line| !line.trim().is_empty());
    let end = lines.iter().rposition(|line| !line.trim().is_empty());

    match (start, end) {
        (Some(first), Some(last)) => lines[first..=last].join("\n"),
        _ => String::new(),
    }
}

/// Read a source file as text, with a size guard.
fn read_source(root: &Path, relative: &str) -> AppResult<String> {
    let absolute = paths::resolve_within(root, Path::new(relative))?;

    let metadata = fs::metadata(&absolute).map_err(|e| AppError::from_io(&e, &absolute))?;
    if metadata.len() > MAX_IMPORT_BYTES {
        return Err(AppError::new(
            ErrorKind::Io,
            format!(
                "“{relative}” is {:.1} MB, which is too large to import as a listing.",
                metadata.len() as f64 / 1_048_576.0
            ),
        )
        .with_hint("Import a line range or a named region instead."));
    }

    let bytes = fs::read(&absolute).map_err(|e| AppError::from_io(&e, &absolute))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Resolve a mode into a concrete 1-based line span over `source`.
fn resolve_span(
    source: &str,
    mode: ImportMode,
    first_line: Option<usize>,
    last_line: Option<usize>,
    region: Option<&str>,
) -> AppResult<(usize, usize)> {
    let total = source.lines().count().max(1);

    match mode {
        ImportMode::Whole => Ok((1, total)),

        ImportMode::Range => {
            let first = first_line.unwrap_or(1).max(1);
            let last = last_line.unwrap_or(total).min(total);

            if first > last {
                return Err(AppError::invalid_path(format!(
                    "Line range {first}–{last} is empty."
                )));
            }
            Ok((first, last))
        }

        ImportMode::Region => {
            let name = region.unwrap_or_default();
            regions::find(source, name).ok_or_else(|| {
                AppError::new(
                    ErrorKind::NotFound,
                    format!("The region “{name}” no longer exists in this file."),
                )
                .with_hint("Re-import the listing to pick a different region or range.")
            })
        }
    }
}

/// Extract a snippet and describe it.
pub fn import(
    root: &Path,
    relative: &str,
    mode: ImportMode,
    first_line: Option<usize>,
    last_line: Option<usize>,
    region: Option<&str>,
    dedent_snippet: bool,
) -> AppResult<ImportedCode> {
    let source = read_source(root, relative)?;
    let total_lines = source.lines().count();

    let (first, last) = resolve_span(&source, mode, first_line, last_line, region)?;

    let slice = source
        .lines()
        .skip(first.saturating_sub(1))
        .take(last.saturating_sub(first).saturating_add(1))
        .collect::<Vec<_>>()
        .join("\n");

    let trimmed = trim_blank_edges(&slice);
    let content = if dedent_snippet {
        dedent(&trimmed)
    } else {
        trimmed
    };

    Ok(ImportedCode {
        content: content.clone(),
        hash: fingerprint(&content),
        first_line: first,
        last_line: last,
        total_lines,
        region_count: regions::detect(&source).len(),
    })
}

/// Re-extract each link and report whether its listing is still current.
///
/// Batched deliberately: a document with fifty listings would otherwise cost
/// fifty IPC round-trips every time the watcher fires.
pub fn check_links(root: &Path, queries: &[SourceLinkQuery]) -> Vec<SourceLinkResult> {
    queries
        .iter()
        .map(|query| {
            let outcome = import(
                root,
                &query.path,
                query.mode,
                query.first_line,
                query.last_line,
                query.region.as_deref(),
                query.dedent,
            );

            match outcome {
                Ok(imported) => SourceLinkResult {
                    status: if imported.hash == query.hash {
                        SourceLinkStatus::UpToDate
                    } else {
                        SourceLinkStatus::Changed
                    },
                    hash: Some(imported.hash),
                    first_line: Some(imported.first_line),
                    last_line: Some(imported.last_line),
                },
                Err(error) => {
                    // Distinguish "the file went away" from "the region went
                    // away": the UI offers different repairs for each. The
                    // error kind alone is ambiguous — a missing file also
                    // surfaces as NotFound — so the file is checked directly.
                    let file_exists = paths::resolve_within(root, Path::new(&query.path))
                        .map(|absolute| absolute.is_file())
                        .unwrap_or(false);

                    let status = if !file_exists {
                        SourceLinkStatus::FileMissing
                    } else if query.mode == ImportMode::Region && error.kind == ErrorKind::NotFound
                    {
                        SourceLinkStatus::RegionMissing
                    } else {
                        SourceLinkStatus::FileMissing
                    };

                    SourceLinkResult {
                        status,
                        hash: None,
                        first_line: None,
                        last_line: None,
                    }
                }
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn sandbox(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("inktex-import-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    const SAMPLE: &str = "\
fn main() {
    // region core
    let x = 1;
    let y = 2;
    // endregion
}
";

    #[test]
    fn fingerprint_is_stable_and_line_ending_agnostic() {
        assert_eq!(fingerprint("a\nb"), fingerprint("a\r\nb"));
        assert_ne!(fingerprint("a\nb"), fingerprint("a\nc"));
        assert_eq!(fingerprint("x").len(), 16);
    }

    #[test]
    fn dedent_removes_the_common_prefix_only() {
        let text = "    a\n      b\n\n    c";
        assert_eq!(dedent(text), "a\n  b\n\nc");
        // Nothing to remove when a line is already flush left.
        assert_eq!(dedent("a\n  b"), "a\n  b");
    }

    #[test]
    fn imports_a_whole_file() {
        let root = sandbox("whole");
        fs::write(root.join("main.rs"), SAMPLE).unwrap();

        let imported =
            import(&root, "main.rs", ImportMode::Whole, None, None, None, false).unwrap();

        assert_eq!(imported.first_line, 1);
        assert_eq!(imported.total_lines, 6);
        assert!(imported.content.starts_with("fn main()"));
        assert_eq!(imported.region_count, 1);

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn imports_a_region_dedented_and_without_markers() {
        let root = sandbox("region");
        fs::write(root.join("main.rs"), SAMPLE).unwrap();

        let imported = import(
            &root,
            "main.rs",
            ImportMode::Region,
            None,
            None,
            Some("core"),
            true,
        )
        .unwrap();

        assert_eq!(imported.content, "let x = 1;\nlet y = 2;");
        assert_eq!(imported.first_line, 3);
        assert_eq!(imported.last_line, 4);

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn clamps_out_of_bounds_ranges() {
        let root = sandbox("range");
        fs::write(root.join("main.rs"), SAMPLE).unwrap();

        let imported = import(
            &root,
            "main.rs",
            ImportMode::Range,
            Some(1),
            Some(9_999),
            None,
            false,
        )
        .unwrap();

        assert_eq!(imported.last_line, 6);

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn missing_region_is_reported_distinctly() {
        let root = sandbox("missing-region");
        fs::write(root.join("main.rs"), SAMPLE).unwrap();

        let queries = vec![SourceLinkQuery {
            path: "main.rs".into(),
            mode: ImportMode::Region,
            first_line: None,
            last_line: None,
            region: Some("gone".into()),
            hash: "0".into(),
            dedent: true,
        }];

        assert_eq!(
            check_links(&root, &queries)[0].status,
            SourceLinkStatus::RegionMissing
        );

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn detects_up_to_date_and_changed_links() {
        let root = sandbox("links");
        fs::write(root.join("main.rs"), SAMPLE).unwrap();

        let imported = import(
            &root,
            "main.rs",
            ImportMode::Region,
            None,
            None,
            Some("core"),
            true,
        )
        .unwrap();

        let query = |hash: &str| SourceLinkQuery {
            path: "main.rs".into(),
            mode: ImportMode::Region,
            first_line: None,
            last_line: None,
            region: Some("core".into()),
            hash: hash.into(),
            dedent: true,
        };

        assert_eq!(
            check_links(&root, &[query(&imported.hash)])[0].status,
            SourceLinkStatus::UpToDate
        );
        assert_eq!(
            check_links(&root, &[query("stale")])[0].status,
            SourceLinkStatus::Changed
        );

        // A missing file is distinct again.
        fs::remove_file(root.join("main.rs")).unwrap();
        assert_eq!(
            check_links(&root, &[query(&imported.hash)])[0].status,
            SourceLinkStatus::FileMissing
        );

        fs::remove_dir_all(&root).ok();
    }
}
