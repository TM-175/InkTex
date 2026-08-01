/**
 * The LaTeX generator: `ListingSpec` → markup.
 *
 * Everything the visual tools do ends up here, so this is the file that decides
 * what the user's document actually contains. Two rules govern it:
 *
 * * **Nothing proprietary.** The only InkTex-specific artefact is one comment
 *   line recording the source link, which LaTeX ignores and a human can read.
 *   A document with the comment stripped still compiles identically.
 * * **Readable output.** Options break onto their own lines once there are
 *   more than a couple, because a user is going to read and hand-edit this.
 */

import type { ListingSpec, SourceLink } from '@/types/listing';
import { languageById } from './languages';
import { backgroundColorName, themeById, HIGHLIGHT_COLOR_NAME } from './themes';
import { listingsHighlightExpression } from './lineRanges';

/** Marker introducing the source-link comment. */
export const LINK_COMMENT_PREFIX = '% inktex-listing:';

/** Sensible starting point for a new listing. */
export function defaultSpec(overrides: Partial<ListingSpec> = {}): ListingSpec {
  return {
    engine: 'minted',
    language: 'python',
    code: '',
    caption: '',
    label: '',
    theme: 'inktex',
    fontSize: 'footnotesize',
    frame: 'single',
    lineNumbers: true,
    firstNumber: 1,
    highlightLines: '',
    float: true,
    placement: 'htbp',
    breakLines: true,
    tabSize: 4,
    background: false,
    customOptions: '',
    link: null,
    ...overrides,
  };
}

/** Quote a value for the key=value comment only if it needs it. */
function quoteMetaValue(value: string): string {
  return /[\s"=]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/**
 * Serialise a source link as one readable comment line.
 *
 * Example:
 * `% inktex-listing: source=src/parser.rs mode=region region=tokenize hash=3f9a…`
 */
export function formatLinkComment(link: SourceLink): string {
  const parts = [`source=${quoteMetaValue(link.path)}`, `mode=${link.mode}`];

  if (link.mode === 'range' && link.firstLine !== undefined && link.lastLine !== undefined) {
    parts.push(`lines=${link.firstLine}-${link.lastLine}`);
  }
  if (link.mode === 'region' && link.region !== undefined) {
    parts.push(`region=${quoteMetaValue(link.region)}`);
  }
  if (link.dedent) parts.push('dedent=1');

  parts.push(`hash=${link.hash}`);
  return `${LINK_COMMENT_PREFIX} ${parts.join(' ')}`;
}

/** Escape a value going into a `caption={…}` style option. */
function optionValue(value: string): string {
  return `{${value}}`;
}

/** Assemble an option list, breaking onto multiple lines when long. */
function renderOptions(options: string[]): string {
  if (options.length === 0) return '';
  // Short lists stay inline; long ones become one option per line so the
  // generated LaTeX is comfortable to read and edit by hand.
  const inline = options.join(', ');
  if (options.length <= 3 && inline.length <= 72) return `[${inline}]`;

  return `[\n  ${options.join(',\n  ')},\n]`;
}

/** Options for a `minted` environment. */
function mintedOptions(spec: ListingSpec): string[] {
  const options: string[] = [`style=${themePygments(spec.theme)}`];

  options.push(`fontsize=\\${spec.fontSize}`);
  if (spec.frame !== 'none') options.push(`frame=${spec.frame}`);
  if (spec.lineNumbers) options.push('linenos');
  if (spec.lineNumbers && spec.firstNumber !== 1) {
    options.push(`firstnumber=${spec.firstNumber}`);
  }
  if (spec.highlightLines !== '') {
    options.push(`highlightlines={${spec.highlightLines}}`);
  }
  if (spec.breakLines) options.push('breaklines');
  if (spec.tabSize !== 8) options.push(`tabsize=${spec.tabSize}`);
  if (spec.background) options.push(`bgcolor=${backgroundColorName(spec.theme)}`);

  appendCustom(options, spec.customOptions);
  return options;
}

/** Options for an `lstlisting` environment. */
function listingsOptions(spec: ListingSpec, forFloat: boolean): string[] {
  const language = languageById(spec.language);
  const options: string[] = [`style=inktex${spec.theme.replace(/[^a-zA-Z]/g, '')}`];

  if (language !== undefined && language.listings !== '') {
    options.push(`language=${language.listings}`);
  }
  options.push(`basicstyle=\\ttfamily\\${spec.fontSize}`);

  if (spec.frame !== 'none') options.push(`frame=${spec.frame}`);
  if (spec.lineNumbers) {
    options.push('numbers=left', 'numbersep=8pt');
    if (spec.firstNumber !== 1) options.push(`firstnumber=${spec.firstNumber}`);
  }
  if (spec.breakLines) options.push('breaklines=true');
  options.push(`tabsize=${spec.tabSize}`);

  if (spec.background) {
    options.push(`backgroundcolor=\\color{${backgroundColorName(spec.theme)}}`);
  }

  // `listings` has no highlightlines; generate the equivalent conditional.
  const highlight = listingsHighlightExpression(spec.highlightLines, HIGHLIGHT_COLOR_NAME);
  if (highlight !== null) {
    options.push(`linebackgroundcolor={%\n    ${highlight}%\n  }`);
  }

  // Caption and label are options here rather than separate commands.
  if (spec.caption !== '') options.push(`caption=${optionValue(spec.caption)}`);
  if (spec.label !== '') options.push(`label=${optionValue(spec.label)}`);
  if (forFloat) options.push(`float=${spec.placement}`);

  appendCustom(options, spec.customOptions);
  return options;
}

/** Split a user-supplied option string on top-level commas and append it. */
function appendCustom(options: string[], custom: string): void {
  if (custom.trim() === '') return;

  for (const option of splitTopLevel(custom)) {
    const trimmed = option.trim();
    if (trimmed !== '') options.push(trimmed);
  }
}

/**
 * Split on commas that are not inside braces or brackets.
 *
 * Naive splitting would break `highlightlines={1,3}` in half.
 */
export function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of input) {
    if (character === '{' || character === '[') depth += 1;
    else if (character === '}' || character === ']') depth = Math.max(0, depth - 1);

    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }

  if (current.trim() !== '') parts.push(current);
  return parts;
}

