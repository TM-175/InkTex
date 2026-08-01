/**
 * PDF.js bootstrapping and document loading.
 *
 * The worker is imported through Vite's `?url` so it is served from the bundle
 * rather than a CDN, which the webview's CSP would block.
 */

import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { toAppError, type AppError } from '@/types/errors';

let configured = false;

function configure(): void {
  if (configured) return;
  configured = true;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
}

/**
 * Parse PDF bytes into a document.
 *
 * The buffer is copied because PDF.js takes ownership of what it is given and
 * detaches it — reusing the caller's array afterwards would throw.
 */
export async function loadPdfDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  configure();

  try {
    const task = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      disableFontFace: false,
      useSystemFonts: true,
    });
    return await task.promise;
  } catch (error) {
    throw asPdfError(error);
  }
}

/**
 * Release a document and the worker backing it.
 *
 * The teardown lives on the *loading task*, not the document, so a viewer that
 * only dropped its reference to the proxy would leak a worker per compile.
 */
export async function destroyPdfDocument(document: PDFDocumentProxy | null): Promise<void> {
  if (document === null) return;

  try {
    await document.loadingTask.destroy();
  } catch {
    // Already torn down, or the worker died with the page; nothing to do.
  }
}

/** Turn a PDF.js failure into a message that names a likely cause. */
function asPdfError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error);

  if (/invalid pdf|structure/i.test(message)) {
    return {
      kind: 'io',
      message: 'The output PDF could not be read — it appears to be incomplete.',
      hint: 'This usually means the compiler was interrupted. Try compiling again.',
    };
  }
  if (/password/i.test(message)) {
    return {
      kind: 'io',
      message: 'This PDF is password protected and cannot be previewed.',
      hint: null,
    };
  }
  return toAppError(error, 'The PDF could not be displayed.');
}

/** Zoom steps used by the +/- controls. */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

export function nextZoomStep(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_STEPS.find((step) => step > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]!;
  }
  const smaller = ZOOM_STEPS.filter((step) => step < current - 0.001);
  return smaller[smaller.length - 1] ?? ZOOM_STEPS[0]!;
}

/**
 * Device pixel ratio to render at, capped so a 4×-scaled page on a Retina
 * display does not allocate a canvas large enough to stall the compositor.
 */
export function renderScale(zoom: number): number {
  const ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(ratio, zoom > 2 ? 1.5 : 2);
}
