/**
 * The command registry.
 *
 * Every action reachable from the command palette, the menus and the keyboard
 * is defined here exactly once, so a shortcut and its palette entry can never
 * drift apart.
 */

import { useMemo } from 'react';
import type { Command } from '@/types/editor';
import { compileApi, fsApi, systemApi } from '@/tauri';
import { useProjectStore } from '@/store/projectStore';
import { useCompileStore } from '@/store/compileStore';
import { useSettingsStore } from '@/store/settingsStore';
import { notify, useUiStore } from '@/store/uiStore';
import { shortcutLabel } from '@/services/shortcuts';
import { toAppError } from '@/types/errors';
import { stem } from '@/utils/path';

/** Prompt for a folder and open it as a project. */
async function openProjectViaDialog(): Promise<void> {
  const selected = await systemApi.pickDirectory('Open LaTeX Project');
  if (selected !== null) {
    await useProjectStore.getState().openProject(selected);
  }
}

/** Copy the compiled PDF somewhere the user chooses. */
async function exportPdf(): Promise<void> {
  const { pdfPath } = useCompileStore.getState();
  const project = useProjectStore.getState().project;

  if (pdfPath === null) {
    notify.warning('There is no compiled PDF to export', 'Compile the document first.');
    return;
  }

  const suggested = `${stem(project?.mainDocument ?? 'document')}.pdf`;
  const destination = await systemApi.pickSaveLocation('Export PDF', suggested, ['pdf']);
  if (destination === null) return;

  try {
    await fsApi.exportPdf(pdfPath, destination);
    notify.success('PDF exported', destination);
  } catch (error) {
    const appError = toAppError(error, 'The PDF could not be exported.');
    notify.error(appError.message, appError.hint ?? undefined);
  }
}

/** Open the build directory in the platform file manager. */
async function revealOutputFolder(): Promise<void> {
  try {
    const directory = await compileApi.getOutputDirectory(
      useSettingsStore.getState().settings.useOutputDirectory,
    );
    await systemApi.revealInFileManager(directory);
  } catch (error) {
    const appError = toAppError(error, 'The output folder could not be opened.');
    notify.error(appError.message, appError.hint ?? undefined);
  }
}

async function openTerminal(): Promise<void> {
  try {
    await systemApi.openTerminal();
  } catch (error) {
    const appError = toAppError(error, 'A terminal could not be opened.');
    notify.error(appError.message, appError.hint ?? undefined);
  }
}

/** Cycle to the tab `offset` positions away, wrapping around. */
function cycleTab(offset: number): void {
  const { tabs, activePath, setActiveTab } = useProjectStore.getState();
  if (tabs.length === 0) return;

  const index = tabs.findIndex((tab) => tab.path === activePath);
  const next = (index + offset + tabs.length) % tabs.length;
  setActiveTab(tabs[next]!.path);
}

/**
 * Build the command list.
 *
 * Recomputed when project or compile state changes so `enabled` stays accurate.
 */
