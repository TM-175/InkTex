import { lazy, Suspense, useState } from 'react';
import { AlertTriangle, FileCode2 } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { useCodeStore } from '@/store/codeStore';
import { isEditable } from '@/services/tabService';
import { shortcutLabel } from '@/services/shortcuts';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { cn } from '@/utils/cn';
import { TabStrip } from './TabStrip';
import { ImagePreview, UnsupportedPreview } from './BinaryPreview';

// Monaco is the largest dependency in the bundle; loading it only once a text
// file is actually opened keeps the first paint fast.
const MonacoEditor = lazy(() =>
  import('./MonacoEditor').then((module) => ({ default: module.MonacoEditor })),
);

// The PDF viewer is reused here for `.pdf` files that live in the project.
const PdfViewer = lazy(() =>
  import('@/components/pdf/PdfViewer').then((module) => ({ default: module.PdfViewer })),
);

export function EditorPane() {
  const tabs = useProjectStore((state) => state.tabs);
  const activePath = useProjectStore((state) => state.activePath);
  const project = useProjectStore((state) => state.project);
  const reloadFromDisk = useProjectStore((state) => state.reloadTabFromDisk);
  const saveTab = useProjectStore((state) => state.saveTab);
  const openOverlay = useUiStore((state) => state.openOverlay);
  const openCodeImport = useUiStore((state) => state.openCodeImport);
  const openFile = useProjectStore((state) => state.openFile);
  const assets = useCodeStore((state) => state.assets);

  const [dropActive, setDropActive] = useState(false);

  const tab = tabs.find((candidate) => candidate.path === activePath) ?? null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-surface-base">
      <TabStrip />

      {tab === null ? (
        <EmptyState
          icon={<FileCode2 className="size-12" />}
          title="No file open"
          description="Choose a file in the explorer, or press the shortcut below to search by name."
          action={
            <Button variant="secondary" size="sm" onClick={() => openOverlay('quickOpen')}>
              Quick Open
              <kbd className="ml-1.5 rounded border border-border-subtle bg-surface-base px-1.5 py-0.5 font-mono text-[0.6875rem] text-content-muted">
                {shortcutLabel('palette.files')}
              </kbd>
            </Button>
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {tab.conflicted && (
            <div className="flex shrink-0 items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <AlertTriangle className="size-4 shrink-0 text-amber-400" />
              <p className="min-w-0 flex-1 text-xs text-content-primary">
                <span className="font-medium">{tab.name}</span> changed on disk while you had
                unsaved edits.
              </p>
              <Button size="sm" variant="ghost" onClick={() => void reloadFromDisk(tab.path)}>
                Discard Mine
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void saveTab(tab.path)}>
                Keep Mine
              </Button>
            </div>
          )}

          <div
            className={cn('relative min-h-0 flex-1', dropActive && 'ring-2 ring-accent ring-inset')}
            onDragOver={(event) => {
              // Only source files can become listings; everything else falls
              // through to the default handling.
              if (!event.dataTransfer.types.includes('application/x-inktex-path')) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(event) => {
              const path = event.dataTransfer.getData('application/x-inktex-path');
              setDropActive(false);
              if (path === '') return;

              event.preventDefault();
              const asset = assets.find((candidate) => candidate.path === path);

              if (asset === undefined) {
                // Not an indexed source file — open it as a document instead.
                void openFile(path);
                return;
              }
              // Ask what to import: whole file, a range, or a named region.
              openCodeImport(asset);
            }}
          >
            {dropActive && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-accent px-3 py-1 text-center text-xs font-medium text-white">
                Drop to insert as a code listing
              </div>
            )}
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Spinner className="size-5 text-content-muted" />
                </div>
              }
            >
              {isEditable(tab.kind) ? (
                <MonacoEditor tab={tab} />
              ) : tab.kind === 'image' ? (
                <ImagePreview tab={tab} />
              ) : tab.kind === 'pdf' && project !== null ? (
                <PdfViewer
                  source={{ kind: 'absolute', path: `${project.root}/${tab.path}` }}
                  version={0}
                />
              ) : (
                <UnsupportedPreview tab={tab} />
              )}
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
