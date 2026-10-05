/**
 * The Overview, read from what Pholio actually holds.
 *
 * Pure: every section of the page is derived here from server payloads and a
 * `now`, so the page component only lays it out and the reading can be tested
 * without a browser. Nothing here estimates, scores or predicts. When a fact
 * is missing (no shoot date, no review window), the reading says so or stays
 * silent; it never fills the gap.
 */

import { statusConfig, isEventApplication } from '../../utils/applicationStatus';
import { daysUntilNext, formatTimeRange } from '../../utils/callWindows';

const DAY_MS = 86_400_000;
const STATS_STALE_AFTER_DAYS = 90;
const MAX_LIVE_ROWS = 6;
const MAX_NEXT_AGENCIES = 3;

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayIndex(date, now) {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
}

export function daysAgo(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((now - date) / DAY_MS));
}

/** "today", "yesterday", "4 days ago", "3 weeks ago", "5 months ago". */
export function relativeDay(value, now = new Date()) {
  const days = daysAgo(value, now);
  if (days == null) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? 'a year ago' : `${years} years ago`;
}

function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** "3 Nov" this year, "3 Nov 2025" otherwise. */
export function shortDate(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return '';
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "Thu 9 Oct, 4 PM" — an answer-by moment. */
export function momentLabel(value) {
  const date = toDate(value);
  if (!date) return '';
  const day = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: date.getMinutes() ? '2-digit' : undefined })
    .replace(':00', '');
  return `${day}, ${time}`;
}

