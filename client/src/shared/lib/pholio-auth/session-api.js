import { API_LOGIN_PATH, API_SESSION_PATH, PUBLIC_SESSION_PATH } from './constants';

export async function fetchPublicSession() {
  const response = await fetch(PUBLIC_SESSION_PATH, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    return { authenticated: false };
  }

  return response.json();
}

export async function fetchAppSession() {
  const response = await fetch(API_SESSION_PATH, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    return { authenticated: false };
  }

  return response.json();
}

export async function syncFirebaseSession(idToken) {
  const response = await fetch(API_LOGIN_PATH, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ firebase_token: idToken }),
  });

  if (!response.ok) {
    return { success: false };
  }

  const data = await response.json();
  return { success: data?.success !== false, redirect: data?.redirect };
}
