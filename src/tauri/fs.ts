/** Filesystem IPC wrappers. All paths are project-relative unless noted. */

import { call, callBinary } from './client';
import type { FileContent, FileNode } from '@/types/project';

export function readTextFile(path: string): Promise<FileContent> {
  return call('read_text_file', { path });
}

/** Write a file and return its new mtime in epoch milliseconds. */
export function writeTextFile(path: string, content: string): Promise<number> {
  return call('write_text_file', { path, content });
}

export function readBinaryFile(path: string): Promise<Uint8Array> {
  return callBinary('read_binary_file', { path });
}

/**
 * Read a PDF from an absolute path.
 *
 * Separate from {@link readBinaryFile} because the build directory can sit
 * outside the project scope; the backend restricts this to `.pdf` files and
 * validates the magic bytes.
 */
export function readPdfFile(path: string): Promise<Uint8Array> {
  return callBinary('read_pdf_file', { path });
}

export function createFile(parent: string, name: string): Promise<FileNode> {
  return call('create_file', { parent, name });
}

export function createDirectory(parent: string, name: string): Promise<FileNode> {
  return call('create_directory', { parent, name });
}

/** Rename in place; resolves to the new project-relative path. */
export function renameEntry(path: string, newName: string): Promise<string> {
  return call('rename_entry', { path, newName });
}

/** Move into another folder; resolves to the new project-relative path. */
export function moveEntry(path: string, destinationParent: string): Promise<string> {
  return call('move_entry', { path, destinationParent });
}

export function deleteEntry(path: string): Promise<void> {
  return call('delete_entry', { path });
}

/** Copy a file from anywhere on disk into the project. */
export function importFile(sourcePath: string, destinationParent: string): Promise<FileNode> {
  return call('import_file', { sourcePath, destinationParent });
}

export function pathExists(path: string): Promise<boolean> {
  return call('path_exists', { path });
}

export interface PathKind {
  path: string;
  exists: boolean;
  isDirectory: boolean;
}

/** Classify dropped paths so folders open as projects and files import. */
export function inspectPaths(paths: string[]): Promise<PathKind[]> {
  return call('inspect_paths', { paths });
}

/** Copy the compiled PDF to an absolute destination chosen by the user. */
export function exportPdf(sourcePath: string, destinationPath: string): Promise<void> {
  return call('export_pdf', { sourcePath, destinationPath });
}
