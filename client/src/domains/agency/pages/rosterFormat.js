/**
 * Roster formatting helpers — single source of truth shared by the roster list
 * and the roster detail drawer. Keep these pure; no JSX, no side effects.
 */

export const STAGE_LABELS = Object.freeze({
  main: 'Main',
  development: 'Development',
  new_face: 'New Face',
});

export function normalizeStatusKey(value) {
  return String(value || 'unknown').trim().toLowerCase().replaceAll(' ', '_');
}

export function cmToImperial(cm) {
  const numeric = Number(cm);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  // Round total inches first, then split — flooring feet before rounding the
  // remainder produces impossible values like 5′ 12″ for 182 cm.
  const totalInches = Math.round(numeric / 2.54);
  const feet = Math.floor(totalInches / 12);
  return `${feet}′ ${totalInches - feet * 12}″`;
}

export function heightLine(cm) {
  return cm ? `${cm} cm · ${cmToImperial(cm)}` : 'Height not recorded';
}

export function measurementSummary(item) {
  const values = item?.measurements || {};
  const ordered = [values.chest_cm || values.bust_cm, values.waist_cm, values.hips_cm]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!ordered.length) return 'Measurements incomplete';
  return `${ordered.join(' / ')} cm · ${ordered.map((value) => Math.round(value / 2.54)).join(' / ')} in`;
}

// Builds form-field values from a talent_records row's stored `measurements`
// JSON so the edit form can prefill without the caller knowing the shape.
export function measurementsToFormFields(measurements) {
  const m = measurements || {};
  return {
    bustCm: m.bust_cm ?? '',
    chestCm: m.chest_cm ?? '',
    waistCm: m.waist_cm ?? '',
    hipsCm: m.hips_cm ?? '',
    inseamCm: m.inseam_cm ?? '',
    shoeSize: m.shoe_size ?? '',
  };
}

export function measurementAge(timestamp) {
  if (!timestamp) return 'Date not recorded';
  const ageDays = Math.floor((Date.now() - new Date(timestamp).getTime()) / 86400000);
  if (!Number.isFinite(ageDays) || ageDays < 0) return 'Recently updated';
  if (ageDays < 31) return `Updated ${Math.max(1, ageDays)}d ago`;
  return `Updated ${Math.floor(ageDays / 30)}mo ago`;
}

/**
 * Freshness of a talent's measurements as a plain-text label plus a semantic
 * tone. Never rendered as a badge or pill — tone maps to text color only.
 */
export function measurementFreshness(timestamp) {
  if (!timestamp) return { label: 'Date missing', tone: 'muted' };
  const ageDays = Math.floor((Date.now() - new Date(timestamp).getTime()) / 86400000);
  if (!Number.isFinite(ageDays) || ageDays < 0) return { label: 'Current', tone: 'current' };
  if (ageDays < 31) return { label: 'Current', tone: 'current' };
  const ageMonths = Math.max(1, Math.floor(ageDays / 30));
  if (ageDays < 91) return { label: `Updated ${ageMonths}mo`, tone: 'current' };
  if (ageDays < 181) return { label: `Updated ${ageMonths}mo`, tone: 'due' };
  return { label: `Stale · ${ageMonths}mo`, tone: 'stale' };
}
