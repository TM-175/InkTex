/**
 * Global keyboard handling.
 *
 * Shortcuts whose command exists in the registry are handled here. Bindings
 * listed in {@link SHORTCUTS} with no matching command (Find, Replace, Toggle
 * Comment, Go to Line) are deliberately left alone so Monaco's own keybindings
 * receive them when the editor has focus.
 */

import { useEffect } from 'react';
import type { Command } from '@/types/editor';
import { SHORTCUTS, matchesBinding } from '@/services/shortcuts';
import { useUiStore } from '@/store/uiStore';

/** Is the user typing into a form control rather than the editor? */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts(commands: readonly Command[]): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const ui = useUiStore.getState();

      // Escape backs out of whatever is open, from anywhere.
      if (event.key === 'Escape') {
        if (ui.confirmRequest !== null) {
          event.preventDefault();
          ui.resolveConfirm(null);
          return;
        }
        if (ui.overlay !== null) {
          event.preventDefault();
          ui.closeOverlay();
          return;
        }
        return;
      }

      for (const shortcut of SHORTCUTS) {
        if (!matchesBinding(event, shortcut.binding)) continue;

        const command = commands.find((candidate) => candidate.id === shortcut.command);
        // No registered command means the binding belongs to Monaco.
        if (command === undefined) return;
        if (command.enabled === false) return;

        // Plain-key shortcuts must not fire while typing in a text field.
        const usesModifier = shortcut.binding.includes('mod') || shortcut.binding.includes('alt');
        if (!usesModifier && isTypingTarget(event.target)) return;

        event.preventDefault();
        event.stopPropagation();
        void command.run();
        return;
      }
    };

    // Capture phase so overlays and Monaco cannot swallow app-level shortcuts.
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [commands]);
}
