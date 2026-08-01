import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Clock } from 'lucide-react';
import { useCompileStore } from '@/store/compileStore';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { statusColor, summarize } from '@/services/compileService';
import { isTabDirty } from '@/types/editor';
import { formatDuration } from '@/utils/format';
import { cn } from '@/utils/cn';

export function StatusBar() {
  const phase = useCompileStore((state) => state.phase);
  const result = useCompileStore((state) => state.result);
  const startedAt = useCompileStore((state) => state.startedAt);
  const environment = useCompileStore((state) => state.environment);

  const tabs = useProjectStore((state) => state.tabs);
  const activePath = useProjectStore((state) => state.activePath);
  const showBottomTab = useUiStore((state) => state.showBottomTab);
  const settings = useSettingsStore((state) => state.settings);

  const activeTab = tabs.find((tab) => tab.path === activePath) ?? null;
  const dirtyCount = tabs.filter(isTabDirty).length;

  // Live elapsed time while a build runs.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (phase !== 'running' || startedAt === null) {
      setElapsed(0);
      return;
    }

    const tick = (): void => setElapsed(Date.now() - startedAt);
    tick();

    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [phase, startedAt]);

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-border-subtle bg-surface-raised px-3 text-[0.6875rem] text-content-secondary">
      {/* Compile status */}
      <button
        type="button"
        onClick={() => showBottomTab(phase === 'running' ? 'output' : 'problems')}
        className="flex items-center gap-1.5 rounded px-1 transition-colors hover:bg-surface-hover"
      >
        {phase === 'running' ? (
          <>
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
            <span>Compiling… {formatDuration(elapsed)}</span>
          </>
        ) : phase === 'canceling' ? (
          <span>Canceling…</span>
        ) : result !== null ? (
          <span className={statusColor(result.status)}>{summarize(result)}</span>
        ) : (
          <span className="text-content-muted">Ready</span>
        )}
      </button>

      {/* Problem counts */}
      {result !== null && (result.errorCount > 0 || result.warningCount > 0) && (
        <button
          type="button"
          onClick={() => showBottomTab('problems')}
          className="flex items-center gap-2 rounded px-1 transition-colors hover:bg-surface-hover"
        >
          {result.errorCount > 0 && (
            <span className="flex items-center gap-1 text-rose-400">
              <AlertCircle className="size-3" />
              {result.errorCount}
            </span>
          )}
          {result.warningCount > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="size-3" />
              {result.warningCount}
            </span>
          )}
        </button>
      )}

      <div className="ml-auto flex items-center gap-3">
        {/* Missing toolchain is worth surfacing permanently. */}
        {environment !== null && !environment.installed && (
          <span className="flex items-center gap-1 text-amber-400">
            <AlertTriangle className="size-3" />
            No TeX installation found
          </span>
        )}

        {dirtyCount > 0 && settings.autoSave === 'off' && (
          <span className="text-amber-400">
            {dirtyCount} unsaved
          </span>
        )}

        {activeTab !== null && activeTab.viewState !== null && (
          <span className="tabular-nums">
            Ln {activeTab.viewState.line}, Col {activeTab.viewState.column}
          </span>
        )}

        {activeTab !== null && (
          <span className="text-content-muted">
            {settings.insertSpaces ? 'Spaces' : 'Tabs'}: {settings.tabWidth}
          </span>
        )}

        {result !== null && (
          <span className={cn('flex items-center gap-1 text-content-muted')}>
            <Clock className="size-3" />
            {formatDuration(result.durationMs)}
          </span>
        )}
      </div>
    </footer>
  );
}