function monthYear(value) {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function cityOnly(location) {
  if (!location) return '';
  return String(location).split(',')[0].trim();
}

function agencyName(app) {
  return app?.agency_name || 'The agency';
}

function anchorOf(app) {
  return toDate(app?.status_changed_at) || toDate(app?.updated_at) || toDate(app?.created_at);
}

function applicationLink(app) {
  return `/dashboard/talent/applications?application=${encodeURIComponent(app.id)}`;
}

function threadLink(id) {
  return `/dashboard/talent/messages?thread=${encodeURIComponent(id)}`;
}

function status(app) {
  return String(app?.status || '').toLowerCase();
}

/* ─── Your move ─────────────────────────────────────────────────────────── */

/**
 * What is waiting on the talent, most time-bound first. Each move is one
 * sentence of fact, one line of context, one verb.
 */
export function buildMoves({
  applications = [],
  threads = [],
  freshness = null,
  profile = null,
  draft = null,
  requiredGaps = [],
  minorGated = false,
  now = new Date(),
}) {
  const moves = [];
  const covered = new Set();

  for (const app of applications) {
    if (!(isEventApplication(app) && status(app) === 'accepted')) continue;
    const eventName = app.event?.name;
    const answerBy = app.offer_closes_at ? momentLabel(app.offer_closes_at) : null;
    moves.push({
      key: `offer-${app.id}`,
      rank: 0,
      title: eventName
        ? `${agencyName(app)} offered you a slot in ${eventName}.`
        : `${agencyName(app)} offered you a slot.`,
      context: answerBy
        ? `The slot is held until ${answerBy}. After that it is released.`
        : 'The slot is held until you answer.',
      action: { label: 'Answer the offer', to: applicationLink(app) },
    });
    covered.add(app.id);
  }

  for (const app of applications) {
    const s = status(app);
    if (s === 'requested_more') {
      moves.push({
        key: `more-${app.id}`,
        rank: 1,
        title: `${agencyName(app)} asked for more.`,
        context: `Requested ${relativeDay(anchorOf(app), now)}. Send the digitals or shots they named to keep this moving.`,
        action: { label: 'See the request', to: applicationLink(app) },
      });
      covered.add(app.id);
    } else if (s === 'meeting_requested') {
      moves.push({
        key: `gosee-${app.id}`,
        rank: 1,
        title: `${agencyName(app)} wants to meet you.`,
        context: `A go-see, requested ${relativeDay(anchorOf(app), now)}. Reply in the thread to settle a time.`,
        action: { label: 'Open the thread', to: threadLink(app.id) },
      });
      covered.add(app.id);
    }
  }

  for (const thread of threads) {
    if (covered.has(thread.id)) continue;
    if (String(thread.lastSenderType || '').toUpperCase() !== 'AGENCY') continue;
    if (String(thread.status || '').toLowerCase() === 'withdrawn') continue;
    const preview = String(thread.preview || '').replace(/\s+/g, ' ').trim();
    moves.push({
      key: `thread-${thread.id}`,
      rank: 2,
      title: `${thread.agencyName || 'An agency'} wrote to you.`,
      context: preview
        ? `${capitalize(relativeDay(thread.timestamp, now))}: “${preview.length > 110 ? `${preview.slice(0, 107).trimEnd()}…` : preview}”`
        : `${capitalize(relativeDay(thread.timestamp, now))}.`,
      action: { label: 'Reply', to: threadLink(thread.id) },
    });
  }

  if (minorGated) {
    moves.push({
      key: 'guardian',
      rank: 3,
      title: 'Guardian consent is not recorded yet.',
      context: 'Measurements, full-length photos and public sharing stay off until it is.',
      action: { label: 'Record guardian consent', to: '/dashboard/talent/profile?tab=identity' },
    });
  }

  if (requiredGaps.length > 0) {
    const names = requiredGaps.map((gap) => gap.label);
    const listed =
      names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
    moves.push({
      key: 'required',
      rank: 3,
      title:
        requiredGaps.length === 1
          ? 'One required detail is missing from your package.'
          : `${requiredGaps.length} required details are missing from your package.`,
      context: `${listed}. Submissions and comp card export wait on ${requiredGaps.length === 1 ? 'it' : 'them'}.`,
      action: { label: 'Complete them', to: requiredGaps[0].to },
    });
  }

  if (freshness && !minorGated) {
    const set = freshness.currentSet;
    if (!freshness.hasDigitals) {
      moves.push({
        key: 'digitals-none',
        rank: 4,
        title: 'You have no digitals yet.',
        context: 'A dated set of plain, unretouched photos is what an agency reviews first.',
        action: { label: 'Add digitals', to: '/dashboard/talent/media' },
      });
    } else if (freshness.state === 'stale') {
      moves.push({
        key: 'digitals-stale',
        rank: 4,
        title: 'Your digitals are out of date.',
        context: `Shot ${shortDate(set?.capturedOn, now)}. Agencies read digitals as how you look now. Reshoot before your next submission.`,
        action: { label: 'Upload new digitals', to: '/dashboard/talent/media' },
      });
    } else if (freshness.state === 'undated') {
      moves.push({
        key: 'digitals-undated',
        rank: 4,
        title: 'Your digitals have no shoot date.',
        context: 'Without one, an agency cannot tell how current they are.',
        action: { label: 'Add the shoot date', to: '/dashboard/talent/media' },
      });
    }
  }

  if (draft?.canResume && draft.agency?.name) {
    moves.push({
      key: `draft-${draft.agencyId}`,
      rank: 5,
      title: `Your submission to ${draft.agency.name} is not sent yet.`,
      context: `Last saved ${relativeDay(draft.updatedAt, now)}.`,
      action: {
        label: 'Continue',
        to: `/dashboard/talent/applications/apply?agency=${encodeURIComponent(draft.agencyId)}`,
      },
    });
  }

  const statsAge = daysAgo(profile?.measurements_updated_at, now);
  if (!minorGated && statsAge != null && statsAge >= STATS_STALE_AFTER_DAYS) {
    moves.push({
      key: 'stats',
      rank: 6,
      title: 'Are your stats still accurate?',
      context: `Last updated ${monthYear(profile.measurements_updated_at)}.`,
      action: { label: 'Update stats', to: '/dashboard/talent/profile?tab=appearance' },
      confirmStats: true,
    });
  }

  return moves.sort((a, b) => a.rank - b.rank);
}

/* ─── In circulation ────────────────────────────────────────────────────── */

const WAITING_ON_TALENT = new Set(['requested_more', 'meeting_requested']);

function circulationRank(app) {
  const s = status(app);
  if (isEventApplication(app) && s === 'accepted') return 0;
  if (WAITING_ON_TALENT.has(s)) return 1;
  const group = statusConfig(s, { purpose: app.call_purpose }).group;
  if (group === 'represented') return 2;
  if (group === 'advancing') return 3;
  return 4;
}

/**
 * The review window as a reading: how far into it the submission is, and the
 * date silence turns into a close. Only rows the auto-close job acts on carry
 * one; the date comes from the server, which reads the same window the job does.
 */
export function waitReading(app, now = new Date()) {
  const closes = toDate(app?.review_closes_at);
  const start = anchorOf(app);
  if (!closes || !start || closes <= start) return null;
  const total = Math.max(1, Math.round((closes - start) / DAY_MS));
  const elapsed = Math.min(total, Math.max(0, Math.floor((now - start) / DAY_MS)));
  return {
    total,
    elapsed,
    fraction: Math.min(1, Math.max(0, (now - start) / (closes - start))),
    closesOn: shortDate(closes, now),
  };
}

export function buildCirculation(applications = [], now = new Date()) {
  const live = [];
  const closed = [];
  for (const app of applications) {
    const config = statusConfig(app.status, { purpose: app.call_purpose });
    const row = {
      id: app.id,
      agency: agencyName(app),
      place: isEventApplication(app) && app.event?.name ? app.event.name : cityOnly(app.agency_location),
      standing: config.label,
      since: capitalize(relativeDay(anchorOf(app), now)),
      sentOn: shortDate(app.created_at, now),
      to: applicationLink(app),
      waiting: WAITING_ON_TALENT.has(status(app)) || (isEventApplication(app) && status(app) === 'accepted'),
      wait: waitReading(app, now),
    };
    if (config.group === 'closed') closed.push(row);
    else live.push({ ...row, rank: circulationRank(app), anchor: anchorOf(app)?.getTime() || 0 });
  }
  live.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.wait && b.wait) return a.wait.total - a.wait.elapsed - (b.wait.total - b.wait.elapsed);
    return b.anchor - a.anchor;
  });
  return {
    live: live.slice(0, MAX_LIVE_ROWS),
    liveOverflow: Math.max(0, live.length - MAX_LIVE_ROWS),
    liveCount: live.length,
    closed,
  };
}

