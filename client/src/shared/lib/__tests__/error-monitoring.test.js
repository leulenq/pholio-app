import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const scope = {
  setTag: vi.fn(),
  setContext: vi.fn(),
};

const Sentry = {
  init: vi.fn(),
  withScope: vi.fn((callback) => callback(scope)),
  captureReactException: vi.fn(() => 'event-id'),
  reactErrorHandler: vi.fn(() => vi.fn()),
};

vi.mock('@sentry/react', () => Sentry);

async function loadMonitoring() {
  return import('../error-monitoring');
}

describe('error-monitoring', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('sanitizeMonitoringUrl strips query/hash and redacts reply tokens', async () => {
    const { sanitizeMonitoringUrl } = await loadMonitoring();

    expect(
      sanitizeMonitoringUrl(
        'https://app.pholio.studio/reply/secret-token?next=/dashboard#message',
      ),
    ).toBe('https://app.pholio.studio/reply/[redacted]');
  });

  test('does not initialize without a production DSN', async () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_SENTRY_DSN', '');

    const { initErrorMonitoring } = await loadMonitoring();

    expect(initErrorMonitoring()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  test('initializes Sentry in production with privacy filters', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.ingest.sentry.io/1');
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'production');
    vi.stubEnv('VITE_SENTRY_RELEASE', 'pholio-app@test');

    const { initErrorMonitoring, sanitizeMonitoringUrl } = await loadMonitoring();

    expect(initErrorMonitoring()).toBe(true);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@example.ingest.sentry.io/1',
        environment: 'production',
        release: 'pholio-app@test',
        sendDefaultPii: false,
      }),
    );

    const initOptions = Sentry.init.mock.calls[0][0];
    const event = initOptions.beforeSend({
      request: {
        url: 'https://app.pholio.studio/reply/secret-token?auth=1',
      },
    });
    const breadcrumb = initOptions.beforeBreadcrumb({
      data: {
        url: 'https://app.pholio.studio/dashboard/talent?token=abc#panel',
      },
    });

    expect(event.request.url).toBe('https://app.pholio.studio/reply/[redacted]');
    expect(breadcrumb.data.url).toBe(
      sanitizeMonitoringUrl('https://app.pholio.studio/dashboard/talent?token=abc#panel'),
    );
  });

  test('reports React errors with sanitized route context in production', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.ingest.sentry.io/1');

    const error = new Error('boom');
    const errorInfo = { componentStack: '\n    in BrokenChild' };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    window.history.pushState({}, '', '/reply/secret-token?next=/dashboard');

    const { initErrorMonitoring, reportReactError } = await loadMonitoring();
    initErrorMonitoring();

    const eventId = reportReactError(error, errorInfo, { boundary: 'app-root' });

    expect(eventId).toBe('event-id');
    expect(consoleError).not.toHaveBeenCalled();
    expect(Sentry.captureReactException).toHaveBeenCalledWith(error, errorInfo);
    expect(scope.setTag).toHaveBeenCalledWith('error.boundary', 'app-root');
    expect(scope.setContext).toHaveBeenCalledWith('route', {
      path: '/reply/[redacted]',
    });

    consoleError.mockRestore();
  });

  test('logs to the console in development instead of reporting', async () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('DEV', true);

    const error = new Error('dev boom');
    const errorInfo = { componentStack: '\n    in BrokenChild' };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { reportReactError } = await loadMonitoring();
    reportReactError(error, errorInfo, { boundary: 'app-root' });

    expect(Sentry.captureReactException).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'ErrorBoundary caught an error:',
      error,
      errorInfo,
    );

    consoleError.mockRestore();
  });

  test('returns React root handlers only after initialization', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.ingest.sentry.io/1');

    const { getReactRootErrorHandlers, initErrorMonitoring } = await loadMonitoring();

    expect(getReactRootErrorHandlers()).toEqual({});

    initErrorMonitoring();

    const handlers = getReactRootErrorHandlers();
    expect(Sentry.reactErrorHandler).toHaveBeenCalled();
    expect(handlers).toEqual(
      expect.objectContaining({
        onUncaughtError: expect.any(Function),
        onRecoverableError: expect.any(Function),
      }),
    );
    expect(handlers.onCaughtError).toBeUndefined();
  });
});
