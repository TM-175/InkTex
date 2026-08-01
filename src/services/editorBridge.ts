/**
 * A narrow handle on the live Monaco instance.
 *
 * The snippet picker, the Problems panel and drag-and-drop import all need to
 * act on the editor from outside the component that owns it. Passing a ref down
 * through the tree would couple unrelated components; a module-level registry
 * with a small, explicit API keeps the coupling to this file.
 */

import type * as Monaco from 'monaco-editor/editor/editor.api';

let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
let monacoApi: typeof Monaco | null = null;

/** Called by the editor component on mount and unmount. */
export function setActiveEditor(
  instance: Monaco.editor.IStandaloneCodeEditor | null,
  api: typeof Monaco | null,
): void {
  editor = instance;
  monacoApi = api;
}

export function hasEditor(): boolean {
  return editor !== null;
}

export function focusEditor(): void {
  editor?.focus();
}

/**
 * Insert snippet text at the cursor, expanding `${1:…}` tab stops.
 *
 * Uses Monaco's snippet controller so placeholders become real tab stops rather
 * than literal text.
 */
export function insertSnippet(body: string): void {
  if (editor === null) return;

  editor.focus();
  const contribution = editor.getContribution('snippetController2');

  // `insert` is not on the public contribution interface, but it is the only
  // way to expand a snippet programmatically.
  const controller = contribution as unknown as { insert?: (template: string) => void } | null;

  if (controller?.insert !== undefined) {
    controller.insert(body);
    return;
  }

  // Fallback: paste the body with placeholders stripped.
  const plain = body.replace(/\$\{\d+:?([^}]*)\}/g, '$1').replace(/\$\d+/g, '');
  const selection = editor.getSelection();
  if (selection !== null) {
    editor.executeEdits('inktex-snippet', [{ range: selection, text: plain, forceMoveMarkers: true }]);
  }
}

/** Insert plain text at the cursor. */
export function insertText(text: string): void {
  if (editor === null) return;

  editor.focus();
  const selection = editor.getSelection();
  if (selection === null) return;

  editor.executeEdits('inktex-insert', [
    { range: selection, text, forceMoveMarkers: true },
  ]);
}

/**
 * Replace a character range in the active model.
 *
 * Goes through Monaco's edit API rather than rewriting the buffer, so
 * regenerating a listing after a property change is one undoable step and the
 * user's cursor and scroll position survive it.
 *
 * Returns false when there is no editor, or the range is out of bounds.
 */
export function replaceRange(startOffset: number, endOffset: number, text: string): boolean {
  if (editor === null) return false;

  const model = editor.getModel();
  if (model === null) return false;

  const length = model.getValueLength();
  if (startOffset < 0 || endOffset > length || startOffset > endOffset) return false;

  const start = model.getPositionAt(startOffset);
  const end = model.getPositionAt(endOffset);

  editor.executeEdits('inktex-listing', [
    {
      range: {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      },
      text,
      forceMoveMarkers: true,
    },
  ]);
  return true;
}

/** Character offset of the cursor, or null when there is no editor. */
export function cursorOffset(): number | null {
  const model = editor?.getModel();
  const position = editor?.getPosition();
  if (model == null || position == null) return null;

  return model.getOffsetAt(position);
}

/** Scroll to a 1-based line/column and place the cursor there. */
export function revealLocation(line: number, column = 1): void {
  if (editor === null || monacoApi === null) return;

  editor.revealLineInCenter(line, monacoApi.editor.ScrollType.Smooth);
  editor.setPosition({ lineNumber: line, column });
  editor.focus();
}

/** Run a built-in Monaco action, e.g. `actions.find`. */
export function triggerAction(actionId: string): void {
  editor?.getAction(actionId)?.run();
}

/** Cursor position as `{ line, column }`, or null when there is no editor. */
export function cursorPosition(): { line: number; column: number } | null {
  const position = editor?.getPosition();
  return position == null ? null : { line: position.lineNumber, column: position.column };
}
