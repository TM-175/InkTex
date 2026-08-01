import { useRef, useState } from 'react';
import { Star } from 'lucide-react';
import type { FileNode } from '@/types/project';
import { DisclosureIcon, FileIcon } from '@/components/ui/FileIcon';
import { cn } from '@/utils/cn';
import { dirname } from '@/utils/path';

/** Indentation per tree level, in pixels. */
const INDENT = 12;
const BASE_PADDING = 8;

interface FileTreeRowProps {
  node: FileNode;
  depth: number;
  expanded: boolean;
  /** This file is the active editor tab. */
  active: boolean;
  /** This row has keyboard focus. */
  selected: boolean;
  isMainDocument: boolean;
  renaming: boolean;
  dropTarget: boolean;
  onSelect: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onRenameSubmit: (name: string) => void;
  onRenameCancel: () => void;
  onDropTargetChange: (path: string | null) => void;
  onMove: (source: string, destinationParent: string) => void;
}

export function FileTreeRow({
  node,
  depth,
  expanded,
  active,
  selected,
  isMainDocument,
  renaming,
  dropTarget,
  onSelect,
  onContextMenu,
  onRenameSubmit,
  onRenameCancel,
  onDropTargetChange,
  onMove,
}: FileTreeRowProps) {
  const [draftName, setDraftName] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const paddingLeft = BASE_PADDING + depth * INDENT;

  if (renaming) {
    return (
      <div className="flex h-6 items-center gap-1.5" style={{ paddingLeft }}>
        <FileIcon kind={node.kind} expanded={expanded} />
        <input
          ref={inputRef}
          type="text"
          value={draftName}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- rename starts by typing
          autoFocus
          aria-label={`Rename ${node.name}`}
          spellCheck={false}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              const trimmed = draftName.trim();
              if (trimmed !== '') onRenameSubmit(trimmed);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onRenameCancel();
            }
          }}
          onFocus={(event) => {
            // Preselect the stem so the extension is easy to keep.
            const dot = node.name.lastIndexOf('.');
            event.target.setSelectionRange(0, dot > 0 ? dot : node.name.length);
          }}
          onBlur={onRenameCancel}
          className={cn(
            'mr-2 h-5 min-w-0 flex-1 rounded border border-accent bg-surface-base px-1',
            'text-[0.8125rem] text-content-primary focus:outline-none',
          )}
        />
      </div>
    );
  }

  return (
    <div
      role="treeitem"
      aria-expanded={node.isDirectory ? expanded : undefined}
      aria-selected={active}
      tabIndex={-1}
      draggable
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-inktex-path', node.path);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        // Files accept drops on behalf of their containing folder.
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        onDropTargetChange(node.isDirectory ? node.path : dirname(node.path));
      }}
      onDragLeave={(event) => {
        event.stopPropagation();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();

        const source = event.dataTransfer.getData('application/x-inktex-path');
        onDropTargetChange(null);
        if (source === '' || source === node.path) return;

        onMove(source, node.isDirectory ? node.path : dirname(node.path));
      }}
      style={{ paddingLeft }}
      className={cn(
        'group flex h-6 cursor-default items-center gap-1.5 pr-2 text-[0.8125rem] transition-colors',
        active
          ? 'bg-accent-soft text-content-primary'
          : 'text-content-secondary hover:bg-surface-hover',
        selected && !active && 'bg-surface-hover',
        dropTarget && 'ring-1 ring-accent ring-inset',
      )}
    >
      {node.isDirectory ? (
        <DisclosureIcon expanded={expanded} />
      ) : (
        <span className="size-3.5 shrink-0" />
      )}

      <FileIcon kind={node.kind} expanded={expanded} />

      <span className={cn('truncate', active && 'font-medium')} title={node.path}>
        {node.name}
      </span>

      {isMainDocument && (
        <Star
          className="ml-auto size-3 shrink-0 fill-amber-400 text-amber-400"
          aria-label="Main document"
        />
      )}
    </div>
  );
}
