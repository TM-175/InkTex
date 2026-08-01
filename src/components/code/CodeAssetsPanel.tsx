import { useEffect, useMemo, useState } from 'react';
import { Braces, FileCode2, RefreshCw, Search, X } from 'lucide-react';
import type { CodeAsset } from '@/types/listing';
import { useCodeStore } from '@/store/codeStore';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { languageForFile, languageLabel } from '@/services/listings/languages';
import { fuzzyFilter } from '@/utils/fuzzy';
import { formatBytes } from '@/utils/format';
import { dirname } from '@/utils/path';
import { IconButton } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { ContextMenu, type MenuItem } from '@/components/ui/ContextMenu';
import { CodeAssetPreview } from './CodeAssetPreview';
import { cn } from '@/utils/cn';

/**
 * The Code Assets browser.
 *
 * A flat, fuzzy-searchable list grouped by folder rather than a nested tree:
 * source files in a project are usually spread across `src/`, `lib/` and
 * `test/`, and a student looking for `quicksort.py` wants to type its name, not
 * expand four folders. Grouping preserves the folder context a tree would give.
 *
 * The index comes from the backend and updates incrementally, so this stays
 * responsive on a repository with thousands of files.
 */
export function CodeAssetsPanel() {
  const assets = useCodeStore((state) => state.assets);
  const indexing = useCodeStore((state) => state.indexing);
  const indexed = useCodeStore((state) => state.indexed);
  const indexAssets = useCodeStore((state) => state.indexAssets);

  const openFile = useProjectStore((state) => state.openFile);
  const hasProject = useProjectStore((state) => state.project !== null);
  const openCodeImport = useUiStore((state) => state.openCodeImport);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CodeAsset | null>(null);
  const [menu, setMenu] = useState<{ position: { x: number; y: number }; items: MenuItem[] } | null>(
    null,
  );

  // Build the index the first time the panel is shown for a project.
  useEffect(() => {
    if (hasProject && !indexed && !indexing) void indexAssets();
  }, [hasProject, indexed, indexing, indexAssets]);

  const matches = useMemo(
    () => fuzzyFilter(assets, query, (asset) => asset.path, 400).map((entry) => entry.item),
    [assets, query],
  );

  /** Group results by folder, preserving the fuzzy ranking within each. */
  const groups = useMemo(() => {
    const byFolder = new Map<string, CodeAsset[]>();

    for (const asset of matches) {
      const folder = dirname(asset.path);
      const existing = byFolder.get(folder);
      if (existing === undefined) byFolder.set(folder, [asset]);
      else existing.push(asset);
    }
    return [...byFolder.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [matches]);

  const totalLines = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.lines, 0),
    [assets],
  );

  const openMenu = (event: React.MouseEvent, asset: CodeAsset): void => {
    event.preventDefault();
    setSelected(asset);
    setMenu({
      position: { x: event.clientX, y: event.clientY },
      items: [
        {
          id: 'insert',
          label: 'Insert into Document…',
          icon: <Braces className="size-3.5" />,
          onSelect: () => openCodeImport(asset),
        },
        {
          id: 'open',
          label: 'Open in Editor',
          icon: <FileCode2 className="size-3.5" />,
          onSelect: () => void openFile(asset.path),
        },
      ],
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-raised">
      <div className="flex h-9 shrink-0 items-center justify-between gap-1 border-b border-border-subtle pr-1 pl-3">
        <span className="text-[0.6875rem] font-semibold tracking-wider text-content-secondary uppercase">
          Code Assets
        </span>
        <IconButton label="Re-index source files" onClick={() => void indexAssets()}>
          <RefreshCw className={cn('size-3.5', indexing && 'animate-spin')} />
        </IconButton>
      </div>

      {/* Search */}
      <div className="relative shrink-0 border-b border-border-subtle p-2">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-content-muted" />
        <input
          type="text"
          value={query}
          placeholder="Search source files…"
          aria-label="Search source files"
          onChange={(event) => setQuery(event.target.value)}
          className={cn(
            'h-7 w-full rounded-md border border-border-subtle bg-surface-base pr-7 pl-7',
            'text-xs text-content-primary placeholder:text-content-muted',
            'focus:border-accent focus:outline-none',
          )}
        />
        {query !== '' && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="absolute top-1/2 right-4 -translate-y-1/2 text-content-muted hover:text-content-primary"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Results */}
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {indexing && assets.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-content-muted">
            <Spinner className="size-3.5" />
            Indexing source files…
          </div>
        )}

        {!indexing && assets.length === 0 && (
          <EmptyState
            icon={<FileCode2 className="size-8" />}
            title="No source files found"
            description="InkTex indexes code files next to your document — add a .py, .java, .rs or similar file to the project."
          />
        )}

        {assets.length > 0 && matches.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-content-muted">
            Nothing matches “{query}”.
          </p>
        )}

        {groups.map(([folder, items]) => (
          <div key={folder} className="mb-1">
            <div className="truncate px-3 py-1 text-[0.625rem] font-medium tracking-wide text-content-muted uppercase">
              {folder === '' ? 'Project root' : folder}
            </div>

            {items.map((asset) => {
              const language = languageForFile(asset.path);
              const isSelected = selected?.path === asset.path;

              return (
                <button
                  key={asset.path}
                  type="button"
                  onClick={() => setSelected(isSelected ? null : asset)}
                  onDoubleClick={() => void openFile(asset.path)}
                  onContextMenu={(event) => openMenu(event, asset)}
                  draggable
                  onDragStart={(event) => {
                    // Same payload the explorer uses, so the editor drop target
                    // handles both sources identically.
                    event.dataTransfer.setData('application/x-inktex-path', asset.path);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1 text-left text-[0.8125rem] transition-colors',
                    isSelected
                      ? 'bg-accent-soft text-content-primary'
                      : 'text-content-secondary hover:bg-surface-hover',
                  )}
                >
                  <FileCode2 className="size-3.5 shrink-0 text-indigo-400" />
                  <span className="min-w-0 flex-1 truncate" title={asset.path}>
                    {asset.name}
                  </span>
                  <span className="shrink-0 text-[0.625rem] text-content-muted tabular-nums">
                    {asset.truncated ? formatBytes(asset.size) : `${asset.lines} L`}
                  </span>
                  {language !== undefined && (
                    <span className="w-14 shrink-0 truncate text-right text-[0.625rem] text-content-muted">
                      {language.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Preview of the selected file */}
      {selected !== null && (
        <CodeAssetPreview
          asset={selected}
          onInsert={() => openCodeImport(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="flex h-6 shrink-0 items-center justify-between border-t border-border-subtle px-3 text-[0.6875rem] text-content-muted">
        <span>
          {assets.length} file{assets.length === 1 ? '' : 's'}
          {query !== '' && ` · ${matches.length} shown`}
        </span>
        <span>{totalLines.toLocaleString()} lines</span>
      </div>

      {menu !== null && (
        <ContextMenu position={menu.position} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

/** Language label for an asset, for use in list rows elsewhere. */
export function assetLanguageLabel(asset: CodeAsset): string {
  const language = languageForFile(asset.path);
  return language === undefined ? asset.extension.toUpperCase() : languageLabel(language.id);
}
