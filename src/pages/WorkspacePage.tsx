import { useAutoCompile, useAutoSave, useFileWatcher } from '@/hooks';
import { TitleBar } from '@/components/layout/TitleBar';
import { StatusBar } from '@/components/layout/StatusBar';
import { Workspace } from '@/components/layout/Workspace';

/**
 * The editing screen.
 *
 * Auto-save, auto-compile and the file watcher are mounted here rather than at
 * the app root so they exist only while a project is open.
 */
export function WorkspacePage() {
  useAutoSave();
  useAutoCompile();
  useFileWatcher();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar />
      <Workspace />
      <StatusBar />
    </div>
  );
}
