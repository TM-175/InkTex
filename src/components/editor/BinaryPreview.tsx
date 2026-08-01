import { useEffect, useState } from 'react';
import { FileQuestion, ImageOff } from 'lucide-react';
import { fsApi, systemApi } from '@/tauri';
import { useProjectStore } from '@/store/projectStore';
import type { EditorTab } from '@/types/editor';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { formatBytes } from '@/utils/format';
import { extname } from '@/utils/path';
import { toAppError } from '@/types/errors';

/** Extension → MIME type for the blob URL an <img> needs. */
const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/** Preview for an image file opened as a tab. */
export function ImagePreview({ tab }: { tab: EditorTab }) {
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let canceled = false;

    const load = async (): Promise<void> => {
      try {
        const bytes = await fsApi.readBinaryFile(tab.path);
        if (canceled) return;

        const mime = MIME_TYPES[extname(tab.path)] ?? 'application/octet-stream';
        // A blob URL keeps the bytes out of the DOM, which matters for large
        // images where a data: URI would be several times bigger.
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));

        setUrl(objectUrl);
        setSize(bytes.byteLength);
      } catch (caught) {
        if (!canceled) setError(toAppError(caught).message);
      }
    };

    void load();

    return () => {
      canceled = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [tab.path]);

  if (error !== null) {
    return (
      <EmptyState
        icon={<ImageOff className="size-10" />}
        title="This image could not be displayed"
        description={error}
      />
    );
  }

  if (url === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-5 text-content-muted" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-sunken">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
        {/* A checkerboard makes transparency visible. */}
        <div
          className="rounded border border-border-subtle"
          style={{
            backgroundImage:
              'linear-gradient(45deg, rgb(128 128 128 / 0.15) 25%, transparent 25%), linear-gradient(-45deg, rgb(128 128 128 / 0.15) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgb(128 128 128 / 0.15) 75%), linear-gradient(-45deg, transparent 75%, rgb(128 128 128 / 0.15) 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          }}
        >
          <img
            src={url}
            alt={tab.name}
            className="max-h-[70vh] max-w-full object-contain"
          />
        </div>
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between border-t border-border-subtle bg-surface-raised px-3 text-xs text-content-muted">
        <span className="truncate">{tab.path}</span>
        <span>{formatBytes(size)}</span>
      </div>
    </div>
  );
}

/** Placeholder for a file InkTex cannot render. */
export function UnsupportedPreview({ tab }: { tab: EditorTab }) {
  const root = useProjectStore((state) => state.project?.root);

  return (
    <EmptyState
      icon={<FileQuestion className="size-10" />}
      title={`${tab.name} cannot be shown here`}
      description="This file type has no in-app preview. Open it with the system default application instead."
      action={
        root === undefined ? undefined : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void systemApi.openExternally(`${root}/${tab.path}`)}
          >
            Open in Default App
          </Button>
        )
      }
    />
  );
}
