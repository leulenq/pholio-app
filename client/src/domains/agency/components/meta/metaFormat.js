/**
 * Metadata formatters — one source of truth for every value the agency
 * dashboard prints about a person, a board, or a record.
 *
 * WHY THIS FILE EXISTS
 *
 * Before it, the same value was formatted differently in every file that
 * rendered it. Five separate `timeAgo` implementations disagreed on casing
 * ("just now" vs "Just now"), on the one-day label ("yesterday" vs
 * "Yesterday"), on the empty case ('' vs '—'), and on whether a two-week-old
 * record reads as "34d ago" or "12 Mar". A booker comparing two panels saw
 * two different vocabularies for one fact.
 *
 * Everything here is pure and returns STRUCTURE, not markup — `{ value, unit,
 * sub }` rather than a joined string — so the components decide typography
 * and the callers cannot re-join it their own way. That is the part that
 * actually stops the drift: a formatter returning a finished string invites
 * the next caller to build a slightly different one.
 */

import { normalizeLocation, formatLocation } from '../../../../shared/utils/locationFormat';

/* Locale is pinned. Left to the runtime, the same roster renders "12 Mar" for
   one booker and "Mar 12" for their colleague, and screenshots in a shared
   casting thread stop matching. */
const LOCALE = 'en-GB';

const MS = { minute: 60_000, hour: 3_600_000, day: 86_400_000 };

/** Finite, positive number or null. Guards every numeric formatter below. */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ============================================================
   PLACE

   `profiles.city` is one free-text column holding whatever was typed at
   onboarding: "Copenhagen, Denmark", "Los Angeles, CA", "Paris". A booker
   scanning a roster wants the city — the country is noise in a column and
   pushes real signal out of the row. The full string stays available for
   the title attribute, so nothing is actually lost.
   ============================================================ */

/**
 * Split a stored location into its parts.
 *
 * Parsing delegates to `shared/utils/locationFormat`, which already resolves
 * against the CITIES market registry and knows US state names and codes.
 * A naive split on the first comma gets "Los Angeles, California, United
 * States" wrong, and duplicating that knowledge here is how the two would
 * drift.
 *
 * `full` is the CANONICAL form from `formatLocation` ("Los Angeles, CA"),
 * not the raw stored string — so the hover text is tidied too rather than
 * echoing whatever was typed at onboarding.
 *
 * @returns {{city: string, region: string|null, full: string}|null}
 */
export function placeParts(value) {
  const raw = typeof value === 'string' ? value.trim() : value;
  if (!raw) return null;

  const norm = normalizeLocation(raw);
  if (!norm.city) return null;

  const full = formatLocation(raw) || norm.city;
  const region = norm.regionCode || norm.region || norm.country || null;
  return { city: norm.city, region, full };
}

/** Just the city. `cityOf("Copenhagen, Denmark")` → `"Copenhagen"`. */
export function cityOf(value) {
  return placeParts(value)?.city ?? null;
}

/* ============================================================
   MOMENT

   One recency vocabulary, reconciling the five that existed. Chosen from
   the union of their best behaviours:
     · sentence case, because these appear standalone in cells and columns
       where a lowercase "just now" reads like a fragment
     · "Yesterday" as a word — a booker reads it faster than "1d ago"
     · an absolute date past two weeks, because "47d ago" is a number
       nobody converts back into a date
   Returns null (never '—') for missing input: the em-dash is a rendering
   decision that belongs to the component, not the formatter.
   ============================================================ */

/**
 * @returns {{label: string, title: string, iso: string, days: number}|null}
 */
