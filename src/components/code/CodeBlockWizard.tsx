import { useCallback, useEffect, useMemo, useState } from 'react';
import { Code2, Eye, FileCode2, Link2, Sparkles, Unlink, Wand2 } from 'lucide-react';
import type { ListingSpec } from '@/types/listing';
import { useUiStore } from '@/store/uiStore';
import { useProjectStore } from '@/store/projectStore';
import { useCodeStore } from '@/store/codeStore';
import { defaultSpec, generateListing } from '@/services/listings/latexGenerator';
import { analysePreamble, isPreambleSatisfied } from '@/services/listings/preamble';
import { detectLanguage } from '@/services/listings/languageDetect';
import { languageLabel } from '@/services/listings/languages';
import { themeById } from '@/services/listings/themes';
import { insertListing } from '@/services/listings/listingActions';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { EmbeddedCodeEditor } from './EmbeddedCodeEditor';
import { ThemePreview } from './ThemePreview';
import { ListingOptionsForm } from './ListingOptionsForm';
import { cn } from '@/utils/cn';

/** What the centre pane is showing. */
type ViewMode = 'code' | 'preview' | 'latex';

const VIEWS: { id: ViewMode; label: string; icon: typeof Code2 }[] = [
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'preview', label: 'Theme preview', icon: Eye },
  { id: 'latex', label: 'LaTeX', icon: FileCode2 },
];

/**
 * The Insert → Code Block wizard.
 *
 * Three panes: the code itself on the left (a real Monaco instance, with
 * clickable line numbers for highlighting), the generated LaTeX or a themed
 * preview behind a tab, and every option on the right.
 *
 * The LaTeX view is not read-only decoration — it is the same markup that will
 * be inserted, shown so the user can confirm nothing opaque is happening.
 */
