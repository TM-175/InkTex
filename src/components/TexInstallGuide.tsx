import { useState, type ReactNode } from 'react';
import { Check, Copy, ExternalLink, RefreshCw, TriangleAlert } from 'lucide-react';
import { systemApi } from '@/tauri';
import { useCompileStore } from '@/store/compileStore';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';
import { cn } from '@/utils/cn';

type Platform = 'macos' | 'windows' | 'linux';

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'macos', label: 'macOS' },
  { id: 'windows', label: 'Windows' },
  { id: 'linux', label: 'Linux' },
];

/** Best guess at the current platform, used to preselect a tab. */
function detectPlatform(): Platform {
  const agent = `${navigator.userAgent} ${navigator.platform ?? ''}`.toLowerCase();
  if (agent.includes('mac') || agent.includes('iphone') || agent.includes('ipad')) return 'macos';
  if (agent.includes('win')) return 'windows';
  return 'linux';
}

interface Step {
  title: string;
  detail: string;
  /** Shell command to run, if this step has one. */
  command?: string;
}

interface Guide {
  recommended: string;
  downloadUrl: string;
  downloadLabel: string;
  size: string;
  steps: Step[];
}

const GUIDES: Record<Platform, Guide> = {
  macos: {
    recommended: 'MacTeX',
    downloadUrl: 'https://tug.org/mactex/',
    downloadLabel: 'tug.org/mactex',
    size: 'about 5 GB',
    steps: [
      {
        title: 'Install MacTeX',
        detail:
          'The Homebrew cask is the quickest route. The “-no-gui” variant skips the bundled editors, which InkTex replaces.',
        command: 'brew install --cask mactex-no-gui',
      },
      {
        title: 'No Homebrew? Use the installer',
        detail:
          'Download MacTeX.pkg from the link above and run it. It installs everything InkTex needs, including latexmk.',
      },
      {
        title: 'Restart InkTex, then re-check',
        detail:
          'The installer adds /Library/TeX/texbin, which is one of the locations InkTex searches.',
      },
    ],
  },
  windows: {
    recommended: 'MiKTeX',
    downloadUrl: 'https://miktex.org/download',
    downloadLabel: 'miktex.org/download',
    size: 'about 1 GB',
    steps: [
      {
        title: 'Install MiKTeX',
        detail:
          'MiKTeX installs missing packages on demand, which pairs well with InkTex’s error messages.',
        command: 'winget install MiKTeX.MiKTeX',
      },
      {
        title: 'Install Perl',
        detail:
          'latexmk is a Perl script, and Windows has no Perl by default. Strawberry Perl works well.',
        command: 'winget install StrawberryPerl.StrawberryPerl',
      },
      {
        title: 'Add latexmk',
        detail:
          'Open MiKTeX Console → Packages, search for “latexmk”, and install it. Or install TeX Live instead, which bundles both latexmk and Perl.',
      },
      {
        title: 'Reopen InkTex, then re-check',
        detail: 'A restart is needed so InkTex picks up the updated system PATH.',
      },
    ],
  },
  linux: {
    recommended: 'TeX Live',
    downloadUrl: 'https://tug.org/texlive/',
    downloadLabel: 'tug.org/texlive',
    size: 'about 5 GB for the full scheme',
    steps: [
      {
        title: 'Debian / Ubuntu',
        detail: 'The full scheme is large but avoids missing-package errors later.',
        command: 'sudo apt install texlive-full latexmk',
      },
      {
        title: 'Smaller Debian / Ubuntu install',
        detail: 'Enough for most documents, at roughly a tenth of the size.',
        command:
          'sudo apt install texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended latexmk biber',
      },
      {
        title: 'Fedora',
        detail: 'Includes latexmk in the full scheme.',
        command: 'sudo dnf install texlive-scheme-full latexmk',
      },
      {
        title: 'Arch',
        detail: 'texlive-most covers the common package set.',
        command: 'sudo pacman -S texlive-most texlive-bin biber',
      },
    ],
  },
};

/** A command line with a copy button. */
function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused; the text is selectable either way.
    }
  };

  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-md border border-border-subtle bg-surface-sunken px-2.5 py-1.5">
      <code className="selectable min-w-0 flex-1 overflow-x-auto font-mono text-[0.6875rem] whitespace-nowrap text-content-secondary">
        {command}
      </code>
      <button
        type="button"
        aria-label={copied ? 'Copied' : 'Copy command'}
        onClick={() => void copy()}
        className="shrink-0 rounded p-1 text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
      >
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

/**
 * Install instructions shown when no TeX distribution is present.
 *
 * InkTex drives an existing TeX installation rather than bundling one, so
 * without a distribution there is nothing to compile with. This is the blocking
 * screen rather than a dismissible banner.
 */
export function TexInstallGuide({ footer }: { footer?: ReactNode }) {
  const [platform, setPlatform] = useState<Platform>(detectPlatform);
  const environment = useCompileStore((state) => state.environment);
  const probeEnvironment = useCompileStore((state) => state.probeEnvironment);
  const [checking, setChecking] = useState(false);

  const guide = GUIDES[platform];

  const recheck = async (): Promise<void> => {
    setChecking(true);
    await probeEnvironment();
    setChecking(false);
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-amber-500/20 p-5">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-content-primary">
            LaTeX is not installed
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-content-secondary">
            InkTex compiles with the TeX distribution on your machine — it does not bundle
            one. Install {guide.recommended} to get started.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void recheck()}
          disabled={checking}
          icon={checking ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
        >
          {checking ? 'Checking…' : 'Re-check'}
        </Button>
      </div>

      {/* Platform tabs */}
      <div className="flex items-center gap-1 border-b border-amber-500/20 px-5 py-2">
        {PLATFORMS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => setPlatform(candidate.id)}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              platform === candidate.id
                ? 'bg-surface-active text-content-primary'
                : 'text-content-muted hover:bg-surface-hover hover:text-content-secondary',
            )}
          >
            {candidate.label}
          </button>
        ))}

        <span className="ml-auto text-[0.6875rem] text-content-muted">
          {guide.recommended} — {guide.size}
        </span>
      </div>

      {/* Steps */}
      <ol className="space-y-3.5 p-5">
        {guide.steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-active text-[0.6875rem] font-semibold text-content-secondary">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-content-primary">{step.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-content-muted">{step.detail}</p>
              {step.command !== undefined && <CommandLine command={step.command} />}
            </div>
          </li>
        ))}
      </ol>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-3 border-t border-amber-500/20 px-5 py-3">
        <button
          type="button"
          onClick={() => void systemApi.openExternally(guide.downloadUrl)}
          className="flex items-center gap-1.5 text-xs text-accent transition-colors hover:underline"
        >
          <ExternalLink className="size-3.5" />
          {guide.downloadLabel}
        </button>

        {environment !== null && environment.searchPath !== '' && (
          <details className="ml-auto text-[0.6875rem] text-content-muted">
            <summary className="cursor-pointer transition-colors hover:text-content-secondary">
              Where InkTex looked
            </summary>
            <p className="selectable mt-1.5 max-w-xl font-mono break-all">
              {environment.searchPath.split(':').join('  ·  ')}
            </p>
          </details>
        )}

        {footer}
      </div>
    </div>
  );
}
