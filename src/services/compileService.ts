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
import { parseShellArgs } from '@/utils/shellArgs';
import { formatDuration, pluralize } from '@/utils/format';

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
  mainDocument: string | null,
): string | null {
  if (mainDocument === null) {
    return 'No main document is set. Right-click a .tex file and choose “Set as main document”.';
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
