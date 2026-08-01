/** Timing helpers used for auto-save and auto-compile scheduling. */

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Run the pending call immediately, if any. */
  flush(): void;
  /** Discard the pending call. */
  cancel(): void;
}

/**
 * Delay `fn` until `wait` ms have passed without another call.
 *
 * The returned function exposes `flush` and `cancel` so callers can force a
 * pending auto-save (on window blur) or abandon one (on tab close).
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: A | null = null;

  const debounced = ((...args: A) => {
    pendingArgs = args;
    if (timer !== null) clearTimeout(timer);

    timer = setTimeout(() => {
      timer = null;
      const call = pendingArgs;
      pendingArgs = null;
      if (call !== null) fn(...call);
    }, wait);
  }) as Debounced<A>;

  debounced.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;

    const call = pendingArgs;
    pendingArgs = null;
    if (call !== null) fn(...call);
  };

  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };

  return debounced;
}
