/**
 * Deciding how a file should be presented in the editor area.
 *
 * The tree is authoritative when the file is in it; extension inference covers
 * files opened before a tree refresh has caught up.
 */

import type { FileKind, FileNode } from '@/types/project';
import { findNode } from './fileTreeService';
import { extname, isImageFile, isTextFile } from '@/utils/path';

/** How the editor area should render a file. */
export function classifyTab(path: string, tree: FileNode | null): FileKind {
  const node = tree !== null ? findNode(tree, path) : null;
  if (node !== null && !node.isDirectory) return node.kind;

  if (extname(path) === 'pdf') return 'pdf';
  if (isImageFile(path)) return 'image';
  if (isTextFile(path)) return 'text';
  return 'binary';
}

/** Can this kind be edited as text in Monaco? */
export function isEditable(kind: FileKind): boolean {
  return kind === 'tex' || kind === 'bib' || kind === 'style' || kind === 'text';
}
