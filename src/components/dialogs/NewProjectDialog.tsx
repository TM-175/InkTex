import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { useProjectStore } from '@/store/projectStore';
import { systemApi } from '@/tauri';
import { TEMPLATES } from '@/services/templates';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Feedback';
import { cn } from '@/utils/cn';
import { truncatePath } from '@/utils/format';

/** Names that would fail validation in the backend, checked up front. */
const INVALID_NAME = /[/\\:*?"<>|]/;

export function NewProjectDialog() {
  const open = useUiStore((state) => state.overlay === 'newProject');
  const close = useUiStore((state) => state.closeOverlay);
  const createProject = useProjectStore((state) => state.createProject);

  const [name, setName] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(TEMPLATES[0]!.id);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setBusy(false);
    }
  }, [open]);

  const template = TEMPLATES.find((candidate) => candidate.id === templateId) ?? TEMPLATES[0]!;
  const nameInvalid = name !== '' && INVALID_NAME.test(name);
  const canCreate = name.trim() !== '' && !nameInvalid && parent !== null && !busy;

  const chooseParent = async (): Promise<void> => {
    const selected = await systemApi.pickDirectory('Choose where to create the project');
    if (selected !== null) setParent(selected);
  };

  const create = async (): Promise<void> => {
    if (!canCreate || parent === null) return;

    setBusy(true);
    const created = await createProject(parent, name.trim(), template.files);
    setBusy(false);

    if (created) close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="New Project"
      description="Pick a template; every file it creates is a working starting point."
      className="max-w-2xl"
    >
      <div className="grid min-h-0 grid-cols-[1fr_1.1fr] overflow-hidden">
        {/* Templates */}
        <div className="max-h-[26rem] overflow-auto border-r border-border-subtle p-3">
          <div className="grid gap-1.5">
            {TEMPLATES.map((candidate) => {
              const selected = candidate.id === templateId;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setTemplateId(candidate.id)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    selected
                      ? 'border-accent bg-accent-soft'
                      : 'border-border-subtle hover:border-border-strong hover:bg-surface-hover',
                  )}
                >
                  <div className="text-sm font-medium text-content-primary">{candidate.name}</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-content-muted">
                    {candidate.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Details */}
        <div className="flex max-h-[26rem] flex-col gap-4 overflow-auto p-4">
          <div>
            <label
              htmlFor="new-project-name"
              className="mb-1.5 block text-xs font-medium text-content-secondary"
            >
              Project name
            </label>
            <TextInput
              label="Project name"
              value={name}
              onChange={setName}
              placeholder="my-paper"
              autoFocus
              invalid={nameInvalid}
              className="w-full"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canCreate) void create();
              }}
            />
            {nameInvalid && (
              <p className="mt-1 text-xs text-rose-400">
                A folder name cannot contain {String.raw`/ \ : * ? " < > |`}
              </p>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-content-secondary">
              Location
            </span>
            <button
              type="button"
              onClick={() => void chooseParent()}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border border-border-subtle',
                'bg-surface-base px-2.5 py-2 text-left text-xs transition-colors',
                'hover:border-border-strong',
              )}
            >
              <FolderOpen className="size-4 shrink-0 text-content-muted" />
              <span
                className={cn('truncate', parent === null ? 'text-content-muted' : 'text-content-primary')}
                title={parent ?? undefined}
              >
                {parent === null ? 'Choose a folder…' : truncatePath(parent, 40)}
              </span>
            </button>
            {parent !== null && name.trim() !== '' && (
              <p className="mt-1.5 truncate text-[0.6875rem] text-content-muted">
                Creates {parent}/{name.trim()}/
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1">
            <span className="mb-1.5 block text-xs font-medium text-content-secondary">
              Files
            </span>
            <ul className="space-y-0.5 rounded-md bg-surface-sunken p-2.5">
              {template.files
                .filter((file) => !file.path.endsWith('.gitkeep'))
                .map((file) => (
                  <li key={file.path} className="font-mono text-[0.6875rem] text-content-muted">
                    {file.path}
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!canCreate}
          onClick={() => void create()}
          icon={busy ? <Spinner className="size-3.5" /> : undefined}
        >
          Create Project
        </Button>
      </footer>
    </Modal>
  );
}
