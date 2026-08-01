import { CheckCircle2, Clock, XCircle, AlertTriangle, Ban } from 'lucide-react';
import { useCompileStore } from '@/store/compileStore';
import type { CompileStatus } from '@/types/compile';
import { EmptyState } from '@/components/ui/Feedback';
import { formatClockTime, formatDuration, pluralize } from '@/utils/format';
import { cn } from '@/utils/cn';

const STATUS_META: Record<
  CompileStatus,
  { icon: typeof CheckCircle2; color: string; label: string }
> = {
  success: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Succeeded' },
  succeededWithErrors: { icon: AlertTriangle, color: 'text-amber-400', label: 'Completed with errors' },
  failed: { icon: XCircle, color: 'text-rose-400', label: 'Failed' },
  canceled: { icon: Ban, color: 'text-content-muted', label: 'Canceled' },
};

/** Recent compile history, newest first. */
export function HistoryPanel() {
  const history = useCompileStore((state) => state.history);

  if (history.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="size-8" />}
        title="No builds yet"
        description="Each compilation is recorded here with its duration and problem counts."
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto py-1">
      <ul>
        {history.map((entry) => {
          const meta = STATUS_META[entry.status];
          const Icon = meta.icon;

          return (
            <li
              key={entry.id}
              className="flex items-center gap-3 px-3 py-1.5 text-xs hover:bg-surface-hover"
            >
              <Icon className={cn('size-3.5 shrink-0', meta.color)} />

              <span className="w-16 shrink-0 font-mono text-[0.6875rem] text-content-muted tabular-nums">
                {formatClockTime(entry.finishedAt)}
              </span>

              <span className="min-w-0 flex-1 truncate text-content-primary">
                {entry.mainDocument}
              </span>

              <span className="shrink-0 rounded bg-surface-hover px-1.5 py-px text-[0.6875rem] text-content-muted">
                {entry.compiler}
              </span>

              {entry.errorCount > 0 && (
                <span className="shrink-0 text-rose-400">
                  {pluralize(entry.errorCount, 'error')}
                </span>
              )}
              {entry.warningCount > 0 && (
                <span className="shrink-0 text-amber-400">
                  {pluralize(entry.warningCount, 'warning')}
                </span>
              )}

              <span className="w-14 shrink-0 text-right text-content-secondary tabular-nums">
                {formatDuration(entry.durationMs)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
