/**
 * Pure derivations for the talent dossier. No JSX, no fetching — every helper
 * turns the `/dossier` payload into something a booker can read at a glance.
 *
 * Industry vocabulary is deliberate throughout: board (not category), book
 * (not gallery), digitals (not selfies), comp card (not profile card),
 * bookout / option / hold (not "unavailable").
 */

import {
  analyzeDigitalsSet,
  analyzeBookRange,
  isDigitalSlot,
  isHeadshotImage,
  isDigitalProfileImage,
  isDigitalThreeQuarterImage,
  isDigitalFullLengthImage,
  isDigitalBackImage,
} from '../../../../shared/utils/profileReadinessImages';
import { SHOT_LABELS } from '../../../../shared/constants/frameTaxonomy';

const DAY_MS = 86400000;

/* ------------------------------------------------------------------ dates */

export const fmtDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const fmtDayMonth = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const fmtDateTime = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

export const daysSince = (value) => {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / DAY_MS));
};

/** "today" · "3d ago" · "5 wks ago" · "14 Mar" for anything older than a year. */
export const fmtAgo = (value) => {
  const days = daysSince(value);
  if (days == null) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days}d ago`;
  if (days < 90) return `${Math.round(days / 7)} wks ago`;
  if (days < 365) return `${Math.round(days / 30)} mo ago`;
  return fmtDate(value);
};

/* --------------------------------------------------------------- identity */

export const talentName = (talent) =>
  [talent?.first_name, talent?.last_name].filter(Boolean).join(' ').trim() || 'Unnamed talent';

export const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '—';
};

const TRACK_LABELS = {
  womenswear: 'Womenswear',
  menswear: 'Menswear',
  ungendered: 'Ungendered',
};

const MARKET_LABELS = {
  'new-york': 'New York',
  'los-angeles': 'Los Angeles',
  london: 'London',
  paris: 'Paris',
  milan: 'Milan',
  tokyo: 'Tokyo',
  berlin: 'Berlin',
  sydney: 'Sydney',
  toronto: 'Toronto',
  'sao-paulo': 'São Paulo',
};

export const marketLabel = (market) => {
  if (!market) return null;
  return MARKET_LABELS[market] || titleCase(String(market).replace(/-/g, ' '));
};

export function titleCase(value) {
  const s = String(value ?? '').replace(/[_-]+/g, ' ').trim();
  if (!s) return '';
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The reading line — the handful of facts a booker says out loud when they
 * pull a card off the shelf. Age band, track, base, and second market.
 */
export function readingLine(dossier) {
  const t = dossier?.talent || {};
  const out = [];
  if (t.is_minor) out.push('Under 18');
  else if (t.age != null) out.push(`${t.age}`);
  if (t.stats_track) out.push(TRACK_LABELS[t.stats_track] || titleCase(t.stats_track));
  if (t.professional?.discipline) out.push(titleCase(t.professional.discipline));
  const base = t.city || marketLabel(t.market);
  if (base) out.push(base);
  if (t.professional?.city_secondary) out.push(`+ ${t.professional.city_secondary}`);
  if (t.nationality) out.push(t.nationality);
  return out;
}

/* --------------------------------------------------------- representation */

const REPRESENTATION_HEADLINE = {
  represented: 'Represented',
  exclusive_elsewhere: 'Exclusive elsewhere',
  seeking: 'Seeking representation',
  unrepresented: 'Unrepresented',
};

/**
 * The representation standing, in the terms an agency actually uses. Returns a
 * headline plus the qualifying clause — never a badge, never a colour.
 */
export function representationRead(representation) {
  const status = representation?.status || 'unrepresented';
  const headline = REPRESENTATION_HEADLINE[status] || titleCase(status);
  const lines = representation?.lines || [];
  const active = lines.filter((l) => l.status === 'active');
  const mother = active.find((l) => l.relationship_type === 'mother');
  const placements = active.filter((l) => l.relationship_type === 'placement');

  let detail;
  if (status === 'exclusive_elsewhere') {
    detail = 'Under an exclusive elsewhere — a placement would need releasing first.';
  } else if (status === 'represented') {
    const named = representation?.represented_by;
    const who = mother?.agency_name || (named && named !== 'undisclosed' ? named : null);
    detail = mother
      ? `Mother agency${who ? `: ${who}` : ' undisclosed'}${
          placements.length ? ` · ${placements.length} market placement${placements.length > 1 ? 's' : ''}` : ''
        }`
      : who
        ? `Signed with ${who}`
        : 'Agency undisclosed by the talent';
  } else if (status === 'seeking') {
    detail = 'Open to signing — no active representation on record.';
  } else {
    detail = 'No representation on record.';
  }

  return { status, headline, detail, mother, placements, active, all: lines };
}

/** One relationship line, phrased the way a booker would say it. */
export function representationLineText(line) {
  const kind = line.relationship_type === 'mother' ? 'Mother agency' : 'Placement';
  const who = line.agency_name || (line.is_this_agency ? 'This agency' : 'Undisclosed agency');
  const scope = [line.market && marketLabel(line.market), line.territory, line.division]
    .filter(Boolean)
    .join(' · ');
  return { kind, who, scope, exclusive: line.is_exclusive };
}

/* ------------------------------------------------------------------ stats */

/**
 * Measurement provenance. The industry rule is that stats go stale — a booker
 * must know whether these were self-reported months ago or measured in the
 * agency's own office.
 */
export function measurementProvenance(talent) {
  const stats = talent?.stats || {};
  if (talent?.measured_by_us && talent?.measured_in_person_at) {
    return {
      text: `Measured in person ${fmtAgo(talent.measured_in_person_at)}`,
      stale: false,
      verified: true,
    };
  }
  if (talent?.measured_in_person_at) {
    return {
      text: `Measured in person ${fmtAgo(talent.measured_in_person_at)} by another agency`,
      stale: false,
      verified: true,
    };
  }
  if (!stats.measurements_updated_at) {
    return { text: 'Self-reported · never confirmed', stale: true, verified: false };
  }
  return {
    text: `Self-reported · updated ${fmtAgo(stats.measurements_updated_at)}`,
    stale: Boolean(stats.is_stale),
    verified: false,
  };
}

/* ---------------------------------------------------------------- package */

/**
 * The package read: digitals-set coverage against the five canonical slots,
 * plus the styled book count. A minor without guardian consent is never
 * expected to supply body frames, so those slots are withheld rather than
 * counted as gaps.
 */
export function packageRead(dossier) {
  const images = dossier?.images || [];
  const suppressBodyImagery = Boolean(
    dossier?.compliance?.is_minor && !dossier?.compliance?.guardian_consent_at,
  );
  const set = analyzeDigitalsSet(images, { suppressBodyImagery });
  const range = analyzeBookRange(images);

  const digitals = images.filter(isDigitalSlot);
  const book = images.filter((img) => !isDigitalSlot(img));

  const dated = images
    .map((img) => img.captured_at || img.created_at)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t));
  const newestDigital = digitals
    .map((img) => img.captured_at || img.created_at)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)[0];

  return {
    set,
    range,
    suppressBodyImagery,
    frames: images.length,
    digitalsCount: digitals.length,
    bookCount: book.length,
    newestFrameAt: dated.length ? new Date(Math.max(...dated)).toISOString() : null,
    digitalsAgeDays: newestDigital ? daysSince(new Date(newestDigital).toISOString()) : null,
    missingLabels: set.missingSlots.map((slot) => SHOT_LABELS[slot] || titleCase(slot)),
  };
}

export const DIGITAL_SLOTS = [
  { key: 'headshot', label: 'Headshot', body: false },
  { key: 'profile', label: 'Profile', body: false },
  { key: 'three_quarter', label: 'Three-quarter', body: true },
  { key: 'full_length', label: 'Full length', body: true },
  { key: 'back', label: 'Back', body: true },
];

/**
 * The frame filling a digitals slot, using the exact predicates
 * `analyzeDigitalsSet` counts with — so the pictures and the coverage number
 * can never disagree. A styled book frame never stands in for a raw digital.
 */
const SLOT_PREDICATE = {
  headshot: isHeadshotImage,
  profile: isDigitalProfileImage,
  three_quarter: isDigitalThreeQuarterImage,
  full_length: isDigitalFullLengthImage,
  back: isDigitalBackImage,
};

export function frameForSlot(images, slot) {
  const predicate = SLOT_PREDICATE[slot];
  if (!predicate) return null;
  return (images || []).find(predicate) || null;
}

/* --------------------------------------------------------------- calendar */

const COMMITMENT_TONE = {
  booked: 'live',
  option: 'motion',
  hold: 'select',
  bookout: 'hold',
};

/**
 * The calendar line — every span that constrains the next N days, normalised to
 * 0–1 offsets so the client can draw one rule. Talent-declared bookouts and
 * this agency's own options / holds / bookings share the rule because a booker
 * reads them together.
 */
export function calendarSpans(availability) {
  const windowDays = availability?.window_days || 90;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const endMs = startMs + windowDays * DAY_MS;
  const span = endMs - startMs;

  const clamp = (v) => Math.min(1, Math.max(0, v));
  const toSpan = (from, to, kind, label, tier) => {
    const s = new Date(from).getTime();
    const e = to ? new Date(to).getTime() + DAY_MS : endMs;
    if (!Number.isFinite(s)) return null;
    const endAt = Number.isFinite(e) ? e : endMs;
    if (endAt < startMs || s > endMs) return null;
    const left = clamp((s - startMs) / span);
    const right = clamp((endAt - startMs) / span);
    if (right - left <= 0) return null;
    return {
      kind,
      tone: COMMITMENT_TONE[kind] || 'hold',
      label,
      tier: tier || null,
      left,
      width: Math.max(right - left, 0.012),
      from,
      to,
    };
  };

  const spans = [];
  for (const b of availability?.bookouts || []) {
    const s = toSpan(b.starts_on, b.ends_on, 'bookout', b.note || 'Bookout');
    if (s) spans.push({ ...s, id: `bookout-${b.id}` });
  }
  for (const c of availability?.commitments || []) {
    const kind = String(c.kind || '').toLowerCase();
    const tierLabel =
      kind === 'option' && c.option_tier
        ? `${c.option_tier === 1 ? '1st' : c.option_tier === 2 ? '2nd' : `${c.option_tier}th`} option`
        : titleCase(kind);
    const s = toSpan(c.start_date, c.end_date, kind, c.client_ref || tierLabel, c.option_tier);
    if (s) spans.push({ ...s, id: `commit-${c.id}`, kindLabel: tierLabel });
  }

  // Month ticks across the window.
  const ticks = [];
  const cursor = new Date(startMs);
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() + 1);
  while (cursor.getTime() < endMs) {
    ticks.push({
      at: clamp((cursor.getTime() - startMs) / span),
      label: cursor.toLocaleDateString('en-US', { month: 'short' }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const next = spans.slice().sort((a, b) => a.left - b.left)[0] || null;
  return { windowDays, spans, ticks, next };
}

/* --------------------------------------------------------------- standing */

const ACTIVITY_VERBS = {
  application_created: 'Submitted',
  status_change: 'Status changed',
  note_added: 'Note added',
  note_edited: 'Note edited',
  note_deleted: 'Note deleted',
  tag_added: 'Tag added',
  tag_removed: 'Tag removed',
  profile_viewed: 'Opened',
  email_sent: 'Email sent',
  message_sent: 'Message sent',
  interview_scheduled: 'Meeting scheduled',
  reminder_created: 'Follow-up set',
  board_assigned: 'Filed to a board',
};

export const activityVerb = (type) => ACTIVITY_VERBS[type] || titleCase(type);

/** Open follow-ups, split so overdue work reads first. */
export function followUps(standing) {
  const reminders = (standing?.reminders || []).filter((r) => r.status !== 'completed');
  const now = Date.now();
  const overdue = reminders.filter((r) => new Date(r.reminder_date).getTime() < now);
  const upcoming = reminders.filter((r) => new Date(r.reminder_date).getTime() >= now);
  const interviews = (standing?.interviews || []).filter(
    (i) => !['cancelled', 'declined'].includes(String(i.status)),
  );
  const nextInterview = interviews
    .filter((i) => new Date(i.proposed_datetime).getTime() >= now)
    .sort((a, b) => new Date(a.proposed_datetime) - new Date(b.proposed_datetime))[0] || null;
  return { overdue, upcoming, interviews, nextInterview };
}

/* -------------------------------------------------------------- position */

/**
 * Market position, expressed against this agency's own book — the only
 * comparison a booker can act on.
 */
export function positionRead(position, talent) {
  if (!position || !position.roster_size) return null;
  // One plain-English line only — the ledger beneath it carries the numbers, so
  // repeating market and board counts here would just be the same fact twice.
  if (position.height_percentile == null || position.track_peers < 2) return null;
  return [
    `Taller than ${position.height_percentile}% of your ${position.track_peers} active ${
      TRACK_LABELS[talent?.stats_track]?.toLowerCase() || 'roster'
    } talent`,
  ];
}
