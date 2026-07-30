import * as Sentry from '@sentry/react';

let initialized = false;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function sanitizeMonitoringUrl(value) {
  if (!isNonEmptyString(value)) {
    return value;
  }

  try {
    const url = new URL(value, typeof window !== 'undefined' ? window.location.origin : 'https://app.pholio.studio');
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(
      /^(\/reply\/)[^/]+/i,
      '$1[redacted]',
    );
    return `${url.origin}${url.pathname}`;
  } catch {
    return value
      .replace(/[?#].*$/, '')
      .replace(/(\/reply\/)[^/?#]+/i, '$1[redacted]');
  }
}

function sanitizeEvent(event) {
  if (!event || typeof event !== 'object') {
    return event;
  }

  if (event.request?.url) {
    event.request.url = sanitizeMonitoringUrl(event.request.url);
  }

  return event;
}

function sanitizeBreadcrumb(breadcrumb) {
  if (!breadcrumb || typeof breadcrumb !== 'object') {
    return breadcrumb;
  }

  if (breadcrumb.data?.url) {
    breadcrumb.data.url = sanitizeMonitoringUrl(breadcrumb.data.url);
  }

  return breadcrumb;
}

function currentSanitizedPath() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return new URL(sanitizeMonitoringUrl(window.location.href)).pathname;
  } catch {
    return undefined;
  }
}

export function initErrorMonitoring() {
  if (initialized) {
    return true;
  }

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!import.meta.env.PROD || !isNonEmptyString(dsn)) {
    return false;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'production',
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    beforeSend: sanitizeEvent,
    beforeBreadcrumb: sanitizeBreadcrumb,
  });

  initialized = true;
  return true;
}

export function reportReactError(error, errorInfo, context = {}) {
  if (import.meta.env.DEV) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    return undefined;
  }

  if (!initialized) {
    return undefined;
  }

  let eventId;
  Sentry.withScope((scope) => {
    const boundary = context.boundary || 'shared';
    scope.setTag('error.boundary', boundary);

    const path = currentSanitizedPath();
    if (path) {
      scope.setContext('route', { path });
    }

    eventId = Sentry.captureReactException(error, errorInfo);
  });

  return eventId;
}

export function getReactRootErrorHandlers() {
  if (!initialized) {
    return {};
  }

  return {
    onUncaughtError: Sentry.reactErrorHandler(),
    onRecoverableError: Sentry.reactErrorHandler(),
  };
}
