/**
 * The listing parser: LaTeX → `ListingSpec`.
 *
 * This is what lets the visual tools operate on a document they did not write.
 * A `minted` or `lstlisting` environment typed by hand — or by a collaborator
 * in a different editor — is found, understood, and editable in the inspector
 * exactly like one InkTex generated.
 *
 * Options the parser does not recognise are preserved verbatim in
 * `unknownOptions` and written back on regeneration, so round-tripping never
 * silently drops something the user added.
 */

import type {
  ImportMode,
  ListingEngine,
  ListingFontSize,
  ListingFrame,
  ListingSpec,
  ParsedListing,
  SourceLink,
} from '@/types/listing';
import { LANGUAGES, languageById } from './languages';
import { THEMES } from './themes';
import { defaultSpec, splitTopLevel, LINK_COMMENT_PREFIX } from './latexGenerator';

/** Options the generator emits and therefore knows how to reconstruct. */
const KNOWN_OPTIONS = new Set([
  'style', 'fontsize', 'basicstyle', 'frame', 'linenos', 'numbers', 'numbersep',
  'firstnumber', 'highlightlines', 'breaklines', 'tabsize', 'bgcolor',
  'backgroundcolor', 'linebackgroundcolor', 'caption', 'label', 'float', 'language',
]);

const FONT_SIZES: ListingFontSize[] = [
  'tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize',
];

const FRAMES: ListingFrame[] = [
  'none', 'lines', 'single', 'leftline', 'topline', 'bottomline',
];

/** Strip one layer of surrounding braces. */
function unwrap(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}')
    ? trimmed.slice(1, -1)
    : trimmed;
}

/** Parse `key=value, flag, key={a,b}` into a map plus a list of bare flags. */
export function parseOptions(input: string): {
  values: Map<string, string>;
  flags: Set<string>;
  order: string[];
} {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const order: string[] = [];

  for (const part of splitTopLevel(input)) {
    const trimmed = part.trim();
    if (trimmed === '') continue;

    const equals = trimmed.indexOf('=');
    // A `=` inside braces belongs to the value, not the key.
    const braceStart = trimmed.indexOf('{');
    const isAssignment = equals !== -1 && (braceStart === -1 || equals < braceStart);

    if (isAssignment) {
      const key = trimmed.slice(0, equals).trim().toLowerCase();
      values.set(key, trimmed.slice(equals + 1).trim());
      order.push(key);
    } else {
      flags.add(trimmed.toLowerCase());
      order.push(trimmed.toLowerCase());
    }
  }

  return { values, flags, order };
}

/** Recover the source link from an `% inktex-listing:` comment. */
export function parseLinkComment(comment: string): SourceLink | null {
  const body = comment.slice(comment.indexOf(':') + 1).trim();
  const fields = new Map<string, string>();

  // Split on whitespace, but keep quoted values together.
  const token = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = token.exec(body)) !== null) {
    const raw = match[2]!;
    const value = raw.startsWith('"')
      ? raw.slice(1, -1).replace(/\\"/g, '"')
      : raw;
    fields.set(match[1]!, value);
  }

  const path = fields.get('source');
  const hash = fields.get('hash');
  if (path === undefined || hash === undefined) return null;

  const mode = (fields.get('mode') ?? 'whole') as ImportMode;
  const link: SourceLink = { path, mode, hash, dedent: fields.get('dedent') === '1' };

  const lines = fields.get('lines');
  if (lines !== undefined) {
    const range = /^(\d+)-(\d+)$/.exec(lines);
    if (range !== null) {
      link.firstLine = Number(range[1]);
      link.lastLine = Number(range[2]);
    }
  }

  const region = fields.get('region');
  if (region !== undefined) link.region = region;

  return link;
}

/** Map a `listings` language name back to a registry id. */
function languageFromListings(name: string): string | undefined {
  const clean = unwrap(name).trim().toLowerCase();
  return LANGUAGES.find((language) => language.listings.toLowerCase() === clean)?.id;
}

/** Map a Pygments lexer back to a registry id. */
function languageFromMinted(lexer: string): string {
  const clean = lexer.trim().toLowerCase();
  return LANGUAGES.find((language) => language.minted === clean)?.id ?? clean;
}

/** Map a Pygments style or `lstdefinestyle` name back to a theme id. */
function themeFromOption(value: string | undefined, engine: ListingEngine): string {
  if (value === undefined) return 'inktex';
  const clean = unwrap(value).trim();

  if (engine === 'listings') {
    const match = /^inktex(.+)$/i.exec(clean);
    if (match !== null) {
      const suffix = match[1]!.toLowerCase();
      const theme = THEMES.find((candidate) => candidate.id.replace(/[^a-z]/g, '') === suffix);
      if (theme !== undefined) return theme.id;
    }
    return 'inktex';
  }

  return THEMES.find((theme) => theme.pygments === clean)?.id ?? 'inktex';
}

