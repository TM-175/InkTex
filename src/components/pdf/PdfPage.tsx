import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { renderScale } from '@/services/pdfService';
import { cn } from '@/utils/cn';

interface PdfPageProps {
  document: PDFDocumentProxy;
  pageNumber: number;
  /** CSS pixels per PDF unit. */
  scale: number;
  /** Render eagerly rather than waiting to scroll into view. */
  priority: boolean;
  /** Reports the page's laid-out size so the container can size its slot. */
  onMeasure?: (pageNumber: number, size: { width: number; height: number }) => void;
}

/**
 * One page of the document.
 *
 * Rendering is deferred until the page approaches the viewport, so a 300-page
 * thesis costs the same to open as a one-page note. The placeholder keeps the
 * page's real dimensions so the scrollbar never jumps as pages fill in.
 */
export function PdfPage({ document, pageNumber, scale, priority, onMeasure }: PdfPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<RenderTask | null>(null);

  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [visible, setVisible] = useState(priority);
  const [rendered, setRendered] = useState(false);

  // Measure the page up front; this is cheap and does not rasterise anything.
  useEffect(() => {
    let canceled = false;

    void document.getPage(pageNumber).then((page) => {
      if (canceled) return;
      const viewport = page.getViewport({ scale });
      const next = { width: viewport.width, height: viewport.height };

      setSize(next);
      onMeasure?.(pageNumber, next);
    });

    return () => {
      canceled = true;
    };
  }, [document, pageNumber, scale, onMeasure]);

  // Start rendering shortly before the page scrolls into view.
  useEffect(() => {
    if (priority) {
      setVisible(true);
      return;
    }

    const element = containerRef.current;
    if (element === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // One viewport of lead time in each direction.
      { root: element.closest('[data-pdf-scroll]'), rootMargin: '100% 0px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [priority]);

  // Rasterise.
  useEffect(() => {
    if (!visible) return;

    let canceled = false;
    setRendered(false);

    const draw = async (): Promise<void> => {
      const page = await document.getPage(pageNumber);
      if (canceled) return;

      const canvas = canvasRef.current;
      if (canvas === null) return;

      const viewport = page.getViewport({ scale });
      const pixelRatio = renderScale(scale);

      // Back the canvas at device resolution, then scale it down with CSS so
      // text stays crisp on a Retina display.
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const context = canvas.getContext('2d', { alpha: false });
      if (context === null) return;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      // Abandon any render still running for a previous zoom level.
      renderTask.current?.cancel();

      const task = page.render({ canvas, canvasContext: context, viewport });
      renderTask.current = task;

      try {
        await task.promise;
        if (!canceled) setRendered(true);
      } catch {
        // A cancelled render rejects; that is the expected path when zooming.
      }
    };

    void draw();

    return () => {
      canceled = true;
      renderTask.current?.cancel();
      renderTask.current = null;
    };
  }, [visible, document, pageNumber, scale]);

  return (
    <div
      ref={containerRef}
      data-pdf-page={pageNumber}
      className="relative shrink-0 bg-white shadow-lg shadow-black/20"
      style={size === null ? { width: 612 * scale, height: 792 * scale } : size}
    >
      <canvas
        ref={canvasRef}
        className={cn('block transition-opacity duration-150', rendered ? 'opacity-100' : 'opacity-0')}
      />
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-slate-400">{pageNumber}</span>
        </div>
      )}
    </div>
  );
}
