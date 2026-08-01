import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { isTabDirty, type EditorTab } from '@/types/editor';
import { FileIcon } from '@/components/ui/FileIcon';
import { ContextMenu, type MenuItem } from '@/components/ui/ContextMenu';
import { cn } from '@/utils/cn';
import { dirname } from '@/utils/path';

export function TabStrip() {
  const tabs = useProjectStore((state) => state.tabs);
  const activePath = useProjectStore((state) => state.activePath);
  const setActiveTab = useProjectStore((state) => state.setActiveTab);
  const closeTab = useProjectStore((state) => state.closeTab);
  const closeOthers = useProjectStore((state) => state.closeOtherTabs);
  const closeAll = useProjectStore((state) => state.closeAllTabs);

  const [menu, setMenu] = useState<{ position: { x: number; y: number }; items: MenuItem[] } | null>(
    null,
  );
  const stripRef = useRef<HTMLDivElement>(null);

  if (tabs.length === 0) return null;

  const openMenu = (event: React.MouseEvent, tab: EditorTab): void => {
    event.preventDefault();
    setMenu({
      position: { x: event.clientX, y: event.clientY },
      items: [
        { id: 'close', label: 'Close', onSelect: () => void closeTab(tab.path) },
        { id: 'close-others', label: 'Close Others', onSelect: () => void closeOthers(tab.path) },
        { id: 'close-all', label: 'Close All', onSelect: () => void closeAll() },
      ],
    });
  };

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label="Open files"
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border-subtle bg-surface-raised"
      onWheel={(event) => {
        // Let a vertical wheel scroll the strip horizontally.
        if (event.deltaY !== 0 && stripRef.current !== null) {
          stripRef.current.scrollLeft += event.deltaY;
        }
      }}
    >
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        const dirty = isTabDirty(tab);
        const directory = dirname(tab.path);

        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            title={tab.path}
            onClick={() => setActiveTab(tab.path)}
            onContextMenu={(event) => openMenu(event, tab)}
            onAuxClick={(event) => {
              // Middle-click closes, as in every browser and VS Code.
              if (event.button === 1) {
                event.preventDefault();
                void closeTab(tab.path);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setActiveTab(tab.path);
              }
            }}
            className={cn(
              'group relative flex max-w-56 min-w-0 shrink-0 cursor-default items-center gap-2',
              'border-r border-border-subtle px-3 text-[0.8125rem] transition-colors',
              active
                ? 'bg-surface-base text-content-primary'
                : 'text-content-secondary hover:bg-surface-hover',
            )}
          >
            {/* Active tab is marked with a top rule, the VS Code convention. */}
            {active && (
              <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" aria-hidden />
            )}

            <FileIcon kind={tab.kind} className="size-3.5" />

            <span className="truncate">{tab.name}</span>

            {tab.conflicted && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-amber-400"
                title="This file changed on disk"
              />
            )}

            {directory !== '' && !active && (
              <span className="hidden truncate text-[0.6875rem] text-content-muted lg:inline">
                {directory}
              </span>
            )}

            <button
              type="button"
              aria-label={`Close ${tab.name}`}
              onClick={(event) => {
                event.stopPropagation();
                void closeTab(tab.path);
              }}
              className={cn(
                'ml-auto flex size-4 shrink-0 items-center justify-center rounded transition-all',
                'hover:bg-surface-active hover:text-content-primary',
                // The dot stands in for the close button until hovered, so a
                // dirty file is obvious without crowding the tab.
                dirty ? 'text-content-primary' : 'text-content-muted opacity-0 group-hover:opacity-100',
              )}
            >
              {dirty ? (
                <span className="size-2 rounded-full bg-current group-hover:hidden" />
              ) : null}
              <X className={cn('size-3', dirty && 'hidden group-hover:block')} />
            </button>
          </div>
        );
      })}

      {menu !== null && (
        <ContextMenu position={menu.position} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
