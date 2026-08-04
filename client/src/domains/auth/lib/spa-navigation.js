/**
 * Post-auth navigation used to finish with `window.location.href = redirect`,
 * which tears the SPA down and boots it again from scratch: blank page, chunk
 * re-download, Firebase re-init, every query re-fetched. Inside the app that
 * whole reload is dead weight — the session cookie is already set by the time
 * the backend answers, and the React Query cache is empty anyway on a fresh
 * sign-in.
 *
 * So route in-app whenever the destination is a route this SPA owns, and keep
 * the hard navigation only for targets it does not (server-rendered pages,
 * other origins), where a document load is the actual requirement.
 *
 * Shared by LoginPage and ResetPasswordPage — both land a freshly-authenticated
 * session on the same set of destinations.
 */
const SPA_ROUTE_ROOTS = ['/dashboard', '/reveal', '/internal'];

export function isSpaRoute(target) {
  if (typeof target !== 'string' || !target.startsWith('/')) return false;
  if (target.startsWith('//')) return false; // protocol-relative — off-origin
  const path = target.split(/[?#]/)[0];
  return SPA_ROUTE_ROOTS.some(
    (root) => path === root || path.startsWith(`${root}/`)
  );
}

/**
 * Land in the app without reloading it when the destination is ours; fall
 * back to a document load for anything this SPA does not route.
 */
export function goToDestination(target, navigate) {
  if (isSpaRoute(target)) {
    navigate(target, { replace: true });
    return;
  }
  window.location.href = target;
}
