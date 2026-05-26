/**
 * Normalize API failures for inline error UI and toasts.
 * Detects migration-required responses from the Express error handler.
 */
export function parseApiFailure(error, fallbackTitle = 'Something went wrong') {
  const payload = error?.data?.error ?? error?.data ?? null;
  const code = payload?.code ?? error?.data?.code;
  const migrationRequired =
    payload?.migrationRequired === true || code === 'DATABASE_SETUP_REQUIRED';

  const rawMessage =
    (typeof payload?.message === 'string' && payload.message) ||
    (typeof error?.data?.message === 'string' && error.data.message) ||
    (typeof error?.message === 'string' && error.message) ||
    '';

  if (migrationRequired || /database tables do not exist/i.test(rawMessage)) {
    return {
      title: 'Database setup required',
      body: 'Pholio cannot reach required database tables. Run migrations locally, then reload this page and try again.',
      supportingMeta: 'From the project root: npm run migrate',
      isMigration: true,
      toastMessage: 'Database setup required — run npm run migrate',
    };
  }

  if (code === 'upload_storage_unavailable' || error?.data?.error === 'upload_storage_unavailable') {
    return {
      title: 'Uploads not configured',
      body: 'Production image storage (Cloudflare R2) is not set up. Add R2_BUCKET and credentials to Netlify, then redeploy.',
      supportingMeta: null,
      isMigration: false,
      toastMessage: 'Image storage is not configured on the server',
    };
  }

  if (code === 'DATABASE_CONNECTION_ERROR') {
    return {
      title: 'Database unavailable',
      body: 'We could not connect to the database. Check your connection settings and try again.',
      supportingMeta: null,
      isMigration: false,
      toastMessage: rawMessage || 'Database connection failed',
    };
  }

  const body =
    rawMessage.trim() ||
    'We could not complete that request. Try again in a moment.';

  return {
    title: fallbackTitle,
    body,
    supportingMeta: null,
    isMigration: false,
    toastMessage: body,
  };
}
