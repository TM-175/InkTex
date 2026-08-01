/**
 * Keeps the code subsystem in step with the rest of the app:
 *
 * * re-parses the active document so the inspector and search see current
 *   listings,
 * * re-indexes only the source files the watcher reports as changed,
 * * rebuilds the index when the project changes.
 */

import { useEffect, useMemo } from 'react';
import { eventsApi } from '@/tauri';
import { useCodeStore } from '@/store/codeStore';
import { useProjectStore } from '@/store/projectStore';
import { languageForFile } from '@/services/listings/languages';
import { debounce } from '@/utils/debounce';

export function useCodeListings(): void {
  const project = useProjectStore((state) => state.project);
  const activePath = useProjectStore((state) => state.activePath);
  const tabs = useProjectStore((state) => state.tabs);

  const activeContent = useMemo(
    () => tabs.find((tab) => tab.path === activePath)?.content ?? null,
    [tabs, activePath],
  );

  // Parsing is cheap but link checking hits the filesystem, so it is debounced
  // rather than run on every keystroke.
  const sync = useMemo(
    () =>
      debounce((path: string, text: string) => {
        void useCodeStore.getState().syncListings(path, text);
      }, 400),
    [],
  );

  useEffect(() => {
    if (activePath === null || activeContent === null) return;
    // Only .tex files can contain listings.
    if (!/\.(tex|ltx|latex)$/i.test(activePath)) return;

    sync(activePath, activeContent);
    return () => sync.cancel();
  }, [activePath, activeContent, sync]);

  // A new project means a new index.
  useEffect(() => {
    const store = useCodeStore.getState();
    store.clear();
    if (project !== null) void store.indexAssets();
  }, [project?.root]);

  // Incremental re-index: only the files that actually changed.
  useEffect(() => {
    const pending = eventsApi.onFsChanged((event) => {
      const changed = event.changes
        .filter((change) => !change.isDirectory && languageForFile(change.path) !== undefined)
        .map((change) => change.path);

      if (changed.length > 0) void useCodeStore.getState().refreshAssets(changed);
    });

    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);
}
