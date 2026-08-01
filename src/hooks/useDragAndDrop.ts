/**
 * Window-level drag-and-drop.
 *
 * Dropping a folder opens it as a project. Dropping files imports them into the
 * project, and an image dropped while a `.tex` file is open also gets an
 * `\includegraphics` inserted at the cursor.
 */

import { useEffect } from 'react';
import { eventsApi, fsApi } from '@/tauri';
import { useProjectStore } from '@/store/projectStore';
import { confirm, notify } from '@/store/uiStore';
import { insertText } from '@/services/editorBridge';
import { basename, graphicsReference, isImageFile } from '@/utils/path';

/** Preferred destination for imported assets. */
function assetDestination(): string {
  const tree = useProjectStore.getState().tree;
  const conventional = ['figures', 'images', 'img', 'assets'];

  const match = (tree?.children ?? []).find(
    (child) => child.isDirectory && conventional.includes(child.name.toLowerCase()),
  );
  return match?.path ?? '';
}

export function useDragAndDrop(): void {
  useEffect(() => {
    const pending = eventsApi.onFileDrop((paths) => {
      void handleDrop(paths);
    });

    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);
}

async function handleDrop(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  const inspected = await fsApi.inspectPaths(paths).catch(() => []);
  const existing = inspected.filter((entry) => entry.exists);
  if (existing.length === 0) return;

  const directories = existing.filter((entry) => entry.isDirectory);
  const files = existing.filter((entry) => !entry.isDirectory);

  const store = useProjectStore.getState();

  // A dropped folder is a request to open a project.
  if (directories.length > 0) {
    const target = directories[0]!;

    if (store.project !== null && store.project.root !== target.path) {
      const choice = await confirm({
        title: `Open “${basename(target.path)}”?`,
        message: 'This will close the current project. Unsaved changes will be kept open.',
        actions: [
          { id: 'open', label: 'Open Project', variant: 'primary' },
          { id: 'cancel', label: 'Cancel', variant: 'ghost' },
        ],
      });
      if (choice !== 'open') return;
    }

    await store.openProject(target.path);
    return;
  }

  if (store.project === null) {
    notify.warning('Open a project first', 'Drop a folder here to open it as a project.');
    return;
  }

  // Otherwise import the dropped files as project assets.
  const destination = assetDestination();
  const imported = await store.importFiles(
    files.map((entry) => entry.path),
    destination,
  );
  if (imported.length === 0) return;

  notify.success(
    imported.length === 1
      ? `Imported ${basename(imported[0]!)}`
      : `Imported ${imported.length} files`,
    destination === '' ? undefined : `into ${destination}/`,
  );

  // Insert a graphics include for a single dropped image, so the common case
  // needs no further typing.
  const activePath = useProjectStore.getState().activePath;
  if (imported.length === 1 && isImageFile(imported[0]!) && activePath?.endsWith('.tex') === true) {
    const reference = graphicsReference(imported[0]!, activePath);
    insertText(`\\includegraphics[width=0.8\\textwidth]{${reference}}`);
  }
}
