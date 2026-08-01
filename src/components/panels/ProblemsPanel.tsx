import { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Info } from 'lucide-react';
import { useCompileStore } from '@/store/compileStore';
import { useProjectStore } from '@/store/projectStore';
import { countBySeverity } from '@/services/compileService';
import type { Diagnostic, DiagnosticSeverity } from '@/types/compile';
import { EmptyState } from '@/components/ui/Feedback';
import { cn } from '@/utils/cn';

const SEVERITY_META: Record<
  DiagnosticSeverity,
  { icon: typeof AlertCircle; color: string; label: string }
> = {
  error: { icon: AlertCircle, color: 'text-rose-400', label: 'Errors' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', label: 'Warnings' },
  info: { icon: Info, color: 'text-sky-400', label: 'Info' },
};

export function ProblemsPanel() {
  const diagnostics = useCompileStore((state) => state.diagnostics);
  const openFile = useProjectStore((state) => state.openFile);

  const [hidden, setHidden] = useState<Set<DiagnosticSeverity>>(() => new Set(['info']));
  const [expanded, setExpanded] = useState<number | null>(null);

  const counts = useMemo(() => countBySeverity(diagnostics), [diagnostics]);
  const visible = useMemo(
    () => diagnostics.filter((diagnostic) => !hidden.has(diagnostic.severity)),
    [diagnostics, hidden],
  );

  const toggleSeverity = (severity: DiagnosticSeverity): void => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });
  };

  /** Open the file a diagnostic points at, at the right line. */
  const jumpTo = (diagnostic: Diagnostic): void => {
    if (diagnostic.file === null) return;
    void openFile(diagnostic.file, {
      path: diagnostic.file,
      line: diagnostic.line ?? 1,
      column: 1,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Severity filters */}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
        {(Object.keys(SEVERITY_META) as DiagnosticSeverity[]).map((severity) => {
          const meta = SEVERITY_META[severity];
          const Icon = meta.icon;
          const active = !hidden.has(severity);

          return (
            <button
              key={severity}
              type="button"
              onClick={() => toggleSeverity(severity)}
              aria-pressed={active}
              title={`${active ? 'Hide' : 'Show'} ${meta.label.toLowerCase()}`}
              className={cn(
                'flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
                active
                  ? 'bg-surface-hover text-content-primary'
                  : 'text-content-muted hover:bg-surface-hover',
              )}
            >
              <Icon className={cn('size-3.5', active ? meta.color : '')} />
              <span className="tabular-nums">{counts[severity]}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="size-8" />}
            title={
              diagnostics.length === 0
                ? 'No problems detected'
                : 'No problems match the current filters'
            }
            description={
              diagnostics.length === 0
                ? 'Errors and warnings from the compiler appear here.'
                : undefined
            }
          />
        ) : (
          <ul className="py-1">
            {visible.map((diagnostic, index) => {
              const meta = SEVERITY_META[diagnostic.severity];
              const Icon = meta.icon;
              const clickable = diagnostic.file !== null;
              const isExpanded = expanded === index;

              return (
                <li key={`${diagnostic.file ?? ''}-${diagnostic.line ?? 0}-${index}`}>
                  <div
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={() => clickable && jumpTo(diagnostic)}
                    onKeyDown={(event) => {
                      if (clickable && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        jumpTo(diagnostic);
                      }
                    }}
                    className={cn(
                      'group flex items-start gap-2 px-3 py-1.5 text-xs transition-colors',
                      clickable ? 'cursor-pointer hover:bg-surface-hover' : 'cursor-default',
                    )}
                  >
                    <Icon className={cn('mt-0.5 size-3.5 shrink-0', meta.color)} />

                    <div className="min-w-0 flex-1">
                      <p className="selectable leading-relaxed text-content-primary">
                        {diagnostic.message}
                      </p>

                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-content-muted">
                        {diagnostic.file !== null && (
                          <span className="text-accent">
                            {diagnostic.file}
                            {diagnostic.line !== null && `:${diagnostic.line}`}
                          </span>
                        )}
                        {diagnostic.component !== null && diagnostic.component !== '' && (
                          <span className="rounded bg-surface-hover px-1.5 py-px">
                            {diagnostic.component}
                          </span>
                        )}
                      </div>

                      {isExpanded && (
                        <pre className="selectable mt-1.5 overflow-x-auto rounded bg-surface-sunken p-2 font-mono text-[0.6875rem] leading-relaxed whitespace-pre text-content-secondary">
                          {diagnostic.raw}
                        </pre>
                      )}
                    </div>

                    <button
                      type="button"
                      aria-label={isExpanded ? 'Hide log excerpt' : 'Show log excerpt'}
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpanded(isExpanded ? null : index);
                      }}
                      className="shrink-0 rounded p-0.5 text-content-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-content-primary"
                    >
                      <ChevronRight
                        className={cn('size-3.5 transition-transform', isExpanded && 'rotate-90')}
                      />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
