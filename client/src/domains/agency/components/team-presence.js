/* Shared, photo-free identity helpers for the Team page — monogram, a stable warm
   hue per person (so the wall feels alive and people are recognizable), and tenure. */

// Curated, on-brand palette — muted golds, terracotta, sage, clay, ink-blue.
const PALETTE = [
  { bg: 'rgba(201,165,90,0.16)', fg: '#9a7b3c', ring: 'rgba(201,165,90,0.4)' },   // gold
  { bg: 'rgba(176,108,82,0.15)', fg: '#9c5a40', ring: 'rgba(176,108,82,0.38)' },  // terracotta
  { bg: 'rgba(125,155,130,0.16)', fg: '#5f7d66', ring: 'rgba(125,155,130,0.4)' }, // sage
  { bg: 'rgba(150,128,160,0.15)', fg: '#6f5c7d', ring: 'rgba(150,128,160,0.38)' },// plum
  { bg: 'rgba(120,140,168,0.15)', fg: '#566685', ring: 'rgba(120,140,168,0.38)' },// ink-blue
  { bg: 'rgba(184,140,94,0.16)', fg: '#8a5f37', ring: 'rgba(184,140,94,0.4)' },   // clay
];

export const PRESET_ROLE_LABELS = {
  OWNER: 'Principal',
  ADMIN: 'Managing Agent',
  AGENT: 'Agent · Booker',
  SCOUT: 'Scout · Junior',
  VIEWER: 'Observer',
  MEMBER: 'Scout · Junior',
};

export const ASSIGNABLE_ROLES = [
  { value: 'ADMIN', label: 'Managing Agent', hint: 'Full ops, team & permissions (Principal only)' },
  { value: 'AGENT', label: 'Agent · Booker', hint: 'Pipeline, casting, roster & messaging.' },
  { value: 'SCOUT', label: 'Scout · Junior', hint: 'Discover, review & shortlist — cannot sign talent.' },
  { value: 'VIEWER', label: 'Observer', hint: 'Read-only access across the dashboard.' },
];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function monogramOf(member) {
  const f = member?.first_name?.[0] || '';
  const l = member?.last_name?.[0] || '';
  const ini = (f + l) || member?.full_name?.[0] || member?.email?.[0] || '?';
  return ini.toUpperCase();
}

export function hueOf(member) {
  const key = member?.userId || member?.full_name || member?.email || '?';
  return PALETTE[hash(String(key)) % PALETTE.length];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function tenureLabel(member) {
  const raw = member?.joined_at || member?.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return `Joined ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Earliest known join/created year across the team, for the masthead subline.
export function foundingYear(members = []) {
  let min = Infinity;
  for (const m of members) {
    const raw = m?.joined_at || m?.created_at;
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (!Number.isNaN(t)) min = Math.min(min, t);
  }
  return min === Infinity ? null : new Date(min).getFullYear();
}

export function formatRole(role) {
  if (!role) return 'Scout · Junior';
  const key = String(role).toUpperCase();
  return PRESET_ROLE_LABELS[key] || key;
}

export function normalizeRole(role) {
  if (!role) return 'SCOUT';
  const key = String(role).toUpperCase();
  if (key === 'MEMBER') return 'SCOUT';
  return key;
}
