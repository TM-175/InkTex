//! Parser for TeX engine and latexmk output.
//!
//! TeX logs are notoriously unstructured. Two things make this tractable:
//!
//! 1. We invoke every engine with `-file-line-error`, which prefixes most
//!    errors with `path:line:`, giving an exact source location.
//! 2. We set `max_print_line` to a large value (see [`super::engine`]) so the
//!    engine stops hard-wrapping messages at 79 columns and breaking them
//!    mid-token.
//!
//! Anything that still lacks a location falls back to the `(file … )` stack
//! that TeX prints as it opens and closes inputs.

use crate::models::{Diagnostic, DiagnosticSeverity};
use crate::paths;
use regex::Regex;
use std::collections::HashSet;
use std::path::Path;
use std::sync::OnceLock;

macro_rules! lazy_regex {
    ($name:ident, $pattern:expr) => {
        fn $name() -> &'static Regex {
            static RE: OnceLock<Regex> = OnceLock::new();
            RE.get_or_init(|| Regex::new($pattern).expect("valid regex"))
        }
    };
}

// `./main.tex:12: Undefined control sequence.`
lazy_regex!(
    file_line_error,
    r"(?m)^(?P<file>[^\s:][^:]*\.(?:tex|ltx|sty|cls|clo|def|bib|dtx|ins|bbx|cbx|lbx)):(?P<line>\d+):\s*(?P<message>.*)$"
);
// `! Undefined control sequence.`
lazy_regex!(bang_error, r"^!\s*(?P<message>.*)$");
// `l.42 \badmacro`
lazy_regex!(line_marker, r"^l\.(?P<line>\d+)\s?(?P<context>.*)$");
// `LaTeX Warning: …`, `Package hyperref Warning: …`, `Class article Warning: …`
lazy_regex!(
    warning,
    r"^(?P<producer>LaTeX|Package|Class|pdfTeX|LuaTeX|luaotfload|Font)\s*(?P<component>[A-Za-z0-9@_\-]+)?\s*(?P<level>Warning|Info):\s*(?P<message>.*)$"
);
// `… on input line 42.`
lazy_regex!(input_line, r"on input line (?P<line>\d+)");
// `Overfull \hbox (12.34pt too wide) in paragraph at lines 10--12`
lazy_regex!(
    box_warning,
    r"^(?P<type>Overfull|Underfull)\s+\\(?P<box>[hv])box\s*\((?P<detail>[^)]*)\)(?P<where>.*?)(?:at lines?\s+(?P<line>\d+)(?:--(?P<end>\d+))?)?\s*$"
);
// `! LaTeX Error: File `foo.sty' not found.`
lazy_regex!(missing_file, r"File `(?P<file>[^']+)' not found");
// `Latexmk: Errors, so I did not complete making targets`
lazy_regex!(latexmk_note, r"^Latexmk:\s*(?P<message>.*)$");

/// Tracks the `(file … )` nesting TeX prints while reading inputs.
#[derive(Default)]
struct FileStack {
    stack: Vec<String>,
}

impl FileStack {
    /// Consume one log line, pushing and popping as parentheses are seen.
    fn feed(&mut self, line: &str) {
        let chars: Vec<char> = line.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            match chars[i] {
                '(' => {
                    let start = i + 1;
                    let mut end = start;
                    while end < chars.len() && !is_path_terminator(chars[end]) {
                        end += 1;
                    }
                    let candidate: String = chars[start..end].iter().collect();
                    if looks_like_path(&candidate) {
                        self.stack.push(candidate);
                        i = end;
                    } else {
                        // A literal parenthesis in prose, not a file open.
                        i = start;
                    }
                }
                ')' => {
                    self.stack.pop();
                    i += 1;
                }
                _ => i += 1,
            }
        }
    }

    fn current(&self) -> Option<&str> {
        self.stack.last().map(String::as_str)
    }
}

fn is_path_terminator(c: char) -> bool {
    matches!(
        c,
        '(' | ')' | ' ' | '\t' | '{' | '}' | '[' | ']' | '"' | '\r' | '\n'
    )
}

