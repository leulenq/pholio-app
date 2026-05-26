function noopToast() {
  return undefined;
}

/**
 * Toast system disabled intentionally.
 * Keep API surface as no-ops so existing callers do not break.
 */
export const pholioToast = {
  success: noopToast,
  error: noopToast,
  info: noopToast,
  warning: noopToast,
  loading: noopToast,
  promise: noopToast,
  dismiss: noopToast,
  fromFailure: noopToast,
};
