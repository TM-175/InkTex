import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronsDownUp,
  FilePlus2,
  FolderPlus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import {
  allDirectoryPaths,
  filterTree,
  flattenTree,
  type FlatNode,
} from '@/services/fileTreeService';
import { IconButton } from '@/components/ui/Button';
import { ContextMenu, type MenuItem } from '@/components/ui/ContextMenu';
import { FileTreeRow } from './FileTreeRow';
import { InlineNameInput } from './InlineNameInput';
import { buildRowMenu } from './rowMenu';
import { dirname } from '@/utils/path';
import { cn } from '@/utils/cn';

/** A pending inline "new file"/"new folder" entry. */
interface DraftEntry {
  parent: string;
  directory: boolean;
}

interface MenuState {
  position: { x: number; y: number };
  items: MenuItem[];
}

export function FileExplorer() {
  const tree = useProjectStore((state) => state.tree);
  const project = useProjectStore((state) => state.project);
  const expandedDirs = useProjectStore((state) => state.expandedDirs);
  const activePath = useProjectStore((state) => state.activePath);
  const openFile = useProjectStore((state) => state.openFile);
  const toggleDirectory = useProjectStore((state) => state.toggleDirectory);
  const setExpandedDirs = useProjectStore((state) => state.setExpandedDirs);
  const refreshTree = useProjectStore((state) => state.refreshTree);
  const createEntry = useProjectStore((state) => state.createEntry);
  const renameEntry = useProjectStore((state) => state.renameEntry);
  const moveEntry = useProjectStore((state) => state.moveEntry);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<DraftEntry | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /** Row focused for keyboard navigation. */
  const [selected, setSelected] = useState<string | null>(null);

  // A search match should be visible even inside collapsed folders, so the
  // filtered view expands everything it kept.
  const filtered = useMemo(
    () => (tree === null ? null : filterTree(tree, query)),
    [tree, query],
  );

  const effectiveExpanded = useMemo(() => {
    if (query.trim() === '' || filtered === null) return expandedDirs;
    return new Set(allDirectoryPaths(filtered));
  }, [query, filtered, expandedDirs]);

  const rows: FlatNode[] = useMemo(
    () => (filtered === null ? [] : flattenTree(filtered, effectiveExpanded)),
    [filtered, effectiveExpanded],
  );

  // The command palette's "New File"/"New Folder" entries start a draft here.
  useEffect(() => {
    const onNewFile = (event: Event): void => {
      const detail = (event as CustomEvent<{ parent: string }>).detail;
      setDraft({ parent: detail?.parent ?? '', directory: false });
    };
    const onNewFolder = (event: Event): void => {
      const detail = (event as CustomEvent<{ parent: string }>).detail;
      setDraft({ parent: detail?.parent ?? '', directory: true });
    };

    window.addEventListener('inktex:new-file', onNewFile);
    window.addEventListener('inktex:new-folder', onNewFolder);
    return () => {
      window.removeEventListener('inktex:new-file', onNewFile);
      window.removeEventListener('inktex:new-folder', onNewFolder);
    };
  }, []);

  /** Where a new entry should be created, given what is selected. */
  const draftParent = useCallback((): string => {
    if (selected === null) return '';

    const node = rows.find((row) => row.node.path === selected)?.node;
    if (node === undefined) return '';
    return node.isDirectory ? node.path : dirname(node.path);
  }, [rows, selected]);

  const startDraft = (directory: boolean): void => {
    const parent = draftParent();
    if (parent !== '') useProjectStore.getState().revealPath(`${parent}/x`);
    setDraft({ parent, directory });
  };

  const onRowContextMenu = (event: React.MouseEvent, path: string): void => {
    event.preventDefault();
    event.stopPropagation();

    const node = rows.find((row) => row.node.path === path)?.node;
    if (node === undefined) return;

    setSelected(path);
    setMenu({
      position: { x: event.clientX, y: event.clientY },
      items: buildRowMenu(node, {
        onRename: () => setRenaming(path),
        onNewFile: () => setDraft({ parent: node.isDirectory ? path : dirname(path), directory: false }),
        onNewFolder: () => setDraft({ parent: node.isDirectory ? path : dirname(path), directory: true }),
      }),
    });
  };

  /** Arrow-key navigation over the flattened rows. */
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (rows.length === 0) return;

    const index = rows.findIndex((row) => row.node.path === selected);

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const next = rows[Math.min(index + 1, rows.length - 1)] ?? rows[0]!;
        setSelected(next.node.path);
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const previous = rows[Math.max(index - 1, 0)] ?? rows[0]!;
        setSelected(previous.node.path);
        break;
      }
      case 'ArrowRight': {
        const row = rows[index];
        if (row?.node.isDirectory === true && !row.expanded) {
          event.preventDefault();
          toggleDirectory(row.node.path);
        }
        break;
      }
      case 'ArrowLeft': {
        const row = rows[index];
        if (row?.node.isDirectory === true && row.expanded) {
          event.preventDefault();
          toggleDirectory(row.node.path);
        }
        break;
      }
      case 'Enter': {
        const row = rows[index];
        if (row === undefined) break;
        event.preventDefault();
        if (row.node.isDirectory) {
          toggleDirectory(row.node.path);
        } else {
          void openFile(row.node.path);
        }
        break;
      }
      default:
        break;
    }
  };

  if (project === null || tree === null) return null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-raised">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-1 border-b border-border-subtle pr-1 pl-3">
        <span
          className="truncate text-[0.6875rem] font-semibold tracking-wider text-content-secondary uppercase"
          title={project.root}
        >
          {project.name}
        </span>
        <div className="flex items-center">
          <IconButton
            label="Search files"
            active={searching}
            onClick={() => {
              setSearching((value) => !value);
              if (searching) setQuery('');
            }}
          >
            <Search className="size-3.5" />
          </IconButton>
          <IconButton label="New file" onClick={() => startDraft(false)}>
            <FilePlus2 className="size-3.5" />
          </IconButton>
          <IconButton label="New folder" onClick={() => startDraft(true)}>
            <FolderPlus className="size-3.5" />
          </IconButton>
          <IconButton label="Collapse all folders" onClick={() => setExpandedDirs([])}>
            <ChevronsDownUp className="size-3.5" />
          </IconButton>
          <IconButton label="Refresh" onClick={() => void refreshTree()}>
            <RefreshCw className="size-3.5" />
          </IconButton>
        </div>
      </div>

      {/* Filter */}
      {searching && (
        <div className="relative shrink-0 border-b border-border-subtle p-2">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            value={query}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- opened explicitly to type
            autoFocus
            placeholder="Filter files…"
            aria-label="Filter files"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('');
                setSearching(false);
              }
            }}
            className={cn(
              'h-7 w-full rounded-md border border-border-subtle bg-surface-base pr-7 pl-7',
              'text-xs text-content-primary placeholder:text-content-muted',
              'focus:border-accent focus:outline-none',
            )}
          />
          {query !== '' && (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-4 -translate-y-1/2 text-content-muted hover:text-content-primary"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Tree */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="tree"
        aria-label="Project files"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => {
          // Right-clicking empty space acts on the project root.
          event.preventDefault();
          setMenu({
            position: { x: event.clientX, y: event.clientY },
            items: [
              {
                id: 'new-file',
                label: 'New File',
                onSelect: () => setDraft({ parent: '', directory: false }),
              },
              {
                id: 'new-folder',
                label: 'New Folder',
                onSelect: () => setDraft({ parent: '', directory: true }),
              },
            ],
          });
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDropTarget('');
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(event) => {
          event.preventDefault();
          const source = event.dataTransfer.getData('application/x-inktex-path');
          setDropTarget(null);
          if (source !== '') void moveEntry(source, '');
        }}
        className={cn(
          'min-h-0 flex-1 overflow-auto py-1 focus:outline-none',
          dropTarget === '' && 'bg-accent-soft/40',
        )}
      >
        {rows.length === 0 && query !== '' && (
          <p className="px-3 py-6 text-center text-xs text-content-muted">
            No files match “{query}”.
          </p>
        )}

        {rows.map((row) => (
          <div key={row.node.path}>
            <FileTreeRow
              node={row.node}
              depth={row.depth}
              expanded={row.expanded}
              active={row.node.path === activePath}
              selected={row.node.path === selected}
              isMainDocument={row.node.path === project.mainDocument}
              renaming={renaming === row.node.path}
              dropTarget={dropTarget === row.node.path}
              onSelect={() => {
                setSelected(row.node.path);
                if (row.node.isDirectory) {
                  toggleDirectory(row.node.path);
                } else {
                  void openFile(row.node.path);
                }
              }}
              onContextMenu={(event) => onRowContextMenu(event, row.node.path)}
              onRenameSubmit={(name) => {
                setRenaming(null);
                if (name !== row.node.name) void renameEntry(row.node.path, name);
              }}
              onRenameCancel={() => setRenaming(null)}
              onDropTargetChange={setDropTarget}
              onMove={(source, destination) => void moveEntry(source, destination)}
            />

            {/* Inline draft appears directly beneath its parent folder. */}
            {draft !== null && draft.parent === row.node.path && row.node.isDirectory && (
              <InlineNameInput
                depth={row.depth + 1}
                directory={draft.directory}
                onSubmit={(name) => {
                  setDraft(null);
                  void createEntry(draft.parent, name, draft.directory);
                }}
                onCancel={() => setDraft(null)}
              />
            )}
          </div>
        ))}

        {/* A draft at the project root sits at the end of the list. */}
        {draft !== null && draft.parent === '' && (
          <InlineNameInput
            depth={0}
            directory={draft.directory}
            onSubmit={(name) => {
              setDraft(null);
              void createEntry('', name, draft.directory);
            }}
            onCancel={() => setDraft(null)}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex h-6 shrink-0 items-center justify-between border-t border-border-subtle px-3 text-[0.6875rem] text-content-muted">
        <span>
          {project.fileCount} file{project.fileCount === 1 ? '' : 's'}
        </span>
        {project.mainDocument !== null && (
          <span className="truncate" title={`Main document: ${project.mainDocument}`}>
            main: {project.mainDocument}
          </span>
        )}
      </div>

      {menu !== null && (
        <ContextMenu
          position={menu.position}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
