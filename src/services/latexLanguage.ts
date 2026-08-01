/**
 * LaTeX language support for Monaco: tokenizer, bracket/comment configuration,
 * folding, and completion backed by {@link SNIPPETS}.
 *
 * Monaco ships no LaTeX grammar, so the Monarch definition below is ours. It
 * distinguishes control sequences, math mode, environment names, comments and
 * the arguments of reference-like commands, which is what the two colour
 * themes in this file are written against.
 */

// Typed against the API surface `monacoSetup.ts` actually loads, not the full
// `monaco-editor` module (which also declares the language services we omit).
import type * as Monaco from 'monaco-editor/editor/editor.api';
import { SNIPPETS } from './snippets';

export const LATEX_LANGUAGE_ID = 'latex';
export const BIBTEX_LANGUAGE_ID = 'bibtex';

export const DARK_THEME_ID = 'inktex-dark';
export const LIGHT_THEME_ID = 'inktex-light';

/** Monarch tokenizer for LaTeX. */
const latexTokenizer: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.tex',

  // Commands that take a label/reference key worth colouring distinctly.
  referenceCommands: /(?:ref|eqref|pageref|autoref|cref|Cref|label|cite|citep|citet|nocite|bibitem)/,

  tokenizer: {
    root: [
      // Comments run to end of line, but `\%` is an escaped percent sign.
      [/(^|[^\\])(%.*$)/, ['', 'comment']],
      [/^%.*$/, 'comment'],

      // \begin{env} / \end{env} — the environment name is highlighted apart
      // from the command so blocks are easy to scan.
      [/(\\(?:begin|end))(\s*)(\{)([^}]*)(\})/, ['keyword.control', '', 'delimiter.curly', 'type.identifier', 'delimiter.curly']],

      // \ref{...}, \cite{...}, \label{...}
      [/(\\@referenceCommands\*?)(\s*)(\{)/, ['keyword.reference', '', { token: 'delimiter.curly', next: '@referenceArgument' }]],

      // Sectioning commands.
      [/\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?/, 'keyword.section'],

      // Preamble commands.
      [/\\(?:documentclass|usepackage|input|include|includeonly|bibliography|bibliographystyle|addbibresource|newcommand|renewcommand|providecommand|newenvironment|renewenvironment|DeclareMathOperator|definecolor)\*?/, 'keyword.preamble'],

      // Display math delimiters.
      [/\\\[/, { token: 'delimiter.math', next: '@displayMath' }],
      [/\$\$/, { token: 'delimiter.math', next: '@displayMathDollar' }],
      [/\\\(/, { token: 'delimiter.math', next: '@inlineMathParen' }],
      [/\$/, { token: 'delimiter.math', next: '@inlineMath' }],

      // Escaped characters must be matched before the generic command rule so
      // `\%` and `\$` do not start a comment or math mode.
      [/\\[\\{}$&#^_%~]/, 'string.escape'],

      // Any other control sequence.
      [/\\[a-zA-Z@]+\*?/, 'keyword'],
      [/\\./, 'string.escape'],

      // Grouping and options.
      [/[{}]/, 'delimiter.curly'],
      [/[[\]]/, 'delimiter.square'],
      [/&/, 'delimiter.alignment'],
      [/~/, 'string.escape'],
    ],

    referenceArgument: [
      [/[^}]+/, 'variable.reference'],
      [/\}/, { token: 'delimiter.curly', next: '@pop' }],
    ],

    displayMath: [
      [/\\\]/, { token: 'delimiter.math', next: '@pop' }],
      { include: '@mathContent' },
    ],

    displayMathDollar: [
      [/\$\$/, { token: 'delimiter.math', next: '@pop' }],
      { include: '@mathContent' },
    ],

    inlineMathParen: [
      [/\\\)/, { token: 'delimiter.math', next: '@pop' }],
      { include: '@mathContent' },
    ],

    inlineMath: [
      [/\$/, { token: 'delimiter.math', next: '@pop' }],
      { include: '@mathContent' },
    ],

    // Shared body of every math mode.
    mathContent: [
      [/(^|[^\\])(%.*$)/, ['', 'comment']],
      [/\\[\\{}$&#^_%~]/, 'string.escape'],
      [/\\[a-zA-Z@]+\*?/, 'keyword.math'],
      [/[{}]/, 'delimiter.curly'],
      [/[0-9]+(?:\.[0-9]+)?/, 'number'],
      [/[_^]/, 'delimiter.math'],
      [/./, 'string.math'],
    ],
  },
};

/** Brackets, comments, auto-closing and folding behaviour. */
const latexConfiguration: Monaco.languages.LanguageConfiguration = {
  comments: { lineComment: '%' },

  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],

  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '$', close: '$' },
    { open: '`', close: "'" },
  ],

  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '$', close: '$' },
  ],

  // Fold on environments; Monaco's marker folding pairs these by nesting.
  folding: {
    markers: {
      start: /\\begin\{[^}]*\}/,
      end: /\\end\{[^}]*\}/,
    },
  },

  // Indent the body of an environment automatically.
  onEnterRules: [
    {
      beforeText: /\\begin\{([^}]*)\}\s*$/,
      afterText: /^\s*\\end\{/,
      action: { indentAction: 3 /* IndentAction.IndentOutdent */ },
    },
    {
      beforeText: /\\begin\{([^}]*)\}\s*$/,
      action: { indentAction: 1 /* IndentAction.Indent */ },
    },
  ],

  wordPattern: /(-?\d*\.\d\w*)|(\\?[^\s`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?]+)/g,
};

/** Minimal BibTeX grammar — enough to make `.bib` files readable. */
const bibtexTokenizer: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.bib',

  tokenizer: {
    root: [
      [/%.*$/, 'comment'],
      [/(@[a-zA-Z]+)(\s*)(\{)/, ['keyword', '', 'delimiter.curly']],
      [/[a-zA-Z][a-zA-Z0-9_-]*(?=\s*=)/, 'attribute.name'],
      [/=/, 'operator'],
      [/"/, { token: 'string.quote', next: '@quotedString' }],
      [/\{/, { token: 'delimiter.curly', next: '@bracedValue' }],
      [/\}/, 'delimiter.curly'],
      [/[0-9]+/, 'number'],
      [/,/, 'delimiter'],
    ],
    quotedString: [
      [/[^"]+/, 'string'],
      [/"/, { token: 'string.quote', next: '@pop' }],
    ],
    bracedValue: [
      [/[^{}]+/, 'string'],
      [/\{/, { token: 'delimiter.curly', next: '@bracedValue' }],
      [/\}/, { token: 'delimiter.curly', next: '@pop' }],
    ],
  },
};

/**
 * Colour themes.
 *
 * Both are tuned so the two things a LaTeX author scans for — control
 * sequences and math — read as distinct hues, while prose stays high-contrast
 * and unsaturated.
 */
const DARK_RULES: Monaco.editor.ITokenThemeRule[] = [
  { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
  { token: 'keyword', foreground: '818cf8' },
  { token: 'keyword.control', foreground: 'f472b6' },
  { token: 'keyword.section', foreground: 'fbbf24', fontStyle: 'bold' },
  { token: 'keyword.preamble', foreground: 'c084fc' },
  { token: 'keyword.reference', foreground: '38bdf8' },
  { token: 'keyword.math', foreground: '5eead4' },
  { token: 'type.identifier', foreground: 'facc15' },
  { token: 'variable.reference', foreground: '7dd3fc', fontStyle: 'italic' },
  { token: 'delimiter.curly', foreground: '94a3b8' },
  { token: 'delimiter.square', foreground: '94a3b8' },
  { token: 'delimiter.math', foreground: '2dd4bf' },
  { token: 'delimiter.alignment', foreground: 'f472b6' },
  { token: 'string.escape', foreground: 'fda4af' },
  { token: 'string.math', foreground: 'a7f3d0' },
  { token: 'string', foreground: '86efac' },
  { token: 'string.quote', foreground: '4ade80' },
  { token: 'number', foreground: 'fbbf24' },
  { token: 'attribute.name', foreground: '93c5fd' },
  { token: 'operator', foreground: '94a3b8' },
];

const LIGHT_RULES: Monaco.editor.ITokenThemeRule[] = [
  { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
  { token: 'keyword', foreground: '4f46e5' },
  { token: 'keyword.control', foreground: 'be185d' },
  { token: 'keyword.section', foreground: 'b45309', fontStyle: 'bold' },
  { token: 'keyword.preamble', foreground: '7e22ce' },
  { token: 'keyword.reference', foreground: '0369a1' },
  { token: 'keyword.math', foreground: '0f766e' },
  { token: 'type.identifier', foreground: 'a16207' },
  { token: 'variable.reference', foreground: '0284c7', fontStyle: 'italic' },
  { token: 'delimiter.curly', foreground: '64748b' },
  { token: 'delimiter.square', foreground: '64748b' },
  { token: 'delimiter.math', foreground: '0d9488' },
  { token: 'delimiter.alignment', foreground: 'be185d' },
  { token: 'string.escape', foreground: 'be123c' },
  { token: 'string.math', foreground: '115e59' },
  { token: 'string', foreground: '15803d' },
  { token: 'string.quote', foreground: '166534' },
  { token: 'number', foreground: 'b45309' },
  { token: 'attribute.name', foreground: '1d4ed8' },
  { token: 'operator', foreground: '64748b' },
];

const DARK_COLORS: Monaco.editor.IColors = {
  'editor.background': '#0f1116',
  'editor.foreground': '#e2e8f0',
  'editorLineNumber.foreground': '#3f4655',
  'editorLineNumber.activeForeground': '#94a3b8',
  'editor.selectionBackground': '#2a3350',
  'editor.inactiveSelectionBackground': '#20263c',
  'editor.lineHighlightBackground': '#161a23',
  'editorCursor.foreground': '#818cf8',
  'editorWhitespace.foreground': '#2b3040',
  'editorIndentGuide.background1': '#232838',
  'editorIndentGuide.activeBackground1': '#3d4660',
  'editorGutter.background': '#0f1116',
  'editorWidget.background': '#161a23',
  'editorWidget.border': '#272c3a',
  'editorSuggestWidget.background': '#161a23',
  'editorSuggestWidget.border': '#272c3a',
  'editorSuggestWidget.selectedBackground': '#2a3350',
  'editorHoverWidget.background': '#161a23',
  'editorBracketMatch.background': '#2a335080',
  'editorBracketMatch.border': '#818cf8',
  'scrollbarSlider.background': '#2b304060',
  'scrollbarSlider.hoverBackground': '#3d466680',
  'scrollbarSlider.activeBackground': '#4c5680a0',
  'minimap.background': '#0f1116',
};

const LIGHT_COLORS: Monaco.editor.IColors = {
  'editor.background': '#ffffff',
  'editor.foreground': '#1e293b',
  'editorLineNumber.foreground': '#cbd5e1',
  'editorLineNumber.activeForeground': '#475569',
  'editor.selectionBackground': '#c7d2fe',
  'editor.lineHighlightBackground': '#f1f5f9',
  'editorCursor.foreground': '#4f46e5',
  'editorIndentGuide.background1': '#e2e8f0',
  'editorIndentGuide.activeBackground1': '#cbd5e1',
  'editorWidget.background': '#ffffff',
  'editorWidget.border': '#e2e8f0',
  'editorBracketMatch.background': '#c7d2fe80',
  'editorBracketMatch.border': '#4f46e5',
};

/** Completion items derived from the shared snippet list. */
function snippetCompletions(
  monaco: typeof Monaco,
  range: Monaco.IRange,
): Monaco.languages.CompletionItem[] {
  return SNIPPETS.map((snippet) => ({
    label: snippet.label,
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: snippet.body,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: { value: `**${snippet.label}** — ${snippet.description}` },
    detail: 'InkTex snippet',
    range,
  }));
}

/** Frequently used commands offered alongside snippets. */
const COMMON_COMMANDS = [
  'textbf', 'textit', 'texttt', 'emph', 'underline', 'textsc',
  'frac', 'sqrt', 'sum', 'prod', 'int', 'lim', 'infty',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'sigma', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Sigma', 'Omega',
  'left', 'right', 'quad', 'qquad', 'hspace', 'vspace', 'newpage', 'clearpage',
  'centering', 'caption', 'label', 'ref', 'cite', 'footnote', 'item',
  'includegraphics', 'input', 'include', 'usepackage', 'documentclass',
  'mathbb', 'mathcal', 'mathbf', 'mathrm', 'text',
];

function commandCompletions(
  monaco: typeof Monaco,
  range: Monaco.IRange,
): Monaco.languages.CompletionItem[] {
  return COMMON_COMMANDS.map((name) => ({
    label: `\\${name}`,
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: name,
    detail: 'LaTeX command',
    range,
  }));
}

let registered = false;

/**
 * Register languages, themes and providers. Safe to call more than once;
 * Monaco throws if a language id is registered twice.
 */
export function registerLatexLanguage(monaco: typeof Monaco): void {
  if (registered) return;
  registered = true;

  monaco.languages.register({
    id: LATEX_LANGUAGE_ID,
    extensions: ['.tex', '.ltx', '.latex', '.sty', '.cls', '.clo', '.def'],
    aliases: ['LaTeX', 'latex', 'TeX'],
  });
  monaco.languages.setMonarchTokensProvider(LATEX_LANGUAGE_ID, latexTokenizer);
  monaco.languages.setLanguageConfiguration(LATEX_LANGUAGE_ID, latexConfiguration);

  monaco.languages.register({
    id: BIBTEX_LANGUAGE_ID,
    extensions: ['.bib', '.bst'],
    aliases: ['BibTeX', 'bibtex'],
  });
  monaco.languages.setMonarchTokensProvider(BIBTEX_LANGUAGE_ID, bibtexTokenizer);
  monaco.languages.setLanguageConfiguration(BIBTEX_LANGUAGE_ID, {
    comments: { lineComment: '%' },
    brackets: [['{', '}']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '"', close: '"' },
    ],
  });

  monaco.editor.defineTheme(DARK_THEME_ID, {
    base: 'vs-dark',
    inherit: true,
    rules: DARK_RULES,
    colors: DARK_COLORS,
  });
  monaco.editor.defineTheme(LIGHT_THEME_ID, {
    base: 'vs',
    inherit: true,
    rules: LIGHT_RULES,
    colors: LIGHT_COLORS,
  });

  monaco.languages.registerCompletionItemProvider(LATEX_LANGUAGE_ID, {
    triggerCharacters: ['\\'],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      return {
        suggestions: [...snippetCompletions(monaco, range), ...commandCompletions(monaco, range)],
      };
    },
  });
}

/**
 * Monaco language id for a project file, by extension.
 *
 * Only ids registered in `monacoSetup.ts` are returned; anything else falls
 * back to plain text rather than naming a language that was never loaded.
 */
export function languageForPath(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;

  if (['tex', 'ltx', 'latex', 'sty', 'cls', 'clo', 'def'].includes(extension)) {
    return LATEX_LANGUAGE_ID;
  }
  if (['bib', 'bst'].includes(extension)) return BIBTEX_LANGUAGE_ID;
  if (['md', 'markdown'].includes(extension)) return 'markdown';
  if (['yml', 'yaml'].includes(extension)) return 'yaml';
  if (extension === 'xml' || extension === 'svg') return 'xml';
  if (name === '.latexmkrc' || name === 'latexmkrc') return 'perl';

  return 'plaintext';
}
