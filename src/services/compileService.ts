/**
 * Compilation business logic that does not belong to the UI or to IPC:
 * assembling a request from settings, and summarising a result.
 */

import type {
  CompileRequest,
  CompileResult,
  CompileStatus,
  Diagnostic,
  DiagnosticSeverity,
  TexEnvironment,
} from '@/types/compile';
import type { Settings } from '@/types/settings';
import type { EditorTab } from '@/types/editor';
import type { ProjectInfo } from '@/types/project';
import { parseShellArgs } from '@/utils/shellArgs';
import { formatDuration, pluralize } from '@/utils/format';
import { dirname, extname, join } from '@/utils/path';

/** Extensions that can be handed to a TeX engine directly. */
const COMPILABLE = new Set(['tex', 'ltx', 'latex']);

/**
 * Read a `% !TeX root = …` magic comment from the head of a document.
 *
 * Returns the declared root as a project-relative path, resolved against the
 * declaring file's folder.
 */
export function parseTexRoot(content: string, filePath: string): string | null {
  // The comment is a preamble convention; only the first lines matter.
  for (const line of content.split('\n', 20)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('%')) continue;

    const match = /!\s*tex\s+root\s*[=:]\s*(.+)$/i.exec(trimmed);
    if (match === null) continue;

    const declared = match[1]?.trim();
    if (declared === undefined || declared === '') continue;

    // Resolve relative to the file that declares it, then collapse `..`.
    const segments = join(dirname(filePath), declared).split('/');
    const resolved: string[] = [];

    for (const segment of segments) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') resolved.pop();
      else resolved.push(segment);
    }
    return resolved.join('/');
  }
  return null;
}

/**
 * Decide which document a compile should build.
 *
 * The document the user is looking at wins — that is what "Compile" means when
 * you press it. Two refinements:
 *
 * 1. A `% !TeX root` comment in that file is an explicit instruction from the
 *    document itself, so a chapter that declares its parent builds the parent.
 * 2. When the active tab is not a `.tex` file (a `.bib`, an image, or nothing
 *    open at all), fall back to the project's main document.
 */
export function resolveCompileTarget(
  project: ProjectInfo | null,
  tabs: readonly EditorTab[],
  activePath: string | null,
): string | null {
  if (project === null) return null;

  const active = tabs.find((tab) => tab.path === activePath) ?? null;

  if (active !== null && COMPILABLE.has(extname(active.path))) {
    const declaredRoot = parseTexRoot(active.content, active.path);
    return declaredRoot ?? active.path;
  }

  return project.mainDocument;
}

/** Build a {@link CompileRequest} from the current project and settings. */
export function buildRequest(
  root: string,
  mainDocument: string,
  settings: Settings,
  options: { force?: boolean } = {},
): CompileRequest {
  return {
    root,
    mainDocument,
    compiler: settings.defaultCompiler,
    latexmkEngine: settings.latexmkEngine,
    bibEngine: settings.bibEngine,
    useOutputDirectory: settings.useOutputDirectory,
    synctex: settings.synctex,
    force: options.force ?? false,
    extraArgs: parseShellArgs(settings.extraCompilerArgs),
  };
}

/**
 * Why a compile cannot start right now, or null when it can.
 *
 * Checking up front lets the UI disable the button with a reason rather than
 * failing after the user clicks.
 */
export function compileBlocker(
  environment: TexEnvironment | null,
  settings: Settings,
  target: string | null,
): string | null {
  if (target === null) {
    return 'Open a .tex file to compile it.';
  }
  if (environment === null) return null; // Still probing; let the attempt proceed.

  if (!environment.installed) {
    return 'No TeX installation was found. Install TeX Live, MacTeX or MiKTeX to compile.';
  }
  if (settings.defaultCompiler === 'latexmk' && !environment.hasLatexmk) {
    return 'latexmk was not found. Choose a different compiler in Settings, or install latexmk.';
  }

  const engine =
    settings.defaultCompiler === 'latexmk' ? settings.latexmkEngine : settings.defaultCompiler;

  if (!environment.binaries.some((binary) => binary.name === engine)) {
    return `${engine} was not found. Choose a different engine in Settings.`;
  }
  return null;
}

/** Human-readable status line shown after a build. */
export function summarize(result: CompileResult): string {
  const duration = formatDuration(result.durationMs);

  switch (result.status) {
    case 'success':
      return result.warningCount > 0
        ? `Compiled in ${duration} with ${pluralize(result.warningCount, 'warning')}`
        : `Compiled in ${duration}`;
    case 'succeededWithErrors':
      return `Compiled in ${duration} with ${pluralize(result.errorCount, 'error')}`;
    case 'failed':
      return result.errorCount > 0
        ? `Failed after ${duration} — ${pluralize(result.errorCount, 'error')}`
        : `Failed after ${duration}`;
    case 'canceled':
      return 'Compilation canceled';
  }
}

/** Tailwind text colour for a status, used by the status bar and history. */
export function statusColor(status: CompileStatus): string {
  switch (status) {
    case 'success':
      return 'text-emerald-400';
    case 'succeededWithErrors':
      return 'text-amber-400';
    case 'failed':
      return 'text-rose-400';
    case 'canceled':
      return 'text-content-muted';
  }
}

const SEVERITY_ORDER: Record<DiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** Sort most severe first, then by file and line, for the Problems panel. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;

    const byFile = (a.file ?? '').localeCompare(b.file ?? '');
    if (byFile !== 0) return byFile;

    return (a.line ?? 0) - (b.line ?? 0);
  });
}

/** Count diagnostics of each severity. */
export function countBySeverity(
  diagnostics: readonly Diagnostic[],
): Record<DiagnosticSeverity, number> {
  const counts: Record<DiagnosticSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of diagnostics) {
    counts[diagnostic.severity] += 1;
  }
  return counts;
}

/**
 * Should this file change trigger an auto-compile?
 *
 * Editing a `.png` or a stray `.txt` note has no effect on the PDF, and
 * recompiling for it wastes seconds.
 */
export function affectsOutput(path: string): boolean {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return ['tex', 'ltx', 'latex', 'bib', 'sty', 'cls', 'clo', 'def', 'bst'].includes(extension);
}
