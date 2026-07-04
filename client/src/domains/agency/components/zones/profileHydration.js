// Social links moved out of the flat profile row into `social_accounts`
// (migration 20260629160000). Agency-facing DTOs now carry them as
// `profile.social` — an array of { platform, handle, url, verified }.
function findSocialUrl(profile, platform) {
  const social = Array.isArray(profile?.social) ? profile.social : [];
  return social.find((account) => account?.platform === platform)?.url || null;
}

export function buildProfileHydration(profile, images) {
  if (!profile) return null;
  return {
    images: images?.length ? images : undefined,
    bio: profile.bio_curated || profile.bio_raw || null,
    slug: profile.slug || null,
    portfolioUrl: findSocialUrl(profile, 'portfolio'),
    isPro: Boolean(profile.is_pro),
  };
}

function formatSiteLabel(href) {
  if (!href) return 'View site';
  if (href.startsWith('/')) return 'View site';
  try {
    const host = new URL(href).hostname.replace(/^www\./, '');
    return host || 'View site';
  } catch {
    return href.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'View site';
  }
}

export function getTalentSiteLink({ isPro, slug, portfolioUrl }) {
  const hasTarget = Boolean(portfolioUrl || slug);
  const showLink = hasTarget && (isPro || (import.meta.env.DEV && slug));
  if (!showLink) return null;
  const href = portfolioUrl || `/portfolio/${slug}`;
  return {
    href,
    label: formatSiteLabel(href),
    external: Boolean(portfolioUrl),
  };
}
