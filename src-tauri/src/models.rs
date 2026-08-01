//! Data transfer objects shared with the frontend.
//!
//! Every struct here serialises to camelCase so it maps 1:1 onto the
//! TypeScript declarations in `src/types/`. Keep the two in sync when editing.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Project / filesystem
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FileKind {
    Directory,
    Tex,
    Bib,
    Image,
    Pdf,
    Style,
    Text,
    Binary,
}

/// One node of the project tree. Directories carry their children inline so a
/// project opens in a single IPC round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    /// Path relative to the project root, forward-slashed. Stable identity.
    pub path: String,
    pub name: String,
    pub kind: FileKind,
    pub is_directory: bool,
    /// Size in bytes; `0` for directories.
    pub size: u64,
    /// Milliseconds since the Unix epoch, or `0` if unavailable.
    pub modified: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    /// Absolute path to the project root.
    pub root: String,
    pub name: String,
    /// Best guess at the document to compile, relative to the root.
    pub main_document: Option<String>,
    /// Set when the user opened a single file rather than a folder: the file
    /// they picked, which the UI opens as the active tab.
    pub opened_file: Option<String>,
    pub tree: FileNode,
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub modified: u64,
    /// True when the file contains bytes that are not valid UTF-8 and was
    /// decoded lossily; the UI warns before allowing a save that would
    /// overwrite the original bytes.
    pub lossy: bool,
}

// ---------------------------------------------------------------------------
// TeX environment
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TexBinary {
    pub name: String,
    pub path: String,
    pub version: Option<String>,
}

/// Result of probing the machine for a usable TeX installation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TexEnvironment {
    /// True when at least one TeX engine was located.
    pub installed: bool,
    pub has_latexmk: bool,
    pub distribution: Option<String>,
    pub binaries: Vec<TexBinary>,
    /// The PATH InkTex uses when invoking the toolchain, for display in
    /// diagnostics.
    pub search_path: String,
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CompilerKind {
    Latexmk,
    Pdflatex,
    Xelatex,
    Lualatex,
}

impl CompilerKind {
    /// The executable this compiler drives.
    pub fn program(self) -> &'static str {
        match self {
            CompilerKind::Latexmk => "latexmk",
            CompilerKind::Pdflatex => "pdflatex",
            CompilerKind::Xelatex => "xelatex",
            CompilerKind::Lualatex => "lualatex",
        }
    }
}

/// The engine `latexmk` should drive, when `CompilerKind::Latexmk` is selected.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LatexmkEngine {
    Pdflatex,
    Xelatex,
    Lualatex,
}

impl LatexmkEngine {
    /// latexmk's engine-selection flag.
    pub fn flag(self) -> &'static str {
        match self {
            LatexmkEngine::Pdflatex => "-pdf",
            LatexmkEngine::Xelatex => "-pdfxe",
            LatexmkEngine::Lualatex => "-pdflua",
        }
    }

    pub fn program(self) -> &'static str {
        match self {
            LatexmkEngine::Pdflatex => "pdflatex",
            LatexmkEngine::Xelatex => "xelatex",
            LatexmkEngine::Lualatex => "lualatex",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BibEngine {
    Auto,
    Bibtex,
    Biber,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileRequest {
    pub root: String,
    /// Main document, relative to the root.
    pub main_document: String,
    pub compiler: CompilerKind,
    pub latexmk_engine: LatexmkEngine,
    pub bib_engine: BibEngine,
    /// Write auxiliary files into a dedicated build directory rather than
    /// alongside the sources.
    pub use_output_directory: bool,
    /// Enable SyncTeX output.
    pub synctex: bool,
    /// Force a from-scratch build, ignoring latexmk's dependency database.
    pub force: bool,
    /// Extra command-line arguments, parsed with shell quoting rules.
    pub extra_args: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Info,
}

/// A single parsed message from the compiler log.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub severity: DiagnosticSeverity,
    pub message: String,
    /// Source file relative to the project root, when it could be determined.
    pub file: Option<String>,
    /// 1-based source line.
    pub line: Option<u32>,
    /// Originating package or class, e.g. `hyperref`.
    pub component: Option<String>,
    /// The raw log excerpt, shown when the user expands a problem.
    pub raw: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CompileStatus {
    Success,
    /// The compiler exited non-zero but still produced a PDF.
    SucceededWithErrors,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileResult {
    pub id: String,
    pub status: CompileStatus,
    pub exit_code: Option<i32>,
    /// Absolute path to the produced PDF, if one exists.
    pub pdf_path: Option<String>,
    /// Milliseconds spent compiling.
    pub duration_ms: u64,
    pub diagnostics: Vec<Diagnostic>,
    /// Full interleaved stdout/stderr of the toolchain.
    pub log: String,
    /// The exact command line that ran, for the terminal panel.
    pub command: String,
    pub error_count: usize,
    pub warning_count: usize,
    /// Unix-epoch milliseconds at which the run finished.
    pub finished_at: u64,
}

/// Emitted on `compile://output` while a build runs.
///
/// Carries a batch of lines rather than one, so a noisy build does not send
/// thousands of individual IPC messages.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileOutputEvent {
    pub id: String,
    pub lines: Vec<String>,
}

/// Emitted on `compile://started`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileStartedEvent {
    pub id: String,
    pub command: String,
    pub started_at: u64,
}

// ---------------------------------------------------------------------------
// File watching
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FsChangeKind {
    Created,
    Modified,
    Removed,
    Renamed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsChange {
    pub kind: FsChangeKind,
    /// Project-relative path.
    pub path: String,
    pub is_directory: bool,
}

/// Emitted on `project://fs-changed` after debouncing.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsChangeEvent {
    pub root: String,
    pub changes: Vec<FsChange>,
    /// True when the change set touches files the editor may have open.
    pub affects_sources: bool,
}
