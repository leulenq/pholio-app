/** Canonical representation outcomes for application UI. */
export const OFFERED_APPLICATION_STATUSES = Object.freeze(['accepted']);
export const REPRESENTED_APPLICATION_STATUSES = Object.freeze(['represented']);

/**
 * The applicant's answer to an event slot offer. Mirrors
 * `src/shared/constants/application-status.js` — both statuses are written by
 * the talent, never by an agency, so they never appear in an agency-writable
 * list. Event-specific labels are owned by the talent status utils.
 */
export const CONFIRMED_APPLICATION_STATUS = 'confirmed';
export const TALENT_DECLINED_APPLICATION_STATUS = 'declined_by_talent';

export const TALENT_WRITABLE_APPLICATION_STATUSES = Object.freeze([
  CONFIRMED_APPLICATION_STATUS,
  TALENT_DECLINED_APPLICATION_STATUS,
]);

export const isOfferedApplicationStatus = (status) =>
  OFFERED_APPLICATION_STATUSES.includes(String(status || '').toLowerCase());

export const isRepresentedApplicationStatus = (status) =>
  REPRESENTED_APPLICATION_STATUSES.includes(String(status || '').toLowerCase());

export const isConfirmedApplicationStatus = (status) =>
  String(status || '').toLowerCase() === CONFIRMED_APPLICATION_STATUS;

export const isTalentDeclinedApplicationStatus = (status) =>
  String(status || '').toLowerCase() === TALENT_DECLINED_APPLICATION_STATUS;

export const isTalentWritableApplicationStatus = (status) =>
  TALENT_WRITABLE_APPLICATION_STATUSES.includes(String(status || '').toLowerCase());
