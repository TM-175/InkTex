/**
 * Auto-save scheduling.
 *
 * `afterDelay` saves every dirty buffer once editing has been idle for
 * `autoSaveDelay` ms. `onFocusChange` saves when the window loses focus or the
 * active tab changes. Both flush any pending save before the window closes.
 */

import { useEffect, useMemo } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isTabDirty } from '@/types/editor';
import { debounce } from '@/utils/debounce';

export function useAutoSave(): void {
  const mode = useSettingsStore((state) => state.settings.autoSave);
  const delay = useSettingsStore((state) => state.settings.autoSaveDelay);
  const tabs = useProjectStore((state) => state.tabs);
  const activePath = useProjectStore((state) => state.activePath);

  const saveAll = useMemo(
    () => debounce(() => void useProjectStore.getState().saveAllTabs(), delay),
    [delay],
  );

  // Re-arm whenever a buffer changes.
  useEffect(() => {
    if (mode !== 'afterDelay') return;
    if (!tabs.some(isTabDirty)) return;

    saveAll();
    return () => saveAll.cancel();
  }, [mode, tabs, saveAll]);

  // Switching tabs commits the previous buffer in `onFocusChange` mode.
  useEffect(() => {
    if (mode !== 'onFocusChange') return;
    return () => void useProjectStore.getState().saveAllTabs();
  }, [mode, activePath]);

  // Window blur, and the final flush before the process exits.
  useEffect(() => {
    if (mode === 'off') return;

    const flush = (): void => {
      saveAll.cancel();
      void useProjectStore.getState().saveAllTabs();
    };

    window.addEventListener('blur', flush);
    window.addEventListener('beforeunload', flush);

    return () => {
      window.removeEventListener('blur', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [mode, saveAll]);
}
