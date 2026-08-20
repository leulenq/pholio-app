/**
 * Shortlist-stage fulfilment API (token auth, no account, no session).
 *
 * Mirrors `domains/events/api/picks.js` and `domains/messaging/api/reply.js` —
 * same request shape, same error class, same `{ success, data }` unwrap.
 *
 * `/api/public/opencall/materials` is deliberately NOT in
 * `PROTECTED_API_PREFIXES` (the request originates from a click in a mail
 * client, which sends no useful Origin), so the same-origin header is not
 * required here. It is still sent for parity with the other tokenized surfaces:
 * a request that carries it is never worse off, and if the prefix is ever
 * protected this client already satisfies it.
 */

import { sameOriginMutationHeaders } from '../../../shared/lib/same-origin-request';

const BASE = '/api/public/opencall/materials';

export class MaterialsApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'MaterialsApiError';
    this.status = status;
    this.data = data;
  }
}

async function request(token, options = {}) {
  const response = await fetch(`${BASE}/${encodeURIComponent(token)}`, {
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
      data?.message ||
      (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
      response.statusText ||
      'Request failed';
    throw new MaterialsApiError(message, response.status, data);
  }

  return data?.data ?? data;
}

/** Never consumes the link — see `src/domains/opencall/routes/materials.js`. */
export function getMaterialsRequest(token) {
  return request(token);
}

/**
 * @param {string} token
 * @param {{answers: object}} body `answers` carries only the requested keys,
 *   plus `measurementsConfirmed` when measurements were asked for.
 */
export function sendMaterials(token, body) {
  return request(token, { method: 'POST', body: JSON.stringify(body) });
}