/// Heuristic: a file token either contains a separator or ends in an extension.
fn looks_like_path(token: &str) -> bool {
    if token.is_empty() || token.len() > 512 {
        return false;
    }
    if token.contains('/') || token.contains('\\') {
        return true;
    }
    match token.rsplit_once('.') {
        Some((stem, ext)) => {
            !stem.is_empty()
                && (1..=5).contains(&ext.len())
                && ext.chars().all(|c| c.is_ascii_alphanumeric())
        }
        None => false,
    }
}

/// Collects diagnostics while de-duplicating repeats across engine passes.
struct Collector {
    out: Vec<Diagnostic>,
    seen: HashSet<(String, Option<String>, Option<u32>)>,
}

impl Collector {
    fn new() -> Self {
        Self {
            out: Vec::new(),
            seen: HashSet::new(),
        }
    }

    fn push(&mut self, diagnostic: Diagnostic) {
        let key = (
            diagnostic.message.clone(),
            diagnostic.file.clone(),
            diagnostic.line,
        );
        if self.seen.insert(key) {
            self.out.push(diagnostic);
        }
    }
}

/// Normalise a path found in the log into a project-relative path.
///
/// Returns `None` for files outside the project (packages from the TeX
/// distribution, for instance) so the UI never offers to open something it
/// cannot read.
fn resolve_source(root: &Path, raw: &str) -> Option<String> {
    let cleaned = raw.trim().trim_start_matches("./");
    if cleaned.is_empty() {
        return None;
    }

    let candidate = Path::new(cleaned);
    let absolute = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root.join(candidate)
    };

    if !absolute.exists() {
        return None;
    }
    // `resolve_within` rejects anything that escapes the project root.
    paths::resolve_within(root, &absolute)
        .ok()
        .map(|p| paths::relative_to(root, &p))
}

/// Strip the trailing `.` and surrounding whitespace TeX adds to messages.
fn tidy(message: &str) -> String {
    message.trim().trim_end_matches('.').trim().to_string()
}

