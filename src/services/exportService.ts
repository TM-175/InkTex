/**
 * Saving copies of project output to somewhere outside the project.
 *
 * Lives in the service layer because both the command palette and the toolbar
 * buttons invoke these, and neither should own the logic.
 */

import { fsApi, systemApi } from '@/tauri';
import { useCompileStore } from '@/store/compileStore';
import { useProjectStore } from '@/store/projectStore';
import { notify } from '@/store/uiStore';
import { toAppError } from '@/types/errors';
import { extname, stem } from '@/utils/path';

/** Copy the compiled PDF to a location the user picks. */
export async function exportPdf(): Promise<void> {
  const { pdfPath } = useCompileStore.getState();
  const project = useProjectStore.getState().project;

  if (pdfPath === null) {
    notify.warning('There is no compiled PDF to export', 'Compile the document first.');
    return;
  }

  const suggested = `${stem(project?.mainDocument ?? 'document')}.pdf`;
  const destination = await systemApi.pickSaveLocation('Export PDF', suggested, ['pdf']);
  if (destination === null) return;

  try {
    await fsApi.exportPdf(pdfPath, destination);
    notify.success('PDF exported', destination);
  } catch (error) {
    const appError = toAppError(error, 'The PDF could not be exported.');
    notify.error(appError.message, appError.hint ?? undefined);
  }
}

/** Save a copy of the active source file outside the project. */
export async function exportActiveSource(): Promise<void> {
  const store = useProjectStore.getState();
  const { project, tabs, activePath } = store;
  const tab = tabs.find((candidate) => candidate.path === activePath);

  if (project === null || tab === undefined) {
    notify.warning('No file is open', 'Open a file to save a copy of it.');
    return;
  }

  const extension = extname(tab.path) || 'tex';
  const destination = await systemApi.pickSaveLocation('Save a Copy', tab.name, [extension]);
  if (destination === null) return;

  try {
    // Flush the buffer first so the copy matches what is on screen.
    await store.saveTab(tab.path);
    await fsApi.exportPdf(`${project.root}/${tab.path}`, destination);
    notify.success('Copy saved', destination);
  } catch (error) {
    const appError = toAppError(error, 'The file could not be saved.');
    notify.error(appError.message, appError.hint ?? undefined);
  }
}
