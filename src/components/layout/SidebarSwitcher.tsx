import { Code2, Files } from 'lucide-react';
import { useUiStore, type SidebarView } from '@/store/uiStore';
import { useCodeStore } from '@/store/codeStore';
import { FileExplorer } from '@/components/explorer/FileExplorer';
import { CodeAssetsPanel } from '@/components/code/CodeAssetsPanel';
import { cn } from '@/utils/cn';

const VIEWS: { id: SidebarView; label: string; icon: typeof Files }[] = [
  { id: 'files', label: 'Project files', icon: Files },
  { id: 'code', label: 'Code assets', icon: Code2 },
];

/**
 * The left sidebar, switching between the project file tree and the code-asset
 * browser.
 *
 * A rail rather than tabs: the two views are peers the user flips between, and
 * a rail keeps the labels out of the way while staying one click from either.
 */
export function SidebarSwitcher() {
  const view = useUiStore((state) => state.sidebarView);
  const setView = useUiStore((state) => state.setSidebarView);
  const assetCount = useCodeStore((state) => state.assets.length);

  return (
    <div className="flex h-full min-h-0">
      <nav
        className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-border-subtle bg-surface-sunken py-2"
        aria-label="Sidebar sections"
      >
        {VIEWS.map((candidate) => {
          const Icon = candidate.icon;
          const active = view === candidate.id;

          return (
            <button
              key={candidate.id}
              type="button"
              title={candidate.label}
              aria-label={candidate.label}
              aria-pressed={active}
              onClick={() => setView(candidate.id)}
              className={cn(
                'relative flex size-8 items-center justify-center rounded-md transition-colors',
                active
                  ? 'bg-accent-soft text-accent'
                  : 'text-content-muted hover:bg-surface-hover hover:text-content-secondary',
              )}
            >
              <Icon className="size-4" />
              {candidate.id === 'code' && assetCount > 0 && !active && (
                <span className="absolute right-1 bottom-1 size-1.5 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">
        {view === 'files' ? <FileExplorer /> : <CodeAssetsPanel />}
      </div>
    </div>
  );
}
