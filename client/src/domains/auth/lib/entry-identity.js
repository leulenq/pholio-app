/** Resolves the avatar/name shown on the post-login entry splash. */

function resolveImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('/')) return url;
  return `/${url}`;
}

/**
 * Account avatar for talent entry splash.
 * Prefer `users.avatar_url` (OAuth). Never treat book/media frames as the
 * account avatar — curated portfolio assets stay in the book layer.
 */
export function resolveTalentEntryAvatar(profile, images, user) {
  const accountAvatar = user?.avatar_url || profile?.avatar_url;
  if (accountAvatar) return resolveImageUrl(accountAvatar);
  return null;
}

export function resolveAgencyEntryAvatar(profile) {
  return resolveImageUrl(profile?.images?.[0]?.path);
}

export function resolveEntryDisplayName(profile, variant) {
  if (variant === 'agency') {
    const first = profile?.first_name || '';
    const last = profile?.last_name || '';
    const full = [first, last].filter(Boolean).join(' ');
    return full || profile?.email?.split('@')[0] || 'Member';
  }

  const first = profile?.first_name || profile?.stage_name || '';
  const last = profile?.last_name || '';
  const full = [first, last].filter(Boolean).join(' ');
  return full || profile?.email?.split('@')[0] || 'Talent';
}

export function resolveTalentGreetingName(profile) {
  const first = profile?.first_name || profile?.stage_name;
  if (first) return first;

  const fallback = resolveEntryDisplayName(profile, 'talent');
  if (fallback === 'Talent') return 'there';
  return fallback.split(' ')[0];
}
