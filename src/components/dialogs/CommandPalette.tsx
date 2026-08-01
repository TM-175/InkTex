import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { Command } from '@/types/editor';
import { fuzzyFilter } from '@/utils/fuzzy';
import { useUiStore } from '@/store/uiStore';
import { Modal } from '@/components/ui/Modal';
import { HighlightedText } from './HighlightedText';
import { cn } from '@/utils/cn';

interface CommandPaletteProps {
  commands: readonly Command[];
}

export function CommandPalette({ commands }: CommandPaletteProps) {
  const open = useUiStore((state) => state.overlay === 'commandPalette');
  const close = useUiStore((state) => state.closeOverlay);

  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Disabled commands are hidden rather than greyed: a palette is for doing,
  // not for browsing what cannot be done.
  const available = useMemo(
    () => commands.filter((command) => command.enabled !== false),
    [commands],
  );

  const matches = useMemo(
    () =>
      fuzzyFilter(
        available,
        query,
        (command) => `${command.title} ${command.category} ${command.keywords ?? ''}`,
        60,
      ),
    [available, query],
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlighted(0);
    }
  }, [open]);

  useEffect(() => setHighlighted(0), [query]);

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${highlighted}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const runAt = (index: number): void => {
    const match = matches[index];
    if (match === undefined) return;

    close();
    void match.item.run();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((index) => Math.min(index + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runAt(highlighted);
    }
  };

  return (
    <Modal open={open} onClose={close} align="top" bare className="max-w-xl">
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
        <Search className="size-4 shrink-0 text-content-muted" />
        <input
          type="text"
          value={query}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the palette exists to be typed into
          autoFocus
          spellCheck={false}
          placeholder="Type a command…"
          aria-label="Command"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent text-sm text-content-primary placeholder:text-content-muted focus:outline-none"
        />
      </div>

      <ul ref={listRef} className="max-h-96 overflow-auto py-1">
        {matches.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-content-muted">
            No matching commands.
          </li>
        )}

        {matches.map(({ item, match }, index) => (
          <li key={item.id}>
            <button
              type="button"
              data-index={index}
              onMouseMove={() => setHighlighted(index)}
              onClick={() => runAt(index)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
                index === highlighted ? 'bg-accent-soft' : 'hover:bg-surface-hover',
              )}
            >
              <span className="min-w-0 flex-1 truncate text-sm text-content-primary">
                <HighlightedText text={item.title} indices={match.indices} />
              </span>
              <span className="shrink-0 text-[0.6875rem] text-content-muted">
                {item.category}
              </span>
              {item.shortcut !== undefined && (
                <kbd className="shrink-0 rounded border border-border-subtle bg-surface-base px-1.5 py-0.5 font-mono text-[0.6875rem] text-content-muted">
                  {item.shortcut}
                </kbd>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
