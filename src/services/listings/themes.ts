/**
 * Syntax-highlighting themes.
 *
 * One definition drives three things, which is what keeps the in-app preview
 * honest about what the PDF will look like:
 *
 * 1. The **preview** in the wizard, rendered from these colours directly.
 * 2. **minted**, via the name of the matching Pygments style.
 * 3. **listings**, via a generated `\lstdefinestyle` built from these colours —
 *    exact, because `listings` has no built-in themes at all.
 *
 * The minted mapping is an approximation (Pygments owns those palettes), so the
 * preview is labelled as indicative for that engine.
 */

export interface ThemeColors {
  background: string;
  text: string;
  keyword: string;
  /** Types and built-ins. */
  type: string;
  string: string;
  comment: string;
  number: string;
  /** Line-number gutter. */
  gutter: string;
}

export interface ListingTheme {
  id: string;
  label: string;
  /** Light backgrounds print well; dark ones look better on screen. */
  dark: boolean;
  /** Pygments style name used by minted. */
  pygments: string;
  colors: ThemeColors;
}

export const THEMES: ListingTheme[] = [
  {
    id: 'inktex',
    label: 'InkTex',
    dark: false,
    pygments: 'friendly',
    colors: {
      background: 'F8FAFC',
      text: '1E293B',
      keyword: '4F46E5',
      type: '0F766E',
      string: '15803D',
      comment: '64748B',
      number: 'B45309',
      gutter: '94A3B8',
    },
  },
  {
    id: 'paper',
    label: 'Paper (print-friendly)',
    dark: false,
    pygments: 'bw',
    colors: {
      background: 'FFFFFF',
      text: '000000',
      keyword: '000000',
      type: '000000',
      string: '333333',
      comment: '555555',
      number: '000000',
      gutter: '888888',
    },
  },
  {
    id: 'github',
    label: 'GitHub Light',
    dark: false,
    pygments: 'default',
    colors: {
      background: 'FFFFFF',
      text: '24292F',
      keyword: 'CF222E',
      type: '953800',
      string: '0A3069',
      comment: '6E7781',
      number: '0550AE',
      gutter: '8C959F',
    },
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    dark: false,
    pygments: 'solarized-light',
    colors: {
      background: 'FDF6E3',
      text: '657B83',
      keyword: '859900',
      type: 'B58900',
      string: '2AA198',
      comment: '93A1A1',
      number: 'D33682',
      gutter: '93A1A1',
    },
  },
  {
    id: 'xcode',
    label: 'Xcode',
    dark: false,
    pygments: 'xcode',
    colors: {
      background: 'FFFFFF',
      text: '000000',
      keyword: 'AA0D91',
      type: '5C2699',
      string: 'C41A16',
      comment: '007400',
      number: '1C00CF',
      gutter: '9B9B9B',
    },
  },
  {
    id: 'monokai',
    label: 'Monokai',
    dark: true,
    pygments: 'monokai',
    colors: {
      background: '272822',
      text: 'F8F8F2',
      keyword: 'F92672',
      type: '66D9EF',
      string: 'E6DB74',
      comment: '75715E',
      number: 'AE81FF',
      gutter: '75715E',
    },
  },
  {
    id: 'dracula',
    label: 'Dracula',
    dark: true,
    pygments: 'dracula',
    colors: {
      background: '282A36',
      text: 'F8F8F2',
      keyword: 'FF79C6',
      type: '8BE9FD',
      string: 'F1FA8C',
      comment: '6272A4',
      number: 'BD93F9',
      gutter: '6272A4',
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    dark: true,
    pygments: 'nord',
    colors: {
      background: '2E3440',
      text: 'D8DEE9',
      keyword: '81A1C1',
      type: '8FBCBB',
      string: 'A3BE8C',
      comment: '616E88',
      number: 'B48EAD',
      gutter: '4C566A',
    },
  },
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    dark: true,
    pygments: 'solarized-dark',
    colors: {
      background: '002B36',
      text: '839496',
      keyword: '859900',
      type: 'B58900',
      string: '2AA198',
      comment: '586E75',
      number: 'D33682',
      gutter: '586E75',
    },
  },
];

const BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]));

export const DEFAULT_THEME = 'inktex';

export function themeById(id: string): ListingTheme {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_THEME)!;
}

export function themeOptions(): { value: string; label: string }[] {
  return THEMES.map((theme) => ({
    value: theme.id,
    label: theme.dark ? `${theme.label} (dark)` : theme.label,
  }));
}

/** LaTeX colour name for one role of one theme. Stable and collision-free. */
function colorName(themeId: string, role: keyof ThemeColors): string {
  const clean = themeId.replace(/[^a-zA-Z]/g, '');
  return `inktex${clean}${role.charAt(0).toUpperCase()}${role.slice(1)}`;
}

/** `\definecolor` lines for every role in a theme. */
export function themeColorDefinitions(themeId: string): string[] {
  const theme = themeById(themeId);

  return (Object.keys(theme.colors) as (keyof ThemeColors)[]).map(
    (role) => `\\definecolor{${colorName(themeId, role)}}{HTML}{${theme.colors[role]}}`,
  );
}

/**
 * A `\lstdefinestyle` block implementing the theme for the `listings` package.
 *
 * `basicstyle` deliberately omits the font size: the size is a per-listing
 * option, so baking it into the shared style would stop listings differing.
 */
export function lstStyleDefinition(themeId: string): string {
  const theme = themeById(themeId);
  const color = (role: keyof ThemeColors) => `\\color{${colorName(themeId, role)}}`;

  return [
    `\\lstdefinestyle{inktex${themeId.replace(/[^a-zA-Z]/g, '')}}{`,
    `  basicstyle=\\ttfamily${theme.dark ? `${color('text')}` : ''},`,
    `  keywordstyle=${color('keyword')}\\bfseries,`,
    `  ndkeywordstyle=${color('type')},`,
    `  stringstyle=${color('string')},`,
    `  commentstyle=${color('comment')}\\itshape,`,
    `  numberstyle=\\tiny${color('gutter')},`,
    `  identifierstyle=${theme.dark ? color('text') : '\\color{black}'},`,
    `  showstringspaces=false,`,
    `  columns=fullflexible,`,
    `  keepspaces=true,`,
    `  upquote=true,`,
    `}`,
  ].join('\n');
}

/** LaTeX colour name for a theme's background, used by `bgcolor`/`backgroundcolor`. */
export function backgroundColorName(themeId: string): string {
  return colorName(themeId, 'background');
}

/** Shared colour used to mark highlighted lines under the `listings` engine. */
export const HIGHLIGHT_COLOR_NAME = 'inktexHighlight';
export const HIGHLIGHT_COLOR_DEFINITION = `\\definecolor{${HIGHLIGHT_COLOR_NAME}}{HTML}{FFF3BF}`;
