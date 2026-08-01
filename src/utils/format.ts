/** Presentation helpers for durations, sizes and timestamps. */

/** Compact duration: `840ms`, `2.4s`, `1m 12s`. */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)}s`;

  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.round((milliseconds % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Coarse relative time: `just now`, `5m ago`, `3d ago`, else a date. */
export function formatRelativeTime(epochMillis: number): string {
  if (!epochMillis) return 'unknown';

  const elapsed = Date.now() - epochMillis;
  if (elapsed < 60_000) return 'just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  if (elapsed < 7 * 86_400_000) return `${Math.floor(elapsed / 86_400_000)}d ago`;

  return new Date(epochMillis).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Clock time, used in the compile history list. */
export function formatClockTime(epochMillis: number): string {
  return new Date(epochMillis).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Shorten a long absolute path for display, keeping the tail readable. */
export function truncatePath(path: string, maxLength = 48): string {
  if (path.length <= maxLength) return path;
  return `…${path.slice(path.length - maxLength + 1)}`;
}

/** `1 error`, `2 errors` — pluralisation for status text. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
