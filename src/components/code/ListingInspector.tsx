import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  FileCode2,
  FileQuestion,
  RefreshCw,
  Unlink,
  X,
} from 'lucide-react';
import type { ListingEntry, ListingSpec, SourceLinkStatus } from '@/types/listing';
import { useCodeStore } from '@/store/codeStore';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { listingAtOffset } from '@/services/listings/latexParser';
import { generateListing } from '@/services/listings/latexGenerator';
import { breakLink, refreshListing, updateListing } from '@/services/listings/listingActions';
import { cursorOffset } from '@/services/editorBridge';
import { languageLabel } from '@/services/listings/languages';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { ListingOptionsForm } from './ListingOptionsForm';
import { ThemePreview } from './ThemePreview';
import { cn } from '@/utils/cn';

const STATUS_META: Record<
  SourceLinkStatus,
  { icon: typeof CheckCircle2; label: string; className: string }
> = {
  upToDate: { icon: CheckCircle2, label: 'Up to date', className: 'text-emerald-400' },
  changed: { icon: AlertTriangle, label: 'Source file changed', className: 'text-amber-400' },
  fileMissing: { icon: FileQuestion, label: 'Source file missing', className: 'text-rose-400' },
  regionMissing: { icon: FileQuestion, label: 'Region no longer exists', className: 'text-rose-400' },
};

/**
 * The Listing Inspector.
 *
 * Docks beside the editor and follows the cursor: put the caret inside any
 * `minted` or `lstlisting` environment and every property becomes editable
 * without touching the markup. Applying a change regenerates that listing in
 * place as one undoable edit.
 */
export function ListingInspector() {
  const listings = useCodeStore((state) => state.listings);
  const toggleInspector = useUiStore((state) => state.toggleInspector);

  const activePath = useProjectStore((state) => state.activePath);
  const tabs = useProjectStore((state) => state.tabs);

  const [offset, setOffset] = useState<number | null>(null);
  const [draft, setDraft] = useState<ListingSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  // The cursor position is not reactive state, so poll it. A quarter second is
  // imperceptible for a panel that follows the caret and costs nothing.
  useEffect(() => {
    const timer = setInterval(() => setOffset(cursorOffset()), 250);
    return () => clearInterval(timer);
  }, []);

  const entry: ListingEntry | null = useMemo(() => {
    if (offset === null) return null;

    const found = listingAtOffset(
      listings.map((candidate) => candidate.listing),
      offset,
    );
    if (found === null) return null;

    return listings.find((candidate) => candidate.listing.start === found.start) ?? null;
  }, [listings, offset]);

  // Reset the draft whenever the selected listing changes.
  const selectedStart = entry?.listing.start ?? null;
  useEffect(() => {
    setDraft(entry === null ? null : { ...entry.listing.spec });
  }, [selectedStart, entry]);

  const patch = useCallback((changes: Partial<ListingSpec>) => {
    setDraft((current) => (current === null ? null : { ...current, ...changes }));
  }, []);

  const dirty = useMemo(() => {
    if (entry === null || draft === null) return false;
    return generateListing(draft) !== generateListing(entry.listing.spec);
  }, [entry, draft]);

  const apply = async (): Promise<void> => {
    if (entry === null || draft === null) return;

    setBusy(true);
    await updateListing(entry.listing, draft);
    setBusy(false);

    // The store re-parses from the document, which becomes the new baseline.
    const tab = tabs.find((candidate) => candidate.path === activePath);
    if (tab !== undefined && activePath !== null) {
      await useCodeStore.getState().syncListings(activePath, tab.content);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border-subtle bg-surface-raised">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle pr-1 pl-3">
        <Code2 className="size-3.5 shrink-0 text-accent" />
        <span className="flex-1 text-[0.6875rem] font-semibold tracking-wider text-content-secondary uppercase">
          Listing
        </span>
        <IconButton label="Close inspector" onClick={toggleInspector}>
          <X className="size-3.5" />
        </IconButton>
      </div>

      {entry === null || draft === null ? (
        <EmptyState
          icon={<Code2 className="size-8" />}
          title="No listing selected"
          description={
            listings.length === 0
              ? 'This document has no code listings yet. Use Insert → Code Block to add one.'
              : `Put the cursor inside one of the ${listings.length} listings in this document to edit it.`
          }
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto">
            {/* Source link status */}
            {draft.link !== null && entry.status !== null && (
              <SourceLinkBanner entry={entry} />
            )}

            {draft.link !== null && (
              <div className="border-b border-border-subtle px-3 py-2">
                <div className="flex items-center gap-2">
                  <FileCode2 className="size-3.5 shrink-0 text-content-muted" />
                  <span
                    className="min-w-0 flex-1 truncate text-[0.6875rem] text-content-secondary"
                    title={draft.link.path}
                  >
                    {draft.link.path}
                  </span>
                </div>
                <p className="mt-0.5 pl-5 text-[0.625rem] text-content-muted">
                  {draft.link.mode === 'region' && `Region “${draft.link.region}”`}
                  {draft.link.mode === 'range' &&
                    `Lines ${draft.link.firstLine}–${draft.link.lastLine}`}
                  {draft.link.mode === 'whole' && 'Whole file'}
                  {' · '}
                  {languageLabel(draft.language)}
                </p>
              </div>
            )}

            {showPreview && (
              <div className="border-b border-border-subtle p-3">
                <ThemePreview spec={draft} maxLines={10} />
              </div>
            )}

            <div className="px-3">
              <ListingOptionsForm spec={draft} onChange={patch} />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-border-subtle p-2">
            <button
              type="button"
              onClick={() => setShowPreview((value) => !value)}
              className="rounded px-2 py-1 text-[0.6875rem] text-content-muted transition-colors hover:bg-surface-hover hover:text-content-secondary"
            >
              {showPreview ? 'Hide preview' : 'Show preview'}
            </button>

            <Button
              size="sm"
              variant="primary"
              className="ml-auto"
              disabled={!dirty || busy}
              icon={busy ? <Spinner className="size-3" /> : undefined}
              onClick={() => void apply()}
            >
              {dirty ? 'Apply' : 'No changes'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Status banner with the repair actions for a drifted link. */
function SourceLinkBanner({ entry }: { entry: ListingEntry }) {
  const [busy, setBusy] = useState(false);
  const status = entry.status;
  if (status === null) return null;

  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const canRefresh = status === 'changed';

  const run = async (action: () => Promise<boolean>): Promise<void> => {
    setBusy(true);
    await action();
    setBusy(false);
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-b px-3 py-2',
        status === 'upToDate'
          ? 'border-border-subtle'
          : 'border-amber-500/30 bg-amber-500/10',
      )}
    >
      <Icon className={cn('size-3.5 shrink-0', meta.className)} />
      <span className="min-w-0 flex-1 text-[0.6875rem] text-content-primary">{meta.label}</span>

      {canRefresh && (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          icon={<RefreshCw className="size-3" />}
          onClick={() => void run(() => refreshListing(entry.listing))}
        >
          Refresh
        </Button>
      )}

      {status !== 'upToDate' && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          icon={<Unlink className="size-3" />}
          onClick={() => void run(() => breakLink(entry.listing))}
        >
          Break link
        </Button>
      )}
    </div>
  );
}
