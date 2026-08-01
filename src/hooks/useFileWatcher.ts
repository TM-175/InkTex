/**
 * Applies backend filesystem events to the project store, and triggers an
 * auto-compile when a source file changes outside the editor.
 */

import { useEffect } from 'react';
import { eventsApi } from '@/tauri';
import { useProjectStore } from '@/store/projectStore';
import { useCompileStore } from '@/store/compileStore';
import { currentSettings } from '@/store/settingsStore';
import { affectsOutput } from '@/services/compileService';

export function useFileWatcher(): void {
  useEffect(() => {
    const pending = eventsApi.onFsChanged((event) => {
      void useProjectStore
        .getState()
        .applyFsChanges(event)
        .then(() => {
          const settings = currentSettings();
          if (!settings.autoCompile) return;

          // Only rebuild for genuinely external changes. Files open in the
          // editor are already covered by `useAutoCompile`, and InkTex's own
          // save-before-compile makes the watcher fire for them — reacting to
          // that would queue a second, redundant build after every compile.
          const openPaths = new Set(useProjectStore.getState().tabs.map((tab) => tab.path));

          const external = event.changes.some(
            (change) =>
              !change.isDirectory && affectsOutput(change.path) && !openPaths.has(change.path),
          );
          if (external) {
            void useCompileStore.getState().compile({ silent: true });
          }
        });
    });

    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);
}
