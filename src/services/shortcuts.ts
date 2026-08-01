/**
 * Keyboard shortcut definitions.
 *
 * One table drives three things: the global key handler, the hints shown in the
 * command palette, and the keyboard reference dialog. `mod` means ⌘ on macOS
 * and Ctrl elsewhere, matching VS Code's conventions.
 */

export interface ShortcutDefinition {
  /** Command id this shortcut triggers. */
  command: string;
  /** Binding in `mod+shift+p` form. */
  binding: string;
  description: string;
  category: 'File' | 'Edit' | 'View' | 'Compile' | 'Navigation';
}

export const SHORTCUTS: ShortcutDefinition[] = [
  // File
  { command: 'project.open', binding: 'mod+o', description: 'Open project folder…', category: 'File' },
  { command: 'file.open', binding: 'mod+shift+o', description: 'Open a single file…', category: 'File' },
  { command: 'project.new', binding: 'mod+shift+n', description: 'New project…', category: 'File' },
  { command: 'window.new', binding: 'mod+alt+n', description: 'New window', category: 'File' },
  { command: 'project.close', binding: 'mod+shift+w', description: 'Close project (back to start)', category: 'File' },
  { command: 'file.new', binding: 'mod+n', description: 'New file', category: 'File' },
  { command: 'file.save', binding: 'mod+s', description: 'Save', category: 'File' },
  { command: 'file.saveAll', binding: 'mod+alt+s', description: 'Save all', category: 'File' },
  { command: 'file.close', binding: 'mod+w', description: 'Close tab', category: 'File' },
  { command: 'pdf.export', binding: 'mod+e', description: 'Export PDF…', category: 'File' },

  // Navigation
  { command: 'palette.commands', binding: 'mod+shift+p', description: 'Command palette', category: 'Navigation' },
  { command: 'palette.files', binding: 'mod+p', description: 'Quick open file', category: 'Navigation' },
  { command: 'tab.next', binding: 'mod+alt+right', description: 'Next tab', category: 'Navigation' },
  { command: 'tab.previous', binding: 'mod+alt+left', description: 'Previous tab', category: 'Navigation' },
  { command: 'editor.gotoLine', binding: 'mod+g', description: 'Go to line…', category: 'Navigation' },

  // Edit
  { command: 'editor.find', binding: 'mod+f', description: 'Find', category: 'Edit' },
  { command: 'editor.replace', binding: 'mod+alt+f', description: 'Replace', category: 'Edit' },
  { command: 'editor.comment', binding: 'mod+/', description: 'Toggle line comment', category: 'Edit' },
  { command: 'snippets.open', binding: 'mod+shift+i', description: 'Insert snippet…', category: 'Edit' },

  // Code
  { command: 'code.insertBlock', binding: 'mod+shift+c', description: 'Insert code block…', category: 'Edit' },
  { command: 'code.insertFromFile', binding: 'mod+alt+c', description: 'Insert code from file…', category: 'Edit' },
  { command: 'code.inspector', binding: 'mod+alt+i', description: 'Toggle listing inspector', category: 'View' },

  // View
  { command: 'view.explorer', binding: 'mod+b', description: 'Toggle file explorer', category: 'View' },
  { command: 'view.preview', binding: 'mod+shift+v', description: 'Toggle PDF preview', category: 'View' },
  { command: 'view.panel', binding: 'mod+j', description: 'Toggle bottom panel', category: 'View' },
  { command: 'view.problems', binding: 'mod+shift+m', description: 'Show problems', category: 'View' },
  { command: 'settings.open', binding: 'mod+,', description: 'Settings', category: 'View' },
  { command: 'help.shortcuts', binding: 'mod+shift+/', description: 'Keyboard shortcuts', category: 'View' },

  // Compile
  { command: 'compile.run', binding: 'mod+enter', description: 'Compile', category: 'Compile' },
  { command: 'compile.force', binding: 'mod+shift+enter', description: 'Force full recompile', category: 'Compile' },
];

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Symbols used when rendering a binding for this platform. */
const KEY_LABELS: Record<string, string> = IS_MAC
  ? { mod: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃', enter: '↵', left: '←', right: '→', up: '↑', down: '↓', escape: 'Esc' }
  : { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', ctrl: 'Ctrl', enter: 'Enter', left: '←', right: '→', up: '↑', down: '↓', escape: 'Esc' };

/** Render `mod+shift+p` as `⌘⇧P` or `Ctrl+Shift+P`. */
export function formatBinding(binding: string): string {
  const parts = binding.split('+').map((part) => {
    const label = KEY_LABELS[part];
    if (label !== undefined) return label;
    return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
  });

  return IS_MAC ? parts.join('') : parts.join('+');
}

/** The binding registered for a command, or undefined. */
export function bindingFor(command: string): string | undefined {
  return SHORTCUTS.find((shortcut) => shortcut.command === command)?.binding;
}

/** Formatted shortcut for a command, ready to render. */
export function shortcutLabel(command: string): string | undefined {
  const binding = bindingFor(command);
  return binding === undefined ? undefined : formatBinding(binding);
}

/** Physical keys whose `code` is not simply `Key<X>` or `Digit<N>`. */
const CODE_NAMES: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Space: 'space',
  Enter: 'enter',
  NumpadEnter: 'enter',
  Escape: 'escape',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/**
 * Reduce a keyboard event to the key name used in bindings.
 *
 * Matching is done on `event.code` — the *physical* key — rather than
 * `event.key`. Two things break otherwise: on macOS, Option+S reports
 * `event.key` as `ß`, so every `alt` binding would silently never fire; and on
 * non-US layouts `event.key` varies with the layout. This is the same
 * `dispatch: "code"` behaviour VS Code uses.
 */
function normalizeKey(event: KeyboardEvent): string {
  const { code } = event;

  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);

  const mapped = CODE_NAMES[code];
  if (mapped !== undefined) return mapped;

  // Function keys and anything unmapped fall back to `key`.
  return event.key.toLowerCase();
}

/** Does this keyboard event match the binding? */
export function matchesBinding(event: KeyboardEvent, binding: string): boolean {
  const parts = binding.split('+');
  const key = parts[parts.length - 1]!;

  const wantsMod = parts.includes('mod');
  const wantsShift = parts.includes('shift');
  const wantsAlt = parts.includes('alt');
  const wantsCtrl = parts.includes('ctrl');

  const modPressed = IS_MAC ? event.metaKey : event.ctrlKey;
  // On macOS `mod` is ⌘, so a stray Ctrl must not also satisfy it.
  const otherModifier = IS_MAC ? event.ctrlKey : event.metaKey;

  if (wantsMod !== modPressed) return false;
  if (!wantsCtrl && !wantsMod && otherModifier) return false;
  if (wantsCtrl && !event.ctrlKey) return false;
  if (wantsShift !== event.shiftKey) return false;
  if (wantsAlt !== event.altKey) return false;

  return normalizeKey(event) === key;
}

export { IS_MAC };
