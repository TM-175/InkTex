import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { IconButton } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Width class; defaults to a comfortable dialog width. */
  className?: string;
  /** Anchor near the top, as command palettes conventionally do. */
  align?: 'center' | 'top';
  /** Hide the header entirely (palettes provide their own). */
  bare?: boolean;
}

/**
 * Modal surface with a scrim, focus containment and Escape-to-close.
 *
 * Escape is handled globally by `useKeyboardShortcuts`; this component keeps
 * focus inside the dialog and restores it to the previously focused element on
 * close, which keyboard users depend on.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  align = 'center',
  bare = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Focus the first control, or the panel itself so Escape still reaches it.
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel)?.focus();

    return () => previouslyFocused.current?.focus();
  }, [open]);

  // Keep Tab cycling within the dialog.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (panel === null) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex justify-center bg-slate-950/50 p-4 backdrop-blur-[2px] animate-fade-in',
        align === 'top' ? 'items-start pt-[12vh]' : 'items-center',
      )}
      onMouseDown={(event) => {
        // Only a click that both starts and ends on the scrim dismisses.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-border-subtle',
          'bg-surface-overlay shadow-[var(--shadow-overlay)] outline-none animate-scale-in',
          className ?? 'max-w-lg',
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {!bare && title !== undefined && (
          <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-content-primary">{title}</h2>
              {description !== undefined && (
                <p className="mt-1 text-sm text-content-secondary">{description}</p>
              )}
            </div>
            <IconButton label="Close" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
