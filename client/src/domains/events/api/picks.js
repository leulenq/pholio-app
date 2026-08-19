/**
 * Designer pick-list API (token auth, no account, no session).
 *
 * Mirrors `domains/messaging/api/reply.js` — same request shape, same error
 * class pattern, same `{ success, data }` unwrap. `credentials: 'include'` is
 * kept for parity even though nothing here reads a cookie: the same-origin
 * mutation guard on `/api/picks` still wants the custom header, which
 * `sameOriginMutationHeaders` supplies for unsafe methods.
 */

import { sameOriginMutationHeaders } from '../../../shared/lib/same-origin-request';

const BASE = '/api/picks';

export class PicksApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'PicksApiError';
    this.status = status;
    this.data = data;
  }
}

async function request(token, endpoint, options = {}) {
  const url = `${BASE}/${encodeURIComponent(token)}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      ...sameOriginMutationHeaders(options.method),
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // No JSON body — leave data null and fall through to the status check.
  }

  if (!response.ok) {
    const message =
      (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
      data?.message ||
      response.statusText ||
      'Request failed';
    throw new PicksApiError(message, response.status, data);
  }

  return data?.data ?? data;
}

export function getPickList(token) {
  return request(token, '');
}

/** `mark: null` clears the selection. */
export function savePickSelection(token, applicationId, { mark, note } = {}) {
  return request(token, `/selections/${encodeURIComponent(applicationId)}`, {
    method: 'PUT',
    body: JSON.stringify({ mark: mark ?? null, note: note ?? null }),
  });
}

export function submitPickList(token) {
  return request(token, '/submit', { method: 'POST' });
}