/** Extract a `\fontsize`-style size command from `basicstyle` or `fontsize`. */
function fontSizeFrom(values: Map<string, string>): ListingFontSize {
  const raw = values.get('fontsize') ?? values.get('basicstyle') ?? '';

  for (const size of FONT_SIZES) {
    if (raw.includes(`\\${size}`)) return size;
  }
  return 'footnotesize';
}

/**
 * Find the environment body bounded by `\begin{name}` … `\end{name}`.
 *
 * Returns the offsets of the body and of the whole environment. Nesting is not
 * a concern: neither `minted` nor `lstlisting` may contain itself.
 */
function findEnvironment(
  text: string,
  name: string,
  from: number,
): { optionsStart: number; bodyStart: number; bodyEnd: number; end: number } | null {
  const begin = text.indexOf(`\\begin{${name}}`, from);
  if (begin === -1) return null;

  const end = text.indexOf(`\\end{${name}}`, begin);
  if (end === -1) return null;

  return {
    optionsStart: begin + `\\begin{${name}}`.length,
    bodyStart: begin,
    bodyEnd: end,
    end: end + `\\end{${name}}`.length,
  };
}

/** Read a bracketed optional argument starting at `index`, if present. */
function readOptional(text: string, index: number): { content: string; next: number } {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor]!)) cursor += 1;

  if (text[cursor] !== '[') return { content: '', next: index };

  let depth = 0;
  for (let scan = cursor; scan < text.length; scan += 1) {
    const character = text[scan]!;
    if (character === '[' || character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    else if (character === ']') {
      depth -= 1;
      if (depth === 0) {
        return { content: text.slice(cursor + 1, scan), next: scan + 1 };
      }
    }
  }
  return { content: '', next: index };
}

/** Read a `{…}` group starting at `index`. */
function readGroup(text: string, index: number): { content: string; next: number } {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor]!)) cursor += 1;
  if (text[cursor] !== '{') return { content: '', next: index };

  let depth = 0;
  for (let scan = cursor; scan < text.length; scan += 1) {
    if (text[scan] === '{') depth += 1;
    else if (text[scan] === '}') {
      depth -= 1;
      if (depth === 0) return { content: text.slice(cursor + 1, scan), next: scan + 1 };
    }
  }
  return { content: '', next: index };
}

/** Look backwards from `offset` for an enclosing `\begin{listing}[…]`. */
function findEnclosingFloat(
  text: string,
  offset: number,
): { start: number; placement: string } | null {
  const begin = text.lastIndexOf('\\begin{listing}', offset);
  if (begin === -1) return null;

  // Only counts if no `\end{listing}` intervenes.
  const closed = text.lastIndexOf('\\end{listing}', offset);
  if (closed > begin) return null;

  const optional = readOptional(text, begin + '\\begin{listing}'.length);
  return { start: begin, placement: optional.content || 'htbp' };
}

/** Capture `\caption{…}` and `\label{…}` between two offsets. */
function readFloatMetadata(text: string, from: number, to: number): {
  caption: string;
  label: string;
} {
  const region = text.slice(from, to);
  let caption = '';
  let label = '';

  const captionAt = region.indexOf('\\caption');
  if (captionAt !== -1) {
    caption = readGroup(region, captionAt + '\\caption'.length).content;
  }
  const labelAt = region.indexOf('\\label');
  if (labelAt !== -1) {
    label = readGroup(region, labelAt + '\\label'.length).content;
  }

  return { caption, label };
}

/** The link comment immediately above `offset`, if there is one. */
function readLinkComment(text: string, offset: number): { link: SourceLink | null; start: number } {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const previousEnd = lineStart - 1;
  if (previousEnd <= 0) return { link: null, start: offset };

  const previousStart = text.lastIndexOf('\n', previousEnd - 1) + 1;
  const previousLine = text.slice(previousStart, previousEnd).trim();

  if (!previousLine.startsWith(LINK_COMMENT_PREFIX)) return { link: null, start: offset };

  return { link: parseLinkComment(previousLine), start: previousStart };
}

/** Line number (1-based) of a character offset. */
function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index += 1) {
    if (text[index] === '\n') line += 1;
  }
  return line;
}

