import { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Link2, Search } from 'lucide-react';
import { useCodeStore } from '@/store/codeStore';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { describeListing } from '@/services/listings/latexParser';
import { languageLabel } from '@/services/listings/languages';
import { fuzzyFilter } from '@/utils/fuzzy';
import { Modal } from '@/components/ui/Modal';
import { HighlightedText } from '@/components/dialogs/HighlightedText';
import { cn } from '@/utils/cn';

/**
 * Search across the listings in the active document.
 *
 * Matches on everything that identifies a listing — caption, label, language
 * and linked source path — because a student looking for "the quicksort one"
 * may remember any of those and none of the others.
 */
export function ListingSearchDialog() {
  const open = useUiStore((state) => state.overlay === 'listingSearch');
  const close = useUiStore((state) => state.closeOverlay);

  const listings = useCodeStore((state) => state.listings);
  const listingsPath = useCodeStore((state) => state.listingsPath);
  const openFile = useProjectStore((state) => state.openFile);

  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(
    () =>
      fuzzyFilter(
        listings,
        query,
        (entry) => {
          const { spec } = entry.listing;
          return [
            spec.caption,
            spec.label,
            languageLabel(spec.language),
            spec.link?.path ?? '',
            spec.link?.region ?? '',
          ]
            .filter((part) => part !== '')
            .join(' ');
        },
        60,
      ),
    [listings, query],
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

  const goTo = (index: number): void => {
    const match = matches[index];
    if (match === undefined || listingsPath === null) return;

    close();
    void openFile(listingsPath, {
      path: listingsPath,
      line: match.item.listing.line,
      column: 1,
    });
  };

  return (
    <Modal open={open} onClose={close} align="top" bare className="max-w-xl">
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
        <Search className="size-4 shrink-0 text-content-muted" />
        <input
          type="text"
          value={query}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- opened to type into
          autoFocus
          spellCheck={false}
          placeholder="Search listings by caption, label, language or source…"
          aria-label="Search listings"
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
              goTo(highlighted);
            }
          }}
          className="w-full bg-transparent text-sm text-content-primary placeholder:text-content-muted focus:outline-none"
        />
      </div>

      <ul ref={listRef} className="max-h-96 overflow-auto py-1">
        {matches.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-content-muted">
            {listings.length === 0
              ? 'This document has no code listings yet.'
              : 'No listings match.'}
          </li>
        )}

        {matches.map(({ item, match }, index) => {
          const { spec } = item.listing;

          return (
            <li key={item.listing.start}>
              <button
                type="button"
                data-index={index}
                onMouseMove={() => setHighlighted(index)}
                onClick={() => goTo(index)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors',
                  index === highlighted ? 'bg-accent-soft' : 'hover:bg-surface-hover',
                )}
              >
                <Code2 className="size-4 shrink-0 text-indigo-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-content-primary">
                    <HighlightedText text={describeListing(item.listing)} indices={match.indices} />
                  </span>
                  <span className="flex items-center gap-2 text-[0.6875rem] text-content-muted">
                    <span>line {item.listing.line}</span>
                    <span>{languageLabel(spec.language)}</span>
                    {spec.label !== '' && <span className="font-mono">{spec.label}</span>}
                    {spec.link !== null && (
                      <span className="flex items-center gap-0.5">
                        <Link2 className="size-2.5" />
                        {spec.link.path}
                      </span>
                    )}
                  </span>
                </span>
                {item.status !== null && item.status !== 'upToDate' && (
                  <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] text-amber-400">
                    stale
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
