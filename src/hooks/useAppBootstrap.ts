/**
 * Application startup.
 *
 * Runs once at the root: configures Monaco, loads preferences, probes for TeX,
 * and restores the previous session. Ordering matters — settings must be loaded
 * before the project opens, because the recent-projects limit and
 * restore-on-launch preference both come from them.
 */

import { useEffect, useRef, useState } from 'react';
import { settingsApi } from '@/tauri';
import { setupMonaco } from '@/services/monacoSetup';
import { useSettingsStore } from '@/store/settingsStore';
import { useProjectStore } from '@/store/projectStore';
import { restoreExistingPdf, useCompileStore } from '@/store/compileStore';

export function useAppBootstrap(): { ready: boolean } {
  const [ready, setReady] = useState(false);
  // React 18+ mounts effects twice in development; bootstrap must not repeat.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const bootstrap = async (): Promise<void> => {
      setupMonaco();

      const settings = useSettingsStore.getState();
      await settings.load();

      // Awaited rather than fired off: a project cannot be opened without a TeX
      // installation, so the answer is needed before deciding whether to
      // restore the last session. It is fast when nothing is installed.
      await useCompileStore.getState().probeEnvironment();

      const project = useProjectStore.getState();
      await project.loadRecentProjects();

      const texInstalled = useCompileStore.getState().environment?.installed === true;
      if (settings.settings.restoreLastProject && texInstalled) {
        await restoreLastSession();
      }

      setReady(true);
    };

    void bootstrap();
  }, []);

  // Follow the OS colour scheme while the theme preference is `system`.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => useSettingsStore.getState().syncSystemTheme();

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return { ready };
}

/** Reopen the last project and its tabs. */
async function restoreLastSession(): Promise<void> {
  let session;
  try {
    session = await settingsApi.getSession();
  } catch {
    return;
  }

  if (session.lastProject === null) return;

  const project = useProjectStore.getState();
  const opened = await project.openProject(session.lastProject);
  if (!opened) return;

  // Reopen the tabs that were showing, skipping any that have since been
  // deleted. `openProject` already opened the main document.
  const tree = useProjectStore.getState().tree;
  for (const path of session.openFiles) {
    if (tree === null) break;
    const alreadyOpen = useProjectStore.getState().tabs.some((tab) => tab.path === path);
    if (alreadyOpen) continue;

    await project.openFile(path);
  }

  if (session.activeFile !== null) {
    const exists = useProjectStore.getState().tabs.some((tab) => tab.path === session.activeFile);
    if (exists) useProjectStore.getState().setActiveTab(session.activeFile);
  }

  // Show the PDF from the previous session before the first rebuild.
  await restoreExistingPdf();
}
