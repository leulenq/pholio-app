/** Canonical representation outcomes for application UI. */
export const OFFERED_APPLICATION_STATUSES = Object.freeze(['accepted']);
export const REPRESENTED_APPLICATION_STATUSES = Object.freeze(['represented']);

export const isOfferedApplicationStatus = (status) =>
  OFFERED_APPLICATION_STATUSES.includes(String(status || '').toLowerCase());

export const isRepresentedApplicationStatus = (status) =>
  REPRESENTED_APPLICATION_STATUSES.includes(String(status || '').toLowerCase());