/** Build a spec from one environment's options and body. */
function specFrom(
  engine: ListingEngine,
  optionText: string,
  lexerOrLanguage: string,
  code: string,
): { spec: ListingSpec; unknown: string[] } {
  const { values, flags, order } = parseOptions(optionText);

  const unknown = order
    .filter((key) => !KNOWN_OPTIONS.has(key))
    .map((key) => (values.has(key) ? `${key}=${values.get(key)}` : key));

  const frameRaw = unwrap(values.get('frame') ?? 'none');
  const frame = (FRAMES as string[]).includes(frameRaw)
    ? (frameRaw as ListingFrame)
    : 'none';

  const language =
    engine === 'minted'
      ? languageFromMinted(lexerOrLanguage)
      : (languageFromListings(values.get('language') ?? '') ?? 'text');

  const lineNumbers =
    engine === 'minted'
      ? flags.has('linenos') || values.get('linenos') === 'true'
      : (values.get('numbers') ?? 'none') !== 'none';

  const spec = defaultSpec({
    engine,
    language,
    code,
    theme: themeFromOption(values.get('style'), engine),
    fontSize: fontSizeFrom(values),
    frame,
    lineNumbers,
    firstNumber: Number(unwrap(values.get('firstnumber') ?? '1')) || 1,
    highlightLines: unwrap(values.get('highlightlines') ?? ''),
    breakLines: flags.has('breaklines') || (values.get('breaklines') ?? '') === 'true',
    tabSize: Number(unwrap(values.get('tabsize') ?? '4')) || 4,
    background: values.has('bgcolor') || values.has('backgroundcolor'),
    caption: unwrap(values.get('caption') ?? ''),
    label: unwrap(values.get('label') ?? ''),
    float: values.has('float'),
    placement: unwrap(values.get('float') ?? 'htbp') || 'htbp',
    customOptions: unknown.join(', '),
  });

  return { spec, unknown };
}

/**
 * Find every code listing in a document.
 *
 * Results are ordered by position, so the inspector can locate the listing
 * containing the cursor with a simple scan.
 */
export function parseListings(text: string): ParsedListing[] {
  const listings: ParsedListing[] = [];

  for (const [engine, environment] of [
    ['minted', 'minted'],
    ['listings', 'lstlisting'],
  ] as const) {
    let cursor = 0;

    for (;;) {
      const found = findEnvironment(text, environment, cursor);
      if (found === null) break;
      cursor = found.end;

      const optional = readOptional(text, found.optionsStart);

      // minted takes a mandatory `{lexer}` after its options.
      let lexer = '';
      let codeStart = optional.next;
      if (engine === 'minted') {
        const group = readGroup(text, optional.next);
        lexer = group.content;
        codeStart = group.next;
      }

      // The body starts after the newline that ends the \begin line.
      const newline = text.indexOf('\n', codeStart);
      const bodyStart = newline === -1 ? codeStart : newline + 1;
      const code = text.slice(bodyStart, found.bodyEnd).replace(/\n[ \t]*$/, '');

      const { spec, unknown } = specFrom(engine, optional.content, lexer, code);

      // A surrounding float supplies caption, label and placement for minted.
      let start = found.bodyStart;
      let end = found.end;

      const float = findEnclosingFloat(text, found.bodyStart);
      if (float !== null) {
        const closing = text.indexOf('\\end{listing}', found.end);
        if (closing !== -1) {
          const metadata = readFloatMetadata(text, found.end, closing);
          spec.float = true;
          spec.placement = float.placement;
          if (metadata.caption !== '') spec.caption = metadata.caption;
          if (metadata.label !== '') spec.label = metadata.label;

          start = float.start;
          end = closing + '\\end{listing}'.length;
        }
      }

      const comment = readLinkComment(text, start);
      spec.link = comment.link;

      listings.push({
        spec,
        start: comment.start,
        end,
        line: lineAt(text, comment.start),
        unknownOptions: unknown,
      });
    }
  }

  listings.sort((a, b) => a.start - b.start);
  return listings;
}

/** The listing containing a character offset, if any. */
export function listingAtOffset(
  listings: readonly ParsedListing[],
  offset: number,
): ParsedListing | null {
  return listings.find((listing) => offset >= listing.start && offset <= listing.end) ?? null;
}

/** Replace one listing's LaTeX in a document, returning the new text. */
export function replaceListing(
  text: string,
  listing: ParsedListing,
  replacement: string,
): string {
  return text.slice(0, listing.start) + replacement + text.slice(listing.end);
}

/** Human-readable summary for the search results and inspector header. */
export function describeListing(listing: ParsedListing): string {
  const { spec } = listing;
  const language = languageById(spec.language)?.label ?? spec.language;

  if (spec.caption !== '') return `${spec.caption} — ${language}`;
  if (spec.link !== null) return `${spec.link.path} — ${language}`;

  const firstLine = spec.code.split('\n').find((line) => line.trim() !== '') ?? '';
  return firstLine.trim().slice(0, 60) || `${language} listing`;
}
