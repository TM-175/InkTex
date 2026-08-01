import { useMemo } from 'react';
import type { ListingSpec } from '@/types/listing';
import { themeById } from '@/services/listings/themes';
import { languageById } from '@/services/listings/languages';
import { parseLineRanges } from '@/services/listings/lineRanges';
import { cn } from '@/utils/cn';

/** Font-size command → an approximate on-screen size, for the preview only. */
const PREVIEW_SIZES: Record<ListingSpec['fontSize'], string> = {
  tiny: '0.5625rem',
  scriptsize: '0.625rem',
  footnotesize: '0.6875rem',
  small: '0.75rem',
  normalsize: '0.8125rem',
};

/** Token classes the crude preview tokenizer produces. */
type TokenKind = 'text' | 'keyword' | 'type' | 'string' | 'comment' | 'number';

interface Token {
  text: string;
  kind: TokenKind;
}

/**
 * A deliberately simple tokenizer, used only to colour the preview.
 *
 * It is not a parser and does not need to be: its job is to show what the
 * theme's keyword, string, comment and number colours look like together, so
 * approximate token boundaries are sufficient.
 */
function tokenize(line: string, lineComment: string | undefined): Token[] {
  if (lineComment !== undefined && line.trimStart().startsWith(lineComment)) {
    return [{ text: line, kind: 'comment' }];
  }

  const tokens: Token[] = [];
  // Strings, numbers, identifiers, then anything else.
  const pattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+|.)/g;

  const KEYWORDS = new Set([
    'fn', 'let', 'mut', 'const', 'return', 'if', 'else', 'for', 'while', 'match', 'impl',
    'struct', 'enum', 'pub', 'use', 'def', 'class', 'import', 'from', 'public', 'private',
    'static', 'void', 'int', 'function', 'var', 'new', 'package', 'func', 'type',
    'interface', 'export', 'async', 'await', 'in', 'as', 'self', 'this',
  ]);
  const TYPES = new Set([
    'String', 'Vec', 'Option', 'Result', 'usize', 'i32', 'u32', 'f64', 'bool', 'str',
    'Integer', 'Boolean', 'List', 'Map', 'number', 'string', 'boolean', 'Array',
  ]);

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    const [, string, number, word, other] = match;

    if (string !== undefined) tokens.push({ text: string, kind: 'string' });
    else if (number !== undefined) tokens.push({ text: number, kind: 'number' });
    else if (word !== undefined) {
      const kind: TokenKind = KEYWORDS.has(word)
        ? 'keyword'
        : TYPES.has(word)
          ? 'type'
          : 'text';
      tokens.push({ text: word, kind });
    } else if (other !== undefined) tokens.push({ text: other, kind: 'text' });
  }

  return tokens;
}

interface ThemePreviewProps {
  spec: ListingSpec;
  /** Lines to render; defaults to the spec's own code. */
  sample?: string;
  className?: string;
  /** Cap the rendered lines so the preview never grows unbounded. */
  maxLines?: number;
}

/**
 * Renders code the way the chosen theme will render it.
 *
 * Colours come from the same theme definition that generates the LaTeX, so for
 * the `listings` engine this is exact. For `minted` the palette belongs to
 * Pygments, and the preview is indicative — the caller labels it as such.
 */
export function ThemePreview({ spec, sample, className, maxLines = 14 }: ThemePreviewProps) {
  const theme = themeById(spec.theme);
  const language = languageById(spec.language);

  const source = (sample ?? spec.code).replace(/\s+$/, '');
  const highlighted = useMemo(
    () => parseLineRanges(spec.highlightLines),
    [spec.highlightLines],
  );

  const lines = useMemo(() => {
    const all = source === '' ? ['// nothing to preview yet'] : source.split('\n');
    return all.slice(0, maxLines);
  }, [source, maxLines]);

  const hiddenLines = Math.max(0, source.split('\n').length - lines.length);

  const frameStyle =
    spec.frame === 'none'
      ? {}
      : spec.frame === 'single'
        ? { border: `1px solid #${theme.colors.gutter}55` }
        : spec.frame === 'lines'
          ? {
              borderTop: `1px solid #${theme.colors.gutter}55`,
              borderBottom: `1px solid #${theme.colors.gutter}55`,
            }
          : spec.frame === 'leftline'
            ? { borderLeft: `2px solid #${theme.colors.gutter}55` }
            : spec.frame === 'topline'
              ? { borderTop: `1px solid #${theme.colors.gutter}55` }
              : { borderBottom: `1px solid #${theme.colors.gutter}55` };

  return (
    <div
      className={cn('overflow-hidden rounded-md', className)}
      style={{
        backgroundColor: `#${theme.colors.background}`,
        fontSize: PREVIEW_SIZES[spec.fontSize],
        ...frameStyle,
      }}
    >
      <pre className="overflow-x-auto p-2.5 font-mono leading-[1.5]">
        {lines.map((line, index) => {
          const displayed = index + spec.firstNumber;
          const isHighlighted = highlighted.has(displayed);

          return (
            <div
              key={index}
              className="flex"
              style={isHighlighted ? { backgroundColor: '#FFF3BF44' } : undefined}
            >
              {spec.lineNumbers && (
                <span
                  className="mr-2.5 inline-block shrink-0 text-right select-none"
                  style={{ color: `#${theme.colors.gutter}`, minWidth: '2ch' }}
                >
                  {displayed}
                </span>
              )}
              <span style={{ color: `#${theme.colors.text}` }}>
                {tokenize(line, language?.lineComment).map((token, tokenIndex) => (
                  <span
                    key={tokenIndex}
                    style={
                      token.kind === 'text'
                        ? undefined
                        : { color: `#${theme.colors[token.kind]}` }
                    }
                  >
                    {token.text}
                  </span>
                ))}
                {line === '' ? ' ' : ''}
              </span>
            </div>
          );
        })}

        {hiddenLines > 0 && (
          <div style={{ color: `#${theme.colors.comment}` }} className="pt-1 italic">
            … {hiddenLines} more line{hiddenLines === 1 ? '' : 's'}
          </div>
        )}
      </pre>
    </div>
  );
}
