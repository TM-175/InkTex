/** Editor, tab and UI-shell types. These exist only in the frontend. */

import type { FileKind } from './project';

/** One open editor tab. */
export interface EditorTab {
  /** Project-relative path — the tab's identity. */
  path: string;
  name: string;
  kind: FileKind;
  /** Content as last read from or written to disk. */
  savedContent: string;
  /** Current buffer content. */
  content: string;
  /** mtime of the last read/write InkTex performed, for conflict detection. */
  diskModified: number;
  /** The file was decoded lossily from non-UTF-8 bytes. */
  lossy: boolean;
  /** Set when the file changed on disk while the buffer had unsaved edits. */
  conflicted: boolean;
  /** Cursor/scroll position, restored when the tab is reactivated. */
  viewState: EditorViewState | null;
}

export interface EditorViewState {
  line: number;
  column: number;
  scrollTop: number;
}

/** A tab is dirty when its buffer differs from what is on disk. */
export function isTabDirty(tab: EditorTab): boolean {
  return tab.content !== tab.savedContent;
}

/** Where the editor should navigate to. */
export interface SourceLocation {
  path: string;
  line: number;
  column?: number;
}

/** A LaTeX snippet offered in the snippet picker and Monaco completions. */
export interface Snippet {
  id: string;
  label: string;
  description: string;
  category: SnippetCategory;
  /** Monaco snippet syntax, using `${1:placeholder}` tab stops. */
  body: string;
}

export type SnippetCategory = 'math' | 'structure' | 'floats' | 'lists' | 'bibliography';

/** A project template offered on the welcome screen. */
export interface Template {
  id: string;
  name: string;
  description: string;
  /** The document this template compiles by default. */
  mainDocument: string;
  files: { path: string; content: string }[];
}

/** An entry in the command palette. */
export interface Command {
  id: string;
  title: string;
  /** Grouping label shown to the right of the title. */
  category: string;
  /** Human-readable shortcut, e.g. `⌘S`. */
  shortcut?: string;
  /** Extra words the fuzzy matcher should consider. */
  keywords?: string;
  run: () => void | Promise<void>;
  /** When false, the command is hidden from the palette. */
  enabled?: boolean;
}

/** Which bottom panel tab is showing. */
export type BottomPanelTab = 'problems' | 'output' | 'log';

/** A transient notification shown in the corner. */
export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
  /** Milliseconds before auto-dismiss; `0` keeps it until dismissed. */
  duration: number;
}
