/**
 * Stripe Identity handoff.
 *
 * The handoff moment is Stripe's design, never ours: we render no Stripe
 * chrome, no logo lockup, no imitation of their modal. We hand off and get out
 * of the way.
 *
 * Two handoff shapes exist, in order of preference:
 *
 *  1. `stripe.verifyIdentity(clientSecret)` — Stripe.js opens their own modal
 *     over our page. This needs a publishable key (VITE_STRIPE_PUBLISHABLE_KEY)
 *     AND a `clientSecret` on the session response. The backend currently
 *     returns only `{ url, status }`, so this path stays dormant until the
 *     session endpoint also returns `client_secret` (tracked as a follow-up).
 *  2. `session.url` — Stripe's hosted verification page. Same Stripe-owned UI,
 *     full page instead of a modal. This is what runs today.
 *
 * Stripe.js is loaded from their CDN at handoff time rather than bundled:
 * Stripe requires their script to be served from js.stripe.com, and it keeps
 * a third-party script off every other page in the app. No new dependency.
 */

const STRIPE_JS_SRC = 'https://js.stripe.com/v3/';

let stripeJsPromise = null;

export function getPublishableKey() {
  try {
    return import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY || '';
  } catch {
    return '';
  }
}

export function loadStripeJs() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  if (window.Stripe) return Promise.resolve(window.Stripe);
  if (stripeJsPromise) return stripeJsPromise;

  stripeJsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${STRIPE_JS_SRC}"]`);
    const script = existing || document.createElement('script');

    script.addEventListener('load', () => resolve(window.Stripe || null), { once: true });
    script.addEventListener(
      'error',
      () => {
        stripeJsPromise = null;
        reject(new Error('Stripe could not be reached. Check your connection and try again.'));
      },
      { once: true },
    );

    if (!existing) {
      script.src = STRIPE_JS_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return stripeJsPromise;
}

/**
 * @param {{url?: string, clientSecret?: string, client_secret?: string}} session
 * @returns {Promise<{mode: 'modal'|'redirect', error: {message?: string}|null}>}
 */
export async function startIdentityHandoff(session) {
  const clientSecret = session?.clientSecret || session?.client_secret || null;
  const publishableKey = getPublishableKey();

  if (clientSecret && publishableKey) {
    const stripeFactory = await loadStripeJs();
    if (stripeFactory) {
      const stripe = stripeFactory(publishableKey);
      const result = await stripe.verifyIdentity(clientSecret);
      return { mode: 'modal', error: result?.error || null };
    }
  }

  if (session?.url) {
    window.location.assign(session.url);
    return { mode: 'redirect', error: null };
  }

  throw new Error('Stripe did not return a verification link. Try again in a moment.');
}
