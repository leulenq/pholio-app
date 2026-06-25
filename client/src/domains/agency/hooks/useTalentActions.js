import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  acceptApplication, declineApplication, shortlistApplication,
  keepOnFileApplication, archiveApplication, assignToBoard,
} from '../api/agency';

// Shared talent action mutations — used by both the panel and the full-page view
// so behaviour stays identical. Broadly invalidates agency data so KPIs, the
// boards table, pipeline, and the open application all reflect the change.
export function useTalentActions(applicationId) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['application', applicationId] });
    qc.invalidateQueries({ queryKey: ['agency'] });
    qc.invalidateQueries({ queryKey: ['applications'] });
  };

  // Shared success/error handlers (plain objects — no hooks here).
  const opts = (okMsg) => ({
    onSuccess: () => { invalidate(); toast.success(okMsg); },
    onError: (e) => toast.error(e?.message || 'Something went wrong'),
  });

  const accept = useMutation({ mutationFn: () => acceptApplication(applicationId), ...opts('Talent accepted') });
  const shortlist = useMutation({ mutationFn: () => shortlistApplication(applicationId), ...opts('Added to shortlist') });
  const decline = useMutation({ mutationFn: () => declineApplication(applicationId), ...opts('Application declined') });
  const keepOnFile = useMutation({ mutationFn: () => keepOnFileApplication(applicationId), ...opts('Kept on file') });
  const archive = useMutation({ mutationFn: () => archiveApplication(applicationId), ...opts('Archived') });
  const addToBoard = useMutation({ mutationFn: (boardId) => assignToBoard(applicationId, boardId), ...opts('Added to board') });

  const isPending =
    accept.isPending || shortlist.isPending || decline.isPending ||
    keepOnFile.isPending || archive.isPending || addToBoard.isPending;

  return { accept, shortlist, decline, keepOnFile, archive, addToBoard, isPending };
}
