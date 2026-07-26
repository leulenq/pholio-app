import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import { purgeApplyDraftStorage } from '../../domains/talent/pages/ApplyPage/applicationDraftStorage';
import { sameOriginMutationHeaders } from './same-origin-request';

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

  // Firebase must be signed out too — otherwise the global auth listener
  // (PholioAuthBridge) treats the still-present Firebase user as a signal
  // to silently re-create an Express session on the next page load.
  await signOut(auth).catch(() => {});

  try {
    const response = await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...sameOriginMutationHeaders('POST'),
      },
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

  purgeApplyDraftStorage();
  window.location.href = target;
}
