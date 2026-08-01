import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { collectFiles } from '@/services/fileTreeService';
import { fuzzyFilter } from '@/utils/fuzzy';
import { Modal } from '@/components/ui/Modal';
import { FileIcon } from '@/components/ui/FileIcon';
import { HighlightedText } from './HighlightedText';
import { dirname } from '@/utils/path';
import { cn } from '@/utils/cn';

/** Fuzzy file finder, the equivalent of VS Code's Go to File. */
export function QuickOpen() {
  const open = useUiStore((state) => state.overlay === 'quickOpen');
  const close = useUiStore((state) => state.closeOverlay);
  const tree = useProjectStore((state) => state.tree);
  const openFile = useProjectStore((state) => state.openFile);

  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const files = useMemo(() => (tree === null ? [] : collectFiles(tree)), [tree]);

  const matches = useMemo(
    () => fuzzyFilter(files, query, (node) => node.path, 50),
    [files, query],
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlighted(0);
    }
  }, [open]);

  useEffect(() => setHighlighted(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${highlighted}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const openAt = (index: number): void => {
    const match = matches[index];
    if (match === undefined) return;

    close();
    void openFile(match.item.path);
  };

  return (
    <Modal open={open} onClose={close} align="top" bare className="max-w-xl">
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
        <Search className="size-4 shrink-0 text-content-muted" />
        <input
          type="text"
          value={query}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- opened to type a file name
          autoFocus
          spellCheck={false}
          placeholder="Search files by name…"
          aria-label="File name"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setHighlighted((index) => Math.min(index + 1, matches.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlighted((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              openAt(highlighted);
            }
          }}
          className="w-full bg-transparent text-sm text-content-primary placeholder:text-content-muted focus:outline-none"
        />
      </div>

      <ul ref={listRef} className="max-h-96 overflow-auto py-1">
        {matches.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-content-muted">
            {files.length === 0 ? 'This project has no files yet.' : 'No files match.'}
          </li>
        )}

        {matches.map(({ item, match }, index) => {
          const directory = dirname(item.path);
          // Highlight indices are relative to the full path; shift them so the
          // file-name portion highlights correctly.
          const nameOffset = directory === '' ? 0 : directory.length + 1;

          return (
            <li key={item.path}>
              <button
                type="button"
                data-index={index}
                onMouseMove={() => setHighlighted(index)}
                onClick={() => openAt(index)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors',
                  index === highlighted ? 'bg-accent-soft' : 'hover:bg-surface-hover',
                )}
              >
                <FileIcon kind={item.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-content-primary">
                    <HighlightedText
                      text={item.name}
                      indices={match.indices
                        .filter((i) => i >= nameOffset)
                        .map((i) => i - nameOffset)}
                    />
                  </span>
                  {directory !== '' && (
                    <span className="block truncate text-[0.6875rem] text-content-muted">
                      {directory}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
