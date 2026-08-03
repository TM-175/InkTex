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
import {
  buildRequest,
  resolveCompileTarget,
  sortDiagnostics,
  summarize,
} from '@/services/compileService';
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
  appendOutput: (lines: string[]) => void;
  clearOutput: () => void;
  cleanAuxiliaryFiles: () => Promise<void>;
  /** Load a PDF that already exists on disk, without compiling. */
  adoptExistingPdf: (path: string) => void;
  /** Forget the previous project's PDF, diagnostics and output. */
  resetOutput: () => void;
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
    const { tabs, activePath } = useProjectStore.getState();

    // Build whatever the user is looking at, not a pinned "main" document.
    const target = resolveCompileTarget(project, tabs, activePath);

    if (project === null || target === null) {
      if (!silent) {
        notify.warning('Nothing to compile', 'Open a .tex file first.');
      }
      return;
    }

    // The backend rejects overlapping jobs; skipping here avoids the round-trip
    // and keeps auto-compile from queueing behind a slow build.
    if (get().phase !== 'idle') return;

    // Auto-save before building so the compiler sees what is on screen.
    await useProjectStore.getState().saveAllTabs();

    const settings = currentSettings();
    const request = buildRequest(project.root, target, settings, { force });

    set({ phase: 'running', outputLines: [], startedAt: Date.now() });

    try {
      const result = await compileApi.compileProject(request);

      const historyEntry: CompileHistoryEntry = {
        id: result.id,
        status: result.status,
        mainDocument: target,
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

  appendOutput: (lines) => {
    if (lines.length === 0) return;

    set((state) => {
      const outputLines = [...state.outputLines, ...lines];
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
    set((state) =>
      // Re-adopting the PDF already on screen must not bump the version: that
      // would tear down a perfectly good document and re-render every page.
      state.pdfPath === path ? state : { pdfPath: path, pdfVersion: state.pdfVersion + 1 },
    );
  },

  resetOutput: () => {
    set({
      pdfPath: null,
      result: null,
      diagnostics: [],
      outputLines: [],
      // Still bumped, so a viewer holding the outgoing document reloads rather
      // than showing the previous project's pages.
      pdfVersion: get().pdfVersion + 1,
    });
  },
}));

/**
 * Show the PDF already sitting in the build directory, if there is one.
 *
 * Called whenever a project is opened. Without this the preview claims there is
 * nothing to show even when the document was built minutes ago — the output is
 * right there on disk, and re-compiling to see it again is wasted work.
 */
export async function adoptExistingOutput(): Promise<void> {
  const project = currentProject();
  if (project === null) return;

  // Match what Compile would build, so the preview and the compile button agree
  // about which document is in view.
  const { tabs, activePath } = useProjectStore.getState();
  const target = resolveCompileTarget(project, tabs, activePath);
  if (target === null) return;

  try {
    const outputDirectory = await compileApi.getOutputDirectory(
      currentSettings().useOutputDirectory,
    );
    const stem = target.replace(/\.[^./]+$/, '').split('/').pop();
    if (stem === undefined) return;

    const candidate = `${outputDirectory}/${stem}.pdf`;

    // Reading it is the cheapest way to confirm it exists and is a valid PDF.
    await fsApi.readPdfFile(candidate);

    // The project may have been closed again while this was in flight.
    if (currentProject()?.root !== project.root) return;
    useCompileStore.getState().adoptExistingPdf(candidate);
  } catch {
    // No previous output; the preview shows its empty state until first build.
  }
}
