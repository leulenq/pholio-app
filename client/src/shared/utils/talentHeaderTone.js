/** Routes whose main surface is cream/paper — header uses light tone. */
const LIGHT_HEADER_PREFIXES = [
  '/dashboard/talent/profile',
  '/dashboard/talent/media',
  '/dashboard/talent/analytics', // legacy alias → IntelPage
  '/dashboard/talent/intel',
  '/dashboard/talent/applications',
  '/dashboard/talent/messages',
  '/dashboard/talent/settings',
];

/**
 * @param {string} pathname
 * @returns {'dark' | 'light'}
 */
export function getTalentHeaderTone(pathname) {
  if (pathname === '/dashboard/talent' || pathname === '/dashboard/talent/') {
    return 'dark';
  }

  const isLight = LIGHT_HEADER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  return isLight ? 'light' : 'dark';
}
