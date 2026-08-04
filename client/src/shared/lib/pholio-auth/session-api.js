import { API_LOGIN_PATH, API_SESSION_PATH, PUBLIC_SESSION_PATH } from './constants';
import { sameOriginMutationHeaders } from '../same-origin-request';

async function readJson(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return { ok: false, reason: 'non_json_response' };
  }

  try {
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false, reason: 'invalid_json_response' };
  }
}

function sessionResultFromResponse(response, data = {}) {
  if (!response.ok || data?.success !== true) {
    return {
      success: false,
      status: response.status,
      reason: response.ok ? 'unsuccessful_response' : 'request_failed',
      error: typeof data?.error === 'string' ? data.error : undefined,
      message: typeof data?.message === 'string' ? data.message : undefined,
      errors: data?.errors,
      redirect: typeof data?.redirect === 'string' ? data.redirect : undefined,
    };
  }

  return {
    success: true,
    redirect: typeof data?.redirect === 'string' ? data.redirect : undefined,
  };
}

// Firebase and focus reconciliation can request the same exchange at nearly
// the same time. Share one request so the server regenerates the session once.
const activeFirebaseSessionSyncs = new Map();

export async function fetchPublicSession() {
  const response = await fetch(PUBLIC_SESSION_PATH, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    return { authenticated: false };
  }

  const payload = await readJson(response);
  return payload.ok
    ? payload.data
    : { authenticated: false, reason: payload.reason };
}

export async function fetchAppSession() {
  const response = await fetch(API_SESSION_PATH, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    return { authenticated: false };
  }

  const payload = await readJson(response);
  return payload.ok
    ? payload.data
    : { authenticated: false, reason: payload.reason };
}

export async function syncFirebaseSession(idToken, { inviteToken } = {}) {
  const syncKey = `${idToken}\u0000${inviteToken || ''}`;
  const activeSync = activeFirebaseSessionSyncs.get(syncKey);
  if (activeSync) return activeSync;

  const sync = (async () => {
    try {
      const response = await fetch(API_LOGIN_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...sameOriginMutationHeaders('POST'),
        },
        body: JSON.stringify({
          firebase_token: idToken,
          invite_token: inviteToken || undefined,
        }),
      });
      const payload = await readJson(response);
      if (!payload.ok) {
        return {
          success: false,
          status: response.status,
          reason: payload.reason,
        };
      }
      return sessionResultFromResponse(response, payload.data);
    } catch {
      return { success: false, reason: 'network_error' };
    }
  })();

  activeFirebaseSessionSyncs.set(syncKey, sync);
  try {
    return await sync;
  } finally {
    activeFirebaseSessionSyncs.delete(syncKey);
  }
}
