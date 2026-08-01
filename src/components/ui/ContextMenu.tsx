import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Renders a separator above this item. */
  separated?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  /** Viewport coordinates where the menu should appear. */
  position: { x: number; y: number };
  items: MenuItem[];
  onClose: () => void;
}

/**
 * Cursor-anchored menu.
 *
 * Flips against the viewport edges after measuring, so a right-click near the
 * bottom of the explorer does not open a menu that runs off-screen.
 */
export function ContextMenu({ position, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState(position);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (menu === null) return;

    const { width, height } = menu.getBoundingClientRect();
    const margin = 8;

    setPlacement({
      x: Math.min(position.x, window.innerWidth - width - margin),
      y: Math.min(position.y, window.innerHeight - height - margin),
    });
  }, [position]);

  useEffect(() => {
    // Any click, scroll or resize outside dismisses the menu.
    const dismiss = (): void => onClose();

    window.addEventListener('mousedown', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    // Capture so scrolling in any nested container also closes it.
    window.addEventListener('scroll', dismiss, true);

    return () => {
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left: placement.x, top: placement.y }}
      onMouseDown={(event) => event.stopPropagation()}
      className={cn(
        'fixed z-[70] min-w-52 overflow-hidden rounded-lg border border-border-subtle',
        'bg-surface-overlay py-1 shadow-[var(--shadow-overlay)] animate-scale-in',
      )}
    >
      {items.map((item) => (
        <div key={item.id}>
          {item.separated === true && <div className="my-1 h-px bg-border-subtle" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={cn(
              'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-40',
              item.danger === true
                ? 'text-rose-400 hover:bg-rose-500/10'
                : 'text-content-primary hover:bg-surface-hover',
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center text-content-muted">
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
