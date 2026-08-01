import { useMemo } from 'react';
import { FileWarning, Hammer } from 'lucide-react';
import { useCompileStore } from '@/store/compileStore';
import { useProjectStore } from '@/store/projectStore';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { PdfViewer, type PdfSource } from './PdfViewer';

/**
 * The preview pane.
 *
 * Wraps {@link PdfViewer} with the states that only apply to compiled output:
 * nothing built yet, and a build that failed before producing a PDF.
 */
export function PdfPreview() {
  const pdfPath = useCompileStore((state) => state.pdfPath);
  const pdfVersion = useCompileStore((state) => state.pdfVersion);
  const phase = useCompileStore((state) => state.phase);
  const result = useCompileStore((state) => state.result);
  const compile = useCompileStore((state) => state.compile);
  const mainDocument = useProjectStore((state) => state.project?.mainDocument ?? null);

  const source = useMemo<PdfSource | null>(
    () => (pdfPath === null ? null : { kind: 'absolute', path: pdfPath }),
    [pdfPath],
  );

  if (source === null) {
    const failedWithoutOutput = result?.status === 'failed';

    return (
      <div className="flex h-full flex-col bg-surface-raised">
        <EmptyState
          icon={failedWithoutOutput ? <FileWarning className="size-12" /> : <Hammer className="size-12" />}
          title={failedWithoutOutput ? 'No PDF was produced' : 'No preview yet'}
          description={
            failedWithoutOutput
              ? 'The compiler stopped before writing a PDF. Check the Problems panel for the first error.'
              : mainDocument === null
                ? 'Set a main document, then compile to see the preview here.'
                : 'Compile the document to see the preview here.'
          }
          action={
            mainDocument !== null && (
              <Button
                variant="primary"
                size="sm"
                disabled={phase !== 'idle'}
                onClick={() => void compile()}
              >
                Compile Now
              </Button>
            )
          }
        />
      </div>
    );
  }

  return <PdfViewer source={source} version={pdfVersion} />;
}
