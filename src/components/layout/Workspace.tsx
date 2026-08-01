import { lazy, Suspense, useCallback, useRef } from 'react';
import { useUiStore } from '@/store/uiStore';
import { useResizable } from '@/hooks/useResizable';
import { SidebarSwitcher } from './SidebarSwitcher';
import { ListingInspector } from '@/components/code/ListingInspector';
import { EditorPane } from '@/components/editor/EditorPane';
import { BottomPanel } from '@/components/panels/BottomPanel';
import { Spinner } from '@/components/ui/Feedback';

// PDF.js is ~1.7 MB with its worker. Loading the preview lazily keeps it out of
// the initial bundle, and keeps it in the same chunk as the viewer the editor
// pane lazy-loads for `.pdf` files in the project.
const PdfPreview = lazy(() =>
  import('@/components/pdf/PdfPreview').then((module) => ({ default: module.PdfPreview })),
);

/**
 * The three-pane workspace.
 *
 * Explorer and bottom panel are sized in pixels, so they stay put as the window
 * resizes. The editor/preview split is a fraction, so both keep their share of
 * the remaining width.
 */
export function Workspace() {
  const explorerVisible = useUiStore((state) => state.explorerVisible);
  const previewVisible = useUiStore((state) => state.previewVisible);
  const bottomPanelVisible = useUiStore((state) => state.bottomPanelVisible);
  const explorerWidth = useUiStore((state) => state.explorerWidth);
  const previewFraction = useUiStore((state) => state.previewFraction);
  const bottomPanelHeight = useUiStore((state) => state.bottomPanelHeight);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const setExplorerWidth = useUiStore((state) => state.setExplorerWidth);
  const setPreviewFraction = useUiStore((state) => state.setPreviewFraction);
  const setBottomPanelHeight = useUiStore((state) => state.setBottomPanelHeight);

  /** Measured to convert the split handle's pixel drag into a fraction. */
  const splitAreaRef = useRef<HTMLDivElement>(null);

  const explorerResize = useResizable({
    axis: 'horizontal',
    current: () => useUiStore.getState().explorerWidth,
    onResize: setExplorerWidth,
  });

  const previewResize = useResizable({
    axis: 'horizontal',
    // Track the handle in pixels, then convert to a fraction on each move.
    current: () => {
      const width = splitAreaRef.current?.clientWidth ?? 1;
      return width * (1 - useUiStore.getState().previewFraction);
    },
    onResize: useCallback(
      (editorWidth: number) => {
        const width = splitAreaRef.current?.clientWidth ?? 1;
        setPreviewFraction(1 - editorWidth / width);
      },
      [setPreviewFraction],
    ),
  });

  const bottomResize = useResizable({
    axis: 'vertical',
    current: () => useUiStore.getState().bottomPanelHeight,
    onResize: setBottomPanelHeight,
    // The handle sits above the panel, so dragging up must grow it.
    invert: true,
  });

  return (
    <div className="flex min-h-0 flex-1">
      {explorerVisible && (
        <>
          <aside
            style={{ width: explorerWidth }}
            className="min-w-0 shrink-0 overflow-hidden"
          >
            <SidebarSwitcher />
          </aside>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize file explorer"
            className="resize-handle resize-handle-vertical"
            {...explorerResize}
          />
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={splitAreaRef} className="flex min-h-0 min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <EditorPane />
          </div>

          {inspectorOpen && (
            <div className="w-80 min-w-0 shrink-0">
              <ListingInspector />
            </div>
          )}

          {previewVisible && (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize PDF preview"
                className="resize-handle resize-handle-vertical"
                {...previewResize}
              />
              <div
                style={{ width: `${previewFraction * 100}%` }}
                className="min-w-0 shrink-0"
              >
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center bg-surface-raised">
                      <Spinner className="size-5 text-content-muted" />
                    </div>
                  }
                >
                  <PdfPreview />
                </Suspense>
              </div>
            </>
          )}
        </div>

        {bottomPanelVisible && (
          <>
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize bottom panel"
              className="resize-handle resize-handle-horizontal"
              {...bottomResize}
            />
            <div style={{ height: bottomPanelHeight }} className="min-h-0 shrink-0">
              <BottomPanel />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
