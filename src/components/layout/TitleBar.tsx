import {
  ChevronDown,
  ChevronLeft,
  Columns2,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Hammer,
  PanelBottom,
  PanelLeft,
  Play,
  Settings as SettingsIcon,
  Square,
} from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { useCompileStore } from '@/store/compileStore';
import { useUiStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { compileBlocker, resolveCompileTarget } from '@/services/compileService';
import { exportActiveSource, exportPdf } from '@/services/exportService';
import { IS_MAC, shortcutLabel } from '@/services/shortcuts';
import { Button, IconButton } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';
import { cn } from '@/utils/cn';
import { basename } from '@/utils/path';
import type { CompilerKind } from '@/types/compile';

const COMPILERS: { value: CompilerKind; label: string }[] = [
  { value: 'latexmk', label: 'latexmk' },
  { value: 'pdflatex', label: 'pdfLaTeX' },
  { value: 'xelatex', label: 'XeLaTeX' },
  { value: 'lualatex', label: 'LuaLaTeX' },
];

/**
 * Top bar: project identity on the left, the compile control in the centre,
 * pane toggles on the right.
 */
export function TitleBar() {
  const project = useProjectStore((state) => state.project);
  const phase = useCompileStore((state) => state.phase);
  const environment = useCompileStore((state) => state.environment);
  const compile = useCompileStore((state) => state.compile);
  const cancel = useCompileStore((state) => state.cancel);

  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.update);

  const tabs = useProjectStore((state) => state.tabs);
  const activePath = useProjectStore((state) => state.activePath);
  const closeProject = useProjectStore((state) => state.closeProject);

  const ui = useUiStore();

  // Compile builds the document the user is looking at, so the button's label
  // and enabled state track the active tab rather than a pinned main document.
  const hasPdf = useCompileStore((state) => state.pdfPath !== null);
  const compileTarget = resolveCompileTarget(project, tabs, activePath);
  const blocker = compileBlocker(environment, settings, compileTarget);
  const running = phase !== 'idle';

  return (
    <header
      // The bar doubles as the window drag region. On macOS the window uses the
      // Overlay title-bar style, so the traffic lights sit on top of this bar
      // and the left padding reserves room for them; other platforms draw their
      // own title bar above and need no inset.
      data-tauri-drag-region
      className={cn(
        'flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-raised pr-2',
        IS_MAC ? 'pl-20' : 'pl-3',
      )}
    >
      {/* Project */}
      <div className="flex min-w-0 items-center gap-1.5" data-tauri-drag-region>
        <IconButton
          label={`Close project and return to the start screen (${shortcutLabel('project.close') ?? ''})`}
          onClick={() => void closeProject()}
        >
          <ChevronLeft className="size-4" />
        </IconButton>

        {project === null ? (
          <span className="text-sm text-content-muted">No project open</span>
        ) : project.openedFile !== null ? (
          // Opened as a single file: label with the file, not its folder — the
          // folder was never "opened" and the explorer does not show it.
          <>
            <FileText className="size-4 shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="truncate text-sm leading-tight font-medium text-content-primary">
                {basename(project.openedFile)}
              </div>
              <div
                className="truncate text-[0.6875rem] leading-tight text-content-muted"
                title={project.root}
              >
                {project.root}
              </div>
            </div>
          </>
        ) : (
          <>
            <FolderOpen className="size-4 shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="truncate text-sm leading-tight font-medium text-content-primary">
                {project.name}
              </div>
              {/* What Compile will actually build, which follows the active tab. */}
              {compileTarget !== null && (
                <div
                  className="truncate text-[0.6875rem] leading-tight text-content-muted"
                  title={`Compile builds ${compileTarget}`}
                >
                  {compileTarget}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Compile controls */}
      <div className="mx-auto flex items-center gap-1.5" data-tauri-drag-region>
        {running ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void cancel()}
            disabled={phase === 'canceling'}
            icon={phase === 'canceling' ? <Spinner className="size-3.5" /> : <Square className="size-3 fill-current" />}
          >
            {phase === 'canceling' ? 'Stopping…' : 'Stop'}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={project === null || blocker !== null}
            title={blocker ?? `Compile (${shortcutLabel('compile.run') ?? ''})`}
            onClick={() => void compile()}
            icon={<Play className="size-3 fill-current" />}
          >
            Compile
          </Button>
        )}

        {/* Compiler selector */}
        <div className="relative">
          <select
            aria-label="Compiler"
            value={settings.defaultCompiler}
            onChange={(event) =>
              updateSettings({ defaultCompiler: event.target.value as CompilerKind })
            }
            className={cn(
              'h-7 appearance-none rounded-md border border-border-subtle bg-surface-base',
              'py-0 pr-6 pl-2 text-xs text-content-secondary transition-colors',
              'hover:border-border-strong focus:border-accent focus:outline-none',
            )}
          >
            {COMPILERS.map((compiler) => (
              <option key={compiler.value} value={compiler.value}>
                {compiler.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-content-muted" />
        </div>

        {settings.autoCompile && (
          <span
            className="flex items-center gap-1 rounded-md bg-surface-hover px-2 py-1 text-[0.6875rem] text-content-muted"
            title={`Rebuilds automatically ${settings.autoCompileDelay}ms after you stop typing`}
          >
            <Hammer className="size-3" />
            auto
          </span>
        )}
      </div>

      {/* View toggles */}
      <div className="flex items-center gap-0.5">
        <IconButton
          label={`Toggle file explorer (${shortcutLabel('view.explorer') ?? ''})`}
          active={ui.explorerVisible}
          onClick={ui.toggleExplorer}
        >
          <PanelLeft className="size-4" />
        </IconButton>
        <IconButton
          label={`Toggle PDF preview (${shortcutLabel('view.preview') ?? ''})`}
          active={ui.previewVisible}
          onClick={ui.togglePreview}
        >
          <Columns2 className="size-4" />
        </IconButton>
        <IconButton
          label={`Toggle bottom panel (${shortcutLabel('view.panel') ?? ''})`}
          active={ui.bottomPanelVisible}
          onClick={ui.toggleBottomPanel}
        >
          <PanelBottom className="size-4" />
        </IconButton>

        <div className="mx-1 h-4 w-px bg-border-subtle" />

        <IconButton
          label={`Export PDF… (${shortcutLabel('pdf.export') ?? ''})`}
          disabled={!hasPdf}
          onClick={() => void exportPdf()}
        >
          <Download className="size-4" />
        </IconButton>
        <IconButton
          label="Save a copy of this file…"
          disabled={activePath === null}
          onClick={() => void exportActiveSource()}
        >
          <Copy className="size-4" />
        </IconButton>

        <div className="mx-1 h-4 w-px bg-border-subtle" />

        <IconButton
          label={`Settings (${shortcutLabel('settings.open') ?? ''})`}
          onClick={() => ui.openOverlay('settings')}
        >
          <SettingsIcon className="size-4" />
        </IconButton>
      </div>
    </header>
  );
}
