/**
 * Bridges backend compile events into the compile store.
 *
 * Mounted once, at the app root.
 */

import { useEffect } from 'react';
import { eventsApi } from '@/tauri';
import { useCompileStore } from '@/store/compileStore';
import { notify } from '@/store/uiStore';

export function useCompileEvents(): void {
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    unlisteners.push(
      eventsApi.onCompileStarted(() => {
        useCompileStore.getState().clearOutput();
      }),
    );

    unlisteners.push(
      eventsApi.onCompileOutput(({ lines }) => {
        useCompileStore.getState().appendOutput(lines);
      }),
    );

    unlisteners.push(
      eventsApi.onWatchError((message) => {
        notify.warning(
          'File changes will not be detected automatically',
          message,
        );
      }),
    );

    return () => {
      // Each subscription resolves to its own unlisten function.
      for (const pending of unlisteners) {
        void pending.then((unlisten) => unlisten());
      }
    };
  }, []);
}
