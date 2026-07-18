/**
 * Shared local-dev seed session bootstrap for dashboard SessionGates.
 * Server rejects this unless AUTH_PASSTHROUGH_ENABLED=1 and NODE_ENV !== production.
 */

/** Login form uses the explicit Vite flag so Firebase remains available when unset. */
export const DEV_SEED_AUTH =
  import.meta.env.DEV &&
  import.meta.env.VITE_AUTH_PASSTHROUGH_ENABLED === '1';

/**
 * SessionGates bootstrap whenever Vite is in DEV mode. The API is still
 * hard-gated server-side, so this is safe even if the Vite env flag hasn't
 * been picked up yet after an .env change.
 */
export async function bootstrapDevSeedSession(role) {
  if (!import.meta.env.DEV) return false;

  const response = await fetch('/api/dev/bootstrap', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role }),
  });

  if (!response.ok) {
    return false;
  }

  const payload = await response.json().catch(() => null);
  return Boolean(payload?.success);
}

export async function fetchSession() {
  const response = await fetch('/api/session', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to load session');
  }

  return response.json();
}

/**
 * Ensure a seeded principal exists for the requested dashboard role, then
 * return /api/session. Falls back to a plain session read when passthrough
 * is disabled on the server.
 */
export async function ensureDevDashboardSession(role) {
  await bootstrapDevSeedSession(role);
  return fetchSession();
}
