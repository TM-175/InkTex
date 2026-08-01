import { useEffect, useMemo, useState } from 'react';
import { FileCode2, Layers, ListOrdered } from 'lucide-react';
import type { CodeRegion, ImportMode, ListingSpec } from '@/types/listing';
import { codeApi } from '@/tauri';
import { useUiStore } from '@/store/uiStore';
import { useCodeStore } from '@/store/codeStore';
import { languageForFile } from '@/services/listings/languages';
import { suggestLabel } from '@/services/listings/latexGenerator';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { NumberInput, Toggle } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Feedback';
import { cn } from '@/utils/cn';

const MODES: { id: ImportMode; label: string; description: string; icon: typeof FileCode2 }[] = [
  { id: 'whole', label: 'Whole file', description: 'Every line', icon: FileCode2 },
  { id: 'range', label: 'Line range', description: 'A specific span', icon: ListOrdered },
  { id: 'region', label: 'Named region', description: 'Marked with // region', icon: Layers },
];

/**
 * Insert → Code From File.
 *
 * Chooses *what* to import; the wizard that opens afterwards chooses how it
 * looks. Separating the two keeps each dialog small, and means the same wizard
 * serves a pasted snippet and an imported file.
 */
export function CodeImportDialog() {
  const open = useUiStore((state) => state.overlay === 'codeImport');
  const close = useUiStore((state) => state.closeOverlay);
  const asset = useUiStore((state) => state.importTarget);
  const openCodeBlock = useUiStore((state) => state.openCodeBlock);

  const importCode = useCodeStore((state) => state.importCode);

  const [mode, setMode] = useState<ImportMode>('whole');
  const [firstLine, setFirstLine] = useState(1);
  const [lastLine, setLastLine] = useState(40);
  const [region, setRegion] = useState<string>('');
  const [regions, setRegions] = useState<CodeRegion[]>([]);
  const [dedent, setDedent] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const totalLines = asset?.lines ?? 0;

  // Load the file's regions when the dialog opens, so region mode can be
  // offered (or hidden) truthfully.
  useEffect(() => {
    if (!open || asset === null) return;

    setMode('whole');
    setFirstLine(1);
    setLastLine(Math.min(40, Math.max(1, asset.lines)));
    setRegion('');
    setDedent(true);

    let canceled = false;
    void codeApi
      .detectCodeRegions(asset.path)
      .then((found) => {
        if (canceled) return;
        setRegions(found);
        if (found.length > 0) setRegion(found[0]!.name);
      })
      .catch(() => {
        if (!canceled) setRegions([]);
      });

    return () => {
      canceled = true;
    };
  }, [open, asset]);

  // Keep a live preview of exactly what will be imported.
  useEffect(() => {
    if (!open || asset === null) return;

    let canceled = false;
    const timer = setTimeout(() => {
      void importCode(asset.path, mode, {
        firstLine,
        lastLine,
        region: region === '' ? undefined : region,
        dedent,
      }).then((imported) => {
        if (!canceled) setPreview(imported?.content ?? null);
      });
    }, 120);

    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [open, asset, mode, firstLine, lastLine, region, dedent, importCode]);

  const selectedRegion = useMemo(
    () => regions.find((candidate) => candidate.name === region) ?? null,
    [regions, region],
  );

  const canImport =
    asset !== null && !busy && (mode !== 'region' || regions.length > 0);

  const proceed = async (): Promise<void> => {
    if (asset === null || !canImport) return;

    setBusy(true);
    const imported = await importCode(asset.path, mode, {
      firstLine,
      lastLine,
      region: region === '' ? undefined : region,
      dedent,
    });
    setBusy(false);
    if (imported === null) return;

    const language = languageForFile(asset.path);
    const captionSuffix =
      mode === 'region'
        ? ` (${region})`
        : mode === 'range'
          ? ` (lines ${imported.firstLine}–${imported.lastLine})`
          : '';

    // Hand off to the wizard, pre-filled and already linked to the source.
    const seed: Partial<ListingSpec> = {
      code: imported.content,
      language: language?.id ?? 'text',
      caption: `${asset.name}${captionSuffix}`,
      label: suggestLabel(`${asset.name}${captionSuffix}`),
      // Numbering from the original line makes a range or region locatable in
      // the real file, which is the point of importing rather than pasting.
      firstNumber: mode === 'whole' ? 1 : imported.firstLine,
      link: {
        path: asset.path,
        mode,
        firstLine: imported.firstLine,
        lastLine: imported.lastLine,
        region: mode === 'region' ? region : undefined,
        hash: imported.hash,
        dedent,
      },
    };

    openCodeBlock(seed);
  };

  if (asset === null) return null;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Insert Code From File"
      description={asset.path}
      className="max-w-2xl"
    >
      <div className="space-y-4 px-5 py-4">
        {/* Scope */}
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((candidate) => {
            const Icon = candidate.icon;
            const disabled = candidate.id === 'region' && regions.length === 0;

            return (
              <button
                key={candidate.id}
                type="button"
                disabled={disabled}
                onClick={() => setMode(candidate.id)}
                title={disabled ? 'This file has no region markers' : undefined}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  mode === candidate.id
                    ? 'border-accent bg-accent-soft'
                    : 'border-border-subtle hover:border-border-strong hover:bg-surface-hover',
                )}
              >
                <Icon className="size-4 text-accent" />
                <span className="text-sm font-medium text-content-primary">{candidate.label}</span>
                <span className="text-[0.6875rem] text-content-muted">
                  {candidate.id === 'region' && regions.length > 0
                    ? `${regions.length} available`
                    : candidate.description}
                </span>
              </button>
            );
          })}
        </div>

        {/* Scope detail */}
        {mode === 'range' && (
          <div className="flex items-end gap-3">
            <div>
              <span className="mb-1 block text-xs text-content-secondary">From line</span>
              <NumberInput
                label="First line"
                value={firstLine}
                onChange={(value) => setFirstLine(Math.min(value, lastLine))}
                min={1}
                max={Math.max(1, totalLines)}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs text-content-secondary">To line</span>
              <NumberInput
                label="Last line"
                value={lastLine}
                onChange={(value) => setLastLine(Math.max(value, firstLine))}
                min={1}
                max={Math.max(1, totalLines)}
              />
            </div>
            <span className="pb-2 text-xs text-content-muted">of {totalLines}</span>
          </div>
        )}

        {mode === 'region' && regions.length > 0 && (
          <div className="max-h-32 overflow-auto rounded-lg border border-border-subtle">
            {regions.map((candidate) => (
              <button
                key={`${candidate.name}-${candidate.firstLine}`}
                type="button"
                onClick={() => setRegion(candidate.name)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                  candidate.name === region
                    ? 'bg-accent-soft text-content-primary'
                    : 'text-content-secondary hover:bg-surface-hover',
                )}
                style={{ paddingLeft: 12 + candidate.depth * 14 }}
              >
                <Layers className="size-3 shrink-0 text-content-muted" />
                <span className="min-w-0 flex-1 truncate font-medium">{candidate.name}</span>
                <span className="shrink-0 text-[0.625rem] text-content-muted tabular-nums">
                  {candidate.firstLine}–{candidate.lastLine} · {candidate.lineCount} L
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-content-primary">Remove shared indentation</p>
            <p className="mt-0.5 text-[0.6875rem] text-content-muted">
              A nested region imports flush left instead of wasting page width.
            </p>
          </div>
          <Toggle label="Remove shared indentation" checked={dedent} onChange={setDedent} />
        </div>

        {/* Preview of exactly what will be imported */}
        <div>
          <p className="mb-1.5 flex items-center justify-between text-xs text-content-secondary">
            <span>Preview</span>
            {selectedRegion !== null && mode === 'region' && (
              <span className="text-[0.6875rem] text-content-muted">
                {selectedRegion.lineCount} lines
              </span>
            )}
          </p>
          <div className="max-h-48 overflow-auto rounded-md bg-surface-sunken p-2.5">
            {preview === null ? (
              <div className="flex items-center gap-2 text-xs text-content-muted">
                <Spinner className="size-3.5" />
                Reading…
              </div>
            ) : (
              <pre className="selectable font-mono text-[0.625rem] leading-[1.5] whitespace-pre text-content-secondary">
                {preview || '(empty selection)'}
              </pre>
            )}
          </div>
        </div>
      </div>

      <footer className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!canImport} onClick={() => void proceed()}>
          Continue
        </Button>
      </footer>
    </Modal>
  );
}
