/**
 * Helpers for project-relative paths.
 *
 * Paths from the backend always use forward slashes and never start with `/`,
 * so these can stay simple string operations.
 */

/** Final component of a path. */
export function basename(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

/** Everything before the final component; `''` for a top-level entry. */
export function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

/** Lowercase extension without the dot; `''` when there is none. */
export function extname(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index + 1).toLowerCase();
}

/** File name without its extension. */
export function stem(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf('.');
  return index <= 0 ? name : name.slice(0, index);
}

/** Join segments, dropping empties so `join('', 'a.tex')` yields `'a.tex'`. */
export function join(...segments: string[]): string {
  return segments.filter((s) => s !== '').join('/');
}

/** Is `path` inside `directory` (or equal to it)? */
export function isWithin(directory: string, path: string): boolean {
  if (directory === '') return true;
  return path === directory || path.startsWith(`${directory}/`);
}

/** Every ancestor directory of `path`, outermost first. */
export function ancestors(path: string): string[] {
  const segments = path.split('/').slice(0, -1);
  const result: string[] = [];

  for (let i = 0; i < segments.length; i += 1) {
    result.push(segments.slice(0, i + 1).join('/'));
  }
  return result;
}

/** Extensions Monaco should open as text. */
const TEXT_EXTENSIONS = new Set([
  'tex', 'ltx', 'latex', 'bib', 'bst', 'sty', 'cls', 'clo', 'def', 'cfg',
  'txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'toml', 'csv', 'tsv',
  'log', 'gitignore', 'latexmkrc', 'xml', 'svg',
]);

export function isTextFile(path: string): boolean {
  const extension = extname(path);
  // Extensionless files (`.latexmkrc`, `Makefile`) are treated as text.
  if (extension === '') return true;
  return TEXT_EXTENSIONS.has(extension);
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg']);

export function isImageFile(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(path));
}

/**
 * Path a LaTeX `\includegraphics` should reference, given where the importing
 * document lives. Graphics are resolved relative to the main document's folder.
 */
export function graphicsReference(imagePath: string, documentPath: string): string {
  const documentDirectory = dirname(documentPath);
  if (documentDirectory !== '' && isWithin(documentDirectory, imagePath)) {
    return imagePath.slice(documentDirectory.length + 1);
  }
  return imagePath;
}
