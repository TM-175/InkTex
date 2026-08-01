/**
 * The Listing Manager: every mutation a listing can undergo.
 *
 * Kept out of the components so the wizard, the inspector, the asset browser
 * and drag-and-drop all take the same path, and so each of those stays a view.
 *
 * Two invariants:
 *
 * * Edits go through Monaco's edit API rather than replacing the buffer, so a
 *   listing insert or property change is a single undoable step.
 * * The preamble is amended in the document that actually has the
 *   `\documentclass`, which is often not the file being edited.
 */

import type { ListingSpec, ParsedListing } from '@/types/listing';
import { fsApi } from '@/tauri';
import { useProjectStore } from '@/store/projectStore';
import { useCodeStore } from '@/store/codeStore';
import { notify } from '@/store/uiStore';
import { toAppError } from '@/types/errors';
import { generateListing } from './latexGenerator';
import { analysePreamble, applyPreamble, isPreambleSatisfied } from './preamble';
import { insertText, replaceRange } from '@/services/editorBridge';

/** The document that owns the preamble, and whether it is the active tab. */
interface PreambleTarget {
  path: string;
  content: string;
  isActiveTab: boolean;
}

/**
 * Locate the document carrying `\documentclass`.
 *
 * A listing inserted into `chapters/intro.tex` still needs `\usepackage{minted}`
 * in `main.tex`, so this looks past the active tab when necessary.
 */
async function findPreambleTarget(): Promise<PreambleTarget | null> {
  const { project, tabs, activePath } = useProjectStore.getState();
  if (project === null) return null;

  const active = tabs.find((tab) => tab.path === activePath);
  if (active !== undefined && active.content.includes('\\documentclass')) {
    return { path: active.path, content: active.content, isActiveTab: true };
  }

  const main = project.mainDocument;
  if (main === null) return null;

  const openMain = tabs.find((tab) => tab.path === main);
  if (openMain !== undefined) {
    return { path: main, content: openMain.content, isActiveTab: openMain.path === activePath };
  }

  try {
    const file = await fsApi.readTextFile(main);
    return { path: main, content: file.content, isActiveTab: false };
  } catch {
    return null;
  }
}

/**
 * Add whatever packages and definitions `spec` needs.
 *
 * Returns the number of lines added, or -1 if the preamble could not be found —
 * which is not fatal, since the user may be editing a fragment whose parent
 * already has everything.
 */
export async function ensurePreamble(specs: readonly ListingSpec[]): Promise<number> {
  const target = await findPreambleTarget();
  if (target === null) return -1;

  const requirement = analysePreamble(target.content, specs);
  if (isPreambleSatisfied(requirement)) return 0;

  const updated = applyPreamble(target.content, requirement);
  const added = requirement.packages.length + requirement.definitions.length;

  const store = useProjectStore.getState();
  const isOpen = store.tabs.some((tab) => tab.path === target.path);

  if (isOpen) {
    store.updateTabContent(target.path, updated);
    await store.saveTab(target.path);
  } else {
    try {
      await fsApi.writeTextFile(target.path, updated);
    } catch (error) {
      const appError = toAppError(error, 'The preamble could not be updated.');
      notify.error(appError.message, appError.hint ?? undefined);
      return -1;
    }
  }

  return added;
}

/**
 * Insert a new listing at the cursor.
 *
 * Resolves true when the listing was inserted.
 */
export async function insertListing(spec: ListingSpec): Promise<boolean> {
  const { activePath } = useProjectStore.getState();
  if (activePath === null) {
    notify.warning('No document is open', 'Open a .tex file to insert a listing into.');
    return false;
  }

  const added = await ensurePreamble([spec]);
  // Surround with blank lines so the listing is a paragraph of its own.
  insertText(`\n${generateListing(spec)}\n`);

  if (added > 0) {
    notify.success(
      'Listing inserted',
      `Added ${added} preamble line${added === 1 ? '' : 's'}${
        spec.engine === 'minted' ? ' — minted needs --shell-escape' : ''
      }`,
    );
  } else if (added === -1) {
    notify.warning(
      'Listing inserted, but the preamble was not updated',
      'No \\documentclass was found. Add the required packages to your main document.',
    );
  }

  return true;
}

/** Rewrite an existing listing after its properties changed. */
export async function updateListing(
  listing: ParsedListing,
  spec: ListingSpec,
): Promise<boolean> {
  await ensurePreamble([spec]);

  const replaced = replaceRange(listing.start, listing.end, generateListing(spec));
  if (!replaced) {
    notify.error('The listing could not be updated', 'Reopen the document and try again.');
    return false;
  }
  return true;
}

/**
 * Re-import a linked listing's code from its source file.
 *
 * Only the code and the fingerprint change; every presentation option the user
 * chose is preserved.
 */
export async function refreshListing(listing: ParsedListing): Promise<boolean> {
  const link = listing.spec.link;
  if (link === null) return false;

  const imported = await useCodeStore.getState().importCode(link.path, link.mode, {
    firstLine: link.firstLine,
    lastLine: link.lastLine,
    region: link.region,
    dedent: link.dedent,
  });
  if (imported === null) return false;

  const spec: ListingSpec = {
    ...listing.spec,
    code: imported.content,
    link: {
      ...link,
      hash: imported.hash,
      firstLine: imported.firstLine,
      lastLine: imported.lastLine,
    },
  };

  const ok = await updateListing(listing, spec);
  if (ok) notify.success('Listing refreshed from source');
  return ok;
}

/**
 * Detach a listing from its source file.
 *
 * The code stays exactly as it is; only the tracking comment is dropped. The
 * original file is never touched — InkTex only ever reads source files.
 */
export async function breakLink(listing: ParsedListing): Promise<boolean> {
  const ok = await updateListing(listing, { ...listing.spec, link: null });
  if (ok) notify.info('Link removed', 'The listing is now independent of its source file.');
  return ok;
}
