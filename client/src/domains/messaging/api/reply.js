/**
 * Magic-link reply API (token auth, no login required)
 */

import { sameOriginMutationHeaders } from '../../../shared/lib/same-origin-request';

const BASE = '/api/reply';

export class ReplyApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ReplyApiError';
    this.status = status;
    this.data = data;
  }
}

async function request(token, endpoint, options = {}) {
  const url = `${BASE}/${token}${endpoint}`;

  const config = {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      ...sameOriginMutationHeaders(options.method),
    },
  };

  const response = await fetch(url, config);
  let data = null;
  try {
    data = await response.json();
  } catch {
    // Leave data null when the response has no JSON body.
  }

  if (!response.ok) {
    const message =
      (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
      data?.message ||
      response.statusText ||
      'Request failed';
    throw new ReplyApiError(
      message,
      response.status,
      data,
    );
  }

  return data?.data ?? data;
}

export function getReplyThread(token) {
  return request(token, '');
}

export function sendReplyMessage(token, message) {
  return request(token, '/messages', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function issueReplySessionToken(replyToken) {
  return request(replyToken, '/session-token', { method: 'POST' });
}

export function bootstrapReplySession(sessionToken) {
  return request(sessionToken, '/session', { method: 'POST' });
}