export function CodeBlockWizard() {
  const open = useUiStore((state) => state.overlay === 'codeBlock');
  const close = useUiStore((state) => state.closeOverlay);
  const seed = useUiStore((state) => state.codeBlockSeed);

  const activePath = useProjectStore((state) => state.activePath);
  const tabs = useProjectStore((state) => state.tabs);
  const importCode = useCodeStore((state) => state.importCode);

  const [spec, setSpec] = useState<ListingSpec>(() => defaultSpec());
  const [view, setView] = useState<ViewMode>('code');
  const [showMinimap, setShowMinimap] = useState(false);
  const [detected, setDetected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-seed each time the dialog opens: the caller may have supplied an
  // imported snippet, or nothing at all for a blank listing.
  useEffect(() => {
    if (!open) return;

    setSpec(defaultSpec(seed ?? {}));
    setView('code');
    setDetected(null);
  }, [open, seed]);

  const patch = useCallback((changes: Partial<ListingSpec>) => {
    setSpec((current) => ({ ...current, ...changes }));
  }, []);

  /** Detect the language of pasted code, unless the user already chose one. */
  const onPaste = useCallback(
    (text: string) => {
      const result = detectLanguage(text);
      if (!result.confident || result.language === spec.language) return;

      setDetected(result.language);
      patch({ language: result.language });
    },
    [patch, spec.language],
  );

  const latex = useMemo(() => generateListing(spec), [spec]);

  const documentText = useMemo(
    () => tabs.find((tab) => tab.path === activePath)?.content ?? '',
    [tabs, activePath],
  );

  const preamble = useMemo(
    () => analysePreamble(documentText, [spec]),
    [documentText, spec],
  );

  const theme = themeById(spec.theme);
  const canInsert = spec.code.trim() !== '' && activePath !== null && !busy;

  const insert = async (): Promise<void> => {
    if (!canInsert) return;

    setBusy(true);
    const inserted = await insertListing(spec);
    setBusy(false);

    if (inserted) close();
  };

  /** Re-pull the snippet from disk, e.g. after changing the import options. */
  const refreshFromSource = async (): Promise<void> => {
    const link = spec.link;
    if (link === null) return;

    setBusy(true);
    const imported = await importCode(link.path, link.mode, {
      firstLine: link.firstLine,
      lastLine: link.lastLine,
      region: link.region,
      dedent: link.dedent,
    });
    setBusy(false);

    if (imported === null) return;
    patch({
      code: imported.content,
      link: { ...link, hash: imported.hash, firstLine: imported.firstLine, lastLine: imported.lastLine },
    });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Insert Code Block"
      description="Configure the listing; InkTex writes ordinary LaTeX you can edit afterwards."
      className="max-w-6xl"
    >
      <div className="grid min-h-0 grid-cols-[1fr_22rem] overflow-hidden">
        {/* Left: code, preview or generated LaTeX */}
        <div className="flex min-h-0 flex-col border-r border-border-subtle">
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
            {VIEWS.map((candidate) => {
              const Icon = candidate.icon;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setView(candidate.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    view === candidate.id
                      ? 'bg-accent-soft text-content-primary'
                      : 'text-content-muted hover:bg-surface-hover hover:text-content-secondary',
                  )}
                >
                  <Icon className="size-3.5" />
                  {candidate.label}
                </button>
              );
            })}

            <div className="ml-auto flex items-center gap-2">
              {detected !== null && (
                <span className="flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[0.6875rem] text-accent">
                  <Sparkles className="size-3" />
                  Detected {languageLabel(detected)}
                </span>
              )}

              {view === 'code' && (
                <button
                  type="button"
                  onClick={() => setShowMinimap((value) => !value)}
                  className={cn(
                    'rounded px-2 py-0.5 text-[0.6875rem] transition-colors',
                    showMinimap
                      ? 'bg-surface-active text-content-primary'
                      : 'text-content-muted hover:text-content-secondary',
                  )}
                >
                  Minimap
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {view === 'code' && (
              <EmbeddedCodeEditor
                code={spec.code}
                language={spec.language}
                onChange={(code) => patch({ code })}
                highlightLines={spec.highlightLines}
                onHighlightChange={(highlightLines) => patch({ highlightLines })}
                firstNumber={spec.firstNumber}
                showMinimap={showMinimap}
                onPaste={onPaste}
              />
            )}

            {view === 'preview' && (
              <div className="h-full overflow-auto bg-surface-sunken p-4">
                <ThemePreview spec={spec} maxLines={40} />
                <p className="mt-3 text-[0.6875rem] leading-relaxed text-content-muted">
                  {spec.engine === 'listings'
                    ? `Exact: the listings style is generated from this theme's colours.`
                    : `Indicative: minted renders with the Pygments “${theme.pygments}” style, whose palette is close to this.`}
                </p>
              </div>
            )}

            {view === 'latex' && (
              <div className="h-full overflow-auto bg-surface-sunken p-4">
                <pre className="selectable font-mono text-[0.6875rem] leading-relaxed whitespace-pre-wrap text-content-secondary">
                  {latex}
                </pre>
              </div>
            )}
          </div>

          {/* Source link status */}
          {spec.link !== null && (
            <div className="flex shrink-0 items-center gap-2 border-t border-border-subtle bg-surface-raised px-3 py-2">
              <Link2 className="size-3.5 shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-content-secondary">
                Linked to <span className="text-content-primary">{spec.link.path}</span>
                {spec.link.mode === 'region' && ` · region ${spec.link.region}`}
                {spec.link.mode === 'range' &&
                  ` · lines ${spec.link.firstLine}–${spec.link.lastLine}`}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void refreshFromSource()}>
                Refresh
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Unlink className="size-3" />}
                onClick={() => patch({ link: null })}
              >
                Unlink
              </Button>
            </div>
          )}
        </div>

        {/* Right: options */}
        <div className="max-h-[34rem] overflow-auto px-4">
          <ListingOptionsForm spec={spec} onChange={patch} />
        </div>
      </div>

      <footer className="flex items-center gap-3 border-t border-border-subtle px-5 py-3">
        {/* Say plainly what will be added to the preamble. */}
        {!isPreambleSatisfied(preamble) && (
          <span className="flex items-center gap-1.5 text-[0.6875rem] text-content-muted">
            <Wand2 className="size-3.5 shrink-0 text-accent" />
            Will add {preamble.packages.length + preamble.definitions.length} preamble line
            {preamble.packages.length + preamble.definitions.length === 1 ? '' : 's'}
            {preamble.needsShellEscape && ' · minted needs --shell-escape'}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canInsert} onClick={() => void insert()}>
            Insert Listing
          </Button>
        </div>
      </footer>
    </Modal>
  );
}
