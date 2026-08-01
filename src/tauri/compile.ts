/** Compilation IPC wrappers. */

import { call } from './client';
import type { CompileRequest, CompileResult, TexEnvironment } from '@/types/compile';

/** Probe the machine for a usable TeX installation. */
export function getTexEnvironment(): Promise<TexEnvironment> {
  return call('get_tex_environment');
}

/**
 * Run a build.
 *
 * Rejects with `kind: 'compileBusy'` if one is already running — the backend
 * refuses to overlap jobs because concurrent latexmk runs corrupt each other's
 * auxiliary files.
 */
export function compileProject(request: CompileRequest): Promise<CompileResult> {
  return call('compile_project', { request });
}

/** Stop the running build. Resolves false when nothing was running. */
export function cancelCompile(): Promise<boolean> {
  return call('cancel_compile');
}

export function isCompiling(): Promise<boolean> {
  return call('is_compiling');
}

/** Delete auxiliary artefacts; resolves to the removed relative paths. */
export function cleanAuxiliaryFiles(useOutputDirectory: boolean): Promise<string[]> {
  return call('clean_auxiliary_files', { useOutputDirectory });
}

/** Absolute path of the build output directory. */
export function getOutputDirectory(useOutputDirectory: boolean): Promise<string> {
  return call('get_output_directory', { useOutputDirectory });
}
