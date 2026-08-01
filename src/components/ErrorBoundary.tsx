import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Catches render errors so a bug in one panel does not leave a blank window.
 *
 * A desktop app has no address bar to reload from, so recovery is offered
 * explicitly.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaced in the webview devtools, which is where a crash gets diagnosed.
    console.error('InkTex encountered a render error:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render(): ReactNode {
    const { error, componentStack } = this.state;
    if (error === null) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-surface-base px-8">
        <TriangleAlert className="size-10 text-amber-400" />
        <div className="max-w-lg text-center">
          <h1 className="text-lg font-semibold text-content-primary">Something went wrong</h1>
          <p className="mt-1 text-sm text-content-secondary">
            InkTex hit an unexpected error while drawing the interface. Your files on disk are
            unaffected.
          </p>
        </div>

        <pre className="selectable max-h-48 max-w-2xl overflow-auto rounded-lg bg-surface-sunken p-4 text-left font-mono text-xs leading-relaxed text-content-muted">
          {error.message}
          {componentStack !== null && componentStack}
        </pre>

        <Button
          variant="primary"
          icon={<RefreshCw className="size-4" />}
          onClick={() => window.location.reload()}
        >
          Reload InkTex
        </Button>
      </div>
    );
  }
}
