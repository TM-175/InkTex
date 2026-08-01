import { useProjectStore } from '@/store/projectStore';
import {
  useAppBootstrap,
  useCommands,
  useCompileEvents,
  useDragAndDrop,
  useKeyboardShortcuts,
} from '@/hooks';
import { WelcomePage } from '@/pages/WelcomePage';
import { WorkspacePage } from '@/pages/WorkspacePage';
import { CommandPalette } from '@/components/dialogs/CommandPalette';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { NewProjectDialog } from '@/components/dialogs/NewProjectDialog';
import { QuickOpen } from '@/components/dialogs/QuickOpen';
import { SettingsDialog } from '@/components/dialogs/SettingsDialog';
import { ShortcutsDialog } from '@/components/dialogs/ShortcutsDialog';
import { SnippetPicker } from '@/components/dialogs/SnippetPicker';
import { CodeBlockWizard } from '@/components/code/CodeBlockWizard';
import { CodeImportDialog } from '@/components/code/CodeImportDialog';
import { ListingSearchDialog } from '@/components/code/ListingSearchDialog';
import { Spinner, Toaster } from '@/components/ui/Feedback';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/**
 * Application root.
 *
 * Owns the effects that must live for the whole session (bootstrap, backend
 * events, global keys, drag-and-drop) and picks between the welcome screen and
 * the workspace. Overlays are mounted unconditionally — each renders null
 * unless it is the active overlay — so their state survives being closed.
 */
export default function App() {
  const { ready } = useAppBootstrap();
  const hasProject = useProjectStore((state) => state.project !== null);

  const commands = useCommands();

  useKeyboardShortcuts(commands);
  useCompileEvents();
  useDragAndDrop();

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-base">
        <Spinner className="size-6 text-content-muted" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="h-full">
        {hasProject ? <WorkspacePage /> : <WelcomePage />}

        <CommandPalette commands={commands} />
        <QuickOpen />
        <SettingsDialog />
        <NewProjectDialog />
        <ShortcutsDialog />
        <SnippetPicker />
        <CodeBlockWizard />
        <CodeImportDialog />
        <ListingSearchDialog />
        <ConfirmDialog />
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}
