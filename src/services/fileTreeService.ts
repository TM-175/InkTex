/**
 * Pure operations over the project file tree.
 *
 * Kept free of React and IPC so the traversal logic can be reasoned about (and
 * tested) on its own.
 */

import type { FileNode } from '@/types/project';
import { ancestors } from '@/utils/path';

/** Depth-first walk over every node, including directories. */
export function walk(node: FileNode, visit: (node: FileNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
}

/** Every file (non-directory) in the tree, depth-first. */
export function collectFiles(root: FileNode): FileNode[] {
  const files: FileNode[] = [];
  walk(root, (node) => {
    if (!node.isDirectory) files.push(node);
  });
  return files;
}

/** Find a node by its project-relative path. */
export function findNode(root: FileNode, path: string): FileNode | null {
  if (path === '') return root;

  let found: FileNode | null = null;
  walk(root, (node) => {
    if (found === null && node.path === path) found = node;
  });
  return found;
}

/** Does anything in the tree have this path? */
export function hasPath(root: FileNode, path: string): boolean {
  return findNode(root, path) !== null;
}

/**
 * A flattened, ordered view of the tree honouring which folders are expanded.
 *
 * Rendering from this list keeps the explorer a flat map over one array, so it
 * stays fast for large projects and keeps keyboard navigation trivial.
 */
export interface FlatNode {
  node: FileNode;
  depth: number;
  /** Only meaningful for directories. */
  expanded: boolean;
}

export function flattenTree(root: FileNode, expanded: ReadonlySet<string>): FlatNode[] {
  const rows: FlatNode[] = [];

  const visit = (node: FileNode, depth: number): void => {
    for (const child of node.children ?? []) {
      const isExpanded = child.isDirectory && expanded.has(child.path);
      rows.push({ node: child, depth, expanded: isExpanded });

      if (isExpanded) visit(child, depth + 1);
    }
  };

  visit(root, 0);
  return rows;
}

/**
 * Expansion set that reveals `path`.
 *
 * Used when a compile error or quick-open jumps to a file inside collapsed
 * folders — the explorer should follow along.
 */
export function expandToReveal(
  expanded: ReadonlySet<string>,
  path: string,
): Set<string> {
  const next = new Set(expanded);
  for (const ancestor of ancestors(path)) {
    next.add(ancestor);
  }
  return next;
}

/** Directories that are direct or indirect children of `root`, for a picker. */
export function collectDirectories(root: FileNode): FileNode[] {
  const directories: FileNode[] = [];
  walk(root, (node) => {
    if (node.isDirectory && node !== root) directories.push(node);
  });
  return directories;
}

/**
 * Filter the tree to entries matching `query`, keeping ancestors of any match
 * so results stay in context.
 */
export function filterTree(root: FileNode, query: string): FileNode {
  const needle = query.trim().toLowerCase();
  if (needle === '') return root;

  const prune = (node: FileNode): FileNode | null => {
    const matches = node.name.toLowerCase().includes(needle);

    if (!node.isDirectory) return matches ? node : null;

    const children = (node.children ?? [])
      .map(prune)
      .filter((child): child is FileNode => child !== null);

    // A matching folder keeps its whole subtree; otherwise keep it only if a
    // descendant matched.
    if (matches) return node;
    if (children.length > 0) return { ...node, children };
    return null;
  };

  const pruned = prune(root);
  return pruned ?? { ...root, children: [] };
}

/** Paths of every directory in the tree — used to expand everything at once. */
export function allDirectoryPaths(root: FileNode): string[] {
  const paths: string[] = [];
  walk(root, (node) => {
    if (node.isDirectory && node.path !== '') paths.push(node.path);
  });
  return paths;
}
