/**
 * Magic-link reply API (token auth, no login required)
 */

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
    },
  };

  const response = await fetch(url, config);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new ReplyApiError(
      data?.error || data?.message || response.statusText || 'Request failed',
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

export function bootstrapReplySession(token) {
  return request(token, '/session', { method: 'POST' });
}
