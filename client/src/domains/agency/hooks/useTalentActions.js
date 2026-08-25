import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  acceptApplication, confirmRepresentationApplication, declineApplication, shortlistApplication,
  keepOnFileApplication, requestMoreApplication, requestMeetingApplication,
  requestDigitalsRefresh,
  offerDevelopmentApplication, archiveApplication, assignToBoard,
} from '../api/agency';

// Shared talent action mutations — used by both the panel and the full-page view
// so behaviour stays identical. Broadly invalidates agency data so KPIs, the
// boards table, pipeline, and the open application all reflect the change.
export function useTalentActions(applicationId) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['application', applicationId] });
    qc.invalidateQueries({ queryKey: ['talent-dossier', applicationId] });
    qc.invalidateQueries({ queryKey: ['agency'] });
    qc.invalidateQueries({ queryKey: ['applications'] });
  };

  // Shared success/error handlers (plain objects — no hooks here).
  const opts = (okMsg) => ({
    onSuccess: () => { invalidate(); toast.success(okMsg); },
    onError: (e) => toast.error(e?.message || 'Something went wrong'),
  });

  const accept = useMutation({ mutationFn: () => acceptApplication(applicationId), ...opts('Representation offered') });
  const confirmRepresentation = useMutation({
    mutationFn: () => confirmRepresentationApplication(applicationId),
    ...opts('Representation agreement complete'),
  });
  const shortlist = useMutation({ mutationFn: () => shortlistApplication(applicationId), ...opts('Added to shortlist') });
  // Accepts an optional templated decline reason id (services/decline-reasons.js
  // on the server; see useDeclineReasons on the client) — null/undefined
  // declines without one, which is a valid, first-class outcome.
  const decline = useMutation({
    mutationFn: (declineReason) => declineApplication(applicationId, { declineReason }),
    ...opts('Not moving forward'),
  });
  const keepOnFile = useMutation({ mutationFn: () => keepOnFileApplication(applicationId), ...opts('Kept on file') });
  const requestMore = useMutation({ mutationFn: () => requestMoreApplication(applicationId), ...opts('Requested more materials') });
  const requestMeeting = useMutation({ mutationFn: () => requestMeetingApplication(applicationId), ...opts('Meeting requested') });
  /* Distinct from requestMore: this asks for the digitals to be SHOT AGAIN. The
     server refuses when the set is still current, and its refusal explains why
     in terms a reviewer can act on, so it is surfaced verbatim rather than
     replaced with a generic failure. */
  const requestRefresh = useMutation({
    mutationFn: () => requestDigitalsRefresh(applicationId),
    onSuccess: () => { invalidate(); toast.success('Asked for a current set of digitals'); },
    onError: (e) => toast.error(e?.message || 'Could not ask for a refresh'),
  });
  const offerDevelopment = useMutation({ mutationFn: () => offerDevelopmentApplication(applicationId), ...opts('Development offer sent') });
  const archive = useMutation({ mutationFn: () => archiveApplication(applicationId), ...opts('Archived') });
  const addToBoard = useMutation({ mutationFn: (boardId) => assignToBoard(applicationId, boardId), ...opts('Added to board') });

  const isPending =
    accept.isPending || confirmRepresentation.isPending || shortlist.isPending || decline.isPending ||
    keepOnFile.isPending || requestMore.isPending || requestMeeting.isPending ||
    requestRefresh.isPending ||
    offerDevelopment.isPending || archive.isPending || addToBoard.isPending;

  return {
    accept,
    confirmRepresentation,
    shortlist,
    decline,
    keepOnFile,
    requestMore,
    requestMeeting,
    requestRefresh,
    offerDevelopment,
    archive,
    addToBoard,
    isPending,
  };
}
