/** Desktop integration IPC wrappers and native dialogs. */

import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { call } from './client';

export interface PlatformInfo {
  os: string;
  arch: string;
  /** Label for the primary modifier key, used in shortcut hints. */
  modifierLabel: string;
  texSearchPath: string;
}

export function getPlatformInfo(): Promise<PlatformInfo> {
  return call('get_platform_info');
}

/** Show a file or folder in Finder/Explorer/the Linux file manager. */
export function revealInFileManager(path: string): Promise<void> {
  return call('reveal_in_file_manager', { path });
}

/** Open a terminal whose working directory is the project root. */
export function openTerminal(): Promise<void> {
  return call('open_terminal');
}

/** Open a path with the OS default application. */
export function openExternally(path: string): Promise<void> {
  return openPath(path);
}

/** Native folder picker. Resolves to null when the user cancels. */
export async function pickDirectory(title: string): Promise<string | null> {
  const selected = await openDialog({ directory: true, multiple: false, title });
  return typeof selected === 'string' ? selected : null;
}

/** Native file picker, restricted to the given extensions. */
export async function pickFile(
  title: string,
  extensions: string[],
): Promise<string | null> {
  const selected = await openDialog({
    directory: false,
    multiple: false,
    title,
    filters: extensions.length > 0 ? [{ name: 'Supported files', extensions }] : undefined,
  });
  return typeof selected === 'string' ? selected : null;
}

/** Native save dialog. Resolves to null when the user cancels. */
export async function pickSaveLocation(
  title: string,
  defaultPath: string,
  extensions: string[],
): Promise<string | null> {
  const selected = await saveDialog({
    title,
    defaultPath,
    filters: extensions.length > 0 ? [{ name: 'PDF document', extensions }] : undefined,
  });
  return selected ?? null;
}
