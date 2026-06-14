/** Resolves the avatar/name shown on the post-login entry splash. */

function resolveImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('/')) return url;
  return `/${url}`;
}

export function resolveTalentEntryAvatar(profile, images) {
  const primary = profile?.photo_url_primary;
  if (primary) return resolveImageUrl(primary);
  return resolveImageUrl(images?.[0]?.path);
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
