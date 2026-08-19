import { AlertCircle, Clock, MessageSquare, X } from 'lucide-react';
import {
  TRACKER_CHANNELS,
  TRACKER_STATUS,
  DEFAULT_TRACKER_CHANNEL,
} from '../../../shared/constants/submissionTracker';

// Single source of truth for how an off-platform (tracker) submission is
// presented to talent — the sibling of `applicationStatus.js`, which does the
// same job for submissions made on Pholio. Both feed one merged ledger, so
// `tone` and `group` deliberately use the same vocabularies:
//
// `tone`  — 'pending' | 'accepted' | 'file' | 'closed' (drives ApplicationsView CSS)
// `group` — 'inReview' | 'advancing' | 'represented' | 'closed' (drives the filter tabs)
//
// Lapse is NEVER recomputed here (ruling R1). The server computes `isLapsed`,
// `lapseDate` and `reapplyOpensOn` from `submitted_on + review_window_days` and
// ships them on every row; this module only formats what it is handed.

/** Honest channel names for the log form — how it was actually sent. */
export const TRACKER_CHANNEL_LABELS = Object.freeze({
  official_web_form: 'Their website form',
  official_email: 'Email',
  official_walk_in: 'Walk-in',
  agency_branded_third_party_form: 'Third-party form',
  other: 'Other',
});

/** Select options in the constant's own order. */
export const TRACKER_CHANNEL_OPTIONS = Object.freeze(
  TRACKER_CHANNELS.map((value) => ({
    value,
    label: TRACKER_CHANNEL_LABELS[value] || 'Other',
  })),
);

// The plain inline line a tracker row carries in the merged ledger. Never a
// chip: it is a fact about where the submission went, in the same voice as the
// location line on an on-Pholio row.
const CHANNEL_LINES = Object.freeze({
  official_web_form: 'Submitted on their site',
  official_email: 'Submitted by email',
  official_walk_in: 'Submitted in person',
  agency_branded_third_party_form: 'Submitted on their application form',
  other: 'Submitted off Pholio',
});

export function trackerChannelLine(channel) {
  const normalized = String(channel || DEFAULT_TRACKER_CHANNEL).toLowerCase();
  return CHANNEL_LINES[normalized] || CHANNEL_LINES.other;
}

export function trackerChannelLabel(channel) {
  const normalized = String(channel || DEFAULT_TRACKER_CHANNEL).toLowerCase();
  return TRACKER_CHANNEL_LABELS[normalized] || TRACKER_CHANNEL_LABELS.other;
}

/**
 * `YYYY-MM-DD` → "Aug 15, 2026". Read at UTC midnight so a date-only value
 * never slips a day west of Greenwich — the idiom the rest of the talent client
 * uses for date-only columns.
 */
export function formatTrackerDate(value) {
  if (!value) return null;
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** A row is lapsed only while it is still awaiting — the talent's own answer wins. */
export function isTrackerLapsed(row) {
  return (
    String(row?.status || '').toLowerCase() === TRACKER_STATUS.AWAITING && Boolean(row?.isLapsed)
  );
}

/**
 * Display state for one tracker row.
 *
 * The lapsed state mirrors `closed_no_response` on the application side: it
 * names the silence rather than putting a verdict in the agency's mouth, and
 * the next-step line tells the talent what the industry does about it.
 */
export function trackerStatusConfig(row) {
  const status = String(row?.status || TRACKER_STATUS.AWAITING).toLowerCase();

  if (status === TRACKER_STATUS.AWAITING && isTrackerLapsed(row)) {
    const reopens = formatTrackerDate(row?.reapplyOpensOn);
    return {
      label: 'No response',
      short: 'Closed',
      tone: 'closed',
      group: 'closed',
      icon: AlertCircle,
      next: reopens
        ? `Industry convention says treat this as a pass. Re-apply window opens ${reopens}.`
        : 'Industry convention says treat this as a pass.',
      detail: 'No reply arrived inside the review window you logged.',
    };
  }

  if (status === TRACKER_STATUS.HEARD_BACK) {
    return {
      label: 'Heard back',
      short: 'Replied',
      tone: 'pending',
      group: 'inReview',
      icon: MessageSquare,
      next: 'They answered you off Pholio. Keep the outcome in your note, and close this once it is settled.',
      detail: 'You recorded a reply from this agency.',
    };
  }

  if (status === TRACKER_STATUS.CLOSED_BY_TALENT) {
    return {
      label: 'Closed',
      short: 'Closed',
      tone: 'closed',
      group: 'closed',
      icon: X,
      next: 'You closed this record. Log a new submission whenever you approach them again.',
      detail: 'You closed this record yourself.',
    };
  }

  const closesOn = formatTrackerDate(row?.lapseDate);
  return {
    label: 'Awaiting reply',
    short: 'Awaiting',
    tone: 'pending',
    group: 'inReview',
    icon: Clock,
    next: closesOn
      ? `Their review window runs to ${closesOn}. Nothing is expected of you until then.`
      : 'Their review window is still open. Nothing is expected of you until it closes.',
    detail: 'You logged this submission yourself — no agency ever sees this record.',
  };
}

/** Standing group for one row, in the same vocabulary the filter tabs use. */
export function trackerGroup(row) {
  return trackerStatusConfig(row).group;
}

export function trackerMatchesFilter(row, filter) {
  if (filter === 'all') return true;
  return trackerGroup(row) === filter;
}

export const MAX_TRACKER_AGENCY_NAME = 160;
export const MAX_TRACKER_NOTE = 500;

/** Local calendar day as `YYYY-MM-DD` — the day the talent means by "today". */
export function todayTrackerDate(now = new Date()) {
  const offset = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Client-side checks for the log form, mirroring the router's 422s so an
 * obvious mistake is answered in the form rather than by a round trip. Returns
 * a field → message map; empty means the form may be sent.
 */
export function validateTrackerLogForm(values, { today = todayTrackerDate() } = {}) {
  const errors = {};

  const agencyName = String(values?.agencyName || '').trim();
  if (!agencyName) {
    errors.agencyName = 'Name the agency you submitted to.';
  } else if (agencyName.length > MAX_TRACKER_AGENCY_NAME) {
    errors.agencyName = `Keep this to ${MAX_TRACKER_AGENCY_NAME} characters or fewer.`;
  }

  const submittedOn = String(values?.submittedOn || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(submittedOn)) {
    errors.submittedOn = 'Pick the date you sent it.';
  } else if (submittedOn > today) {
    errors.submittedOn = 'That date is still ahead of you.';
  }

  const destinationUrl = String(values?.destinationUrl || '').trim();
  if (destinationUrl && !isHttpUrl(destinationUrl)) {
    errors.destinationUrl = 'Use the full address, starting with https://';
  }

  if (String(values?.note || '').trim().length > MAX_TRACKER_NOTE) {
    errors.note = `Keep this to ${MAX_TRACKER_NOTE} characters or fewer.`;
  }

  return errors;
}

/** Count tracked rows by standing group — the tracker's `bucketCounts`. */
export function trackerBucketCounts(rows = []) {
  const counts = { inReview: 0, advancing: 0, represented: 0, closed: 0 };
  for (const row of rows) {
    const group = trackerGroup(row);
    if (group in counts) counts[group] += 1;
  }
  return counts;
}
