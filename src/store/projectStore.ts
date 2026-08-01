/**
 * Project and editor-buffer state.
 *
 * Owns the open project, its file tree, the explorer's expansion state, and the
 * tab strip. All filesystem effects go through `@/tauri`; this store holds the
 * results and keeps the in-memory buffers consistent with what is on disk.
 */

import { create } from 'zustand';
import { fsApi, projectApi, settingsApi } from '@/tauri';
import type { EditorTab, EditorViewState, SourceLocation } from '@/types/editor';
import { isTabDirty } from '@/types/editor';
import type {
  FileNode,
  FsChangeEvent,
  NewProjectFile,
  ProjectInfo,
  RecentProject,
} from '@/types/project';
import { toAppError } from '@/types/errors';
import { expandToReveal, findNode } from '@/services/fileTreeService';
import { classifyTab } from '@/services/tabService';
import { currentSettings } from './settingsStore';
import { confirm, notify } from './uiStore';
import { useCompileStore } from './compileStore';
import { debounce } from '@/utils/debounce';
import { basename, dirname } from '@/utils/path';

type ProjectStatus = 'empty' | 'opening' | 'ready';

interface ProjectState {
  project: ProjectInfo | null;
  tree: FileNode | null;
  status: ProjectStatus;
  expandedDirs: Set<string>;
  tabs: EditorTab[];
  activePath: string | null;
  recentProjects: RecentProject[];
  /** Set when the editor should scroll to a location, then cleared. */
  pendingLocation: SourceLocation | null;

  // --- Project lifecycle --------------------------------------------------
  loadRecentProjects: () => Promise<void>;
  openProject: (path: string) => Promise<boolean>;
  createProject: (parent: string, name: string, files: NewProjectFile[]) => Promise<boolean>;
  closeProject: () => Promise<void>;
  refreshTree: () => Promise<void>;
  setMainDocument: (path: string) => Promise<void>;
  forgetRecentProject: (path: string) => Promise<void>;
  clearRecentProjects: () => Promise<void>;

  // --- Tabs ---------------------------------------------------------------
  openFile: (path: string, location?: SourceLocation) => Promise<void>;
  closeTab: (path: string) => Promise<void>;
  closeOtherTabs: (path: string) => Promise<void>;
  closeAllTabs: () => Promise<void>;
  setActiveTab: (path: string) => void;
  updateTabContent: (path: string, content: string) => void;
  saveTab: (path: string) => Promise<void>;
  saveActiveTab: () => Promise<void>;
  saveAllTabs: () => Promise<void>;
  reloadTabFromDisk: (path: string) => Promise<void>;
  storeViewState: (path: string, viewState: EditorViewState) => void;
  consumePendingLocation: () => void;

  // --- Explorer -----------------------------------------------------------
  toggleDirectory: (path: string) => void;
  setExpandedDirs: (paths: Iterable<string>) => void;
  revealPath: (path: string) => void;

