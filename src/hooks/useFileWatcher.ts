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

          // Only rebuild when something the PDF depends on actually changed.
          // An edit made inside InkTex is already handled by useAutoCompile;
          // this covers changes made by other tools.
          const relevant = event.changes.some(
            (change) => !change.isDirectory && affectsOutput(change.path),
          );
          if (relevant) {
            void useCompileStore.getState().compile({ silent: true });
          }
        });
    });

    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);
}