/* ─── This week ─────────────────────────────────────────────────────────── */

/**
 * Seven days from today. Only real dated things land on it: curated open-call
 * hours, slot answer-by times, event days, review windows closing, the day
 * the current digitals stop being current. An empty week renders nothing.
 */
export function buildWeek({ callWindows = [], applications = [], freshness = null, now = new Date() }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfDay(now).getTime() + i * DAY_MS);
    return {
      key: date.toISOString().slice(0, 10),
      weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
      date: date.getDate(),
      isToday: i === 0,
      entries: [],
    };
  });

  const place = (index, entry) => {
    if (index >= 0 && index < 7) days[index].entries.push(entry);
  };

  for (const window of callWindows) {
    const offset = daysUntilNext(window, now);
    place(offset, {
      key: `call-${window.id}`,
      title: `${window.displayName} open call`,
      detail: formatTimeRange(window, now) || window.label || '',
      to: '/dashboard/talent/open-calls',
      sort: window.startMinute ?? 9999,
    });
  }

  for (const app of applications) {
    const s = status(app);
    if (app.offer_closes_at) {
      place(dayIndex(new Date(app.offer_closes_at), now), {
        key: `offer-${app.id}`,
        title: `Answer ${agencyName(app)}`,
        detail: `Slot held until ${new Date(app.offer_closes_at)
          .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          .replace(':00', '')}`,
        to: applicationLink(app),
        strong: true,
        sort: -1,
      });
    }
    if (isEventApplication(app) && (s === 'confirmed' || s === 'accepted') && app.event?.startsOn) {
      place(dayIndex(new Date(`${String(app.event.startsOn).slice(0, 10)}T00:00:00`), now), {
        key: `event-${app.id}`,
        title: app.event.name || agencyName(app),
        detail: s === 'confirmed' ? 'You are on the line-up' : 'Slot offered',
        to: applicationLink(app),
        sort: 0,
      });
    }
    if (app.review_closes_at) {
      place(dayIndex(new Date(app.review_closes_at), now), {
        key: `closes-${app.id}`,
        title: `${agencyName(app)} window closes`,
        detail: 'Closes if unanswered',
        to: applicationLink(app),
        sort: 9998,
      });
    }
  }

  const agingOn = freshness?.currentSet?.agingOn;
  if (freshness?.state === 'current' && agingOn) {
    place(dayIndex(new Date(`${agingOn}T00:00:00`), now), {
      key: 'digitals-aging',
      title: 'Digitals stop being current',
      detail: 'Time to plan a reshoot',
      to: '/dashboard/talent/media',
      sort: 9997,
    });
  }

  for (const day of days) day.entries.sort((a, b) => a.sort - b.sort);
  const total = days.reduce((sum, day) => sum + day.entries.length, 0);
  return { days, total };
}

