/**
 * Single source of truth for talent dashboard top navigation.
 * pageKicker — editorial mono label on cream pages (matches nav where applicable).
 */

export const TALENT_NAV_SECTIONS = [
  {
    items: [
      { label: 'Overview', to: '/dashboard/talent', end: true, pageKicker: 'Overview' },
    ],
  },
  {
    items: [
      { label: 'The Book', to: '/dashboard/talent/media', pageKicker: 'The Book' },
      { label: 'Profile', to: '/dashboard/talent/profile', pageKicker: 'Profile' },
    ],
  },
  {
    items: [
      {
        label: 'Market',
        to: '/dashboard/talent/applications',
        pageKicker: 'Market',
        requiresProfileGate: true,
      },
      {
        label: 'Intel',
        to: '/dashboard/talent/intel',
        pageKicker: 'Intel',
        requiresProfileGate: true,
      },
    ],
  },
];

/** Flat list for lookups by route prefix */
export const TALENT_NAV_ITEMS = TALENT_NAV_SECTIONS.flatMap((section) => section.items);

export function getTalentNavItemByPath(pathname = '') {
  if (pathname === '/dashboard/talent/messages' || pathname.startsWith('/dashboard/talent/messages/')) {
    return { label: 'Messages', to: '/dashboard/talent/messages', pageKicker: 'Messages' };
  }
  return TALENT_NAV_ITEMS.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
}

export function getTalentPageKicker(pathname = '') {
  return getTalentNavItemByPath(pathname)?.pageKicker ?? null;
}
