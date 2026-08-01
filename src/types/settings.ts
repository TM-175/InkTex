/**
 * User preferences.
 *
 * The frontend owns this schema: the Rust side persists it as an opaque JSON
 * document (see `src-tauri/src/store.rs`). Defaults and migration live in
 * `src/services/settingsService.ts`.
 */

import type { BibEngine, CompilerKind, LatexmkEngine } from './compile';

export type ThemePreference = 'dark' | 'light' | 'system';

/** Resolved theme after `system` has been evaluated against the OS. */
export type ResolvedTheme = 'dark' | 'light';

export type AutoSaveMode = 'off' | 'afterDelay' | 'onFocusChange';

export type LineNumbersMode = 'on' | 'off' | 'relative';

/** What the preview does with scroll position when a new PDF arrives. */
export type PdfRefreshBehavior = 'preserveScroll' | 'jumpToTop' | 'manual';

export type PdfZoomMode = 'fitWidth' | 'fitPage' | 'custom';

export interface Settings {
  // --- Appearance ---------------------------------------------------------
  theme: ThemePreference;

  // --- Editor -------------------------------------------------------------
  fontSize: number;
  fontFamily: string;
  /** Columns a tab represents. */
  tabWidth: number;
  /** Insert spaces instead of a tab character. */
  insertSpaces: boolean;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: LineNumbersMode;
  bracketPairColorization: boolean;
  renderWhitespace: 'none' | 'boundary' | 'all';
  autoSave: AutoSaveMode;
  /** Idle milliseconds before an auto-save fires, when mode is `afterDelay`. */
  autoSaveDelay: number;
  autoClosingBrackets: boolean;

  // --- Compilation --------------------------------------------------------
  defaultCompiler: CompilerKind;
  latexmkEngine: LatexmkEngine;
  bibEngine: BibEngine;
  autoCompile: boolean;
  /** Idle milliseconds after the last edit before an auto-compile fires. */
  autoCompileDelay: number;
  /** Keep auxiliary files in a build directory instead of beside the sources. */
  useOutputDirectory: boolean;
  synctex: boolean;
  /** Extra compiler flags, parsed with shell quoting rules. */
  extraCompilerArgs: string;
  /** Remove auxiliary files automatically when a project is closed. */
  cleanAuxOnClose: boolean;

  // --- PDF preview --------------------------------------------------------
  pdfRefreshBehavior: PdfRefreshBehavior;
  pdfZoomMode: PdfZoomMode;
  /** Zoom factor used when `pdfZoomMode` is `custom`. 1 = 100%. */
  pdfZoom: number;

  // --- Projects -----------------------------------------------------------
  recentProjectsLimit: number;
  /** Reopen the last project on launch. */
  restoreLastProject: boolean;
}

/** A settings key paired with its value type, for typed partial updates. */
export type SettingsPatch = Partial<Settings>;
