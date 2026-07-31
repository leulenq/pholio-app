/**
 * Status system — canonical config for the four status classes.
 *
 *   Division → BoardPlate      (a home; heaviest form)
 *   Type     → TypeSpec        (a market descriptor; lightest form)
 *   Stage    → StageTrack/Mark (an ordinal ladder; shows progress)
 *   State    → AvailabilityCell(live; pure colour)
 *
 * Real backend keys are inconsistent (on_booking / booking / newfaces /
 * new_faces / under_review …), so every lookup runs through `norm()`.
 * Colours reference the --ss-* tokens in agency-tokens.css.
 */

/* `norm` and `titleCase` now live in divisions.js — the single source of truth
   for board vocabulary. Imported here (not re-exported) so the module barrel
   can `export *` from both files without ambiguous duplicate names. */
import { norm, titleCase, resolveDivision } from './divisions';

/* ---------- Division / board ----------
   Superseded by divisions.js + <DivisionMark>. Kept as a thin adapter so any
   remaining caller of `getDivision` keeps working, now with the full ~21-board
   taxonomy and a never-null fallback behind it. */
export const getDivision = (key) => {
  const d = resolveDivision(key);
  return { label: d.label, code: d.code, c: `var(--ss-p-${d.pigment})` };
};

/* ---------- Type / market — pigment ---------- */
export const TYPES = {
  editorial:  { label: 'Editorial',  c: 'var(--ss-p-editorial)' },
  commercial: { label: 'Commercial', c: 'var(--ss-p-commercial)' },
  runway:     { label: 'Runway',     c: 'var(--ss-p-runway)' },
  fitness:    { label: 'Fitness',    c: 'var(--ss-p-fitness)' },
  curve:      { label: 'Curve',      c: 'var(--ss-p-curve)' },
  plus:       { label: 'Curve',      c: 'var(--ss-p-curve)' },
};

export const getType = (key) => TYPES[norm(key)] || { label: titleCase(key), c: 'var(--ss-p-editorial)' };

/* ---------- Stage — ordinal pipeline + off-track terminals ---------- */
// The canonical submission ladder, in order.
export const PIPELINE = [
  { key: 'submitted',   label: 'Submitted',   c: 'var(--ss-hold)' },
  { key: 'reviewing',   label: 'Reviewing',   c: 'var(--ss-motion)' },
  { key: 'shortlisted', label: 'Shortlisted', c: 'var(--ss-select)' },
  { key: 'signed',      label: 'Signed',      c: 'var(--ss-live)' },
];

// Raw backend status → position on (or off) the ladder.
const STAGE_MAP = {
  submitted:   { idx: 0, label: 'Submitted' },
  pending:     { idx: 0, label: 'Submitted' },
  new:         { idx: 0, label: 'Submitted' },
  underreview: { idx: 1, label: 'Reviewing' },
  reviewing:   { idx: 1, label: 'Reviewing' },
  review:      { idx: 1, label: 'Reviewing' },
  shortlisted: { idx: 2, label: 'Shortlisted' },
  accepted:    { idx: 3, label: 'Signed' },
  signed:      { idx: 3, label: 'Signed' },
  represented: { idx: 3, label: 'Represented' },
  booked:      { idx: 3, label: 'Represented' },
  development: { idx: 3, label: 'New Face', c: 'var(--ss-p-dev)' },
  // Off-track terminals — the submission left the ladder.
  declined:    { off: true, label: 'Passed',   c: 'var(--ss-pass)' },
  passed:      { off: true, label: 'Passed',   c: 'var(--ss-pass)' },
  archived:    { off: true, label: 'Archived', c: 'var(--ss-off)' },
};

/** Resolve a raw status to { idx, off, label, c, reached }. */
export function getStage(status) {
  const s = STAGE_MAP[norm(status)] || STAGE_MAP.submitted;
  const c = s.c || (s.off ? 'var(--ss-off)' : PIPELINE[s.idx]?.c) || 'var(--ss-hold)';
  return { idx: s.idx ?? 0, off: !!s.off, label: s.label, c };
}

/* ---------- Development ladder (board standing) ---------- */
export const LADDER = [
  { key: 'newfaces',    label: 'New Faces' },
  { key: 'development', label: 'Development' },
  { key: 'mainboard',   label: 'Main Board' },
];
export const getLadderIndex = (stage) => {
  const i = LADDER.findIndex((r) => r.key === norm(stage));
  return i === -1 ? 0 : i;
};

/* ---------- State / availability — role + fill firmness ---------- */
// fill: 'tint' = soft/pending, 'solid' = confirmed.
export const STATES = {
  available:  { label: 'Available',  c: 'var(--ss-live)',   fill: 'tint'  },
  onbooking:  { label: 'On Booking', c: 'var(--ss-motion)', fill: 'tint'  },
  booking:    { label: 'On Booking', c: 'var(--ss-motion)', fill: 'tint'  },
  option:     { label: '1st Option', c: 'var(--ss-motion)', fill: 'tint'  },
  firstoption:{ label: '1st Option', c: 'var(--ss-motion)', fill: 'tint'  },
  secondoption:{ label: '2nd Option', c: 'var(--ss-motion)', fill: 'tint' },
  onhold:     { label: 'On Hold',    c: 'var(--ss-select)', fill: 'tint'  },
  hold:       { label: 'On Hold',    c: 'var(--ss-select)', fill: 'tint'  },
  booked:     { label: 'Booked',     c: 'var(--ss-live)',   fill: 'solid' },
  bookout:    { label: 'Bookout',    c: 'var(--ss-hold)',   fill: 'tint'  },
  released:   { label: 'Released',   c: 'var(--ss-pass)',   fill: 'tint'  },
  inactive:   { label: 'Inactive',   c: 'var(--ss-off)',    fill: 'tint'  },
};

export const getState = (status) => STATES[norm(status)] || STATES.available;

/* `titleCase` is re-exported from divisions.js via the module barrel. */
