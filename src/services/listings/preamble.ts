/**
 * Preamble management.
 *
 * A listing is useless if the document does not load the package that renders
 * it, so inserting one has to be able to add `\usepackage{minted}` or
 * `\usepackage{listings}` plus the theme and language definitions it depends
 * on.
 *
 * Everything is inserted as ordinary LaTeX inside a clearly delimited block, so
 * the user can move, edit or delete it. The block is idempotent: re-running
 * after adding a second listing extends it rather than duplicating it.
 */

import type { ListingEngine, ListingSpec } from '@/types/listing';
import { languageById } from './languages';
import {
  HIGHLIGHT_COLOR_DEFINITION,
  HIGHLIGHT_COLOR_NAME,
  lstStyleDefinition,
  themeColorDefinitions,
} from './themes';

const BLOCK_START = '% >>> InkTex code listings — generated, safe to edit or move';
const BLOCK_END = '% <<< InkTex code listings';

export interface PreambleRequirement {
  /** Package lines the document is missing. */
  packages: string[];
  /** Definition blocks (colours, styles, languages) the document is missing. */
  definitions: string[];
  /** True when `minted` is involved and so `-shell-escape` is required. */
  needsShellEscape: boolean;
}

/** Does the document already load `package`? */
function hasPackage(text: string, name: string): boolean {
  // Matches \usepackage{a,minted,b} and \usepackage[opts]{minted} alike.
  const pattern = new RegExp(
    String.raw`\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{[^}]*\b${name}\b[^}]*\}`,
  );
  return pattern.test(text);
}

/** Does the document already contain this definition (by its defining name)? */
function hasDefinition(text: string, marker: string): boolean {
  return text.includes(marker);
}

/**
 * Work out what a document is missing in order to render `specs`.
 *
 * Pure: it reports, and [`applyPreamble`] applies. Keeping them apart means the
 * wizard can tell the user what will be added before anything is written.
 */
export function analysePreamble(
  document: string,
  specs: readonly ListingSpec[],
): PreambleRequirement {
  const packages: string[] = [];
  const definitions: string[] = [];

  const engines = new Set<ListingEngine>(specs.map((spec) => spec.engine));
  const usesMinted = engines.has('minted');
  const usesListings = engines.has('listings');

  if (usesMinted && !hasPackage(document, 'minted')) {
    packages.push('\\usepackage{minted}');
  }
  if (usesListings && !hasPackage(document, 'listings')) {
    packages.push('\\usepackage{listings}');
  }
  // Both engines need xcolor for themes; minted pulls it in itself, but being
  // explicit costs nothing and makes the block self-contained.
  if ((usesMinted || usesListings) && !hasPackage(document, 'xcolor')) {
    packages.push('\\usepackage{xcolor}');
  }

  // A captioned, non-floating minted listing uses `[H]`, which needs `float`.
  const needsFloatPackage = specs.some(
    (spec) => spec.engine === 'minted' && spec.float && spec.placement.includes('H'),
  );
  if (needsFloatPackage && !hasPackage(document, 'float')) {
    packages.push('\\usepackage{float}');
  }

  // Theme colours are needed whenever a theme is used with either engine.
  const themes = new Set(specs.map((spec) => spec.theme));
  for (const theme of themes) {
    for (const definition of themeColorDefinitions(theme)) {
      const marker = definition.slice(0, definition.indexOf('}') + 1);
      if (!hasDefinition(document, marker) && !definitions.includes(definition)) {
        definitions.push(definition);
      }
    }
  }

  // `listings` needs a generated style per theme, and a language definition for
  // anything the package does not ship with.
  if (usesListings) {
    if (!hasDefinition(document, `\\definecolor{${HIGHLIGHT_COLOR_NAME}}`)) {
      definitions.push(HIGHLIGHT_COLOR_DEFINITION);
    }

    for (const theme of themes) {
      const style = lstStyleDefinition(theme);
      const marker = style.slice(0, style.indexOf('}') + 1);
      if (!hasDefinition(document, marker)) definitions.push(style);
    }

    const languages = new Set(
      specs.filter((spec) => spec.engine === 'listings').map((spec) => spec.language),
    );
    for (const languageId of languages) {
      const language = languageById(languageId);
      if (language?.lstDefinition === undefined) continue;

      const marker = `\\lstdefinelanguage{${language.listings}}`;
      if (!hasDefinition(document, marker)) definitions.push(language.lstDefinition);
    }
  }

  return { packages, definitions, needsShellEscape: usesMinted };
}

export function isPreambleSatisfied(requirement: PreambleRequirement): boolean {
  return requirement.packages.length === 0 && requirement.definitions.length === 0;
}

/**
 * Insert the missing pieces into a document's preamble.
 *
 * Additions go into a single delimited block, extended in place if it already
 * exists so repeated inserts do not scatter `\usepackage` lines through the
 * file. Returns the document unchanged when nothing is needed.
 */
export function applyPreamble(document: string, requirement: PreambleRequirement): string {
  if (isPreambleSatisfied(requirement)) return document;

  const additions = [...requirement.packages, ...requirement.definitions];

  // Extend the existing block when there is one.
  const blockStart = document.indexOf(BLOCK_START);
  if (blockStart !== -1) {
    const blockEnd = document.indexOf(BLOCK_END, blockStart);
    if (blockEnd !== -1) {
      const before = document.slice(0, blockEnd);
      const after = document.slice(blockEnd);
      return `${before}${additions.join('\n')}\n${after}`;
    }
  }

  const block = [BLOCK_START, ...additions, BLOCK_END, ''].join('\n');

  // Otherwise place it just before \begin{document}, which is where a reader
  // expects package loading to end.
  const beginDocument = document.indexOf('\\begin{document}');
  if (beginDocument !== -1) {
    const lineStart = document.lastIndexOf('\n', beginDocument - 1) + 1;
    return document.slice(0, lineStart) + block + document.slice(lineStart);
  }

  // No \begin{document}: this is an included fragment, so put the block after
  // the last \usepackage, or at the very top.
  const lastPackage = document.lastIndexOf('\\usepackage');
  if (lastPackage !== -1) {
    const lineEnd = document.indexOf('\n', lastPackage);
    const at = lineEnd === -1 ? document.length : lineEnd + 1;
    return document.slice(0, at) + block + document.slice(at);
  }

  return block + document;
}

/**
 * Does the document already ask for a list of listings?
 *
 * Used by the "List of Listings" toggle so it reflects reality rather than a
 * separate piece of state.
 */
export function hasListOfListings(document: string): boolean {
  return /\\(listoflistings|lstlistoflistings)\b/.test(document);
}

/** The command that prints a list of listings for the given engine. */
export function listOfListingsCommand(engine: ListingEngine): string {
  return engine === 'minted' ? '\\listoflistings' : '\\lstlistoflistings';
}
