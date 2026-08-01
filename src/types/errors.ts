/**
 * Structured errors crossing the IPC boundary.
 *
 * Mirrors `src-tauri/src/error.rs`. Every rejected command promise carries this
 * shape, letting the UI branch on `kind` instead of matching English prose.
 */

export type ErrorKind =
  | 'notFound'
  | 'permissionDenied'
  | 'invalidPath'
  | 'invalidProject'
  | 'texNotFound'
  | 'compilerFailed'
  | 'compileBusy'
  | 'canceled'
  | 'alreadyExists'
  | 'io'
  | 'internal';

export interface AppError {
  kind: ErrorKind;
  message: string;
  /** A short, actionable next step, shown beneath the message. */
  hint: string | null;
}

/** Narrow an unknown rejection to an {@link AppError}. */
export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'message' in value &&
    typeof (value as AppError).message === 'string'
  );
}

/**
 * Coerce anything thrown into an {@link AppError}.
 *
 * Commands reject with a structured payload, but a bug in the frontend can
 * still throw a plain `Error`; the UI must render something useful either way.
 */
export function toAppError(value: unknown, fallbackMessage = 'Something went wrong.'): AppError {
  if (isAppError(value)) return value;

  if (value instanceof Error) {
    return { kind: 'internal', message: value.message || fallbackMessage, hint: null };
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return { kind: 'internal', message: value, hint: null };
  }
  return { kind: 'internal', message: fallbackMessage, hint: null };
}