/// Parse a full log into diagnostics, most severe first is *not* applied here —
/// order follows the log so the reader can follow the build chronologically.
pub fn parse(log: &str, root: &Path) -> Vec<Diagnostic> {
    let mut collector = Collector::new();
    let mut stack = FileStack::default();
    let lines: Vec<&str> = log.lines().collect();
    let mut index = 0;

    while index < lines.len() {
        let line = lines[index];
        // The stack must see every line, including ones we also parse below.
        stack.feed(line);

        // 1. `file:line: message` — the most reliable form.
        if let Some(caps) = file_line_error().captures(line) {
            let file_raw = caps.name("file").map(|m| m.as_str()).unwrap_or_default();
            let line_no: u32 = caps
                .name("line")
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(0);
            let message = caps.name("message").map(|m| m.as_str()).unwrap_or_default();

            // Some warnings also use this prefix; classify by content.
            let severity = if message.contains("Warning") {
                DiagnosticSeverity::Warning
            } else {
                DiagnosticSeverity::Error
            };

            let (message, hint) = augment(message);
            collector.push(Diagnostic {
                severity,
                message,
                file: resolve_source(root, file_raw),
                line: (line_no > 0).then_some(line_no),
                component: hint,
                raw: gather_context(&lines, index),
            });
            index += 1;
            continue;
        }

        // 2. `! message` — an error without an inline location. The location
        //    usually appears a few lines later as `l.<n>`.
        if let Some(caps) = bang_error().captures(line) {
            let head = caps.name("message").map(|m| m.as_str()).unwrap_or_default();
            if !head.trim().is_empty() {
                let mut line_no = None;
                let mut lookahead = index + 1;
                // Scan forward a bounded window for the `l.<n>` marker.
                while lookahead < lines.len() && lookahead <= index + 12 {
                    let probe = lines[lookahead];
                    if let Some(marker) = line_marker().captures(probe) {
                        line_no = marker.name("line").and_then(|m| m.as_str().parse().ok());
                        break;
                    }
                    if probe.starts_with('!') {
                        break;
                    }
                    lookahead += 1;
                }

                let (message, hint) = augment(head);
                collector.push(Diagnostic {
                    severity: DiagnosticSeverity::Error,
                    message,
                    file: stack.current().and_then(|f| resolve_source(root, f)),
                    line: line_no,
                    component: hint,
                    raw: gather_context(&lines, index),
                });
            }
            index += 1;
            continue;
        }

        // 3. Package / class / LaTeX warnings and informational notes.
        if let Some(caps) = warning().captures(line) {
            let producer = caps.name("producer").map(|m| m.as_str()).unwrap_or("");
            let component = caps.name("component").map(|m| m.as_str().to_string());
            let level = caps.name("level").map(|m| m.as_str()).unwrap_or("Warning");
            let head = caps.name("message").map(|m| m.as_str()).unwrap_or("");

            // Warnings wrap onto following indented lines.
            let mut message = head.to_string();
            let mut cursor = index + 1;
            while cursor < lines.len() {
                let next = lines[cursor];
                if next.starts_with('(') || next.trim().is_empty() || !next.starts_with(' ') {
                    break;
                }
                message.push(' ');
                message.push_str(next.trim());
                cursor += 1;
            }

            let line_no = input_line()
                .captures(&message)
                .and_then(|c| c.name("line"))
                .and_then(|m| m.as_str().parse().ok());

            let severity = if level == "Info" {
                DiagnosticSeverity::Info
            } else {
                DiagnosticSeverity::Warning
            };

            // Suppress the noisy rerun notice; latexmk already handles reruns.
            let is_rerun_notice =
                message.contains("Rerun to get") || message.contains("rerunfilecheck");
            if !is_rerun_notice {
                collector.push(Diagnostic {
                    severity,
                    message: tidy(&message),
                    file: stack.current().and_then(|f| resolve_source(root, f)),
                    line: line_no,
                    component: component.or_else(|| Some(producer.to_string())),
                    raw: gather_context(&lines, index),
                });
            }
            index = cursor.max(index + 1);
            continue;
        }

        // 4. Typesetting (over/underfull box) notices — reported as Info so the
        //    Problems panel is not swamped; the UI can filter them back in.
        if let Some(caps) = box_warning().captures(line) {
            let kind = caps.name("type").map(|m| m.as_str()).unwrap_or("");
            let box_type = caps.name("box").map(|m| m.as_str()).unwrap_or("h");
            let detail = caps.name("detail").map(|m| m.as_str()).unwrap_or("");
            let line_no = caps
                .name("line")
                .and_then(|m| m.as_str().parse::<u32>().ok());

            collector.push(Diagnostic {
                severity: DiagnosticSeverity::Info,
                message: format!("{kind} \\{box_type}box ({detail})"),
                file: stack.current().and_then(|f| resolve_source(root, f)),
                line: line_no,
                component: Some("Typesetting".into()),
                raw: line.to_string(),
            });
            index += 1;
            continue;
        }

        // 5. latexmk's own summary lines. Only failures are worth surfacing.
        if let Some(caps) = latexmk_note().captures(line) {
            let message = caps.name("message").map(|m| m.as_str()).unwrap_or("");
            let lowered = message.to_ascii_lowercase();
            if lowered.contains("error")
                || lowered.contains("failed")
                || lowered.contains("did not")
            {
                collector.push(Diagnostic {
                    severity: DiagnosticSeverity::Error,
                    message: tidy(message),
                    file: None,
                    line: None,
                    component: Some("latexmk".into()),
                    raw: line.to_string(),
                });
            }
            index += 1;
            continue;
        }

        index += 1;
    }

    collector.out
}

