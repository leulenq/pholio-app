/**
 * Identity form helpers for Settings → Identity.
 * Kept separate from the page module so hydration logic can be unit-tested
 * without mounting the full settings surface.
 */

export function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return raw ? [raw] : [];
  }
}

/** Build the Identity movement form from the auth/profile payload. */
export function identityFormFromProfile(profile) {
  const fullName = typeof profile?.name === 'string' ? profile.name.trim() : '';
  const nameParts = fullName ? fullName.split(/\s+/) : [];
  return {
    first_name: profile?.first_name || nameParts[0] || '',
    last_name: profile?.last_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '') || '',
    phone: profile?.phone || '',
    language: parseJsonArray(profile?.languages)[0] || 'English',
    timezone: profile?.timezone || 'America/New_York',
  };
}
