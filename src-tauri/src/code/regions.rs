//! Detection of named code regions.
//!
//! Region markers are a convention rather than a standard, so this recognises
//! the forms that appear across the languages InkTex supports:
//!
//! ```text
//! // region NAME          … // endregion          C, C++, Java, Rust, Go, JS, TS, Kotlin, Swift
//! //#region NAME          … //#endregion          Visual Studio / VS Code
//! #pragma region NAME     … #pragma endregion     C, C++
//! # region NAME           … # endregion           Python, Bash, YAML, Ruby
//! -- region NAME          … -- endregion          SQL, Lua, Haskell
//! <!-- #region NAME -->   … <!-- #endregion -->   HTML, Markdown, XML
//! /* region NAME */       … /* endregion */       CSS
//! ```
//!
//! Nesting is supported: an inner region closes before its parent.

use crate::models::CodeRegion;
use regex::Regex;
use std::sync::OnceLock;

/// Opening marker. Captures the region name, which may be empty.
fn region_start() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?ix)
            ^\s*
            (?://+|/\*|\#|--|<!--|%|;)   # a comment opener
            \s*\#?\s*
            (?:pragma\s+)?
            region
            \b\s*
            (?P<name>[^*\-\r\n]*?)       # the name, stopping before */ or -->
            \s*
            (?:\*/|-->)?
            \s*$",
        )
        .expect("valid region regex")
    })
}

/// Closing marker.
fn region_end() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?ix)
            ^\s*
            (?://+|/\*|\#|--|<!--|%|;)
            \s*\#?\s*
            (?:pragma\s+)?
            end\s*region
            \b.*$",
        )
        .expect("valid endregion regex")
    })
}

/// Find every named region in `source`.
///
/// Line numbers are 1-based. `first_line`/`last_line` bound the region's
/// *contents*, excluding the marker lines themselves — importing a region
/// should not drag its `// region` comment into the document.
pub fn detect(source: &str) -> Vec<CodeRegion> {
    let lines: Vec<&str> = source.lines().collect();
    let mut regions: Vec<CodeRegion> = Vec::new();

    // Stack of open regions: (name, index into `regions`, depth marker line).
    let mut open: Vec<(String, usize)> = Vec::new();

    for (index, line) in lines.iter().enumerate() {
        let line_number = index + 1;

        // `endregion` also matches the `region` pattern's prefix, so it must be
        // tested first.
        if region_end().is_match(line) {
            if let Some((_, slot)) = open.pop() {
                let region: &mut CodeRegion = &mut regions[slot];
                // Marker lines are excluded; an empty region stays empty.
                region.last_line = line_number.saturating_sub(1).max(region.first_line);
                region.line_count = region
                    .last_line
                    .saturating_sub(region.first_line)
                    .saturating_add(1);
            }
            continue;
        }

        if let Some(captures) = region_start().captures(line) {
            let raw = captures
                .name("name")
                .map(|m| m.as_str().trim())
                .unwrap_or("");

            // An unnamed region cannot be referenced, so give it a positional
            // name rather than dropping it.
            let name = if raw.is_empty() {
                format!("region {}", regions.len() + 1)
            } else {
                raw.to_string()
            };

            regions.push(CodeRegion {
                name: name.clone(),
                first_line: line_number + 1,
                last_line: line_number + 1,
                line_count: 0,
                depth: open.len(),
            });
            open.push((name, regions.len() - 1));
        }
    }

    // A region left open by a missing `endregion` runs to the end of the file.
    for (_, slot) in open {
        let total = lines.len();
        let region = &mut regions[slot];
        region.last_line = total.max(region.first_line);
        region.line_count = region
            .last_line
            .saturating_sub(region.first_line)
            .saturating_add(1);
    }

    // Drop regions that ended up empty; they are marker noise, not content.
    regions.retain(|region| region.line_count > 0 && region.last_line >= region.first_line);
    regions
}

/// The 1-based line span of a named region, if it exists.
pub fn find(source: &str, name: &str) -> Option<(usize, usize)> {
    detect(source)
        .into_iter()
        .find(|region| region.name.eq_ignore_ascii_case(name))
        .map(|region| (region.first_line, region.last_line))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_c_style_regions() {
        let source = "\
fn main() {}
// region parse
fn parse() {}
fn lex() {}
// endregion
fn tail() {}";

        let regions = detect(source);
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].name, "parse");
        // Contents only: lines 3 and 4, not the markers on 2 and 5.
        assert_eq!(regions[0].first_line, 3);
        assert_eq!(regions[0].last_line, 4);
        assert_eq!(regions[0].line_count, 2);
    }

    #[test]
    fn detects_pragma_and_hash_and_html_forms() {
        for source in [
            "#pragma region Helpers\nint a;\n#pragma endregion",
            "# region Helpers\na = 1\n# endregion",
            "<!-- #region Helpers -->\n<p></p>\n<!-- #endregion -->",
            "//#region Helpers\nlet a;\n//#endregion",
            "-- region Helpers\nSELECT 1;\n-- endregion",
        ] {
            let regions = detect(source);
            assert_eq!(regions.len(), 1, "failed for: {source}");
            assert_eq!(regions[0].name, "Helpers", "failed for: {source}");
            assert_eq!(regions[0].line_count, 1);
        }
    }

    #[test]
    fn supports_nesting() {
        let source = "\
// region outer
a
// region inner
b
// endregion
c
// endregion";

        let regions = detect(source);
        assert_eq!(regions.len(), 2);

        let outer = regions.iter().find(|r| r.name == "outer").unwrap();
        let inner = regions.iter().find(|r| r.name == "inner").unwrap();

        assert_eq!(outer.depth, 0);
        assert_eq!(inner.depth, 1);
        assert_eq!(inner.first_line, 4);
        assert_eq!(inner.last_line, 4);
        // The outer region spans everything between its own markers.
        assert_eq!(outer.first_line, 2);
        assert_eq!(outer.last_line, 6);
    }

    #[test]
    fn unclosed_region_runs_to_end_of_file() {
        let source = "// region tail\na\nb";
        let regions = detect(source);
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].last_line, 3);
    }

    #[test]
    fn finds_region_by_name_case_insensitively() {
        let source = "// region Parse\nx\n// endregion";
        assert_eq!(find(source, "parse"), Some((2, 2)));
        assert_eq!(find(source, "missing"), None);
    }

    #[test]
    fn ignores_prose_containing_the_word_region() {
        let source = "// this region of the code is fast\nlet a = 1;";
        assert!(detect(source).is_empty());
    }
}
