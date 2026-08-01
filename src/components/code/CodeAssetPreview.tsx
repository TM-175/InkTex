import { useEffect, useState } from 'react';
import { Braces, X } from 'lucide-react';
import type { CodeAsset, CodeRegion } from '@/types/listing';
import { codeApi } from '@/tauri';
import { useCodeStore } from '@/store/codeStore';
import { languageForFile } from '@/services/listings/languages';
import { Button, IconButton } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';

interface CodeAssetPreviewProps {
  asset: CodeAsset;
  onInsert: () => void;
  onClose: () => void;
}

/**
 * A peek at the head of a selected source file, plus its named regions.
 *
 * Showing the regions here is what makes them discoverable — a student who has
 * never written `// region` will see the concept the first time they select a
 * file that happens to use it.
 */
export function CodeAssetPreview({ asset, onInsert, onClose }: CodeAssetPreviewProps) {
  const importCode = useCodeStore((state) => state.importCode);

  const [head, setHead] = useState<string | null>(null);
  const [regions, setRegions] = useState<CodeRegion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setHead(null);
    setRegions([]);

    const load = async (): Promise<void> => {
      // Only the first lines are needed for a peek.
      const imported = await importCode(asset.path, 'range', {
        firstLine: 1,
        lastLine: 40,
        dedent: false,
      });
      if (canceled) return;

      setHead(imported?.content ?? null);

      if (imported !== null && imported.regionCount > 0) {
        try {
          const found = await codeApi.detectCodeRegions(asset.path);
          if (!canceled) setRegions(found);
        } catch {
          // Regions are a bonus; failing to list them is not worth surfacing.
        }
      }
      if (!canceled) setLoading(false);
    };

    void load();
    return () => {
      canceled = true;
    };
  }, [asset.path, importCode]);

  const language = languageForFile(asset.path);

  return (
    <div className="flex max-h-64 shrink-0 flex-col border-t border-border-subtle bg-surface-base">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-content-primary">
          {asset.name}
        </span>
        <span className="shrink-0 text-[0.625rem] text-content-muted">
          {language?.label ?? asset.extension} · {asset.lines} lines
        </span>
        <IconButton label="Close preview" onClick={onClose}>
          <X className="size-3.5" />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Spinner className="size-4 text-content-muted" />
          </div>
        ) : head === null ? (
          <p className="px-3 py-4 text-xs text-content-muted">This file could not be read.</p>
        ) : (
          <pre className="selectable px-3 py-2 font-mono text-[0.625rem] leading-[1.5] whitespace-pre text-content-secondary">
            {head}
          </pre>
        )}
      </div>

      {regions.length > 0 && (
        <div className="shrink-0 border-t border-border-subtle px-3 py-2">
          <p className="mb-1 text-[0.625rem] font-medium tracking-wide text-content-muted uppercase">
            {regions.length} region{regions.length === 1 ? '' : 's'}
          </p>
          <div className="flex flex-wrap gap-1">
            {regions.slice(0, 8).map((region) => (
              <span
                key={`${region.name}-${region.firstLine}`}
                className="rounded bg-surface-hover px-1.5 py-0.5 text-[0.625rem] text-content-secondary"
                title={`Lines ${region.firstLine}–${region.lastLine}`}
              >
                {region.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-border-subtle p-2">
        <Button
          size="sm"
          variant="primary"
          className="w-full"
          icon={<Braces className="size-3.5" />}
          onClick={onInsert}
        >
          Insert into Document…
        </Button>
      </div>
    </div>
  );
}
