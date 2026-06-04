export const PHOLIO_AUTH_CHANNEL = 'pholio-auth';
export const PUBLIC_SESSION_PATH = '/api/public/session';
export const API_LOGIN_PATH = '/api/login';
export const API_SESSION_PATH = '/api/session';

export function dashboardPathForRole(role) {
  if (role === 'AGENCY') return '/dashboard/agency';
  if (role === 'TALENT') return '/dashboard/talent';
  return '/dashboard/talent';
}
