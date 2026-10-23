import { analyticsPath, createAnalytics } from './google-analytics.mjs';

// EJS shells also serve errors and auth pages. Only real public portfolios qualify.
const path = window.location.pathname;
if (/^\/(portfolio|p)\/[^/]+\/?$/.test(path) && analyticsPath(path, 'app')) {
  const script = document.getElementById('pholio-google-analytics');
  createAnalytics({
    measurementId: script?.dataset.measurementId,
    surface: 'app', enabled: true,
    allowed() {
      try {
        const raw = document.cookie.split('; ').find((part) => part.startsWith('pholio_consent='));
        const choice = JSON.parse(decodeURIComponent(raw?.slice('pholio_consent='.length) || ''));
        return choice.v === 1 && choice.necessary === true && choice.analytics === true;
      } catch { return false; }
    },
  });
}