  // --- Filesystem edits ---------------------------------------------------
  createEntry: (parent: string, name: string, directory: boolean) => Promise<string | null>;
  renameEntry: (path: string, newName: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;
  moveEntry: (path: string, destinationParent: string) => Promise<void>;
  importFiles: (sources: string[], destinationParent: string) => Promise<string[]>;

  // --- Watcher ------------------------------------------------------------
  applyFsChanges: (event: FsChangeEvent) => Promise<void>;
}

/** Persist the session shortly after it settles, not on every keystroke. */
const persistSession = debounce((project: ProjectInfo | null, tabs: EditorTab[], active: string | null) => {
  void settingsApi
    .saveSession({
      lastProject: project?.root ?? null,
      openFiles: tabs.map((tab) => tab.path),
      activeFile: active,
    })
    .catch(() => {
      // Session restore is a convenience; failing to record it is not worth
      // interrupting the user.
    });
}, 500);

export const useProjectStore = create<ProjectState>((set, get) => {
  /** Persist the session from the current state. */
  const saveSession = (): void => {
    const { project, tabs, activePath } = get();
    persistSession(project, tabs, activePath);
  };

  /** Replace one tab, leaving the rest untouched. */
  const patchTab = (path: string, patch: Partial<EditorTab>): void => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.path === path ? { ...tab, ...patch } : tab)),
    }));
  };

  /**
   * Ask what to do about a dirty buffer before it is closed or discarded.
   * Returns false when the user cancels.
   */
  const resolveDirtyTab = async (tab: EditorTab): Promise<boolean> => {
    const choice = await confirm({
      title: `Save changes to ${tab.name}?`,
      message: 'Your changes will be lost if you do not save them.',
      actions: [
        { id: 'save', label: 'Save', variant: 'primary' },
        { id: 'discard', label: "Don't Save", variant: 'danger' },
        { id: 'cancel', label: 'Cancel', variant: 'ghost' },
      ],
    });

    if (choice === 'save') {
      await get().saveTab(tab.path);
      return true;
    }
    return choice === 'discard';
  };

  return {
    project: null,
    tree: null,
    status: 'empty',
    expandedDirs: new Set<string>(),
    tabs: [],
    activePath: null,
    recentProjects: [],
    pendingLocation: null,

    // --- Project lifecycle ------------------------------------------------
    loadRecentProjects: async () => {
      try {
        set({ recentProjects: await projectApi.getRecentProjects() });
      } catch {
        set({ recentProjects: [] });
      }
    },

    openProject: async (path) => {
      // Single choke point for every way a project can be opened — the welcome
      // cards, recents, drag-and-drop and session restore all land here — so
      // the TeX requirement is enforced in exactly one place.
      const environment = useCompileStore.getState().environment;
      if (environment !== null && !environment.installed) {
        notify.error(
          'LaTeX is not installed',
          'InkTex needs a TeX distribution to compile. Follow the setup instructions on the start screen.',
        );
        return false;
      }

      set({ status: 'opening' });

      try {
        const project = await projectApi.openProject(path, currentSettings().recentProjectsLimit);

        // Expand the root's immediate subdirectories so the project does not
        // open as a wall of collapsed folders.
        const expanded = new Set<string>(
          (project.tree.children ?? [])
            .filter((child) => child.isDirectory)
            .map((child) => child.path),
        );

        set({
          project,
          tree: project.tree,
          status: 'ready',
          expandedDirs: expanded,
          tabs: [],
          activePath: null,
        });

        await get().loadRecentProjects();

        // Open the file the user picked, or the main document, so the editor is
        // never empty on arrival.
        const initial = project.openedFile ?? project.mainDocument;
        if (initial !== null) {
          await get().openFile(initial);
        }
        saveSession();
        return true;
      } catch (error) {
        const appError = toAppError(error, 'The project could not be opened.');
        notify.error(appError.message, appError.hint ?? undefined);
        set({ status: get().project === null ? 'empty' : 'ready' });
        return false;
      }
    },

    createProject: async (parent, name, files) => {
      try {
        const project = await projectApi.createProject(
          parent,
          name,
          files,
          currentSettings().recentProjectsLimit,
        );

        set({
          project,
          tree: project.tree,
          status: 'ready',
          expandedDirs: new Set(
            (project.tree.children ?? [])
              .filter((child) => child.isDirectory)
              .map((child) => child.path),
          ),
          tabs: [],
          activePath: null,
        });

        await get().loadRecentProjects();
        if (project.mainDocument !== null) {
          await get().openFile(project.mainDocument);
        }
        saveSession();
        notify.success(`Created “${name}”`);
        return true;
      } catch (error) {
        const appError = toAppError(error, 'The project could not be created.');
        notify.error(appError.message, appError.hint ?? undefined);
        return false;
      }
    },

    closeProject: async () => {
      // Give the user a chance to save anything outstanding.
      for (const tab of get().tabs) {
        if (isTabDirty(tab) && !(await resolveDirtyTab(tab))) return;
      }

      try {
        await projectApi.closeProject();
      } catch {
        // Closing is best-effort; the UI resets regardless.
      }

      set({
        project: null,
        tree: null,
        status: 'empty',
        tabs: [],
        activePath: null,
        expandedDirs: new Set(),
      });
      saveSession();
    },

    refreshTree: async () => {
      if (get().project === null) return;
      try {
        set({ tree: await projectApi.refreshTree() });
      } catch {
        // The watcher fires during deletes and moves; a transient failure here
        // resolves on the next event.
      }
    },

    setMainDocument: async (path) => {
      const project = get().project;
      if (project === null) return;

      try {
        await projectApi.setMainDocument(path);
        set({ project: { ...project, mainDocument: path } });
        notify.success(`Main document set to ${basename(path)}`);
      } catch (error) {
        const appError = toAppError(error);
        notify.error(appError.message, appError.hint ?? undefined);
      }
    },

    forgetRecentProject: async (path) => {
      try {
        set({ recentProjects: await projectApi.removeRecentProject(path) });
      } catch {
        /* Non-critical. */
      }
    },

    clearRecentProjects: async () => {
      try {
        await projectApi.clearRecentProjects();
        set({ recentProjects: [] });
      } catch {
        /* Non-critical. */
      }
    },

    // --- Tabs -------------------------------------------------------------
    openFile: async (path, location) => {
      const existing = get().tabs.find((tab) => tab.path === path);

      if (existing !== undefined) {
        set({ activePath: path, pendingLocation: location ?? null });
        get().revealPath(path);
        saveSession();
        return;
      }

      const kind = classifyTab(path, get().tree);

      // Binary content is not loaded into a buffer; the pane renders it from
      // disk on demand.
      if (kind === 'image' || kind === 'pdf' || kind === 'binary') {
        const tab: EditorTab = {
          path,
          name: basename(path),
          kind,
          savedContent: '',
          content: '',
          diskModified: 0,
          lossy: false,
          conflicted: false,
          viewState: null,
        };
        set((state) => ({ tabs: [...state.tabs, tab], activePath: path }));
        get().revealPath(path);
        saveSession();
        return;
      }

      try {
        const file = await fsApi.readTextFile(path);
        const tab: EditorTab = {
          path,
          name: basename(path),
          kind,
          savedContent: file.content,
          content: file.content,
          diskModified: file.modified,
          lossy: file.lossy,
          conflicted: false,
          viewState: null,
        };

        set((state) => ({
          tabs: [...state.tabs, tab],
          activePath: path,
          pendingLocation: location ?? null,
        }));
        get().revealPath(path);

        if (file.lossy) {
          notify.warning(
            `${tab.name} contains characters that are not valid UTF-8`,
            'Saving will rewrite the file as UTF-8.',
          );
        }
        saveSession();
      } catch (error) {
        const appError = toAppError(error, `“${path}” could not be opened.`);
        notify.error(appError.message, appError.hint ?? undefined);
      }
    },

    closeTab: async (path) => {
      const tab = get().tabs.find((candidate) => candidate.path === path);
      if (tab === undefined) return;

      if (isTabDirty(tab) && !(await resolveDirtyTab(tab))) return;

      set((state) => {
        const index = state.tabs.findIndex((candidate) => candidate.path === path);
        const tabs = state.tabs.filter((candidate) => candidate.path !== path);

        // Activate the neighbour the user is most likely to want next.
        let activePath = state.activePath;
        if (activePath === path) {
          const neighbour = tabs[Math.min(index, tabs.length - 1)];
          activePath = neighbour?.path ?? null;
        }
        return { tabs, activePath };
      });
      saveSession();
    },

    closeOtherTabs: async (path) => {
      for (const tab of get().tabs) {
        if (tab.path !== path && isTabDirty(tab) && !(await resolveDirtyTab(tab))) return;
      }
      set((state) => ({
        tabs: state.tabs.filter((tab) => tab.path === path),
        activePath: path,
      }));
      saveSession();
    },

    closeAllTabs: async () => {
      for (const tab of get().tabs) {
        if (isTabDirty(tab) && !(await resolveDirtyTab(tab))) return;
      }
      set({ tabs: [], activePath: null });
      saveSession();
    },

    setActiveTab: (path) => {
      set({ activePath: path });
      saveSession();
    },

    updateTabContent: (path, content) => {
      patchTab(path, { content });
    },

    saveTab: async (path) => {
      const tab = get().tabs.find((candidate) => candidate.path === path);
      if (tab === undefined || !isTabDirty(tab)) return;

      try {
        const modified = await fsApi.writeTextFile(path, tab.content);
        patchTab(path, {
          savedContent: tab.content,
          diskModified: modified,
          conflicted: false,
        });
      } catch (error) {
        const appError = toAppError(error, `“${path}” could not be saved.`);
        notify.error(appError.message, appError.hint ?? undefined);
      }
    },

    saveActiveTab: async () => {
      const { activePath } = get();
      if (activePath !== null) await get().saveTab(activePath);
    },

    saveAllTabs: async () => {
      for (const tab of get().tabs) {
        if (isTabDirty(tab)) await get().saveTab(tab.path);
      }
    },

    reloadTabFromDisk: async (path) => {
      try {
        const file = await fsApi.readTextFile(path);
        patchTab(path, {
          content: file.content,
          savedContent: file.content,
          diskModified: file.modified,
          conflicted: false,
        });
      } catch (error) {
        const appError = toAppError(error);
        notify.error(appError.message, appError.hint ?? undefined);
      }
    },

    storeViewState: (path, viewState) => {
      patchTab(path, { viewState });
    },

    consumePendingLocation: () => set({ pendingLocation: null }),

    // --- Explorer ---------------------------------------------------------
    toggleDirectory: (path) => {
      set((state) => {
        const expandedDirs = new Set(state.expandedDirs);
        if (expandedDirs.has(path)) {
          expandedDirs.delete(path);
        } else {
          expandedDirs.add(path);
        }
        return { expandedDirs };
      });
    },

    setExpandedDirs: (paths) => set({ expandedDirs: new Set(paths) }),

    revealPath: (path) => {
      set((state) => ({ expandedDirs: expandToReveal(state.expandedDirs, path) }));
    },

    // --- Filesystem edits -------------------------------------------------
    createEntry: async (parent, name, directory) => {
      try {
        const node = directory
          ? await fsApi.createDirectory(parent, name)
          : await fsApi.createFile(parent, name);

        await get().refreshTree();
        get().revealPath(node.path);

        if (!directory) await get().openFile(node.path);
        return node.path;
      } catch (error) {
        const appError = toAppError(error, 'The item could not be created.');
        notify.error(appError.message, appError.hint ?? undefined);
        return null;
      }
    },

    renameEntry: async (path, newName) => {
      try {
        const newPath = await fsApi.renameEntry(path, newName);

        // Re-key any open tab that lived under the renamed entry.
        set((state) => ({
          tabs: state.tabs.map((tab) => {
            if (tab.path === path) {
              return { ...tab, path: newPath, name: basename(newPath) };
            }
            if (tab.path.startsWith(`${path}/`)) {
              const moved = `${newPath}${tab.path.slice(path.length)}`;
              return { ...tab, path: moved, name: basename(moved) };
            }
            return tab;
          }),
          activePath:
            state.activePath === path
              ? newPath
              : state.activePath?.startsWith(`${path}/`)
                ? `${newPath}${state.activePath.slice(path.length)}`
                : state.activePath,
        }));

        // The main document may have been what was renamed.
        const project = get().project;
        if (project?.mainDocument === path) {
          set({ project: { ...project, mainDocument: newPath } });
          await projectApi.setMainDocument(newPath).catch(() => {});
        }

        await get().refreshTree();
        saveSession();
      } catch (error) {
        const appError = toAppError(error, 'The item could not be renamed.');
        notify.error(appError.message, appError.hint ?? undefined);
      }
    },

    deleteEntry: async (path) => {
      const node = get().tree !== null ? findNode(get().tree!, path) : null;
      const label = node?.isDirectory === true ? 'folder' : 'file';

      const choice = await confirm({
        title: `Delete ${basename(path)}?`,
        message:
          node?.isDirectory === true
            ? 'The folder and everything inside it will be permanently deleted.'
            : `This ${label} will be permanently deleted.`,
        actions: [
          { id: 'delete', label: 'Delete', variant: 'danger' },
          { id: 'cancel', label: 'Cancel', variant: 'ghost' },
        ],
      });
      if (choice !== 'delete') return;

      try {
        await fsApi.deleteEntry(path);

        // Drop tabs for anything that no longer exists, discarding edits — the
        // user just asked for the file to be deleted.
        set((state) => {
          const tabs = state.tabs.filter(
            (tab) => tab.path !== path && !tab.path.startsWith(`${path}/`),
          );
          const activeStillOpen = tabs.some((tab) => tab.path === state.activePath);
          return {
            tabs,
            activePath: activeStillOpen ? state.activePath : (tabs[0]?.path ?? null),
          };
        });

        await get().refreshTree();
        saveSession();
      } catch (error) {
        const appError = toAppError(error, 'The item could not be deleted.');
        notify.error(appError.message, appError.hint ?? undefined);
      }
    },

    moveEntry: async (path, destinationParent) => {
      // Dropping an item into the folder it already lives in is a no-op.
      if (dirname(path) === destinationParent) return;

      try {
        const newPath = await fsApi.moveEntry(path, destinationParent);

        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.path === path ? { ...tab, path: newPath, name: basename(newPath) } : tab,
          ),
          activePath: state.activePath === path ? newPath : state.activePath,
        }));

        await get().refreshTree();
        saveSession();
      } catch (error) {
        const appError = toAppError(error, 'The item could not be moved.');
        notify.error(appError.message, appError.hint ?? undefined);
      }
    },

    importFiles: async (sources, destinationParent) => {
      const imported: string[] = [];

      for (const source of sources) {
        try {
          const node = await fsApi.importFile(source, destinationParent);
          imported.push(node.path);
        } catch (error) {
          const appError = toAppError(error, `“${source}” could not be imported.`);
          notify.error(appError.message, appError.hint ?? undefined);
        }
      }

      if (imported.length > 0) {
        await get().refreshTree();
        get().revealPath(imported[0]!);
      }
      return imported;
    },

    // --- Watcher ----------------------------------------------------------
    applyFsChanges: async (event) => {
      const project = get().project;
      if (project === null || event.root !== project.root) return;

      await get().refreshTree();
      if (!event.affectsSources) return;

      for (const change of event.changes) {
        const tab = get().tabs.find((candidate) => candidate.path === change.path);
        if (tab === undefined || tab.kind === 'image' || tab.kind === 'pdf') continue;

        if (change.kind === 'removed') {
          patchTab(change.path, { conflicted: true });
          continue;
        }

        try {
          const file = await fsApi.readTextFile(change.path);

          // Our own save produced this event; nothing to reconcile.
          if (file.content === tab.content) {
            patchTab(change.path, {
              savedContent: file.content,
              diskModified: file.modified,
              conflicted: false,
            });
            continue;
          }

          if (isTabDirty(tab)) {
            // Unsaved edits plus a different file on disk: let the user choose.
            patchTab(change.path, { conflicted: true });
          } else {
            // Clean buffer — adopt the external edit silently.
            patchTab(change.path, {
              content: file.content,
              savedContent: file.content,
              diskModified: file.modified,
              conflicted: false,
            });
          }
        } catch {
          // The file vanished between the event and the read; the tree refresh
          // above already reflects that.
        }
      }
    },
  };
});

/** Read project state outside React. */
export function currentProject(): ProjectInfo | null {
  return useProjectStore.getState().project;
}

/** The active tab, or null. */
export function activeTab(): EditorTab | null {
  const { tabs, activePath } = useProjectStore.getState();
  return tabs.find((tab) => tab.path === activePath) ?? null;
}
