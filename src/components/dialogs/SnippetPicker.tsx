import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { SNIPPETS, SNIPPET_CATEGORIES } from '@/services/snippets';
import { insertSnippet } from '@/services/editorBridge';
import { fuzzyFilter } from '@/utils/fuzzy';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/utils/cn';

/** Browse and insert a LaTeX snippet at the cursor. */
export function SnippetPicker() {
  const open = useUiStore((state) => state.overlay === 'snippets');
  const close = useUiStore((state) => state.closeOverlay);

  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);

  const matches = useMemo(
    () =>
      fuzzyFilter(
        SNIPPETS,
        query,
        (snippet) => `${snippet.label} ${snippet.description} ${snippet.category}`,
        40,
      ),
    [query],
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlighted(0);
    }
  }, [open]);

  useEffect(() => setHighlighted(0), [query]);

  const insertAt = (index: number): void => {
    const match = matches[index];
    if (match === undefined) return;

    close();
    // Let the modal restore focus to the editor before expanding the snippet.
    requestAnimationFrame(() => insertSnippet(match.item.body));
  };

  const preview = matches[highlighted]?.item;

  return (
    <Modal open={open} onClose={close} align="top" bare className="max-w-3xl">
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
        <Search className="size-4 shrink-0 text-content-muted" />
        <input
          type="text"
          value={query}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- opened to type a snippet name
          autoFocus
          spellCheck={false}
          placeholder="Search snippets — equation, figure, theorem…"
          aria-label="Snippet"
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
              insertAt(highlighted);
            }
          }}
          className="w-full bg-transparent text-sm text-content-primary placeholder:text-content-muted focus:outline-none"
        />
      </div>

      <div className="grid min-h-0 grid-cols-[1fr_1.2fr]">
        <ul className="max-h-96 overflow-auto border-r border-border-subtle py-1">
          {matches.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-content-muted">
              No snippets match.
            </li>
          )}

          {matches.map(({ item }, index) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseMove={() => setHighlighted(index)}
                onClick={() => insertAt(index)}
                className={cn(
                  'w-full px-4 py-2 text-left transition-colors',
                  index === highlighted ? 'bg-accent-soft' : 'hover:bg-surface-hover',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-sm text-content-primary">{item.label}</span>
                  <span className="shrink-0 text-[0.6875rem] text-content-muted">
                    {SNIPPET_CATEGORIES.find((category) => category.id === item.category)?.label}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-content-muted">{item.description}</p>
              </button>
            </li>
          ))}
        </ul>

        {/* Preview of the snippet body, with tab stops shown as placeholders. */}
        <div className="max-h-96 overflow-auto bg-surface-sunken p-4">
          {preview === undefined ? (
            <p className="text-sm text-content-muted">Select a snippet to preview it.</p>
          ) : (
            <pre className="selectable font-mono text-xs leading-relaxed whitespace-pre text-content-secondary">
              {preview.body.replace(/\$\{\d+:?([^}|]*)(\|[^}]*\|)?\}/g, '$1').replace(/\$0/g, '')}
            </pre>
          )}
        </div>
      </div>
    </Modal>
  );
}
