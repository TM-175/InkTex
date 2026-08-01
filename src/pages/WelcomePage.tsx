import { Clock, FilePlus2, FileText, FolderOpen, Trash2, X } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { useCompileStore } from '@/store/compileStore';
import { useUiStore } from '@/store/uiStore';
import { systemApi } from '@/tauri';
import { Button, IconButton } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';
import { TexInstallGuide } from '@/components/TexInstallGuide';
import { shortcutLabel } from '@/services/shortcuts';
import { formatRelativeTime, truncatePath } from '@/utils/format';
import { cn } from '@/utils/cn';

/** Landing screen shown when no project is open. */
export function WelcomePage() {
  const recentProjects = useProjectStore((state) => state.recentProjects);
  const openProject = useProjectStore((state) => state.openProject);
  const forgetRecent = useProjectStore((state) => state.forgetRecentProject);
  const clearRecent = useProjectStore((state) => state.clearRecentProjects);
  const status = useProjectStore((state) => state.status);

  const environment = useCompileStore((state) => state.environment);
  const openOverlay = useUiStore((state) => state.openOverlay);

  // Nothing can be opened until a TeX distribution is present.
  const ready = environment !== null && environment.installed;

  const chooseFolder = async (): Promise<void> => {
    const selected = await systemApi.pickDirectory('Open LaTeX Project');
    if (selected !== null) await openProject(selected);
  };

  const chooseFile = async (): Promise<void> => {
    const selected = await systemApi.pickFile(
      'Open LaTeX File',
      ['tex', 'ltx', 'latex', 'bib', 'sty', 'cls'],
      'LaTeX files',
    );
    if (selected !== null) await openProject(selected);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-surface-base">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-8 py-12">
        {/* Hero */}
        <div className="flex items-center gap-4">
          <InkTexMark />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-content-primary">InkTex</h1>
            <p className="mt-0.5 text-sm text-content-secondary">
              A local-first LaTeX editor. Your files stay on your machine.
            </p>
          </div>
        </div>

        {/* InkTex drives an existing TeX installation, so without one there is
            nothing it can do; the guide replaces the actions rather than
            sitting above them as a dismissible warning. */}
        {environment !== null && !environment.installed && <TexInstallGuide />}

        {environment === null && (
          <div className="flex items-center gap-2.5 rounded-lg border border-border-subtle px-4 py-3 text-sm text-content-muted">
            <Spinner className="size-4" />
            Looking for your TeX installation…
          </div>
        )}

        {/* Actions */}
        {ready && (
          <div className="grid gap-3 sm:grid-cols-3">
            <ActionCard
              icon={<FolderOpen className="size-5" />}
              title="Open Project"
              description="Open a folder that contains your .tex files."
              shortcut={shortcutLabel('project.open')}
              onClick={() => void chooseFolder()}
              disabled={status === 'opening'}
            />
            <ActionCard
              icon={<FileText className="size-5" />}
              title="Open File"
              description="Open a single .tex file. Its folder becomes the project."
              shortcut={shortcutLabel('file.open')}
              onClick={() => void chooseFile()}
              disabled={status === 'opening'}
            />
            <ActionCard
              icon={<FilePlus2 className="size-5" />}
              title="New Project"
              description="Start from an article, report, book, résumé, slides or homework template."
              shortcut={shortcutLabel('project.new')}
              onClick={() => openOverlay('newProject')}
            />
          </div>
        )}

        {/* Recent projects */}
        {ready && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-content-muted uppercase">
              <Clock className="size-3.5" />
              Recent
            </h2>
            {recentProjects.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => void clearRecent()}>
                Clear
              </Button>
            )}
          </div>

          {recentProjects.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-subtle px-4 py-8 text-center text-sm text-content-muted">
              Projects you open will appear here. You can also drop a folder anywhere on this
              window.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle">
              {recentProjects.map((project) => (
                <li key={project.path}>
                  <div
                    className={cn(
                      'group flex items-center gap-3 px-4 py-2.5 transition-colors',
                      project.exists ? 'hover:bg-surface-hover' : 'opacity-50',
                    )}
                  >
                    <button
                      type="button"
                      disabled={!project.exists || status === 'opening'}
                      onClick={() => void openProject(project.path)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                    >
                      <FolderOpen className="size-4 shrink-0 text-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-content-primary">
                          {project.name}
                        </span>
                        <span className="block truncate text-xs text-content-muted" title={project.path}>
                          {project.exists ? truncatePath(project.path, 56) : 'Folder no longer exists'}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-content-muted">
                        {formatRelativeTime(project.lastOpened)}
                      </span>
                    </button>

                    <IconButton
                      label={`Remove ${project.name} from recent projects`}
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => void forgetRecent(project.path)}
                    >
                      {project.exists ? <X className="size-3.5" /> : <Trash2 className="size-3.5" />}
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}

        {/* Footer hint */}
        <p className="text-center text-xs text-content-muted">
          Press{' '}
          <kbd className="rounded border border-border-subtle bg-surface-raised px-1.5 py-0.5 font-mono">
            {shortcutLabel('palette.commands')}
          </kbd>{' '}
          for the command palette, or{' '}
          <kbd className="rounded border border-border-subtle bg-surface-raised px-1.5 py-0.5 font-mono">
            {shortcutLabel('help.shortcuts')}
          </kbd>{' '}
          for all shortcuts.
        </p>
      </div>
    </div>
  );
}

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}

function ActionCard({ icon, title, description, shortcut, onClick, disabled }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex flex-col items-start gap-2 rounded-lg border border-border-subtle p-4 text-left',
        'transition-colors hover:border-accent hover:bg-surface-hover',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      <span className="text-accent">{icon}</span>
      <span className="flex w-full items-center gap-2">
        <span className="text-sm font-medium text-content-primary">{title}</span>
        {shortcut !== undefined && (
          <kbd className="ml-auto rounded border border-border-subtle bg-surface-base px-1.5 py-0.5 font-mono text-[0.6875rem] text-content-muted">
            {shortcut}
          </kbd>
        )}
      </span>
      <span className="text-xs leading-relaxed text-content-muted">{description}</span>
    </button>
  );
}

/** The app mark, drawn inline so it scales with the theme. */
function InkTexMark() {
  return (
    <svg viewBox="0 0 64 64" className="size-14 shrink-0" aria-hidden>
      <defs>
        <linearGradient id="inktex-mark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#inktex-mark)" />
      {/* Ink droplet: a circular bowl fused with a tapering apex. */}
      <path
        d="M32 15 L43 36.5 A11.6 11.6 0 1 1 21 36.5 Z"
        fill="white"
      />
      <rect x="30.4" y="32" width="3.2" height="16" rx="1.6" fill="url(#inktex-mark)" />
    </svg>
  );
}
