/**
 * Typed subscriptions to backend events.
 *
 * Each helper returns an unlisten function suitable for a `useEffect` cleanup.
 * Channel names and payloads are documented in `src-tauri/src/lib.rs`.
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { CompileOutputEvent, CompileResult, CompileStartedEvent } from '@/types/compile';
import type { FsChangeEvent } from '@/types/project';
import { isTauri } from './client';

/** Subscribe when running under Tauri; a no-op unlisten otherwise. */
async function subscribe<T>(
  channel: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<T>(channel, (event) => handler(event.payload));
}

export function onCompileStarted(handler: (event: CompileStartedEvent) => void) {
  return subscribe<CompileStartedEvent>('compile://started', handler);
}

/** One line of toolchain output, emitted while the build runs. */
export function onCompileOutput(handler: (event: CompileOutputEvent) => void) {
  return subscribe<CompileOutputEvent>('compile://output', handler);
}

export function onCompileFinished(handler: (result: CompileResult) => void) {
  return subscribe<CompileResult>('compile://finished', handler);
}

/** Debounced filesystem changes within the open project. */
export function onFsChanged(handler: (event: FsChangeEvent) => void) {
  return subscribe<FsChangeEvent>('project://fs-changed', handler);
}

/** The watcher could not be started, or failed mid-session. */
export function onWatchError(handler: (message: string) => void) {
  return subscribe<string>('project://watch-error', handler);
}

/**
 * Files dropped onto the window.
 *
 * Tauri emits this for the whole webview; the drop target decides what to do
 * based on where the pointer was.
 */
export function onFileDrop(handler: (paths: string[]) => void) {
  return subscribe<{ paths: string[] }>('tauri://drag-drop', (payload) =>
    handler(payload?.paths ?? []),
  );
}
