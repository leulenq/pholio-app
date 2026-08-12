/**
 * Instagram OAuth helpers (server redirect flow).
 */

let configuredCache = null;

export async function isInstagramAuthConfigured() {
  if (configuredCache !== null) return configuredCache;

  try {
    const response = await fetch('/api/auth/instagram/status', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      configuredCache = false;
      return false;
    }
    const data = await response.json();
    configuredCache = Boolean(data.configured);
    return configuredCache;
  } catch {
    configuredCache = false;
    return false;
  }
}

export async function startInstagramAuth({ flow = 'login', next = null, dateOfBirth = null } = {}) {
  const params = new URLSearchParams({ flow });
  if (next) params.set('next', next);

  if (flow !== 'signup') {
    window.location.href = `/api/auth/instagram/start?${params.toString()}`;
    return;
  }

  const response = await fetch(`/api/auth/instagram/start?${params.toString()}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Pholio-Request': 'same-origin',
    },
    body: JSON.stringify({ date_of_birth: dateOfBirth }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.authorize_url) {
    throw new Error(data.message || data.error || 'Unable to start Instagram sign-up.');
  }
  window.location.href = data.authorize_url;
}