/* ─── The Package ───────────────────────────────────────────────────────── */

function cmToImperial(cm) {
  const n = Number(cm);
  if (!Number.isFinite(n) || n <= 0) return null;
  const inches = n / 2.54;
  let feet = Math.floor(inches / 12);
  let rest = Math.round(inches - feet * 12);
  if (rest === 12) {
    feet += 1;
    rest = 0;
  }
  return `${feet}′${rest}″`;
}

function cm(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** The stats an agency reads first, in convention order. */
export function statsLine(profile, { withholdBody = false } = {}) {
  if (!profile) return [];
  const parts = [];
  const height = cm(profile.height_cm);
  if (height) parts.push({ key: 'height', value: `${cmToImperial(height)} · ${height} cm` });
  if (withholdBody) return parts;
  const isMale = String(profile.gender || '').toLowerCase() === 'male';
  const trio = isMale
    ? [cm(profile.chest_cm), cm(profile.waist_cm), cm(profile.inseam_cm)]
    : [cm(profile.bust_cm), cm(profile.waist_cm), cm(profile.hips_cm)];
  if (trio.every(Boolean)) {
    parts.push({ key: 'body', value: trio.join('–'), hint: isMale ? 'Chest, waist, inseam (cm)' : 'Bust, waist, hips (cm)' });
  }
  return parts;
}

const FRESHNESS_WORD = { current: 'Current', aging: 'Aging', stale: 'Out of date', undated: 'Undated' };

export function buildPackage({
  profile = null,
  freshness = null,
  isRequiredComplete = false,
  requiredGaps = [],
  minorGated = false,
  websiteUrl = null,
  websiteLabel = '',
  views = null,
  now = new Date(),
}) {
  const lines = [];

  if (!minorGated) {
    let reading;
    let tone = 'quiet';
    if (!freshness) reading = null;
    else if (!freshness.hasDigitals) {
      reading = 'None yet';
      tone = 'absent';
    } else {
      const shot = freshness.currentSet?.capturedOn;
      reading = shot
        ? `${FRESHNESS_WORD[freshness.state] || freshness.label} · shot ${shortDate(shot, now)}`
        : FRESHNESS_WORD.undated;
      if (freshness.state !== 'current') tone = 'flag';
    }
    if (reading) {
      lines.push({ key: 'digitals', term: 'Digitals', reading, tone, to: '/dashboard/talent/media', action: 'Media' });
    }
  }

  const statsAt = profile?.measurements_updated_at;
  lines.push({
    key: 'stats',
    term: 'Stats',
    reading: statsAt ? `Updated ${monthYear(statsAt)}` : 'Not dated',
    tone: statsAt && daysAgo(statsAt, now) < STATS_STALE_AFTER_DAYS ? 'quiet' : 'flag',
    to: '/dashboard/talent/profile?tab=appearance',
    action: 'Edit',
  });

  lines.push(
    minorGated
      ? {
          key: 'card',
          term: 'Comp card',
          reading: 'Exports after guardian consent',
          tone: 'absent',
          to: '/dashboard/talent/profile?tab=identity',
          action: 'Consent',
        }
      : isRequiredComplete
        ? { key: 'card', term: 'Comp card', reading: 'Ready to export', tone: 'quiet', to: '/dashboard/talent/media', action: 'Export' }
        : {
            key: 'card',
            term: 'Comp card',
            reading: `${requiredGaps.length || 'Some'} required ${requiredGaps.length === 1 ? 'detail' : 'details'} missing`,
            tone: 'flag',
            to: requiredGaps[0]?.to || '/dashboard/talent/profile',
            action: 'Complete',
          },
  );

  if (!minorGated && websiteUrl) {
    lines.push({
      key: 'site',
      term: 'Portfolio',
      reading: websiteLabel,
      href: websiteUrl,
      tone: 'quiet',
      note: Number.isFinite(views) ? `${views.toLocaleString()} profile ${views === 1 ? 'view' : 'views'} in 30 days` : null,
      noteTo: '/dashboard/talent/intel',
    });
  }

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
  return {
    name,
    city: cityOnly(profile?.city),
    stats: statsLine(profile, { withholdBody: minorGated }),
    lines,
  };
}

/* ─── Where next ────────────────────────────────────────────────────────── */

function parseBoards(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function ageOn(dob, now) {
  const birth = toDate(dob);
  if (!birth) return null;
  let age = now.getFullYear() - birth.getUTCFullYear();
  const m = now.getMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getUTCDate())) age -= 1;
  return age;
}

