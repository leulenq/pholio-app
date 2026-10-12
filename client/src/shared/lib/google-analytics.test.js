import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAnalytics, trackAnalyticsEvent } from './google-analytics';
import { analyticsPath, createAnalytics } from '../../../../public/scripts/google-analytics.mjs';

let browser;
let allowed;
let tracker;
const commands = () => (browser.dataLayer || []).map((entry) => Array.from(entry));
const events = (name) => commands().filter((entry) => entry[0] === 'event' && entry[1] === name);
const script = () => document.querySelector('script[src*="googletagmanager"]');
function start(extra = {}) {
  tracker = createAnalytics({ measurementId: 'G-TEST123', surface: 'app', enabled: true, debug: true, allowed: () => allowed, ...extra });
  return tracker;
}
function consent(value) {
  allowed = value;
  browser.dispatchEvent(new Event('pholio:consent-changed'));
}

beforeEach(() => {
  vi.useFakeTimers();
  browser = Object.assign(new EventTarget(), {
    location: { hostname: 'localhost', origin: 'http://localhost:5173', pathname: '/dashboard/talent', protocol: 'http:' },
    setInterval: vi.fn(setInterval), clearInterval: vi.fn(clearInterval),
  });
  vi.stubGlobal('window', browser);
  document.head.innerHTML = '';
  document.cookie = 'pholio_consent=; path=/; max-age=0';
  document.cookie = '_ga=; path=/; max-age=0';
  document.cookie = '_ga_TEST123=; path=/; max-age=0';
  allowed = false;
});
afterEach(() => {
  tracker?.destroy();
  tracker = null;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('consent-gated Google Analytics', () => {
  it('makes no Google request or pageview before affirmative consent', () => {
    start();
    expect(script()).toBeNull();
    expect(events('page_view')).toEqual([]);
    consent(true);
    expect(script()).not.toBeNull();
    expect(events('page_view')).toEqual([]);
    script().onload();
    expect(events('page_view')).toHaveLength(1);
    browser.dispatchEvent(new Event('focus'));
    tracker.page('/dashboard/talent');
    expect(events('page_view')).toHaveLength(1);
    expect(commands().find((entry) => entry[0] === 'config')[2].send_page_view).toBe(false);
  });

  it('uses the latest route after loading and strips sensitive URL/title/referrer data', () => {
    allowed = true;
    document.title = 'Jane Private';
    Object.defineProperty(document, 'referrer', { configurable: true, value: 'https://www.pholio.studio/agency/request-access?email=jane@example.com' });
    start();
    tracker.page('/dashboard/agency/talent/secret-id?email=jane@example.com#private');
    script().onload();
    expect(events('page_view')).toHaveLength(1);
    const payload = events('page_view')[0][2];
    expect(payload.page_path).toBe('/dashboard/agency/talent/:id');
    expect(payload.page_referrer).toBe('https://www.pholio.studio/agency/request-access');
    expect(JSON.stringify(commands())).not.toMatch(/Jane Private|secret-id|jane@example|#private/);
    tracker.page('/dashboard/agency/talent/another-secret');
    expect(events('page_view')).toHaveLength(2);
    expect(events('page_view')[1][2].page_path).toBe('/dashboard/agency/talent/:id');
    expect(JSON.stringify(commands())).not.toMatch(/secret-id|another-secret/);
    tracker.page('/dashboard/agency/settings');
    expect(events('page_view')).toHaveLength(3);
  });

  it('prevents loading-race hits and deletes GA cookies on withdrawal', () => {
    allowed = true;
    start();
    const loadingScript = script();
    document.cookie = '_ga=secret; path=/';
    document.cookie = '_ga_TEST123=secret; path=/';
    consent(false);
    loadingScript.onload();
    expect(events('page_view')).toEqual([]);
    expect(browser['ga-disable-G-TEST123']).toBe(true);
    expect(document.cookie).not.toContain('_ga');
    consent(true);
    // The browser load event happens only once, while consent was revoked.
    expect(events('page_view')).toHaveLength(1);
    consent(false);
    tracker.page('/dashboard/talent/profile');
    tracker.event('login', 'email');
    expect(events('page_view')).toHaveLength(1);
    expect(events('login')).toEqual([]);
  });

  it('resumes after withdrawal with a new pageview and no duplicate configuration', () => {
    allowed = true;
    start();
    script().onload();
    consent(false);
    consent(true);
    expect(events('page_view')).toHaveLength(2);
    expect(commands().filter((entry) => entry[0] === 'config')).toHaveLength(1);
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1);
  });

  it('sends a bounded site lead only after consent without personal parameters', () => {
    browser.location.pathname = '/agency/request-access';
    start({ surface: 'site' });
    tracker.event('generate_lead', 'agency_access_request');
    expect(events('generate_lead')).toEqual([]);
    consent(true);
    script().onload();
    tracker.event('generate_lead', 'agency_access_request');
    tracker.event('generate_lead', 'person@example.com');
    expect(events('generate_lead')).toHaveLength(1);
    expect(events('generate_lead')[0][2]).toEqual({ method: 'agency_access_request', pholio_surface: 'site', send_to: 'G-TEST123', debug_mode: true });
  });

  it('never enables DebugView for a production host even when requested', () => {
    browser.location = { hostname: 'app.pholio.studio', origin: 'https://app.pholio.studio', pathname: '/login', protocol: 'https:' };
    allowed = true;
    start();
    script().onload();
    tracker.event('login', 'google');
    expect(events('login')).toHaveLength(1);
    expect(JSON.stringify(commands())).not.toContain('debug_mode');
  });

  it('detects consent changes in another subdomain via polling', () => {
    allowed = true;
    start();
    script().onload();
    allowed = false;
    vi.advanceTimersByTime(1000);
    expect(browser['ga-disable-G-TEST123']).toBe(true);
    tracker.event('login', 'google');
    expect(events('login')).toEqual([]);
  });

  it('suppresses recovery/token/internal/unknown routes and allows bounded events only', () => {
    allowed = true;
    start();
    script().onload();
    tracker.event('login', 'email');
    tracker.event('login', 'jane@example.com');
    tracker.event('custom', 'email');
    expect(events('login')).toHaveLength(1);
    expect(events('custom')).toEqual([]);
    for (const path of ['/reset-password?oobCode=secret', '/reply/private-token', '/picks/private-token', '/opencall/claim/private-token', '/internal/agency-requests', '/unknown-person-name']) {
      tracker.page(path);
      tracker.event('login', 'email');
    }
    expect(events('page_view')).toHaveLength(1);
    expect(events('login')).toHaveLength(1);
    expect(JSON.stringify(commands())).not.toMatch(/private-token|oobCode|unknown-person/);
  });

  it.each([
    { measurementId: 'invalid' },
    { enabled: false },
    { debug: false }, // Local production IDs cannot activate without explicit debug.
    { host: 'preview.netlify.app' },
    { host: 'app.pholio.studio.attacker.example' },
  ])('fails closed for invalid or disabled setup %o', ({ host, ...options }) => {
    if (host) browser.location.hostname = host;
    allowed = true;
    start(options);
    expect(script()).toBeNull();
    expect(commands()).toEqual([]);
  });

  it('can retry a failed SDK download without duplicating pageviews', () => {
    allowed = true;
    start();
    script().onerror();
    expect(script()).toBeNull();
    browser.dispatchEvent(new Event('focus'));
    script().onload();
    expect(events('page_view')).toHaveLength(1);
  });

  it('detaches pending load callbacks and timers on teardown', () => {
    allowed = true;
    start();
    const loadingScript = script();
    tracker.destroy();
    loadingScript.onload();
    expect(events('page_view')).toEqual([]);
    expect(script()).toBeNull();
    expect(browser.clearInterval).toHaveBeenCalled();
  });
});

it('normalizes public portfolios without talent slugs', () => {
  expect(analyticsPath('/portfolio/jane-private?token=secret', 'app')).toBe('/portfolio/:slug');
  expect(analyticsPath('/p/jane-private', 'app')).toBe('/portfolio/:slug');
});


describe('SPA adapter', () => {
  function environment(enabled) {
    vi.stubEnv('DEV', true);
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
    vi.stubEnv('VITE_GA_DEBUG', 'true');
    vi.stubEnv('VITE_GA_ENABLED', enabled);
    document.cookie = `pholio_consent=${encodeURIComponent(JSON.stringify({v:1,necessary:true,analytics:true}))}; path=/`;
  }
  it('requires explicit enablement even for local debug', () => {
    environment('false');
    tracker = startAnalytics();
    expect(script()).toBeNull();
  });
  it('dispatches only bounded login method and no identity data', () => {
    environment('true');
    tracker = startAnalytics();
    script().onload();
    trackAnalyticsEvent('login', 'google');
    trackAnalyticsEvent('login', 'person@example.com');
    expect(events('login')).toHaveLength(1);
    expect(events('login')[0][2]).toEqual({method:'google',pholio_surface:'app',send_to:'G-TEST123',debug_mode:true});
    expect(JSON.stringify(commands())).not.toContain('person@example.com');
  });
});
