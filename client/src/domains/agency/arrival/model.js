/**
 * Arrival — the pure model behind the agency's first run.
 *
 * Scenes are derived, not fixed: an agency that already has a mark is never
 * asked for one, a login that cannot open the agency is never asked anything,
 * and the policies scene only exists while acceptance is outstanding.
 */

export const DEFAULT_ACCENT = '#C9A55A';

export function buildScenes({ intro, legal }) {
  const role = intro?.viewer?.role;
  if (role && role !== 'OWNER' && role !== 'ADMIN') return ['waiting'];
  return [
    'name',
    intro?.agency?.logoPath ? null : 'mark',
    'boards',
    'minors',
    'window',
    'team',
    legal?.needsAcceptance ? 'terms' : null,
    'doors',
  ].filter(Boolean);
}

export function initialAnswers(intro) {
  return {
    name: intro?.agency?.name || '',
    location: intro?.agency?.location || '',
    openBoards: intro?.boards?.chosen || [],
    extraBoards: [],
    acceptsMinors: null,
    minorCustodyAccepted: false,
    reviewWindowDays: intro?.reviewWindow?.days || 30,
    invites: [],
  };
}

export function isSceneComplete(scene, answers) {
  switch (scene) {
    case 'name':
      return answers.name.trim().length > 1;
    case 'boards':
      return answers.openBoards.length > 0;
    case 'window':
      return Number.isInteger(answers.reviewWindowDays) && answers.reviewWindowDays >= 1 && answers.reviewWindowDays <= 365;
    case 'minors':
      return answers.acceptsMinors === false || (answers.acceptsMinors === true && answers.minorCustodyAccepted);
    default:
      return true;
  }
}

/** "Women", "Women and Men", "Women, Men and New Faces". */
export function joinList(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function resolveAssetUrl(path) {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('/') || path.startsWith('blob:')) return path;
  return `/${path}`;
}

export function accentFrom(brandColor) {
  return /^#[0-9a-f]{6}$/i.test(brandColor || '') ? brandColor : DEFAULT_ACCENT;
}

export function formatDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/** Type size for the agency name, so long names hold the same visual weight as short ones. */
export function nameScale(name) {
  const length = Math.max(4, (name || '').length);
  return Math.min(1, 11 / length);
}

export function emailLooksValid(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const DRAFT_KEY = 'pholio.agency.arrival';

export function readDraft(agencyName) {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    const draft = raw ? JSON.parse(raw) : null;
    return draft?.agency === agencyName ? draft : null;
  } catch {
    return null;
  }
}

export function writeDraft(agencyName, scene, answers) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ agency: agencyName, scene, answers }));
  } catch {
    // Storage unavailable; the draft is a convenience only.
  }
}

export function clearDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore.
  }
}
