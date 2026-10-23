/** Mirrored in pholio-app/public/scripts/google-analytics.mjs. No Google SDK before consent. */
const SITE_PATHS = new Set(['/', '/talent', '/agencies', '/studio-plus', '/about', '/contact', '/careers', '/press', '/opening', '/agency/request-access', '/terms', '/privacy', '/cookies', '/ai-notice', '/dmca', '/take-it-down', '/community-guidelines', '/legal/agency-terms', '/legal/submission-program', '/legal/guardians', '/legal/verification', '/legal/subscriptions']);
const APP_PATHS = new Set(['/login', '/login/forgot-password', '/onboarding', '/dashboard/talent', '/dashboard/talent/profile', '/dashboard/talent/media', '/dashboard/talent/comp-card', '/dashboard/talent/intel', '/dashboard/talent/applications', '/dashboard/talent/applications/apply', '/dashboard/talent/open-calls', '/dashboard/talent/messages', '/dashboard/talent/settings', '/dashboard/agency', '/dashboard/agency/setup', '/dashboard/agency/submissions', '/dashboard/agency/signing', '/dashboard/agency/discover', '/dashboard/agency/events', '/dashboard/agency/settings', '/dashboard/agency/messages', '/dashboard/agency/activity', '/dashboard/agency/team']);

/** Unknown routes and recovery/magic-link/staff routes never reach Google. */
export function analyticsPath(pathname, surface) {
  const path = pathname.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  if (surface === 'site') return SITE_PATHS.has(path) ? path : null;
  if (APP_PATHS.has(path)) return path;
  if (/^\/(portfolio|p)\/[^/]+$/.test(path)) return '/portfolio/:slug';
  if (/^\/opencall\/[^/]+$/.test(path)) return '/opencall/:code';
  for (const name of ['talent', 'signing', 'events']) {
    if (new RegExp(`^/dashboard/agency/${name}/[^/]+$`).test(path)) return `/dashboard/agency/${name}/:id`;
  }
  if (/^\/dashboard\/(talent|agency)\/settings\/[^/]+$/.test(path)) return path.replace(/\/[^/]+$/, '/:section');
  return null;
}

/** @param {{measurementId?: string, surface: string, enabled: boolean, debug?: boolean, allowed: () => boolean}} options */
export function createAnalytics(options) {
  const { measurementId = '', surface, enabled, debug: debugRequested = false, allowed } = options;
  const productionHost = ['www.pholio.studio', 'pholio.studio', 'app.pholio.studio'].includes(window.location.hostname);
  const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const debug = debugRequested && localHost;
  if (!enabled || !/^G-[A-Z0-9]+$/.test(measurementId) || (!productionHost && !(debug && localHost))) {
    return { page: () => {}, event: () => {}, destroy: () => {} };
  }
  const disableKey = `ga-disable-${measurementId}`;
  let script = null;
  let configured = false;
  let loaded = false;
  let granted = false;
  let currentPath = window.location.pathname;
  let lastPage = null;
  let previousPage = '';
  let destroyed = false;
  let interval;
  window[disableKey] = true;
  window.dataLayer = window.dataLayer || [];
  // Google expects an Arguments object, not an array.
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const gtag = (...args) => window.gtag(...args);
  const consent = (value) => ({ analytics_storage: value, ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  gtag('consent', 'default', consent('denied'));

  function clearCookies() {
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0];
      if (name !== '_ga' && !name.startsWith('_ga_')) continue;
      for (const domain of ['', window.location.hostname, 'pholio.studio']) {
        document.cookie = `${name}=; path=/; max-age=0; samesite=lax${domain ? `; domain=${domain}` : ''}`;
      }
    }
  }

  function page() {
    const path = analyticsPath(currentPath, surface);
    const navigation = currentPath.split(/[?#]/)[0];
    if (!configured || !granted || !allowed() || !path || lastPage === navigation) return;
    const location = window.location.origin + path;
    const referrer = previousPage || safeReferrer();
    const parameters = { page_location: location, page_referrer: referrer, page_title: `Pholio ${path}`, page_path: path, pholio_surface: surface };
    // Override defaults too: automatic engagement must never inherit the raw URL/title.
    gtag('set', parameters);
    gtag('event', 'page_view', { ...parameters, send_to: measurementId, ...(debug ? { debug_mode: true } : {}) });
    previousPage = location;
    lastPage = navigation;
  }

  function safeReferrer() {
    try {
      const url = new URL(document.referrer);
      if (url.hostname.endsWith('.pholio.studio') || url.hostname === 'pholio.studio') {
        const path = analyticsPath(url.pathname, url.hostname === 'www.pholio.studio' || url.hostname === 'pholio.studio' ? 'site' : 'app');
        return path ? url.origin + path : '';
      }
      return url.origin; // Never transmit referral queries, tokens, or personal paths.
    } catch { return ''; }
  }

  function configure() {
    if (destroyed || configured || !allowed() || !granted) return;
    const path = analyticsPath(currentPath, surface);
    if (!path) return;
    gtag('consent', 'update', consent('granted'));
    gtag('js', new Date());
    gtag('config', measurementId, {
      send_page_view: false, cookie_domain: productionHost ? 'pholio.studio' : 'auto',
      cookie_flags: 'SameSite=Lax;Secure', cookie_expires: 31536000,
      allow_google_signals: false, allow_ad_personalization_signals: false,
      page_location: window.location.origin + path, page_referrer: safeReferrer(),
      page_title: `Pholio ${path}`, pholio_surface: surface,
      ...(debug ? { debug_mode: true } : {}),
    });
    configured = true;
    page();
  }

  function sync() {
    if (destroyed) return;
    const next = allowed() && analyticsPath(currentPath, surface) !== null;
    if (!next) {
      window[disableKey] = true;
      if (granted) {
        granted = false;
        lastPage = null;
        previousPage = '';
        gtag('consent', 'update', consent('denied'));
      }
      if (!allowed()) clearCookies();
      return;
    }
    window[disableKey] = false;
    if (!granted) {
      granted = true;
      if (configured) { gtag('consent', 'update', consent('granted')); page(); }
    }
    if (!script) {
      script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
      script.onload = () => { loaded = true; configure(); };
      script.onerror = () => { script?.remove(); script = null; loaded = false; };
      document.head.appendChild(script);
    } else if (loaded && !configured) configure();
    else if (configured) page();
  }
  const visible = () => { if (document.visibilityState === 'visible') sync(); };
  window.addEventListener('pholio:consent-changed', sync);
  window.addEventListener('focus', sync);
  window.addEventListener('pageshow', sync);
  document.addEventListener('visibilitychange', visible);
  // Cookie writes from another subdomain do not produce a storage event.
  interval = window.setInterval(sync, 1000);
  sync();
  return {
    page(pathname) { currentPath = pathname; sync(); },
    event(name, method) {
      sync();
      if (!granted || !configured || !allowed()) return;
      const methods = { login: ['email', 'google'], sign_up: ['email', 'google'], generate_lead: ['agency_access_request'] };
      if (!methods[name]?.includes(method)) return;
      gtag('event', name, { method, pholio_surface: surface, send_to: measurementId, ...(debug ? { debug_mode: true } : {}) });
    },
    destroy() {
      destroyed = true;
      window[disableKey] = true;
      window.clearInterval(interval);
      window.removeEventListener('pholio:consent-changed', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('pageshow', sync);
      document.removeEventListener('visibilitychange', visible);
      if (!configured) { script?.remove(); script = null; }
    },
  };
}
