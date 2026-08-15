/**
 * Browser mirror of `src/shared/constants/event-casting.js`.
 *
 * Only the vocabulary the SPA actually branches on lives here. Keep the values
 * byte-identical to the server module — they cross the wire in both
 * directions, and a divergence would be a call silently treated as
 * representation.
 */

/** `agency_open_call_links.call_kind` / `applications.call_purpose`. */
export const CALL_KINDS = Object.freeze({
  REPRESENTATION: 'representation',
  EVENT_CASTING: 'event_casting',
});
export const CALL_KIND_VALUES = Object.freeze(Object.values(CALL_KINDS));
export const DEFAULT_CALL_KIND = CALL_KINDS.REPRESENTATION;

/** Mandatory on an event call — the consent copy quotes it verbatim. */
export const COMPENSATION_TYPES = Object.freeze({
  PAID: 'paid',
  UNPAID: 'unpaid',
  STIPEND: 'stipend',
});
export const COMPENSATION_TYPE_VALUES = Object.freeze(Object.values(COMPENSATION_TYPES));

/** A designer's private opinion on the pick-list page. Never a status. */
export const PICK_MARKS = Object.freeze({
  PICK: 'pick',
  MAYBE: 'maybe',
  PASS: 'pass',
});
export const PICK_MARK_VALUES = Object.freeze(Object.values(PICK_MARKS));

export const isEventCastingCallKind = (value) =>
  String(value || '').toLowerCase() === CALL_KINDS.EVENT_CASTING;
