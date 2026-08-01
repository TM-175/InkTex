/**
 * Context-menu construction for explorer rows.
 *
 * Kept out of the component so the item list — which varies by file kind — can
 * be read in one place.
 */

import { createElement } from 'react';
import {
  ExternalLink,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react';
import type { MenuItem } from '@/components/ui/ContextMenu';
import type { FileNode } from '@/types/project';
import { systemApi } from '@/tauri';
import { useProjectStore } from '@/store/projectStore';
import { notify } from '@/store/uiStore';
import { toAppError } from '@/types/errors';

interface RowMenuHandlers {
  onRename: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
}

const icon = (component: typeof Pencil) =>
  createElement(component, { className: 'size-3.5' });

/** Absolute path of a project-relative entry. */
function absolutePath(relative: string): string | null {
  const root = useProjectStore.getState().project?.root;
  return root === undefined ? null : `${root}/${relative}`;
}

async function reveal(relative: string): Promise<void> {
  const absolute = absolutePath(relative);
  if (absolute === null) return;

  try {
    await systemApi.revealInFileManager(absolute);
  } catch (error) {
    const appError = toAppError(error);
    notify.error(appError.message, appError.hint ?? undefined);
  }
}

export function buildRowMenu(node: FileNode, handlers: RowMenuHandlers): MenuItem[] {
  const store = useProjectStore.getState();
  const items: MenuItem[] = [];

  if (node.isDirectory) {
    items.push(
      {
        id: 'new-file',
        label: 'New File',
        icon: icon(FilePlus2),
        onSelect: handlers.onNewFile,
      },
      {
        id: 'new-folder',
        label: 'New Folder',
        icon: icon(FolderPlus),
        onSelect: handlers.onNewFolder,
      },
    );
  } else {
    items.push({
      id: 'open',
      label: 'Open',
      icon: icon(FolderOpen),
      onSelect: () => void store.openFile(node.path),
    });

    // Only a LaTeX source can be the compile target.
    if (node.kind === 'tex') {
      items.push({
        id: 'set-main',
        label: 'Set as Main Document',
        icon: icon(Star),
        onSelect: () => void store.setMainDocument(node.path),
      });
    }
  }

  items.push({
    id: 'rename',
    label: 'Rename…',
    icon: icon(Pencil),
    separated: true,
    onSelect: handlers.onRename,
  });

  items.push({
    id: 'reveal',
    label: 'Reveal in File Manager',
    icon: icon(ExternalLink),
    onSelect: () => void reveal(node.path),
  });

  if (!node.isDirectory) {
    items.push({
      id: 'open-external',
      label: 'Open in Default App',
      icon: icon(ExternalLink),
      onSelect: () => {
        const absolute = absolutePath(node.path);
        if (absolute !== null) void systemApi.openExternally(absolute);
      },
    });
  }

  items.push({
    id: 'delete',
    label: 'Delete',
    icon: icon(Trash2),
    separated: true,
    danger: true,
    onSelect: () => void store.deleteEntry(node.path),
  });

  return items;
}
