/** Marketing site — used after dashboard sign-out. */
export const MARKETING_SITE_URL = (
  import.meta.env.VITE_MARKETING_SITE_URL || 'https://www.pholio.studio'
).replace(/\/$/, '');

/**
 * End the Express session and send the browser to the marketing site.
 * @returns {Promise<void>}
 */
export async function postLogoutAndRedirectToMarketing() {
  let target = MARKETING_SITE_URL;

  try {
    const response = await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const redirect = typeof data?.redirect === 'string' ? data.redirect.trim() : '';
      if (redirect.startsWith('http://') || redirect.startsWith('https://')) {
        target = redirect;
      }
    }
  } catch {
    // Still leave the app even if the request fails.
  }

  window.location.href = target;
}