/** Pygments style name for a theme id. */
function themePygments(themeId: string): string {
  return themeById(themeId).pygments;
}

/**
 * Render a spec as LaTeX.
 *
 * The result always ends without a trailing newline; the caller decides how it
 * joins the surrounding document.
 */
export function generateListing(spec: ListingSpec): string {
  const lines: string[] = [];

  if (spec.link !== null) lines.push(formatLinkComment(spec.link));

  const code = spec.code.replace(/\s+$/, '');
  const wantsCaption = spec.caption !== '' || spec.label !== '';

  if (spec.engine === 'minted') {
    const body = [
      `\\begin{minted}${renderOptions(mintedOptions(spec))}{${mintedLexer(spec.language)}}`,
      code,
      '\\end{minted}',
    ];

    // minted's own `listing` float carries the caption; without a float the
    // caption would have nowhere to attach.
    if (spec.float && wantsCaption) {
      lines.push(`\\begin{listing}[${spec.placement}]`);
      lines.push(...body);
      if (spec.caption !== '') lines.push(`\\caption{${spec.caption}}`);
      if (spec.label !== '') lines.push(`\\label{${spec.label}}`);
      lines.push('\\end{listing}');
    } else {
      lines.push(...body);
    }
  } else {
    const forFloat = spec.float && wantsCaption;
    lines.push(`\\begin{lstlisting}${renderOptions(listingsOptions(spec, forFloat))}`);
    lines.push(code);
    lines.push('\\end{lstlisting}');
  }

  return lines.join('\n');
}

/** Pygments lexer for a language id, falling back to the id itself. */
export function mintedLexer(languageId: string): string {
  return languageById(languageId)?.minted ?? languageId;
}

/**
 * A label suggestion derived from a caption or file name.
 *
 * Follows the `lst:` convention so `\ref` reads naturally and the label sorts
 * with other listings.
 */
export function suggestLabel(seed: string): string {
  const slug = seed
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return slug === '' ? '' : `lst:${slug}`;
}
