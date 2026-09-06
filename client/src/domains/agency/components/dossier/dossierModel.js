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
  DIGITALS_SLOTS,
  frameForSlot,
} from '../../../../shared/utils/profileReadinessImages';
import { SHOT_LABELS } from '../../../../shared/constants/frameTaxonomy';

const DAY_MS = 86400000;

/* ------------------------------------------------------------------ dates */

/**
 * `date` columns (started_on, ends_on, …) arrive as bare "YYYY-MM-DD".
 * `new Date("YYYY-MM-DD")` is UTC midnight, which local formatters render as
 * the previous day anywhere west of UTC — so build those as local dates.
 */
export const parseDateValue = (value) => {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(value);
};

export const fmtDate = (value) => {
  if (!value) return null;
  const d = parseDateValue(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const fmtDayMonth = (value) => {
  if (!value) return null;
  const d = parseDateValue(value);
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

import { formatLocation } from '../../../../shared/utils/locationFormat';

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
  const base = formatLocation(t.city) || marketLabel(t.market);
  if (base) out.push(base);
  if (t.professional?.city_secondary) out.push(`+ ${formatLocation(t.professional.city_secondary)}`);
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
        ? `Represented by ${who}`
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
 * must know how old these numbers are before casting off them.
 *
 * Every measurement Pholio holds is self-reported. This used to also read
 * `measured_in_person_at` / `measured_by_us` and render a "measured in person"
 * line, but the roster endpoint that wrote those columns was removed, so the
 * branch could only ever be dead: it promised a verified reading the product
 * has no way to produce. Stating "self-reported" plainly is the honest answer.
 */
export function measurementProvenance(talent) {
  const stats = talent?.stats || {};
  if (!stats.measurements_updated_at) {
    return { text: 'Self-reported · never confirmed', stale: true };
  }
  return {
    text: `Self-reported · updated ${fmtAgo(stats.measurements_updated_at)}`,
    stale: Boolean(stats.is_stale),
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
  // Freshness comes from the server (`talent-dossier.js` → `digitals-freshness`),
  // so a booker and the talent are told the same thing by the same engine.
  //
  // This file used to compute it, and was wrong twice over. It aged from
  // `captured_at || created_at`, so an undated frame quietly reported the day it
  // was uploaded as if that were when it was shot. And it took the *newest*
  // digital, so a set with one recent frame read as fresh no matter how old the
  // rest were. Both errors pointed the same way: towards telling a reviewer the
  // digitals were current when they were not.
  const freshness = dossier?.digitalsFreshness || null;

  return {
    set,
    range,
    suppressBodyImagery,
    frames: images.length,
    digitalsCount: digitals.length,
    bookCount: book.length,
    newestFrameAt: dated.length ? new Date(Math.max(...dated)).toISOString() : null,
    freshness,
    // The OLDEST frame in the set a submission actually carries — the frame that
    // decides whether the set is usable. Null when nothing is datable, which is
    // a real answer ("we don't know") and must not be read as zero.
    digitalsAgeDays: freshness?.currentSet?.ageDays ?? null,
    missingLabels: set.missingSlots.map((slot) => SHOT_LABELS[slot] || titleCase(slot)),
  };
}

/**
 * The slot list and its frame lookup now live beside the predicates they count
 * with, in `shared/utils/profileReadinessImages`, because the talent /media
 * sheet has to draw the same five slots. Re-exported so dossier callers keep
 * their existing import.
 */
export const DIGITAL_SLOTS = DIGITALS_SLOTS;
export { frameForSlot };

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
    const s = parseDateValue(from).getTime();
    const e = to ? parseDateValue(to).getTime() + DAY_MS : endMs;
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

/* ------------------------------------------------------------ asset guard */

/**
 * A dead asset URL must never leave a broken-image glyph on this surface.
 * Drop the failed <img> and mark its holder so it renders as the same hatched
 * "nothing here" ground an unfilled slot uses. Handled imperatively rather
 * than with per-image state: a book can carry fifty frames, and none of them
 * should own a React state cell for a case that almost never fires.
 */
export function handleShotError(event) {
  const img = event.currentTarget;
  img.style.display = 'none';
  img.parentElement?.classList.add('is-missing');
}
