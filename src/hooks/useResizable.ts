/**
 * Pointer-driven pane resizing.
 *
 * Uses pointer capture so a fast drag that leaves the handle keeps resizing,
 * and suppresses text selection for the duration.
 */

import { useCallback, useRef } from 'react';

interface ResizableOptions {
  /** Which axis the handle moves along. */
  axis: 'horizontal' | 'vertical';
  /** Current size, read when a drag starts. */
  current: () => number;
  /** Called with the new size on every pointer move. */
  onResize: (size: number) => void;
  /** Invert the delta, for handles on the right/bottom of their pane. */
  invert?: boolean;
}

export function useResizable({ axis, current, onResize, invert = false }: ResizableOptions) {
  const start = useRef({ position: 0, size: 0 });

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Ignore secondary buttons so a right-click never starts a drag.
      if (event.button !== 0) return;

      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);

      start.current = {
        position: axis === 'horizontal' ? event.clientX : event.clientY,
        size: current(),
      };

      document.body.style.userSelect = 'none';
      document.body.style.cursor = axis === 'horizontal' ? 'col-resize' : 'row-resize';
    },
    [axis, current],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

      const position = axis === 'horizontal' ? event.clientX : event.clientY;
      const delta = (position - start.current.position) * (invert ? -1 : 1);
      onResize(start.current.size + delta);
    },
    [axis, invert, onResize],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}
