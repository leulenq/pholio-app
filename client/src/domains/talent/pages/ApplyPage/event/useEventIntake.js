import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EVENT_PAGE_ID,
  availabilityIssue,
  defaultAvailabilityForCall,
  eventIntakeGaps,
  isEventCallDTO,
  pagesForCall,
  toDateInputValue,
  walkVideoIssue,
} from './eventIntake';

/**
 * All event-call state for the apply flow, in one hook.
 *
 * `ApplyExperience.jsx` calls this once and spreads the result into the places
 * that already exist — the dossier page list, the draft payload, the consent
 * package, the submit body. Nothing about event casting leaks into that file
 * beyond those wiring points and a single conditional render.
 *
 * The call comes from the open-call claim, which is server-resolved: the client
 * never decides that a submission is an event application, it only renders the
 * fact that the server already established.
 */
export function useEventIntake({ basePages, claim }) {
  const call = claim?.call || null;
  const isEventCall = isEventCallDTO(call);
  const openCallLinkId = isEventCall ? claim?.openCallLinkId || null : null;

  const [availability, setAvailability] = useState(null);
  const [walkVideoUrl, setWalkVideoUrl] = useState('');
  const [measurementsConfirmed, setMeasurementsConfirmed] = useState(false);
  // The call whose defaults have already been applied. Re-seeding on every
  // render would fight the applicant's own edits; re-seeding never would leave
  // the fields blank when they switch to a different call.
  const seededForLinkRef = useRef(null);

  useEffect(() => {
    if (!isEventCall || !openCallLinkId) {
      seededForLinkRef.current = null;
      return;
    }
    if (seededForLinkRef.current === openCallLinkId) return;
    seededForLinkRef.current = openCallLinkId;
    setAvailability(defaultAvailabilityForCall(call));
    setWalkVideoUrl('');
    setMeasurementsConfirmed(false);
  }, [call, isEventCall, openCallLinkId]);

  /**
   * Restore from a saved draft. Called from `applyDraftDocument`, so a resumed
   * event application comes back with the dates and link the applicant chose
   * rather than silently reverting to the event's full run.
   */
  const hydrateFromDraft = useCallback((payload) => {
    const from = toDateInputValue(payload?.availability?.from);
    const to = toDateInputValue(payload?.availability?.to);
    if (from || to) setAvailability({ from, to });
    setWalkVideoUrl(
      typeof payload?.walkVideoUrl === 'string' ? payload.walkVideoUrl : '',
    );
    setMeasurementsConfirmed(payload?.measurementsConfirmed === true);
  }, []);

  const pages = useMemo(
    () => pagesForCall(basePages, isEventCall),
    [basePages, isEventCall],
  );

  // What travels on the draft and the submit body. Null on a representation
  // submission, which is what keeps the consent fingerprint byte-identical to
  // what it has always been.
  const submissionFields = useMemo(() => {
    if (!isEventCall) {
      return { openCallLinkId: null, availability: null, walkVideoUrl: null };
    }
    const from = toDateInputValue(availability?.from);
    const to = toDateInputValue(availability?.to);
    const trimmedVideo = (walkVideoUrl || '').trim();
    return {
      openCallLinkId,
      availability: from && to ? { from, to } : null,
      walkVideoUrl: trimmedVideo || null,
    };
  }, [availability, isEventCall, openCallLinkId, walkVideoUrl]);

  const gaps = useMemo(
    () =>
      isEventCall
        ? eventIntakeGaps({
            call,
            availability,
            walkVideoUrl,
            measurementsConfirmed,
          })
        : [],
    [availability, call, isEventCall, measurementsConfirmed, walkVideoUrl],
  );

  return {
    call,
    isEventCall,
    pages,
    pageId: EVENT_PAGE_ID,
    openCallLinkId,
    availability,
    setAvailability,
    walkVideoUrl,
    setWalkVideoUrl,
    measurementsConfirmed,
    setMeasurementsConfirmed,
    hydrateFromDraft,
    submissionFields,
    measurementsConfirmedForDraft: measurementsConfirmed,
    gaps,
    // Advisory only — the server decides. Surfaced on the footer so an
    // applicant is never surprised by a rejected send.
    gapLabels: gaps.map((gap) => gap.label),
    hasBlockingIssue: Boolean(
      isEventCall && (availabilityIssue(availability) || walkVideoIssue(walkVideoUrl)),
    ),
  };
}

export default useEventIntake;
