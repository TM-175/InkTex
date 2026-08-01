/** Preference and session persistence IPC wrappers. */

import { call } from './client';
import type { Session } from '@/types/project';

/** Raw stored preferences, or `null` when nothing has been saved yet. */
export function getStoredSettings(): Promise<unknown> {
  return call('get_settings');
}

export function saveStoredSettings(settings: unknown): Promise<void> {
  return call('save_settings', { settings });
}

export function getSession(): Promise<Session> {
  return call('get_session');
}

export function saveSession(session: Session): Promise<void> {
  return call('save_session', { session });
}
