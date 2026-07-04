export const CONSENT_KEY = 'pholio_cookie_consent_v1';

export function getConsent() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.necessary !== 'boolean' ||
      typeof parsed.analytics !== 'boolean'
    ) {
      return null;
    }
    return {
      necessary: parsed.necessary,
      analytics: parsed.analytics,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return null;
  }
}

export function setConsent(consent) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify({
      necessary: consent.necessary,
      analytics: consent.analytics,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export function analyticsAllowed() {
  const consent = getConsent();
  if (!consent) return false;
  return consent.analytics === true;
}
