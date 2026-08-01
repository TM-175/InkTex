import { ChevronDown } from 'lucide-react';
import { useCompileStore } from '@/store/compileStore';
import { useUiStore } from '@/store/uiStore';
import type { BottomPanelTab } from '@/types/editor';
import { IconButton } from '@/components/ui/Button';
import { ProblemsPanel } from './ProblemsPanel';
import { OutputPanel } from './OutputPanel';
import { HistoryPanel } from './HistoryPanel';
import { cn } from '@/utils/cn';

const TABS: { id: BottomPanelTab; label: string }[] = [
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Compiler Output' },
  { id: 'log', label: 'History' },
];

export function BottomPanel() {
  const activeTab = useUiStore((state) => state.bottomTab);
  const showTab = useUiStore((state) => state.showBottomTab);
  const toggle = useUiStore((state) => state.toggleBottomPanel);

  const errorCount = useCompileStore((state) => state.result?.errorCount ?? 0);
  const warningCount = useCompileStore((state) => state.result?.warningCount ?? 0);

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-border-subtle bg-surface-raised">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => showTab(tab.id)}
              className={cn(
                'relative flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors',
                active
                  ? 'text-content-primary'
                  : 'text-content-muted hover:text-content-secondary',
              )}
            >
              {tab.label}

              {tab.id === 'problems' && (errorCount > 0 || warningCount > 0) && (
                <span className="flex items-center gap-1 text-[0.6875rem] tabular-nums">
                  {errorCount > 0 && <span className="text-rose-400">{errorCount}</span>}
                  {warningCount > 0 && <span className="text-amber-400">{warningCount}</span>}
                </span>
              )}

              {active && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />
              )}
            </button>
          );
        })}

        <div className="ml-auto">
          <IconButton label="Hide panel" onClick={toggle}>
            <ChevronDown className="size-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === 'problems' && <ProblemsPanel />}
        {activeTab === 'output' && <OutputPanel />}
        {activeTab === 'log' && <HistoryPanel />}
      </div>
    </div>
  );
}