/// Rewrite terse TeX phrasing into something actionable, returning the message
/// plus an optional component tag.
fn augment(message: &str) -> (String, Option<String>) {
    let tidied = tidy(message);

    if let Some(caps) = missing_file().captures(&tidied) {
        let file = caps.name("file").map(|m| m.as_str()).unwrap_or("");
        let is_package = file.ends_with(".sty") || file.ends_with(".cls");
        if is_package {
            let package = file.trim_end_matches(".sty").trim_end_matches(".cls");
            return (
                format!(
                    "Missing package “{package}”. Install it with your TeX package manager \
                     (tlmgr install {package}), or remove the \\usepackage line."
                ),
                Some("Missing package".into()),
            );
        }
        return (
            format!("File “{file}” was not found in the project."),
            Some("Missing file".into()),
        );
    }

    if tidied.starts_with("Undefined control sequence") {
        return (
            "Undefined control sequence — the command on this line is not defined. \
             Check for a typo or a missing \\usepackage."
                .into(),
            Some("Syntax".into()),
        );
    }

    if tidied.contains("Emergency stop") {
        return (tidied, Some("Fatal".into()));
    }

    (tidied, None)
}

/// A short excerpt around `index`, shown when a problem row is expanded.
fn gather_context(lines: &[&str], index: usize) -> String {
    let end = (index + 4).min(lines.len());
    lines[index..end].join("\n").trim_end().to_string()
}

/// Whether the log indicates the engine gave up without producing output.
pub fn is_fatal(log: &str) -> bool {
    log.contains("Fatal error occurred, no output PDF file produced")
        || log.contains("Emergency stop")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DiagnosticSeverity;

    fn root() -> &'static Path {
        Path::new("/nonexistent-project-root")
    }

    #[test]
    fn parses_file_line_errors() {
        let log = "./main.tex:12: Undefined control sequence.\nl.12 \\badmacro\n";
        let diagnostics = parse(log, root());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].severity, DiagnosticSeverity::Error);
        assert_eq!(diagnostics[0].line, Some(12));
        assert!(diagnostics[0]
            .message
            .contains("Undefined control sequence"));
    }

    #[test]
    fn parses_bang_error_with_line_marker() {
        let log = "! Missing $ inserted.\n<inserted text>\n                $\nl.7 x^2\n";
        let diagnostics = parse(log, root());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].line, Some(7));
        assert_eq!(diagnostics[0].severity, DiagnosticSeverity::Error);
    }

    #[test]
    fn parses_warnings_with_input_line() {
        let log = "LaTeX Warning: Reference `fig:one' on page 1 undefined on input line 42.\n";
        let diagnostics = parse(log, root());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].severity, DiagnosticSeverity::Warning);
        assert_eq!(diagnostics[0].line, Some(42));
    }

    #[test]
    fn classifies_box_warnings_as_info() {
        let log = r"Overfull \hbox (12.5pt too wide) in paragraph at lines 10--12";
        let diagnostics = parse(log, root());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].severity, DiagnosticSeverity::Info);
        assert_eq!(diagnostics[0].line, Some(10));
    }

    #[test]
    fn rewrites_missing_package_errors() {
        let log = "! LaTeX Error: File `tikz.sty' not found.\n";
        let diagnostics = parse(log, root());
        assert_eq!(diagnostics.len(), 1);
        assert!(diagnostics[0].message.contains("tlmgr install tikz"));
    }

    #[test]
    fn deduplicates_repeated_passes() {
        let log =
            "./a.tex:3: Undefined control sequence.\n./a.tex:3: Undefined control sequence.\n";
        assert_eq!(parse(log, root()).len(), 1);
    }

    #[test]
    fn ignores_rerun_notices() {
        let log =
            "LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.\n";
        assert!(parse(log, root()).is_empty());
    }

    #[test]
    fn file_stack_tracks_nesting() {
        let mut stack = FileStack::default();
        stack.feed("(./main.tex (./chapters/intro.tex");
        assert_eq!(stack.current(), Some("./chapters/intro.tex"));
        stack.feed(")");
        assert_eq!(stack.current(), Some("./main.tex"));
    }

    #[test]
    fn prose_parentheses_do_not_push() {
        let mut stack = FileStack::default();
        stack.feed("(./main.tex");
        stack.feed("some text (see the transcript file) continues");
        // The literal `)` pops, but no bogus file was pushed.
        assert_eq!(stack.current(), None);
        assert!(looks_like_path("./chapters/intro.tex"));
        assert!(!looks_like_path("see"));
    }

    #[test]
    fn detects_fatal_logs() {
        assert!(is_fatal("! Emergency stop."));
        assert!(!is_fatal("all good"));
    }
}
