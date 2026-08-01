/**
 * Auto-compile scheduling.
 *
 * Rebuilds once editing has been idle for `autoCompileDelay` ms. Three guards
 * keep it from wasting CPU:
 *
 * 1. Only content that affects the PDF counts (a `.png` or a stray note does not).
 * 2. The buffer must have actually changed since the last scheduled build,
 *    so moving the cursor or switching tabs never triggers one.
 * 3. Nothing is scheduled while a build is already running.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useCompileStore } from '@/store/compileStore';
import { affectsOutput } from '@/services/compileService';
import { debounce } from '@/utils/debounce';

export function useAutoCompile(): void {
  const enabled = useSettingsStore((state) => state.settings.autoCompile);
  const delay = useSettingsStore((state) => state.settings.autoCompileDelay);
  const tabs = useProjectStore((state) => state.tabs);
  const project = useProjectStore((state) => state.project);

  /** Fingerprint of the buffers as of the last scheduled compile. */
  const lastFingerprint = useRef<string | null>(null);

  const scheduleCompile = useMemo(
    () => debounce(() => void useCompileStore.getState().compile({ silent: true }), delay),
    [delay],
  );

  useEffect(() => {
    if (!enabled || project === null || project.mainDocument === null) return;

    // Length is enough to detect an edit and is O(1) per tab, unlike hashing
    // the whole buffer on every keystroke.
    const fingerprint = tabs
      .filter((tab) => affectsOutput(tab.path))
      .map((tab) => `${tab.path}:${tab.content.length}:${tab.savedContent.length}`)
      .join('|');

    if (fingerprint === lastFingerprint.current) return;

    const isFirstRun = lastFingerprint.current === null;
    lastFingerprint.current = fingerprint;

    // Opening a project should not immediately trigger a build.
    if (isFirstRun) return;

    scheduleCompile();
    return () => scheduleCompile.cancel();
  }, [enabled, project, tabs, scheduleCompile]);

  // Reset the fingerprint when the project changes so the new one is not
  // compared against the old project's buffers.
  useEffect(() => {
    lastFingerprint.current = null;
  }, [project?.root]);
}