/**
 * Agencies on Pholio the talent has not submitted to, keeping only those whose
 * own published height and age ranges include the talent's declared figures.
 * An agency that publishes no range is kept; a talent with no declared figure
 * is not filtered on it. The range is printed on the row, so the reason a name
 * is here is visible, not inferred.
 */
export function buildNextAgencies({ agencies = [], applications = [], profile = null, now = new Date() }) {
  const applied = new Set(applications.map((app) => app.agency_id).filter(Boolean));
  const gender = String(profile?.gender || '').toLowerCase();
  const side = gender === 'female' ? 'female' : gender === 'male' ? 'male' : null;
  const height = cm(profile?.height_cm);
  const age = ageOn(profile?.date_of_birth, now);

  const rows = [];
  for (const agency of agencies) {
    if (!agency?.id || applied.has(agency.id)) continue;
    const min = side ? cm(agency[`min_height_${side}`]) : null;
    const max = side ? cm(agency[`max_height_${side}`]) : null;
    if (height && min && height < min) continue;
    if (height && max && height > max) continue;
    const minAge = Number(agency.min_age) || null;
    const maxAge = Number(agency.max_age) || null;
    if (age != null && minAge && age < minAge) continue;
    if (age != null && maxAge && age > maxAge) continue;
    const boards = parseBoards(agency.open_boards);
    rows.push({
      id: agency.id,
      name: agency.name,
      city: cityOnly(agency.agency_location),
      boards,
      range: min && max ? `${min}–${max} cm` : min ? `From ${min} cm` : max ? `Up to ${max} cm` : null,
      to: `/dashboard/talent/applications/apply?agency=${encodeURIComponent(agency.id)}`,
    });
  }
  rows.sort((a, b) => (b.boards.length > 0) - (a.boards.length > 0) || String(a.name).localeCompare(String(b.name)));
  return { agencies: rows.slice(0, MAX_NEXT_AGENCIES), more: Math.max(0, rows.length - MAX_NEXT_AGENCIES) };
}

export { asList };
