/**
 * Compilation state: current phase, diagnostics, streamed output and history.
 *
 * Overlap prevention lives in the Rust backend (only one build may hold the
 * compile slot). This store mirrors that with a `phase` so the UI can disable
 * the button, and additionally suppresses redundant auto-compiles.
 */

import { create } from 'zustand';
import { compileApi, fsApi } from '@/tauri';
import type {
  CompileHistoryEntry,
  CompilePhase,
  CompileResult,
  Diagnostic,
  TexEnvironment,
} from '@/types/compile';
import { toAppError } from '@/types/errors';
import { buildRequest, sortDiagnostics, summarize } from '@/services/compileService';
import { currentSettings } from './settingsStore';
import { currentProject, useProjectStore } from './projectStore';
import { notify, useUiStore } from './uiStore';

/** Lines of streamed output kept in memory. */
const MAX_OUTPUT_LINES = 5_000;
/** Builds kept in the history list. */
const MAX_HISTORY = 25;

interface CompileState {
  phase: CompilePhase;
  environment: TexEnvironment | null;
  /** Result of the most recent finished build. */
  result: CompileResult | null;
  diagnostics: Diagnostic[];
  /** Streamed toolchain output for the run in progress or just finished. */
  outputLines: string[];
  history: CompileHistoryEntry[];

  /** Absolute path of the PDF currently displayed. */
  pdfPath: string | null;
  /** Bumped after each successful build so the viewer reloads. */
  pdfVersion: number;
  /** Epoch millis when the running build started. */
  startedAt: number | null;

  probeEnvironment: () => Promise<void>;
  compile: (options?: { force?: boolean; silent?: boolean }) => Promise<void>;
  cancel: () => Promise<void>;
  appendOutput: (line: string) => void;
  clearOutput: () => void;
  cleanAuxiliaryFiles: () => Promise<void>;
  /** Load a PDF that already exists on disk, without compiling. */
  adoptExistingPdf: (path: string) => void;
}

export const useCompileStore = create<CompileState>((set, get) => ({
  phase: 'idle',
  environment: null,
  result: null,
  diagnostics: [],
  outputLines: [],
  history: [],
  pdfPath: null,
  pdfVersion: 0,
  startedAt: null,

  probeEnvironment: async () => {
    try {
      set({ environment: await compileApi.getTexEnvironment() });
    } catch {
      // Treat a failed probe as "nothing installed"; the welcome banner then
      // explains how to install TeX.
      set({
        environment: {
          installed: false,
          hasLatexmk: false,
          distribution: null,
          binaries: [],
          searchPath: '',
        },
      });
    }
  },

  compile: async ({ force = false, silent = false } = {}) => {
    const project = currentProject();
    if (project === null || project.mainDocument === null) {
      if (!silent) {
        notify.warning(
          'No main document is set',
          'Right-click a .tex file in the explorer and choose “Set as main document”.',
        );
      }
      return;
    }

    // The backend rejects overlapping jobs; skipping here avoids the round-trip
    // and keeps auto-compile from queueing behind a slow build.
    if (get().phase !== 'idle') return;

    // Auto-save before building so the compiler sees what is on screen.
    await useProjectStore.getState().saveAllTabs();

    const settings = currentSettings();
    const request = buildRequest(project.root, project.mainDocument, settings, { force });

    set({ phase: 'running', outputLines: [], startedAt: Date.now() });

    try {
      const result = await compileApi.compileProject(request);

      const historyEntry: CompileHistoryEntry = {
        id: result.id,
        status: result.status,
        mainDocument: project.mainDocument,
        compiler: settings.defaultCompiler,
        durationMs: result.durationMs,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        finishedAt: result.finishedAt,
      };

      set((state) => ({
        phase: 'idle',
        result,
        diagnostics: sortDiagnostics(result.diagnostics),
        startedAt: null,
        history: [historyEntry, ...state.history].slice(0, MAX_HISTORY),
        pdfPath: result.pdfPath ?? state.pdfPath,
        // Only refresh the preview when a new PDF was actually produced.
        pdfVersion: result.pdfPath !== null ? state.pdfVersion + 1 : state.pdfVersion,
      }));

      if (result.status === 'canceled') return;

      if (result.status === 'failed') {
        useUiStore.getState().showBottomTab('problems');
        if (!silent) notify.error('Compilation failed', summarize(result));
      } else if (result.errorCount > 0) {
        useUiStore.getState().showBottomTab('problems');
        if (!silent) notify.warning(summarize(result));
      } else if (!silent) {
        notify.success(summarize(result));
      }
    } catch (error) {
      const appError = toAppError(error, 'The document could not be compiled.');
      set({ phase: 'idle', startedAt: null });

      // A busy backend means the user double-triggered; that is not an error
      // worth a modal-level toast.
      if (appError.kind === 'compileBusy') return;

      useUiStore.getState().showBottomTab('output');
      notify.error(appError.message, appError.hint ?? undefined);
    }
  },

  cancel: async () => {
    if (get().phase !== 'running') return;
    set({ phase: 'canceling' });

    try {
      await compileApi.cancelCompile();
    } catch {
      // If the cancel request itself fails the build will finish on its own and
      // reset the phase.
    }
  },

  appendOutput: (line) => {
    set((state) => {
      const outputLines = [...state.outputLines, line];
      // Keep memory bounded on a runaway build.
      return {
        outputLines:
          outputLines.length > MAX_OUTPUT_LINES
            ? outputLines.slice(outputLines.length - MAX_OUTPUT_LINES)
            : outputLines,
      };
    });
  },

  clearOutput: () => set({ outputLines: [] }),

  cleanAuxiliaryFiles: async () => {
    try {
      const removed = await compileApi.cleanAuxiliaryFiles(currentSettings().useOutputDirectory);
      await useProjectStore.getState().refreshTree();

      notify.success(
        removed.length === 0
          ? 'No auxiliary files to clean'
          : `Removed ${removed.length} auxiliary file${removed.length === 1 ? '' : 's'}`,
      );
    } catch (error) {
      const appError = toAppError(error, 'Auxiliary files could not be removed.');
      notify.error(appError.message, appError.hint ?? undefined);
    }
  },

  adoptExistingPdf: (path) => {
    set((state) => ({ pdfPath: path, pdfVersion: state.pdfVersion + 1 }));
  },
}));

/**
 * Look for a PDF left over from a previous session so the preview is populated
 * before the first compile of a reopened project.
 */
export async function restoreExistingPdf(): Promise<void> {
  const project = currentProject();
  if (project === null || project.mainDocument === null) return;

  try {
    const outputDirectory = await compileApi.getOutputDirectory(
      currentSettings().useOutputDirectory,
    );
    const stem = project.mainDocument.replace(/\.[^./]+$/, '').split('/').pop();
    if (stem === undefined) return;

    const candidate = `${outputDirectory}/${stem}.pdf`;

    // Reading it is the cheapest way to confirm it exists and is a valid PDF.
    await fsApi.readPdfFile(candidate);
    useCompileStore.getState().adoptExistingPdf(candidate);
  } catch {
    // No previous output; the preview shows its empty state until first build.
  }
}
