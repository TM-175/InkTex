/**
 * Code-listing types.
 *
 * A `ListingSpec` is the editable model behind a `minted` or `lstlisting`
 * environment. It is derived from the `.tex` file and written back to it — it
 * is never the source of truth on disk, which stays plain LaTeX.
 */

export type ListingEngine = 'minted' | 'listings';

/** LaTeX size command, without the backslash. */
export type ListingFontSize =
  | 'tiny'
  | 'scriptsize'
  | 'footnotesize'
  | 'small'
  | 'normalsize';

export type ListingFrame =
  | 'none'
  | 'lines'
  | 'single'
  | 'leftline'
  | 'topline'
  | 'bottomline';

/** How much of a source file a listing draws from. Mirrors Rust `ImportMode`. */
export type ImportMode = 'whole' | 'range' | 'region';

export type SourceLinkStatus = 'upToDate' | 'changed' | 'fileMissing' | 'regionMissing';

/**
 * A listing's link back to the file it was imported from.
 *
 * Persisted as a single readable LaTeX comment above the environment, so the
 * document stays portable and the link survives editing in any other editor.
 */
export interface SourceLink {
  /** Project-relative path. */
  path: string;
  mode: ImportMode;
  /** 1-based, inclusive; present for `range`, recorded for the others. */
  firstLine?: number;
  lastLine?: number;
  /** Region name, for `region` mode. */
  region?: string;
  /** Fingerprint of the imported snippet, computed by the backend. */
  hash: string;
  /** Whether the snippet had its common indentation removed on import. */
  dedent: boolean;
}

/** Everything needed to render one listing as LaTeX. */
export interface ListingSpec {
  engine: ListingEngine;
  /** Language registry id, e.g. `rust`. */
  language: string;
  code: string;
  caption: string;
  /** Without the `lst:` prefix convention being enforced; stored verbatim. */
  label: string;
  /** Theme registry id. */
  theme: string;
  fontSize: ListingFontSize;
  frame: ListingFrame;
  lineNumbers: boolean;
  firstNumber: number;
  /** Ranges in LaTeX form, e.g. `3,7-9`. Empty when nothing is highlighted. */
  highlightLines: string;
  /** Wrap in a float environment so it can be captioned and referenced. */
  float: boolean;
  /** Float placement specifier, e.g. `htbp`. */
  placement: string;
  breakLines: boolean;
  tabSize: number;
  /** Paint the theme's background colour behind the code. */
  background: boolean;
  /** Verbatim extra options, merged into the option list. */
  customOptions: string;
  link: SourceLink | null;
}

/** A listing located inside a document, with its position. */
export interface ParsedListing {
  spec: ListingSpec;
  /** Character offset of the first character of the block (the comment, if any). */
  start: number;
  /** Character offset one past the last character of the block. */
  end: number;
  /** 1-based line of `start`, for navigation. */
  line: number;
  /** Options the parser did not recognise, preserved on regeneration. */
  unknownOptions: string[];
}

/** One indexed source file. Mirrors Rust `CodeAsset`. */
export interface CodeAsset {
  path: string;
  name: string;
  extension: string;
  size: number;
  lines: number;
  /** Too large to scan, so `lines` is not meaningful. */
  truncated: boolean;
  modified: number;
}

/** A named region inside a source file. Mirrors Rust `CodeRegion`. */
export interface CodeRegion {
  name: string;
  firstLine: number;
  lastLine: number;
  lineCount: number;
  depth: number;
}

/** Result of extracting a snippet. Mirrors Rust `ImportedCode`. */
export interface ImportedCode {
  content: string;
  hash: string;
  firstLine: number;
  lastLine: number;
  totalLines: number;
  regionCount: number;
}

export interface SourceLinkResult {
  status: SourceLinkStatus;
  hash: string | null;
  firstLine: number | null;
  lastLine: number | null;
}

/** A listing paired with its live link status, for the inspector and search. */
export interface ListingEntry {
  listing: ParsedListing;
  status: SourceLinkStatus | null;
}
