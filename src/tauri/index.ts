/**
 * Barrel for the IPC layer.
 *
 * Modules are re-exported under namespaces so call sites read as
 * `projectApi.openProject(...)` rather than a flat soup of free functions.
 */

export * as codeApi from './code';
export * as compileApi from './compile';
export * as eventsApi from './events';
export * as fsApi from './fs';
export * as projectApi from './project';
export * as settingsApi from './settings';
export * as systemApi from './system';
export { isTauri } from './client';
