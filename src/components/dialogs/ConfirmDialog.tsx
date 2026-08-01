import { Modal } from '@/components/ui/Modal';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { useUiStore } from '@/store/uiStore';

/**
 * Renders whatever confirmation `confirm()` has queued.
 *
 * Mounted once at the app root; the promise-based `confirm` helper in
 * `uiStore` is the only thing that opens it.
 */
export function ConfirmDialog() {
  const request = useUiStore((state) => state.confirmRequest);
  const resolve = useUiStore((state) => state.resolveConfirm);

  if (request === null) return null;

  return (
    <Modal
      open
      onClose={() => resolve(null)}
      title={request.title}
      description={request.message}
      className="max-w-md"
    >
      <footer className="flex justify-end gap-2 px-5 py-4">
        {/* Reversed so the primary action sits rightmost, as on macOS. */}
        {[...request.actions].reverse().map((action) => (
          <Button
            key={action.id}
            variant={(action.variant ?? 'secondary') as ButtonVariant}
            onClick={() => resolve(action.id)}
          >
            {action.label}
          </Button>
        ))}
      </footer>
    </Modal>
  );
}
