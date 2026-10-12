import { createAnalytics } from '../../../../public/scripts/google-analytics.mjs';
import { analyticsAllowed } from './cookie-consent';

let analytics;
export function startAnalytics() {
  const debug = import.meta.env.VITE_GA_DEBUG === 'true';
  analytics = createAnalytics({
    measurementId: import.meta.env.VITE_GA_MEASUREMENT_ID,
    surface: 'app',
    enabled: import.meta.env.VITE_GA_ENABLED === 'true' && (import.meta.env.PROD || (import.meta.env.DEV && debug)),
    debug,
    allowed: analyticsAllowed,
  });
  const instance = analytics;
  return { page: (path) => instance.page(path), destroy() { instance.destroy(); if (analytics === instance) analytics = undefined; } };
}
export function trackAnalyticsEvent(name, method) {
  analytics?.event(name, method);
}
