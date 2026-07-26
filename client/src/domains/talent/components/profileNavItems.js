// Section list for the profile form, shared by the desktop/drawer index
// (ProfileNav) and the mobile sticky "Sections" bar (ProfilePage) so both
// read from one source. Kept out of ProfileNav.jsx because exporting a
// non-component from a component module breaks React Fast Refresh.
export const NAV_ITEMS = [
  { id: 'identity', label: 'Personal Details' },
  { id: 'discipline', label: 'Discipline & Focus' },
  { id: 'appearance', label: 'Stats & Measurements' },
  { id: 'credits', label: 'Credits & Experience' },
  { id: 'training', label: 'Training & Skills' },
  { id: 'representation', label: 'Representation' },
  { id: 'socials', label: 'Socials & Media' },
  { id: 'private', label: 'Private & Compliance' },
  { id: 'contact', label: 'On-set Safety' },
];

export const NAV_LABELS_BY_ID = Object.fromEntries(
  NAV_ITEMS.map(({ id, label }) => [id, label]),
);
