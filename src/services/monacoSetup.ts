/**
 * Monaco bootstrapping.
 *
 * `@monaco-editor/react` loads Monaco from a CDN by default, which a
 * local-first desktop app must not do — and cannot do, since the webview's CSP
 * forbids remote scripts. This module points the loader at the bundled copy and
 * wires up the web worker via Vite's `?worker` import.
 */

import { loader } from '@monaco-editor/react';

// Import the editor piece by piece rather than through the `monaco-editor`
// root, which pulls in ~80 language definitions and the TypeScript, JSON, HTML
// and CSS language services — roughly 9 MB of workers a LaTeX editor never
// loads. `editor.api` is the API surface, `features/register.all` is every
// editor contribution (find and replace, folding, bracket matching, multi-
// cursor, the suggest widget, the context menu), and each language definition
// below is registered explicitly.
//
// Subpaths follow monaco-editor's `exports` map, which rewrites `./*` to
// `./esm/vs/*.js`; hence no `esm/vs` prefix and no file extension.
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/features/register.all';
import 'monaco-editor/languages/definitions/markdown/register';
import 'monaco-editor/languages/definitions/xml/register';
import 'monaco-editor/languages/definitions/yaml/register';
// `.latexmkrc` is a Perl script.
import 'monaco-editor/languages/definitions/perl/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

import { registerLatexLanguage } from './latexLanguage';

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

let initialized = false;

/**
 * Configure Monaco to run entirely from the bundle. Idempotent.
 *
 * Only the base editor worker is needed: InkTex registers its own LaTeX and
 * BibTeX grammars and uses none of Monaco's built-in TypeScript, JSON, CSS or
 * HTML language services.
 */
export function setupMonaco(): void {
  if (initialized) return;
  initialized = true;

  window.MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
  };

  // `@monaco-editor/react` types this parameter as the whole `monaco-editor`
  // module, including the `json`/`html`/`css`/`typescript` language services
  // deliberately omitted above. Every member it actually touches is present on
  // the API surface, so the structural mismatch is safe to assert past.
  type MonacoInstance = NonNullable<Parameters<typeof loader.config>[0]['monaco']>;
  loader.config({ monaco: monaco as unknown as MonacoInstance });

  registerLatexLanguage(monaco);
}

export { monaco };
