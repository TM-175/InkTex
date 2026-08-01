/**
 * Compilation types.
 *
 * Mirrors the compilation section of `src-tauri/src/models.rs`.
 */

export type CompilerKind = 'latexmk' | 'pdflatex' | 'xelatex' | 'lualatex';

/** The engine `latexmk` drives when it is the selected compiler. */
export type LatexmkEngine = 'pdflatex' | 'xelatex' | 'lualatex';

export type BibEngine = 'auto' | 'bibtex' | 'biber' | 'none';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  /** Project-relative source file, when it could be determined. */
  file: string | null;
  /** 1-based source line. */
  line: number | null;
  /** Originating package or class, e.g. `hyperref`. */
  component: string | null;
  /** Raw log excerpt, shown when a problem row is expanded. */
  raw: string;
}

export type CompileStatus = 'success' | 'succeededWithErrors' | 'failed' | 'canceled';

export interface CompileRequest {
  root: string;
  mainDocument: string;
  compiler: CompilerKind;
  latexmkEngine: LatexmkEngine;
  bibEngine: BibEngine;
  useOutputDirectory: boolean;
  synctex: boolean;
  force: boolean;
  extraArgs: string[];
}

export interface CompileResult {
  id: string;
  status: CompileStatus;
  exitCode: number | null;
  /** Absolute path to the produced PDF, if one exists. */
  pdfPath: string | null;
  durationMs: number;
  diagnostics: Diagnostic[];
  log: string;
  command: string;
  errorCount: number;
  warningCount: number;
  finishedAt: number;
}

export interface CompileStartedEvent {
  id: string;
  command: string;
  startedAt: number;
}

export interface CompileOutputEvent {
  id: string;
  /** A batch of lines, not one — see `RunContext::emit_lines` in the backend. */
  lines: string[];
}

export interface TexBinary {
  name: string;
  path: string;
  version: string | null;
}

export interface TexEnvironment {
  /** At least one TeX engine was located. */
  installed: boolean;
  hasLatexmk: boolean;
  distribution: string | null;
  binaries: TexBinary[];
  /** The PATH InkTex uses when invoking the toolchain. */
  searchPath: string;
}

/** One entry in the recent-compile history shown in the output panel. */
export interface CompileHistoryEntry {
  id: string;
  status: CompileStatus;
  mainDocument: string;
  compiler: CompilerKind;
  durationMs: number;
  errorCount: number;
  warningCount: number;
  finishedAt: number;
}

/** Lifecycle of the compile subsystem, as reflected in the status bar. */
export type CompilePhase = 'idle' | 'running' | 'canceling';
