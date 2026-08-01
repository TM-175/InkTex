/**
 * Project and filesystem types.
 *
 * Mirrors `src-tauri/src/models.rs` and `src-tauri/src/store.rs`.
 */

export type FileKind =
  | 'directory'
  | 'tex'
  | 'bib'
  | 'image'
  | 'pdf'
  | 'style'
  | 'text'
  | 'binary';

export interface FileNode {
  /** Path relative to the project root, forward-slashed. Stable identity. */
  path: string;
  name: string;
  kind: FileKind;
  isDirectory: boolean;
  /** Size in bytes; `0` for directories. */
  size: number;
  /** Milliseconds since the Unix epoch. */
  modified: number;
  children?: FileNode[];
}

export interface ProjectInfo {
  /** Absolute path to the project root. */
  root: string;
  name: string;
  /** Fallback document to compile, relative to the root. */
  mainDocument: string | null;
  /**
   * Set when the user opened a single file rather than a folder: the file they
   * picked, which the UI opens as the active tab.
   */
  openedFile: string | null;
  tree: FileNode;
  fileCount: number;
}

export interface FileContent {
  path: string;
  content: string;
  modified: number;
  /** The file was not valid UTF-8 and was decoded lossily. */
  lossy: boolean;
}

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
  /** False when the folder has since been moved or deleted. */
  exists: boolean;
}

export interface Session {
  lastProject: string | null;
  openFiles: string[];
  activeFile: string | null;
}

export type FsChangeKind = 'created' | 'modified' | 'removed' | 'renamed';

export interface FsChange {
  kind: FsChangeKind;
  path: string;
  isDirectory: boolean;
}

export interface FsChangeEvent {
  root: string;
  changes: FsChange[];
  /** The change set touches files the editor may have open. */
  affectsSources: boolean;
}

/** A file created as part of a new project from a template. */
export interface NewProjectFile {
  path: string;
  content: string;
}
