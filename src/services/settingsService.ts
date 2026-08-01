/**
 * Settings schema, defaults and validation.
 *
 * The frontend is the single source of truth for what a preference means; the
 * backend stores whatever JSON it is handed. Anything read from disk is passed
 * through {@link normalizeSettings}, so a hand-edited or outdated file degrades
 * to defaults per-field instead of resetting everything.
 */

import type {
  AutoSaveMode,
  LineNumbersMode,
  PdfRefreshBehavior,
  PdfZoomMode,
  ResolvedTheme,
  Settings,
  ThemePreference,
} from '@/types/settings';
import type { BibEngine, CompilerKind, LatexmkEngine } from '@/types/compile';

/** A stack that exists on every supported platform. */
const DEFAULT_FONT_STACK =
  "'JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', 'DejaVu Sans Mono', monospace";

export const DEFAULT_SETTINGS: Settings = {
  // Appearance — dark by default, as specified.
  theme: 'dark',

  // Editor
  fontSize: 14,
  fontFamily: DEFAULT_FONT_STACK,
  tabWidth: 2,
  insertSpaces: true,
  wordWrap: true,
  minimap: false,
  lineNumbers: 'on',
  bracketPairColorization: true,
  renderWhitespace: 'none',
  autoSave: 'afterDelay',
  autoSaveDelay: 1000,
  autoClosingBrackets: true,

  // Compilation
  defaultCompiler: 'latexmk',
  latexmkEngine: 'pdflatex',
  bibEngine: 'auto',
  autoCompile: true,
  autoCompileDelay: 2000,
  useOutputDirectory: true,
  synctex: true,
  extraCompilerArgs: '',
  cleanAuxOnClose: false,

  // PDF preview
  pdfRefreshBehavior: 'preserveScroll',
  pdfZoomMode: 'fitWidth',
  pdfZoom: 1,

  // Projects
  recentProjectsLimit: 10,
  restoreLastProject: true,
};

/** Bounds for the numeric settings, enforced in both the UI and on load. */
export const SETTING_LIMITS = {
  fontSize: { min: 8, max: 32 },
  tabWidth: { min: 1, max: 8 },
  autoSaveDelay: { min: 200, max: 10_000 },
  autoCompileDelay: { min: 300, max: 30_000 },
  recentProjectsLimit: { min: 1, max: 30 },
  pdfZoom: { min: 0.1, max: 8 },
} as const;

const THEMES: ThemePreference[] = ['dark', 'light', 'system'];
const AUTO_SAVE_MODES: AutoSaveMode[] = ['off', 'afterDelay', 'onFocusChange'];
const LINE_NUMBER_MODES: LineNumbersMode[] = ['on', 'off', 'relative'];
const WHITESPACE_MODES: Settings['renderWhitespace'][] = ['none', 'boundary', 'all'];
const COMPILERS: CompilerKind[] = ['latexmk', 'pdflatex', 'xelatex', 'lualatex'];
const LATEXMK_ENGINES: LatexmkEngine[] = ['pdflatex', 'xelatex', 'lualatex'];
const BIB_ENGINES: BibEngine[] = ['auto', 'bibtex', 'biber', 'none'];
const PDF_REFRESH: PdfRefreshBehavior[] = ['preserveScroll', 'jumpToTop', 'manual'];
const PDF_ZOOM_MODES: PdfZoomMode[] = ['fitWidth', 'fitPage', 'custom'];

function pickEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickNumber(
  value: unknown,
  fallback: number,
  limits?: { min: number; max: number },
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (!limits) return value;
  return Math.min(limits.max, Math.max(limits.min, value));
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

/**
 * Coerce an arbitrary stored value into a complete, valid {@link Settings}.
 *
 * Unknown keys are dropped and invalid values fall back field-by-field, so a
 * single bad entry never costs the user their whole configuration.
 */
export function normalizeSettings(stored: unknown): Settings {
  if (typeof stored !== 'object' || stored === null) return { ...DEFAULT_SETTINGS };

  const raw = stored as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;

  return {
    theme: pickEnum(raw.theme, THEMES, d.theme),

    fontSize: pickNumber(raw.fontSize, d.fontSize, SETTING_LIMITS.fontSize),
    fontFamily: pickString(raw.fontFamily, d.fontFamily),
    tabWidth: pickNumber(raw.tabWidth, d.tabWidth, SETTING_LIMITS.tabWidth),
    insertSpaces: pickBoolean(raw.insertSpaces, d.insertSpaces),
    wordWrap: pickBoolean(raw.wordWrap, d.wordWrap),
    minimap: pickBoolean(raw.minimap, d.minimap),
    lineNumbers: pickEnum(raw.lineNumbers, LINE_NUMBER_MODES, d.lineNumbers),
    bracketPairColorization: pickBoolean(raw.bracketPairColorization, d.bracketPairColorization),
    renderWhitespace: pickEnum(raw.renderWhitespace, WHITESPACE_MODES, d.renderWhitespace),
    autoSave: pickEnum(raw.autoSave, AUTO_SAVE_MODES, d.autoSave),
    autoSaveDelay: pickNumber(raw.autoSaveDelay, d.autoSaveDelay, SETTING_LIMITS.autoSaveDelay),
    autoClosingBrackets: pickBoolean(raw.autoClosingBrackets, d.autoClosingBrackets),

    defaultCompiler: pickEnum(raw.defaultCompiler, COMPILERS, d.defaultCompiler),
    latexmkEngine: pickEnum(raw.latexmkEngine, LATEXMK_ENGINES, d.latexmkEngine),
    bibEngine: pickEnum(raw.bibEngine, BIB_ENGINES, d.bibEngine),
    autoCompile: pickBoolean(raw.autoCompile, d.autoCompile),
    autoCompileDelay: pickNumber(
      raw.autoCompileDelay,
      d.autoCompileDelay,
      SETTING_LIMITS.autoCompileDelay,
    ),
    useOutputDirectory: pickBoolean(raw.useOutputDirectory, d.useOutputDirectory),
    synctex: pickBoolean(raw.synctex, d.synctex),
    extraCompilerArgs:
      typeof raw.extraCompilerArgs === 'string' ? raw.extraCompilerArgs : d.extraCompilerArgs,
    cleanAuxOnClose: pickBoolean(raw.cleanAuxOnClose, d.cleanAuxOnClose),

    pdfRefreshBehavior: pickEnum(raw.pdfRefreshBehavior, PDF_REFRESH, d.pdfRefreshBehavior),
    pdfZoomMode: pickEnum(raw.pdfZoomMode, PDF_ZOOM_MODES, d.pdfZoomMode),
    pdfZoom: pickNumber(raw.pdfZoom, d.pdfZoom, SETTING_LIMITS.pdfZoom),

    recentProjectsLimit: pickNumber(
      raw.recentProjectsLimit,
      d.recentProjectsLimit,
      SETTING_LIMITS.recentProjectsLimit,
    ),
    restoreLastProject: pickBoolean(raw.restoreLastProject, d.restoreLastProject),
  };
}

/** Resolve a `system` theme preference against the OS colour scheme. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;

  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  return prefersDark ? 'dark' : 'light';
}

/** Apply the resolved theme to the document root, where Tailwind reads it. */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}
