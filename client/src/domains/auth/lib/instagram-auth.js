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

export function startInstagramAuth({ flow = 'login', next = null } = {}) {
  const params = new URLSearchParams({ flow });
  if (next) params.set('next', next);
  window.location.href = `/api/auth/instagram/start?${params.toString()}`;
}
