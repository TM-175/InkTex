import { useMemo } from 'react';
import { useUiStore } from '@/store/uiStore';
import { SHORTCUTS, formatBinding, type ShortcutDefinition } from '@/services/shortcuts';
import { Modal } from '@/components/ui/Modal';

/** Grouped keyboard reference. */
export function ShortcutsDialog() {
  const open = useUiStore((state) => state.overlay === 'shortcuts');
  const close = useUiStore((state) => state.closeOverlay);

  const grouped = useMemo(() => {
    const groups = new Map<ShortcutDefinition['category'], ShortcutDefinition[]>();

    for (const shortcut of SHORTCUTS) {
      const existing = groups.get(shortcut.category);
      if (existing === undefined) groups.set(shortcut.category, [shortcut]);
      else existing.push(shortcut);
    }
    return [...groups.entries()];
  }, []);

  return (
    <Modal
      open={open}
      onClose={close}
      title="Keyboard Shortcuts"
      description="Editor shortcuts follow VS Code conventions."
      className="max-w-2xl"
    >
      <div className="grid gap-x-8 gap-y-5 overflow-auto px-5 py-4 sm:grid-cols-2">
        {grouped.map(([category, shortcuts]) => (
          <section key={category}>
            <h3 className="mb-2 text-[0.6875rem] font-semibold tracking-wider text-content-muted uppercase">
              {category}
            </h3>
            <dl className="space-y-1">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.command}
                  className="flex items-center justify-between gap-4 rounded px-2 py-1 hover:bg-surface-hover"
                >
                  <dt className="min-w-0 truncate text-sm text-content-secondary">
                    {shortcut.description}
                  </dt>
                  <dd>
                    <kbd className="rounded border border-border-subtle bg-surface-base px-1.5 py-0.5 font-mono text-[0.6875rem] whitespace-nowrap text-content-primary">
                      {formatBinding(shortcut.binding)}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <footer className="border-t border-border-subtle px-5 py-3 text-xs text-content-muted">
        Monaco's own shortcuts also apply — multi-cursor with Alt+Click, column
        selection with Shift+Alt+Drag, and Alt+↑/↓ to move a line.
      </footer>
    </Modal>
  );
}
