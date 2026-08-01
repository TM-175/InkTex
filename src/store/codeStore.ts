/**
 * Code-listing state: the source-file index, the listings in the active
 * document, and their link status.
 *
 * Deliberately separate from `projectStore`: the asset index is expensive to
 * build and cheap to keep, so it must not be thrown away every time a tab
 * changes, and re-indexing one file must not re-render the editor.
 */

import { create } from 'zustand';
import { codeApi } from '@/tauri';
import type {
  CodeAsset,
  ImportedCode,
  ImportMode,
  ListingEntry,
  ParsedListing,
  SourceLink,
  SourceLinkStatus,
} from '@/types/listing';
import { toAppError } from '@/types/errors';
import { indexableExtensions } from '@/services/listings/languages';
import { parseListings } from '@/services/listings/latexParser';
import { notify } from './uiStore';

interface CodeState {
  /** Every indexable source file in the project, sorted by path. */
  assets: CodeAsset[];
  indexing: boolean;
  /** True once an index has been built for the current project. */
  indexed: boolean;

  /** Listings found in the active document, with live link status. */
  listings: ListingEntry[];
  /** Path the listings were parsed from, so stale results can be discarded. */
  listingsPath: string | null;

  indexAssets: () => Promise<void>;
  /** Patch the index for specific paths, without re-walking the project. */
  refreshAssets: (paths: string[]) => Promise<void>;
  clear: () => void;

  /** Re-parse the active document and refresh link statuses. */
  syncListings: (path: string, text: string) => Promise<void>;
  importCode: (
    path: string,
    mode: ImportMode,
    options?: { firstLine?: number; lastLine?: number; region?: string; dedent?: boolean },
  ) => Promise<ImportedCode | null>;
}

export const useCodeStore = create<CodeState>((set, get) => ({
  assets: [],
  indexing: false,
  indexed: false,
  listings: [],
  listingsPath: null,

  indexAssets: async () => {
    if (get().indexing) return;
    set({ indexing: true });

    try {
      const assets = await codeApi.indexCodeAssets(indexableExtensions());
      set({ assets, indexed: true });
    } catch (error) {
      const appError = toAppError(error, 'Source files could not be indexed.');
      // Indexing is a background convenience; a failure disables the browser
      // rather than interrupting whatever the user was doing.
      if (appError.kind !== 'invalidProject') {
        notify.warning('Code assets could not be indexed', appError.message);
      }
      set({ assets: [], indexed: false });
    } finally {
      set({ indexing: false });
    }
  },

  refreshAssets: async (paths) => {
    if (!get().indexed || paths.length === 0) return;

    try {
      const updated = await codeApi.indexCodePaths(indexableExtensions(), paths);
      const byPath = new Map(updated.map((asset) => [asset.path, asset]));

      set((state) => {
        // Paths that were asked about but did not come back no longer qualify
        // as assets — deleted, or no longer readable.
        const removed = new Set(paths.filter((path) => !byPath.has(path)));

        const kept = state.assets
          .filter((asset) => !removed.has(asset.path))
          .map((asset) => byPath.get(asset.path) ?? asset);

        // Anything genuinely new gets appended, then the list is re-sorted.
        const known = new Set(kept.map((asset) => asset.path));
        const added = updated.filter((asset) => !known.has(asset.path));

        const assets = [...kept, ...added].sort((a, b) =>
          a.path.toLowerCase().localeCompare(b.path.toLowerCase()),
        );
        return { assets };
      });
    } catch {
      // A failed incremental update self-heals on the next full index.
    }
  },

  clear: () => set({ assets: [], indexed: false, listings: [], listingsPath: null }),

  syncListings: async (path, text) => {
    const parsed = parseListings(text);

    // Show the listings immediately; statuses arrive once the backend has
    // re-read the sources.
    set({
      listingsPath: path,
      listings: parsed.map((listing) => ({ listing, status: null })),
    });

    const linked = parsed.filter(
      (listing): listing is ParsedListing & { spec: { link: SourceLink } } =>
        listing.spec.link !== null,
    );
    if (linked.length === 0) return;

    try {
      const results = await codeApi.checkSourceLinks(linked.map((l) => l.spec.link));

      set((state) => {
        // Discard if the user switched documents while this was in flight.
        if (state.listingsPath !== path) return state;

        const statusFor = new Map<number, SourceLinkStatus>();
        linked.forEach((listing, index) => {
          const result = results[index];
          if (result !== undefined) statusFor.set(listing.start, result.status);
        });

        return {
          listings: state.listings.map((entry) => ({
            ...entry,
            status: statusFor.get(entry.listing.start) ?? entry.status,
          })),
        };
      });
    } catch {
      // Status is advisory; leaving it unknown is better than an error toast
      // on every keystroke.
    }
  },

  importCode: async (path, mode, options = {}) => {
    try {
      return await codeApi.importCode(path, mode, options);
    } catch (error) {
      const appError = toAppError(error, 'The code could not be imported.');
      notify.error(appError.message, appError.hint ?? undefined);
      return null;
    }
  },
}));

/** Listings whose source has drifted, for the status badge. */
export function staleListingCount(entries: readonly ListingEntry[]): number {
  return entries.filter(
    (entry) => entry.status !== null && entry.status !== 'upToDate',
  ).length;
}