export function useCommands(): Command[] {
  const hasProject = useProjectStore((state) => state.project !== null);
  const hasTabs = useProjectStore((state) => state.tabs.length > 0);
  const phase = useCompileStore((state) => state.phase);
  const hasPdf = useCompileStore((state) => state.pdfPath !== null);

  return useMemo<Command[]>(() => {
    const ui = useUiStore.getState;
    const project = useProjectStore.getState;
    const compile = useCompileStore.getState;
    const settings = useSettingsStore.getState;

    const withShortcut = (id: string): { shortcut?: string } => {
      const label = shortcutLabel(id);
      return label === undefined ? {} : { shortcut: label };
    };

    const commands: Command[] = [
      // --- File -----------------------------------------------------------
      {
        id: 'project.open',
        title: 'Open Project…',
        category: 'File',
        keywords: 'folder directory',
        ...withShortcut('project.open'),
        run: openProjectViaDialog,
      },
      {
        id: 'project.new',
        title: 'New Project…',
        category: 'File',
        keywords: 'create template article report book beamer resume homework',
        ...withShortcut('project.new'),
        run: () => ui().openOverlay('newProject'),
      },
      {
        id: 'project.close',
        title: 'Close Project',
        category: 'File',
        enabled: hasProject,
        run: () => void project().closeProject(),
      },
      {
        id: 'file.new',
        title: 'New File',
        category: 'File',
        enabled: hasProject,
        ...withShortcut('file.new'),
        run: () => {
          // The explorer owns inline creation; ask it to start a new entry at
          // the project root.
          window.dispatchEvent(new CustomEvent('inktex:new-file', { detail: { parent: '' } }));
        },
      },
      {
        id: 'file.newFolder',
        title: 'New Folder',
        category: 'File',
        enabled: hasProject,
        run: () => {
          window.dispatchEvent(new CustomEvent('inktex:new-folder', { detail: { parent: '' } }));
        },
      },
      {
        id: 'file.save',
        title: 'Save',
        category: 'File',
        enabled: hasTabs,
        ...withShortcut('file.save'),
        run: () => void project().saveActiveTab(),
      },
      {
        id: 'file.saveAll',
        title: 'Save All',
        category: 'File',
        enabled: hasTabs,
        ...withShortcut('file.saveAll'),
        run: () => void project().saveAllTabs(),
      },
      {
        id: 'file.close',
        title: 'Close Tab',
        category: 'File',
        enabled: hasTabs,
        ...withShortcut('file.close'),
        run: () => {
          const active = project().activePath;
          if (active !== null) void project().closeTab(active);
        },
      },
      {
        id: 'file.closeAll',
        title: 'Close All Tabs',
        category: 'File',
        enabled: hasTabs,
        run: () => void project().closeAllTabs(),
      },

      // --- Compile --------------------------------------------------------
      {
        id: 'compile.run',
        title: 'Compile',
        category: 'Compile',
        keywords: 'build latex pdf run',
        enabled: hasProject && phase === 'idle',
        ...withShortcut('compile.run'),
        run: () => void compile().compile(),
      },
      {
        id: 'compile.force',
        title: 'Force Full Recompile',
        category: 'Compile',
        keywords: 'rebuild clean build from scratch',
        enabled: hasProject && phase === 'idle',
        ...withShortcut('compile.force'),
        run: () => void compile().compile({ force: true }),
      },
      {
        id: 'compile.cancel',
        title: 'Cancel Compilation',
        category: 'Compile',
        enabled: phase === 'running',
        run: () => void compile().cancel(),
      },
      {
        id: 'compile.clean',
        title: 'Clean Auxiliary Files',
        category: 'Compile',
        keywords: 'aux log tidy remove artifacts',
        enabled: hasProject,
        run: () => void compile().cleanAuxiliaryFiles(),
      },
      {
        id: 'compile.recheckTex',
        title: 'Re-check TeX Installation',
        category: 'Compile',
        keywords: 'detect latexmk pdflatex install',
        run: () => void compile().probeEnvironment(),
      },

      // --- PDF ------------------------------------------------------------
      {
        id: 'pdf.export',
        title: 'Export PDF…',
        category: 'PDF',
        keywords: 'save as copy',
        enabled: hasPdf,
        ...withShortcut('pdf.export'),
        run: exportPdf,
      },
      {
        id: 'pdf.reveal',
        title: 'Reveal Output Folder',
        category: 'PDF',
        keywords: 'finder explorer show build directory',
        enabled: hasProject,
        run: revealOutputFolder,
      },
      {
        id: 'pdf.openExternal',
        title: 'Open PDF in Default Viewer',
        category: 'PDF',
        enabled: hasPdf,
        run: () => {
          const path = compile().pdfPath;
          if (path !== null) void systemApi.openExternally(path);
        },
      },

      // --- View -----------------------------------------------------------
      {
        id: 'view.explorer',
        title: 'Toggle File Explorer',
        category: 'View',
        ...withShortcut('view.explorer'),
        run: () => ui().toggleExplorer(),
      },
      {
        id: 'view.preview',
        title: 'Toggle PDF Preview',
        category: 'View',
        ...withShortcut('view.preview'),
        run: () => ui().togglePreview(),
      },
      {
        id: 'view.panel',
        title: 'Toggle Bottom Panel',
        category: 'View',
        ...withShortcut('view.panel'),
        run: () => ui().toggleBottomPanel(),
      },
      {
        id: 'view.problems',
        title: 'Show Problems',
        category: 'View',
        ...withShortcut('view.problems'),
        run: () => ui().showBottomTab('problems'),
      },
      {
        id: 'view.output',
        title: 'Show Compiler Output',
        category: 'View',
        run: () => ui().showBottomTab('output'),
      },
      {
        id: 'view.log',
        title: 'Show Compile History',
        category: 'View',
        run: () => ui().showBottomTab('log'),
      },
      {
        id: 'view.minimap',
        title: 'Toggle Minimap',
        category: 'View',
        run: () => settings().update({ minimap: !settings().settings.minimap }),
      },
      {
        id: 'view.wordWrap',
        title: 'Toggle Word Wrap',
        category: 'View',
        run: () => settings().update({ wordWrap: !settings().settings.wordWrap }),
      },
      {
        id: 'view.theme',
        title: 'Toggle Dark / Light Theme',
        category: 'View',
        keywords: 'appearance colour color',
        run: () => {
          const current = settings().settings.theme;
          settings().update({ theme: current === 'dark' ? 'light' : 'dark' });
        },
      },

      // --- Tools ----------------------------------------------------------
      {
        id: 'settings.open',
        title: 'Settings',
        category: 'Tools',
        keywords: 'preferences options configure',
        ...withShortcut('settings.open'),
        run: () => ui().openOverlay('settings'),
      },
      {
        id: 'snippets.open',
        title: 'Insert Snippet…',
        category: 'Tools',
        keywords: 'equation figure table theorem itemize matrix tikz',
        enabled: hasTabs,
        ...withShortcut('snippets.open'),
        run: () => ui().openOverlay('snippets'),
      },
      {
        id: 'terminal.open',
        title: 'Open Terminal in Project Folder',
        category: 'Tools',
        keywords: 'shell console command line',
        enabled: hasProject,
        run: openTerminal,
      },
      {
        id: 'project.reveal',
        title: 'Reveal Project in File Manager',
        category: 'Tools',
        enabled: hasProject,
        run: () => {
          const root = project().project?.root;
          if (root !== undefined) void systemApi.revealInFileManager(root);
        },
      },
      {
        id: 'help.shortcuts',
        title: 'Keyboard Shortcuts',
        category: 'Help',
        keywords: 'keybindings hotkeys reference',
        ...withShortcut('help.shortcuts'),
        run: () => ui().openOverlay('shortcuts'),
      },

      // --- Navigation -----------------------------------------------------
      {
        id: 'palette.files',
        title: 'Quick Open File…',
        category: 'Navigation',
        ...withShortcut('palette.files'),
        enabled: hasProject,
        run: () => ui().openOverlay('quickOpen'),
      },
      {
        id: 'tab.next',
        title: 'Next Tab',
        category: 'Navigation',
        enabled: hasTabs,
        ...withShortcut('tab.next'),
        run: () => cycleTab(1),
      },
      {
        id: 'tab.previous',
        title: 'Previous Tab',
        category: 'Navigation',
        enabled: hasTabs,
        ...withShortcut('tab.previous'),
        run: () => cycleTab(-1),
      },
    ];

    return commands;
  }, [hasProject, hasTabs, phase, hasPdf]);
}
