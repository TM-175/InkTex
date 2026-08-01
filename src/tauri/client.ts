/**
 * The single point where the frontend talks to Rust.
 *
 * Everything else in `src/tauri/` is a typed wrapper over {@link call}. Keeping
 * `invoke` behind one function means error normalisation, and the browser-mode
 * guard below, live in exactly one place.
 */

import { invoke } from '@tauri-apps/api/core';
import { toAppError, type AppError } from '@/types/errors';

/**
 * True when running inside the Tauri webview rather than a plain browser.
 *
 * `vite dev` alone (without `tauri dev`) has no Rust side; failing with a clear
 * message beats an opaque "__TAURI_INTERNALS__ is undefined".
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const NO_BACKEND: AppError = {
  kind: 'internal',
  message: 'InkTex is running without its backend.',
  hint: 'Start the app with `npm start` (tauri dev) rather than `npm run dev`.',
};

/**
 * Invoke a Rust command, rejecting with a structured {@link AppError}.
 *
 * @param command Name registered in `invoke_handler!`.
 * @param args Arguments, keyed by the Rust parameter names (camelCase).
 */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw NO_BACKEND;

  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toAppError(error, `The “${command}” operation failed.`);
  }
}

/**
 * Invoke a command that returns raw bytes.
 *
 * Commands returning `tauri::ipc::Response` deliver an `ArrayBuffer` rather
 * than JSON, which is what makes loading a multi-megabyte PDF instant.
 */
export async function callBinary(
  command: string,
  args?: Record<string, unknown>,
): Promise<Uint8Array> {
  const result = await call<ArrayBuffer | number[]>(command, args);

  // Tauri delivers an ArrayBuffer; the array form is a defensive fallback.
  return result instanceof ArrayBuffer ? new Uint8Array(result) : new Uint8Array(result);
}
