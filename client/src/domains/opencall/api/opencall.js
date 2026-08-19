/**
 * The anonymous open-call applicant client
 * (`docs/open-call-applicant-flow-design-2026-08.md` §5.1–§5.3, §5.5).
 *
 * Every endpoint here is public: there is no session, no bearer token, and no
 * same-origin header (`src/shared/middleware/same-origin-mutation.js` does not
 * protect `/api/public/*`). What authorizes a write is the httpOnly draft
 * cookie the server sets on the first save, or the raw token in a claim URL —
 * so `credentials: 'include'` is not optional on any call in this file.
 *
 * Shape mirrors `client/src/domains/agency/api/agency.js`: one request helper,
 * one error class carrying the server's stable code, `{success, data}`
 * unwrapped at the boundary so callers only ever see `data`.
 */

const BASE = '/api/public/opencall';

/**
 * A coded failure from the apply surface.
 *
 * `code` is the server's `error` string (`INTAKE_VALIDATION_FAILED`,
 * `ALREADY_APPLIED`, `CONSENT_PACKAGE_CHANGED`, …) and is the only thing the
 * UI branches on — never the message, which is copy and will change.
 */
export class OpenCallError extends Error {
  constructor(message, { code = 'REQUEST_FAILED', status = 0, errors = [], blockers = [] } = {}) {
    super(message || 'Something went wrong.');
    this.name = 'OpenCallError';
    this.code = code;
    this.status = status;
    this.errors = errors;
    this.blockers = blockers;
  }
}

async function readBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request(path, { method = 'GET', body, formData } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: formData
        ? { Accept: 'application/json' }
        : { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: formData || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    // A dropped connection mid-application is the one failure the applicant is
    // most likely to hit on a phone, so it gets its own code rather than
    // arriving as an unreadable generic.
    throw new OpenCallError('You appear to be offline. Try again in a moment.', {
      code: 'NETWORK_ERROR',
    });
  }

  const payload = await readBody(response);

  if (!response.ok || payload?.success === false) {
    throw new OpenCallError(payload?.message || payload?.error || 'Something went wrong.', {
      code: payload?.error || `HTTP_${response.status}`,
      status: response.status,
      errors: Array.isArray(payload?.errors) ? payload.errors : [],
      blockers: Array.isArray(payload?.blockers) ? payload.blockers : [],
    });
  }

  return payload?.data ?? null;
}

/** Screen one's data, plus whether there is a draft to pick back up. */
export function getCall(code) {
  return request(`/call/${encodeURIComponent(code)}`);
}

/** The saved draft — answers, media present, blockers, consent fingerprint. */
export function getDraft(code) {
  return request(`/call/${encodeURIComponent(code)}/draft`);
}

/** The autosave. Called on every screen advance with just that screen's answers. */
export function saveDraft(code, { answers, customAnswers } = {}) {
  return request(`/call/${encodeURIComponent(code)}/draft`, {
    method: 'POST',
    body: { ...(answers ? { answers } : {}), ...(customAnswers ? { customAnswers } : {}) },
  });
}

/**
 * The email step. The response is identical for a new address, an unclaimed
 * identity and a full Pholio account (§5.3) — never branch the UI on it.
 */
export function attachEmail(code, { email, phone } = {}) {
  return request(`/call/${encodeURIComponent(code)}/draft/email`, {
    method: 'POST',
    body: { email, ...(phone ? { phone } : {}) },
  });
}

/** One camera-roll pick, replacing whatever is stored for that field key. */
export function uploadMedia(code, fieldKey, file) {
  const formData = new FormData();
  formData.append('media', file);
  return request(
    `/call/${encodeURIComponent(code)}/draft/media/${encodeURIComponent(fieldKey)}`,
    { method: 'POST', formData },
  );
}

/** Send. `consent.packageFingerprint` must be the one the applicant confirmed. */
export function submitApplication(code, consent) {
  return request(`/call/${encodeURIComponent(code)}/submit`, {
    method: 'POST',
    body: { consent },
  });
}

/** The claim landing page's preview — a first name and counts, nothing more. */
export function getClaim(token) {
  return request(`/claim/${encodeURIComponent(token)}`);
}

/** "Keep my profile." Returns `{redirect}` and, on success, an open session. */
export function claimProfile(token) {
  return request(`/claim/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: { termsAccepted: true },
  });
}

/** "That wasn't me" (§5.5). */
export function disownIdentity(token) {
  return request(`/disown/${encodeURIComponent(token)}`, { method: 'POST', body: {} });
}
