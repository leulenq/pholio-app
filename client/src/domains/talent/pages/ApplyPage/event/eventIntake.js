/**
 * Event-call intake — the pure part.
 *
 * Everything an event application adds to the submission dossier lives in this
 * folder (design §e, T2). `ApplyExperience.jsx` is four thousand lines and gets
 * exactly one conditional and one hook call; scattering date pickers and URL
 * validation through it would be how that file becomes five thousand.
 */

import { CALL_KINDS } from '../../../../../shared/constants/eventCasting';

export const EVENT_PAGE_ID = 'event';

const EVENT_PAGE = Object.freeze({
  id: EVENT_PAGE_ID,
  title: 'The casting',
  standfirst:
    'What the organizer needs beyond your package: the days you can work, and how you move.',
});

/**
 * The dossier for an event call, with the casting step inserted before Review.
 *
 * Before Review and after The Message on purpose: availability and a walk video
 * are the last things you decide, and Review has to be able to show them back.
 */
export function pagesForCall(basePages, isEventCall) {
  if (!isEventCall) return basePages;
  const reviewIndex = basePages.findIndex((page) => page.id === 'review');
  if (reviewIndex < 0) return [...basePages, EVENT_PAGE];
  return [
    ...basePages.slice(0, reviewIndex),
    EVENT_PAGE,
    ...basePages.slice(reviewIndex),
  ];
}

export function isEventCallDTO(call) {
  return call?.callKind === CALL_KINDS.EVENT_CASTING;
}

/** `YYYY-MM-DD` or ''. Must match the consent fingerprint's normalization. */
export function toDateInputValue(value) {
  const text = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

/**
 * Ruling R1: v1 takes a pasted link, not an upload. The three named hosts are a
 * hint rather than an allowlist — a model with their walk on an agency's own
 * server should not be blocked — but anything that is not http(s) is refused
 * outright, because the organizer's dossier renders this as a live link.
 */
export const WALK_VIDEO_HOST_HINT =
  'Paste an unlisted YouTube or Vimeo link, or a Google Drive link set to “anyone with the link”.';

export const WALK_VIDEO_MAX_LENGTH = 500;

export function walkVideoIssue(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.length > WALK_VIDEO_MAX_LENGTH) return 'That link is too long to save.';
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return 'That is not a complete web address — include https://.';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only http:// and https:// links can be sent.';
  }
  return null;
}

export function isWalkVideoUsable(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return Boolean(text) && walkVideoIssue(text) === null;
}

export function availabilityIssue(range) {
  const from = toDateInputValue(range?.from);
  const to = toDateInputValue(range?.to);
  if (!from && !to) return null;
  if (!from || !to) return 'Give both a first and a last day you can work.';
  if (to < from) return 'The last day cannot fall before the first.';
  return null;
}

export function isAvailabilityComplete(range) {
  return (
    Boolean(toDateInputValue(range?.from)) &&
    Boolean(toDateInputValue(range?.to)) &&
    availabilityIssue(range) === null
  );
}

/**
 * The range the applicant is offered on arrival: the event's own dates. Most
 * applicants are available for the whole run, and the ones who are not will
 * narrow it — which is a far better default than an empty pair of fields that
 * makes everyone guess what the organizer is asking about.
 */
export function defaultAvailabilityForCall(call) {
  const from = toDateInputValue(call?.event?.startsOn);
  const to = toDateInputValue(call?.event?.endsOn) || from;
  if (!from) return null;
  return { from, to };
}

/**
 * What the applicant still has to do before this call will accept a send.
 * Advisory here; `validate-submission-package.js` is what actually enforces it,
 * and the codes match so a blocked submit reads the same in both places.
 */
export function eventIntakeGaps({ call, availability, walkVideoUrl, measurementsConfirmed }) {
  const intake = call?.intake || {};
  const gaps = [];
  if (intake.walkVideo && !isWalkVideoUsable(walkVideoUrl)) {
    gaps.push({ code: 'event_walk_video_required', label: 'Walk video' });
  }
  if (intake.availability && !isAvailabilityComplete(availability)) {
    gaps.push({ code: 'event_availability_required', label: 'Availability' });
  }
  if (intake.measurements && measurementsConfirmed !== true) {
    gaps.push({ code: 'event_measurements_required', label: 'Measurements' });
  }
  return gaps;
}
