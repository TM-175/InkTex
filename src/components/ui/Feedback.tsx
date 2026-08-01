/** Spinners, empty states and the toast stack. */

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useUiStore } from '@/store/uiStore';
import type { Toast } from '@/types/editor';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden />;
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center gap-3 px-8 text-center',
        className,
      )}
    >
      <div className="text-content-muted opacity-60">{icon}</div>
      <div>
        <p className="text-sm font-medium text-content-secondary">{title}</p>
        {description !== undefined && (
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-content-muted">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

const TOAST_STYLES: Record<Toast['kind'], { icon: ReactNode; accent: string }> = {
  info: { icon: <Info className="size-4" />, accent: 'text-sky-400' },
  success: { icon: <CheckCircle2 className="size-4" />, accent: 'text-emerald-400' },
  warning: { icon: <AlertTriangle className="size-4" />, accent: 'text-amber-400' },
  error: { icon: <XCircle className="size-4" />, accent: 'text-rose-400' },
};

/** Bottom-right toast stack. Errors persist until dismissed. */
export function Toaster() {
  const toasts = useUiStore((state) => state.toasts);
  const dismiss = useUiStore((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.kind];
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border-subtle',
              'bg-surface-overlay p-3 shadow-[var(--shadow-overlay)] animate-slide-up',
            )}
          >
            <span className={cn('mt-px shrink-0', style.accent)}>{style.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="selectable text-sm leading-snug font-medium text-content-primary">
                {toast.title}
              </p>
              {toast.detail !== undefined && (
                <p className="selectable mt-1 text-xs leading-relaxed break-words text-content-secondary">
                  {toast.detail}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 rounded p-0.5 text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