export function recency(value, now = Date.now()) {
  const d = parseDate(value);
  if (!d) return null;

  const elapsed = now - d.getTime();
  const iso = d.toISOString();
  const title = d.toLocaleString(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const days = Math.floor(elapsed / MS.day);

  /* A future timestamp is a clock-skew artefact, not a real state. Reading
     it as "Just now" is the honest degradation — the alternative is a
     roster row claiming a measurement was taken "-3d ago". */
  if (elapsed < MS.minute) return { label: 'Just now', title, iso, days: 0 };

  if (elapsed < MS.hour) {
    return { label: `${Math.floor(elapsed / MS.minute)}m ago`, title, iso, days: 0 };
  }
  if (elapsed < MS.day) {
    return { label: `${Math.floor(elapsed / MS.hour)}h ago`, title, iso, days: 0 };
  }
  if (days === 1) return { label: 'Yesterday', title, iso, days };
  if (days < 14) return { label: `${days}d ago`, title, iso, days };

  return { label: calendarDate(d, now), title, iso, days };
}

/**
 * Absolute date. The year appears only when it is not the current one —
 * "12 Mar" inside a working year, "12 Mar 2025" once it matters.
 */
export function calendarDate(value, now = Date.now()) {
  const d = parseDate(value);
  if (!d) return null;
  const sameYear = d.getUTCFullYear() === new Date(now).getUTCFullYear();
  return d.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Clock time, for a message or an interview slot. */
export function clockTime(value) {
  const d = parseDate(value);
  if (!d) return null;
  return d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
}

/* ============================================================
   FIGURE — measured values

   Every formatter returns { value, unit, sub } so a component can set the
   figure and its unit differently. Callers that only want a string can
   still join it, but the structure is what stops "178 cm · 5′ 10″" being
   rebuilt by hand in a fourth file with a different separator.
   ============================================================ */

/** Centimetres to feet and inches. */
export function cmToImperial(cm) {
  const n = num(cm);
  if (n == null) return null;
  /* Round total inches BEFORE splitting. Flooring feet first and rounding
     the remainder produces impossible values like 5′ 12″ at 182cm. */
  const totalInches = Math.round(n / 2.54);
  const feet = Math.floor(totalInches / 12);
  return `${feet}′ ${totalInches - feet * 12}″`;
}

/** @returns {{value: string, unit: string, sub: string}|null} */
export function heightFigure(cm) {
  const n = num(cm);
  if (n == null) return null;
  return { value: String(Math.round(n)), unit: 'cm', sub: cmToImperial(n) };
}

/**
 * Bust/chest, waist, hips.
 *
 * `key` reflects which of bust or chest the record actually carries, so a
 * men's board does not get a column headed "B · W · H".
 *
 * @returns {{key: string, value: string, unit: string, sub: string}|null}
 */
export function measurementFigure(measurements) {
  const m = measurements || {};
  const bust = num(m.bust_cm);
  const chest = num(m.chest_cm);
  const lead = bust ?? chest;
  const ordered = [lead, num(m.waist_cm), num(m.hips_cm)];
  if (ordered.every((v) => v == null)) return null;

  const cm = ordered.map((v) => (v == null ? '—' : String(Math.round(v))));
  const inches = ordered.map((v) => (v == null ? '—' : String(Math.round(v / 2.54))));

  return {
    key: bust != null ? 'B · W · H' : 'C · W · H',
    value: cm.join(' · '),
    unit: 'cm',
    sub: `${inches.join(' · ')} in`,
  };
}

/**
 * Age, from a stored age or a date of birth.
 *
 * `date_of_birth` arrives as either "1995-03-15" or a full ISO timestamp
 * depending on the database — a documented quirk of this schema — so the
 * date part is taken before parsing rather than trusting Date to agree
 * across both shapes.
 */
export function ageFigure(profile, now = Date.now()) {
  const direct = num(profile?.age);
  if (direct != null) return { value: String(Math.round(direct)), unit: 'yrs', sub: null };

  const raw = profile?.date_of_birth ?? profile?.dob;
  if (!raw) {
    const band = profile?.age_band;
    return band ? { value: String(band), unit: null, sub: null } : null;
  }

  const dob = parseDate(String(raw).slice(0, 10));
  if (!dob) return null;

  const ref = new Date(now);
  let years = ref.getFullYear() - dob.getFullYear();
  const monthDelta = ref.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && ref.getDate() < dob.getDate())) years -= 1;
  if (years < 0 || years > 120) return null;

  return { value: String(years), unit: 'yrs', sub: null };
}

/* ============================================================
   FRESHNESS — recency that is actionable

   Distinct from `recency`: this one carries a TONE, because stale
   measurements are a thing a booker has to act on. Tone maps to text
   colour only, never to a badge or a dot.
   ============================================================ */

/** @returns {{label: string, tone: 'current'|'due'|'stale'|'muted'}} */
export function freshness(value, now = Date.now()) {
  const r = recency(value, now);
  if (!r) return { label: 'Not recorded', tone: 'muted' };

  const months = Math.max(1, Math.floor(r.days / 30));
  if (r.days < 31) return { label: 'Current', tone: 'current' };
  if (r.days < 91) return { label: `${months}mo old`, tone: 'current' };
  if (r.days < 181) return { label: `${months}mo old`, tone: 'due' };
  return { label: `Stale · ${months}mo`, tone: 'stale' };
}

/* ============================================================
   COUNTS
   ============================================================ */

/**
 * Pluralise a count with its noun. `countLabel(1, 'board')` → "1 board".
 * Irregular plurals pass `plural` explicitly.
 */
export function countLabel(count, singular, plural) {
  const n = Number(count);
  if (!Number.isFinite(n)) return null;
  const word = n === 1 ? singular : plural || `${singular}s`;
  return `${n} ${word}`;
}
