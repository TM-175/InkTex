import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileWarning,
  Maximize2,
  MoveHorizontal,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { fsApi, systemApi } from '@/tauri';
import { destroyPdfDocument, loadPdfDocument, nextZoomStep } from '@/services/pdfService';
import { exportPdf } from '@/services/exportService';
import { useSettingsStore } from '@/store/settingsStore';
import { toAppError, type AppError } from '@/types/errors';
import { IconButton } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { PdfPage } from './PdfPage';
import { cn } from '@/utils/cn';

/** Where the viewer should read its bytes from. */
export interface PdfSource {
  kind: 'absolute';
  path: string;
}

interface PdfViewerProps {
  source: PdfSource | null;
  /** Bumped by the caller to force a reload after a successful compile. */
  version: number;
}

/** Gap between pages, in CSS pixels. Kept in sync with the layout below. */
const PAGE_GAP = 16;
/** Padding around the page column. */
const VIEW_PADDING = 16;

export function PdfViewer({ source, version }: PdfViewerProps) {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.update);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  /** Intrinsic (scale 1) size of the first page, used for fit calculations. */
  const [baseSize, setBaseSize] = useState<{ width: number; height: number } | null>(null);

  /**
   * Scroll offset preserved across reloads.
   *
   * Stored as a fraction of total height rather than pixels, so a document that
   * gained or lost a page still lands the reader near where they were.
   */
  const scrollRatio = useRef(0);
  const shouldRestore = useRef(false);

  // --- Load -----------------------------------------------------------------
  useEffect(() => {
    if (source === null) {
      setDocument(null);
      return;
    }

    let canceled = false;
    let loaded: PDFDocumentProxy | null = null;

    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      // Remember where the reader was before the document is replaced.
      const container = scrollRef.current;
      if (container !== null && container.scrollHeight > 0) {
        scrollRatio.current = container.scrollTop / container.scrollHeight;
        shouldRestore.current = settings.pdfRefreshBehavior === 'preserveScroll';
      }

      try {
        const bytes = await fsApi.readPdfFile(source.path);
        if (canceled) return;

        loaded = await loadPdfDocument(bytes);
        if (canceled) {
          void destroyPdfDocument(loaded);
          return;
        }

        const firstPage = await loaded.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });

        setBaseSize({ width: viewport.width, height: viewport.height });
        // The outgoing document is torn down by the cleanup effect below, which
        // is the single owner of that lifecycle.
        setDocument(loaded);
      } catch (caught) {
        if (!canceled) {
          setError(toAppError(caught, 'The PDF could not be opened.'));
          setDocument(null);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    void load();

    return () => {
      canceled = true;
    };
    // `settings.pdfRefreshBehavior` is read, not depended on: changing it should
    // not itself trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.path, version]);

  // Release each document when it is replaced, and the last one on unmount.
  // Every PDF.js document owns a worker, so skipping this leaks one per build.
  useEffect(() => () => void destroyPdfDocument(document), [document]);

  // --- Container measurement ------------------------------------------------
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (container === null) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // --- Zoom -----------------------------------------------------------------
  const scale = useMemo(() => {
    if (baseSize === null || containerSize.width === 0) return settings.pdfZoom;

    const available = containerSize.width - VIEW_PADDING * 2;

    switch (settings.pdfZoomMode) {
      case 'fitWidth':
        return Math.max(0.1, available / baseSize.width);
      case 'fitPage': {
        const availableHeight = containerSize.height - VIEW_PADDING * 2;
        return Math.max(
          0.1,
          Math.min(available / baseSize.width, availableHeight / baseSize.height),
        );
      }
      case 'custom':
        return settings.pdfZoom;
    }
  }, [baseSize, containerSize, settings.pdfZoomMode, settings.pdfZoom]);

  const setZoom = useCallback(
    (value: number) => updateSettings({ pdfZoomMode: 'custom', pdfZoom: value }),
    [updateSettings],
  );

  // --- Scroll tracking ------------------------------------------------------
  const onScroll = useCallback(() => {
    const container = scrollRef.current;
    if (container === null || document === null) return;

    // The page occupying the vertical centre is the one the reader is on.
    const midpoint = container.scrollTop + container.clientHeight / 2;
    const pages = container.querySelectorAll<HTMLElement>('[data-pdf-page]');

    for (const element of pages) {
      const top = element.offsetTop;
      if (midpoint >= top && midpoint <= top + element.offsetHeight + PAGE_GAP) {
        const number = Number(element.dataset.pdfPage);
        if (Number.isFinite(number)) setCurrentPage(number);
        return;
      }
    }
  }, [document]);

  // Restore the reader's position once the reloaded document has laid out.
  useEffect(() => {
    if (document === null) return;

    const container = scrollRef.current;
    if (container === null) return;

    if (settings.pdfRefreshBehavior === 'jumpToTop') {
      container.scrollTop = 0;
      setCurrentPage(1);
      return;
    }
    if (!shouldRestore.current) return;

    shouldRestore.current = false;
    const ratio = scrollRatio.current;

    // Two frames: one for the page slots to size, one for layout to settle.
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.scrollTop = ratio * container.scrollHeight;
        onScroll();
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [document, settings.pdfRefreshBehavior, onScroll]);

  const goToPage = useCallback((pageNumber: number): void => {
    const container = scrollRef.current;
    if (container === null) return;

    const target = container.querySelector<HTMLElement>(`[data-pdf-page="${pageNumber}"]`);
    if (target === null) return;

    container.scrollTo({ top: target.offsetTop - VIEW_PADDING, behavior: 'smooth' });
    setCurrentPage(pageNumber);
  }, []);

  // Ctrl/Cmd + wheel zooms, matching every other document viewer.
  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(Math.min(8, Math.max(0.1, scale * (event.deltaY < 0 ? 1.1 : 0.9))));
    },
    [scale, setZoom],
  );

  const pageCount = document?.numPages ?? 0;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-surface-raised">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
        <IconButton
          label="Previous page"
          disabled={currentPage <= 1}
          onClick={() => goToPage(currentPage - 1)}
        >
          <ChevronUp className="size-3.5" />
        </IconButton>
        <IconButton
          label="Next page"
          disabled={currentPage >= pageCount}
          onClick={() => goToPage(currentPage + 1)}
        >
          <ChevronDown className="size-3.5" />
        </IconButton>

        <div className="flex items-center gap-1 px-1 text-xs text-content-secondary">
          <input
            type="number"
            aria-label="Page number"
            value={currentPage}
            min={1}
            max={Math.max(pageCount, 1)}
            onChange={(event) => {
              const page = Number(event.target.value);
              if (page >= 1 && page <= pageCount) goToPage(page);
            }}
            className={cn(
              'h-6 w-10 rounded border border-border-subtle bg-surface-base px-1 text-center',
              'text-xs text-content-primary focus:border-accent focus:outline-none',
              '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
            )}
          />
          <span className="text-content-muted">/ {pageCount || '—'}</span>
        </div>

        <div className="mx-1 h-4 w-px bg-border-subtle" />

        <IconButton label="Zoom out" onClick={() => setZoom(nextZoomStep(scale, -1))}>
          <ZoomOut className="size-3.5" />
        </IconButton>
        <button
          type="button"
          title="Reset zoom to 100%"
          onClick={() => setZoom(1)}
          className="min-w-12 rounded px-1 text-xs text-content-secondary tabular-nums transition-colors hover:bg-surface-hover hover:text-content-primary"
        >
          {Math.round(scale * 100)}%
        </button>
        <IconButton label="Zoom in" onClick={() => setZoom(nextZoomStep(scale, 1))}>
          <ZoomIn className="size-3.5" />
        </IconButton>

        <div className="mx-1 h-4 w-px bg-border-subtle" />

        <IconButton
          label="Fit width"
          active={settings.pdfZoomMode === 'fitWidth'}
          onClick={() => updateSettings({ pdfZoomMode: 'fitWidth' })}
        >
          <MoveHorizontal className="size-3.5" />
        </IconButton>
        <IconButton
          label="Fit page"
          active={settings.pdfZoomMode === 'fitPage'}
          onClick={() => updateSettings({ pdfZoomMode: 'fitPage' })}
        >
          <Maximize2 className="size-3.5" />
        </IconButton>

        <div className="ml-auto flex items-center gap-1">
          {loading && <Spinner className="size-3.5 text-content-muted" />}

          <IconButton
            label="Open in the system PDF viewer"
            disabled={source === null}
            onClick={() => {
              if (source !== null) void systemApi.openExternally(source.path);
            }}
          >
            <ExternalLink className="size-3.5" />
          </IconButton>
          <IconButton
            label="Export PDF…"
            disabled={source === null}
            onClick={() => void exportPdf()}
          >
            <Download className="size-3.5" />
          </IconButton>
        </div>
      </div>

      {/* Pages */}
      <div
        ref={scrollRef}
        data-pdf-scroll
        onScroll={onScroll}
        onWheel={onWheel}
        className="min-h-0 flex-1 overflow-auto bg-surface-sunken"
      >
        {error !== null ? (
          <EmptyState
            icon={<FileWarning className="size-10" />}
            title={error.message}
            description={error.hint ?? undefined}
          />
        ) : document === null ? (
          loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="size-5 text-content-muted" />
            </div>
          ) : (
            <EmptyState
              icon={<RotateCw className="size-10" />}
              title="Nothing to preview yet"
              description="Compile the document to see the PDF here."
            />
          )
        ) : (
          <div
            className="flex flex-col items-center"
            style={{ gap: PAGE_GAP, padding: VIEW_PADDING }}
          >
            {Array.from({ length: document.numPages }, (_, index) => (
              <PdfPage
                key={`${version}-${index + 1}`}
                document={document}
                pageNumber={index + 1}
                scale={scale}
                // The first two pages render immediately so the preview is
                // never blank after a compile.
                priority={index < 2}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
