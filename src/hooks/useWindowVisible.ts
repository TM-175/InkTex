/**
 * Whether the webview is actually being composited.
 *
 * macOS reports the document as hidden when its window is minimised or fully
 * covered by another window, and WebKit suspends `requestAnimationFrame` for
 * the whole time it is. That matters because PDF.js drives rasterisation from
 * rAF: a render started while the window is buried never advances, and the
 * page it was drawing stays blank.
 *
 * Callers use this to hold rendering back until there is a compositor to draw
 * into, and to start again when there is.
 */

import { useEffect, useState } from 'react';

export function useWindowVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const onChange = (): void => setVisible(!document.hidden);

    document.addEventListener('visibilitychange', onChange);
    // Occlusion and focus are distinct on macOS, but a window that regains
    // focus is definitely being composited again — and `visibilitychange` has
    // been known to lag behind it.
    window.addEventListener('focus', onChange);

    return () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('focus', onChange);
    };
  }, []);

  return visible;
}
