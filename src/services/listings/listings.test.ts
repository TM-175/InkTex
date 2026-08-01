/**
 * Tests for the listing pipeline.
 *
 * The round-trip tests matter most: the parser has to understand LaTeX the
 * generator did not write (hand-authored listings), and regenerating a parsed
 * listing must not lose anything the user put there.
 */

import { describe, expect, it } from 'vitest';

import { defaultSpec, generateListing, suggestLabel } from './latexGenerator';
import { describeListing, listingAtOffset, parseListings, replaceListing } from './latexParser';
import { detectLanguage } from './languageDetect';
import { analysePreamble, applyPreamble, isPreambleSatisfied } from './preamble';
import {
  countLines,
  formatLineRanges,
  listingsHighlightExpression,
  parseLineRanges,
  toggleLine,
} from './lineRanges';
import { indexableExtensions, languageForFile } from './languages';

// ---------------------------------------------------------------------------
// Line ranges
// ---------------------------------------------------------------------------

describe('line ranges', () => {
  it('parses singles and ranges', () => {
    expect([...parseLineRanges('1,3-5,9')].sort((a, b) => a - b)).toEqual([1, 3, 4, 5, 9]);
    expect(parseLineRanges('').size).toBe(0);
    // A reversed range is tolerated rather than dropped.
    expect([...parseLineRanges('5-3')].sort((a, b) => a - b)).toEqual([3, 4, 5]);
  });

  it('collapses runs when formatting', () => {
    expect(formatLineRanges(new Set([1, 2, 3, 4]))).toBe('1-4');
    expect(formatLineRanges(new Set([1, 3, 5]))).toBe('1,3,5');
    // A run of two is written out; `3-4` is no shorter than `3,4`.
    expect(formatLineRanges(new Set([3, 4]))).toBe('3,4');
    expect(formatLineRanges(new Set())).toBe('');
  });

  it('round-trips', () => {
    for (const input of ['1', '1,5', '2-8', '1,3-5,9', '10-12,20']) {
      expect(formatLineRanges(parseLineRanges(input))).toBe(input);
    }
  });

  it('toggles individual lines', () => {
    // Filling the gap makes 1..3 contiguous, so it collapses to a range.
    expect(toggleLine('1,3', 2)).toBe('1-3');
    expect(toggleLine('1-3', 2)).toBe('1,3');
    expect(toggleLine('', 4)).toBe('4');
    expect(countLines('1,3-5')).toBe(4);
  });

  it('builds a listings highlight expression with collapsed runs', () => {
    const expression = listingsHighlightExpression('3,7-9', 'hl');

    expect(expression).toContain('\\ifnum\\value{lstnumber}=3');
    // The run 7-9 becomes one bounded test, not three.
    expect(expression).toContain('>6');
    expect(expression).toContain('<10');
    expect(listingsHighlightExpression('', 'hl')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

describe('LaTeX generation', () => {
  it('emits a captioned minted float', () => {
    const latex = generateListing(
      defaultSpec({
        engine: 'minted',
        language: 'rust',
        code: 'fn main() {}',
        caption: 'Hello',
        label: 'lst:hello',
        theme: 'monokai',
        highlightLines: '1',
      }),
    );

    expect(latex).toContain('\\begin{listing}[htbp]');
    expect(latex).toContain('\\begin{minted}');
    expect(latex).toContain('{rust}');
    expect(latex).toContain('style=monokai');
    expect(latex).toContain('highlightlines={1}');
    expect(latex).toContain('\\caption{Hello}');
    expect(latex).toContain('\\label{lst:hello}');
    expect(latex).toContain('\\end{listing}');
  });

  it('emits caption and label as options for the listings engine', () => {
    const latex = generateListing(
      defaultSpec({
        engine: 'listings',
        language: 'python',
        code: 'print(1)',
        caption: 'Snippet',
        label: 'lst:s',
      }),
    );

    expect(latex).toContain('\\begin{lstlisting}');
    expect(latex).toContain('language=Python');
    expect(latex).toContain('caption={Snippet}');
    expect(latex).toContain('label={lst:s}');
    expect(latex).toContain('float=htbp');
    // The float wrapper belongs to minted only.
    expect(latex).not.toContain('\\begin{listing}');
  });

  it('omits the float wrapper when there is nothing to caption', () => {
    const latex = generateListing(
      defaultSpec({ engine: 'minted', code: 'x = 1', caption: '', label: '' }),
    );
    expect(latex).not.toContain('\\begin{listing}');
    expect(latex.startsWith('\\begin{minted}')).toBe(true);
  });

  it('writes a readable source-link comment', () => {
    const latex = generateListing(
      defaultSpec({
        code: 'x',
        link: { path: 'src/main.rs', mode: 'region', region: 'core', hash: 'abc123', dedent: true },
      }),
    );

    expect(latex.split('\n')[0]).toBe(
      '% inktex-listing: source=src/main.rs mode=region region=core dedent=1 hash=abc123',
    );
  });

  it('suggests labels from captions and file names', () => {
    expect(suggestLabel('Binary Search Tree')).toBe('lst:binary-search-tree');
    expect(suggestLabel('src/parser.rs')).toBe('lst:src-parser');
    expect(suggestLabel('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Parsing and round-tripping
// ---------------------------------------------------------------------------

describe('LaTeX parsing', () => {
  it('round-trips a generated minted listing', () => {
    const original = defaultSpec({
      engine: 'minted',
      language: 'python',
      code: 'def f():\n    return 1',
      caption: 'A function',
      label: 'lst:f',
      theme: 'dracula',
      fontSize: 'small',
      frame: 'lines',
      lineNumbers: true,
      firstNumber: 10,
      highlightLines: '1,2',
      tabSize: 2,
    });

    const document = `\\begin{document}\n${generateListing(original)}\n\\end{document}`;
    const [parsed] = parseListings(document);

    expect(parsed).toBeDefined();
    const spec = parsed!.spec;

    expect(spec.engine).toBe('minted');
    expect(spec.language).toBe('python');
    expect(spec.code).toBe('def f():\n    return 1');
    expect(spec.caption).toBe('A function');
    expect(spec.label).toBe('lst:f');
    expect(spec.theme).toBe('dracula');
    expect(spec.fontSize).toBe('small');
    expect(spec.frame).toBe('lines');
    expect(spec.lineNumbers).toBe(true);
    expect(spec.firstNumber).toBe(10);
    expect(spec.highlightLines).toBe('1,2');
    expect(spec.tabSize).toBe(2);
  });

  it('round-trips a generated listings listing', () => {
    const original = defaultSpec({
      engine: 'listings',
      language: 'rust',
      code: 'fn main() {}',
      caption: 'Main',
      label: 'lst:main',
      theme: 'nord',
      lineNumbers: true,
    });

    const [parsed] = parseListings(generateListing(original));
    expect(parsed).toBeDefined();

    expect(parsed!.spec.engine).toBe('listings');
    expect(parsed!.spec.language).toBe('rust');
    expect(parsed!.spec.caption).toBe('Main');
    expect(parsed!.spec.label).toBe('lst:main');
    expect(parsed!.spec.theme).toBe('nord');
    expect(parsed!.spec.lineNumbers).toBe(true);
  });

  it('recovers a source link from the comment', () => {
    const latex = generateListing(
      defaultSpec({
        code: 'x = 1',
        link: {
          path: 'src/deep/mod with space.py',
          mode: 'range',
          firstLine: 10,
          lastLine: 20,
          hash: 'deadbeef',
          dedent: false,
        },
      }),
    );

    const [parsed] = parseListings(latex);
    const link = parsed!.spec.link;

    expect(link).not.toBeNull();
    expect(link!.path).toBe('src/deep/mod with space.py');
    expect(link!.mode).toBe('range');
    expect(link!.firstLine).toBe(10);
    expect(link!.lastLine).toBe(20);
    expect(link!.hash).toBe('deadbeef');
    expect(link!.dedent).toBe(false);
  });

  it('understands a hand-written listing it did not generate', () => {
    const document = String.raw`
\begin{minted}[linenos, fontsize=\tiny]{java}
class A {}
\end{minted}
`;

    const [parsed] = parseListings(document);

    expect(parsed).toBeDefined();
    expect(parsed!.spec.language).toBe('java');
    expect(parsed!.spec.lineNumbers).toBe(true);
    expect(parsed!.spec.fontSize).toBe('tiny');
    expect(parsed!.spec.code).toBe('class A {}');
    expect(parsed!.spec.link).toBeNull();
  });

  it('preserves options it does not recognise', () => {
    const document = String.raw`
\begin{minted}[linenos, escapeinside=||, mathescape]{python}
x = 1
\end{minted}
`;

    const [parsed] = parseListings(document);

    expect(parsed!.unknownOptions).toContain('escapeinside=||');
    expect(parsed!.unknownOptions).toContain('mathescape');
    // …and they survive regeneration.
    expect(generateListing(parsed!.spec)).toContain('mathescape');
  });

  it('finds several listings in order and locates one by offset', () => {
    const document = [
      'Intro',
      generateListing(defaultSpec({ code: 'a', language: 'c' })),
      'Middle',
      generateListing(defaultSpec({ engine: 'listings', code: 'b', language: 'go' })),
      'End',
    ].join('\n\n');

    const listings = parseListings(document);
    expect(listings).toHaveLength(2);
    expect(listings[0]!.start).toBeLessThan(listings[1]!.start);

    const inside = listings[1]!.start + 5;
    expect(listingAtOffset(listings, inside)).toBe(listings[1]);
    expect(listingAtOffset(listings, 0)).toBeNull();
  });

  it('replaces a listing in place without disturbing its surroundings', () => {
    const document = `before\n\n${generateListing(defaultSpec({ code: 'old', language: 'c' }))}\n\nafter`;
    const [parsed] = parseListings(document);

    const updated = replaceListing(document, parsed!, 'REPLACED');

    expect(updated.startsWith('before\n\n')).toBe(true);
    expect(updated.endsWith('\n\nafter')).toBe(true);
    expect(updated).toContain('REPLACED');
    expect(updated).not.toContain('old');
  });

  it('summarises listings for search results', () => {
    const [withCaption] = parseListings(
      generateListing(defaultSpec({ code: 'x', caption: 'Quicksort', language: 'python' })),
    );
    expect(describeListing(withCaption!)).toContain('Quicksort');

    const [bare] = parseListings(
      generateListing(defaultSpec({ code: 'int x = 1;', language: 'c' })),
    );
    expect(describeListing(bare!)).toContain('int x = 1;');
  });
});

// ---------------------------------------------------------------------------
// Language handling
// ---------------------------------------------------------------------------

describe('languages', () => {
  it('resolves languages from paths', () => {
    expect(languageForFile('src/main.rs')?.id).toBe('rust');
    expect(languageForFile('a/b/App.tsx')?.id).toBe('typescript');
    expect(languageForFile('Makefile')?.id).toBe('makefile');
    expect(languageForFile('notes.unknownext')).toBeUndefined();
  });

  it('excludes project documents from the index whitelist', () => {
    const extensions = indexableExtensions();
    expect(extensions).toContain('rs');
    expect(extensions).toContain('py');
    // `.tex` is the document being written, not a code asset.
    expect(extensions).not.toContain('tex');
  });

  it('detects languages from representative snippets', () => {
    const cases: [string, string][] = [
      ['fn main() {\n    let mut x = 1;\n    println!("{}", x);\n}', 'rust'],
      ['def solve(n):\n    return n * 2\n\nprint(solve(3))', 'python'],
      ['public class Main {\n  public static void main(String[] a) {\n    System.out.println(1);\n  }\n}', 'java'],
      ['package main\n\nfunc main() {\n\tif err != nil {\n\t}\n}', 'go'],
      ['#include <iostream>\nint main() { std::cout << 1; }', 'cpp'],
      ['SELECT id, name FROM users WHERE id = 1;', 'sql'],
      ['interface User { name: string; age: number }', 'typescript'],
    ];

    for (const [code, expected] of cases) {
      const result = detectLanguage(code);
      expect(result.language, `detecting: ${code.slice(0, 24)}`).toBe(expected);
      expect(result.confident).toBe(true);
    }
  });

  it('prefers the file name over content heuristics', () => {
    // Content looks like Python; the extension says otherwise and wins.
    expect(detectLanguage('print(1)', 'script.rb').language).toBe('ruby');
  });

  it('is not confident about ambiguous input', () => {
    const result = detectLanguage('hello world');
    expect(result.confident).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Preamble
// ---------------------------------------------------------------------------

describe('preamble management', () => {
  const document = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nx\n\\end{document}\n';

  it('requires minted and shell-escape for the minted engine', () => {
    const requirement = analysePreamble(document, [defaultSpec({ engine: 'minted' })]);

    expect(requirement.packages).toContain('\\usepackage{minted}');
    expect(requirement.needsShellEscape).toBe(true);
    expect(isPreambleSatisfied(requirement)).toBe(false);
  });

  it('adds a lstdefinelanguage block for languages listings lacks', () => {
    const requirement = analysePreamble(document, [
      defaultSpec({ engine: 'listings', language: 'rust' }),
    ]);

    expect(requirement.packages).toContain('\\usepackage{listings}');
    expect(requirement.definitions.some((d) => d.includes('\\lstdefinelanguage{Rust}'))).toBe(true);
    expect(requirement.definitions.some((d) => d.includes('\\lstdefinestyle'))).toBe(true);
    expect(requirement.needsShellEscape).toBe(false);
  });

  it('does not re-add packages the document already loads', () => {
    const withMinted = '\\documentclass{article}\n\\usepackage{minted}\n\\usepackage{xcolor}\n\\begin{document}\n\\end{document}';
    const requirement = analysePreamble(withMinted, [defaultSpec({ engine: 'minted' })]);

    expect(requirement.packages).toHaveLength(0);
  });

  it('recognises a package listed alongside others', () => {
    const combined = '\\usepackage{amsmath,minted,xcolor}\n\\begin{document}\n\\end{document}';
    expect(analysePreamble(combined, [defaultSpec({ engine: 'minted' })]).packages).toHaveLength(0);
  });

  it('inserts the block before \\begin{document}', () => {
    const requirement = analysePreamble(document, [defaultSpec({ engine: 'minted' })]);
    const updated = applyPreamble(document, requirement);

    expect(updated.indexOf('\\usepackage{minted}')).toBeLessThan(
      updated.indexOf('\\begin{document}'),
    );
    expect(updated).toContain('% >>> InkTex code listings');
  });

  it('is idempotent across repeated inserts', () => {
    const once = applyPreamble(document, analysePreamble(document, [defaultSpec()]));
    const twice = applyPreamble(once, analysePreamble(once, [defaultSpec()]));

    expect(twice).toBe(once);
    expect(twice.match(/\\usepackage\{minted\}/g)).toHaveLength(1);
  });

  it('extends an existing block rather than starting a second one', () => {
    const once = applyPreamble(document, analysePreamble(document, [defaultSpec()]));
    const withListings = applyPreamble(
      once,
      analysePreamble(once, [defaultSpec({ engine: 'listings', language: 'go' })]),
    );

    expect(withListings.match(/% >>> InkTex code listings/g)).toHaveLength(1);
    expect(withListings).toContain('\\usepackage{listings}');
    expect(withListings).toContain('\\lstdefinelanguage{Go}');
  });
});
