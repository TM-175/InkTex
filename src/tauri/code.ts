/** Code-listing IPC wrappers. */

import { call } from './client';
import type {
  CodeAsset,
  CodeRegion,
  ImportedCode,
  ImportMode,
  SourceLink,
  SourceLinkResult,
} from '@/types/listing';

/**
 * Index every source file in the project.
 *
 * The extension whitelist comes from the frontend registry, so the backend
 * never needs to know what a language is.
 */
export function indexCodeAssets(extensions: string[]): Promise<CodeAsset[]> {
  return call('index_code_assets', { extensions });
}

/** Re-index a named subset, after a filesystem change. */
export function indexCodePaths(extensions: string[], paths: string[]): Promise<CodeAsset[]> {
  return call('index_code_paths', { extensions, paths });
}

export function detectCodeRegions(path: string): Promise<CodeRegion[]> {
  return call('detect_code_regions', { path });
}

/** Extract a snippet for insertion as a listing. */
export function importCode(
  path: string,
  mode: ImportMode,
  options: {
    firstLine?: number;
    lastLine?: number;
    region?: string;
    dedent?: boolean;
  } = {},
): Promise<ImportedCode> {
  return call('import_code', {
    path,
    mode,
    firstLine: options.firstLine ?? null,
    lastLine: options.lastLine ?? null,
    region: options.region ?? null,
    dedent: options.dedent ?? true,
  });
}

/** Report, for each linked listing, whether its source has drifted. */
export function checkSourceLinks(links: SourceLink[]): Promise<SourceLinkResult[]> {
  return call('check_source_links', {
    links: links.map((link) => ({
      path: link.path,
      mode: link.mode,
      firstLine: link.firstLine ?? null,
      lastLine: link.lastLine ?? null,
      region: link.region ?? null,
      hash: link.hash,
      dedent: link.dedent,
    })),
  });
}
