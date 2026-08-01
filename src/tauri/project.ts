/** Project lifecycle IPC wrappers. */

import { call } from './client';
import type { FileNode, NewProjectFile, ProjectInfo, RecentProject } from '@/types/project';

export function openProject(path: string, recentLimit: number): Promise<ProjectInfo> {
  return call('open_project', { path, recentLimit });
}

export function createProject(
  parentDirectory: string,
  name: string,
  files: NewProjectFile[],
  recentLimit: number,
): Promise<ProjectInfo> {
  return call('create_project', { parentDirectory, name, files, recentLimit });
}

/** Re-read just the file tree — cheaper than a full reload. */
export function refreshTree(): Promise<FileNode> {
  return call('refresh_tree');
}

/** Re-read the whole project description, including the main-document guess. */
export function reloadProject(): Promise<ProjectInfo> {
  return call('reload_project');
}

/** Pin the main document for this project; persists across sessions. */
export function setMainDocument(path: string): Promise<void> {
  return call('set_main_document', { path });
}

export function closeProject(): Promise<void> {
  return call('close_project');
}

export function getRecentProjects(): Promise<RecentProject[]> {
  return call('get_recent_projects');
}

export function removeRecentProject(path: string): Promise<RecentProject[]> {
  return call('remove_recent_project', { path });
}

export function clearRecentProjects(): Promise<void> {
  return call('clear_recent_projects');
}
