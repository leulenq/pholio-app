/**
 * Talent launch status, read once per page load and shared by every reader.
 * Server: GET /api/public/talent-launch (src/routes/api/public.js).
 */

const STATUS_PATH = '/api/public/talent-launch';

let statusRequest = null;

/** Resolves to `{ open, access, launchAt, notifyUrl }`, or null if unreadable. */
export function loadTalentLaunchStatus() {
  statusRequest ??= fetch(STATUS_PATH, {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => (body?.success ? body.data : null))
    .catch(() => null);
  return statusRequest;
}

/** Login/session changes can grant access; read the status again after one. */
export function resetTalentLaunchStatus() {
  statusRequest = null;
}
