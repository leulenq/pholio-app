// Formatting for curated recurring open-call windows ("Thu · 3–4 PM ET").
// Shared by the Requirements ledger and the Overview card. Times are wall-clock
// minutes in the window's OWN timezone — "Thursdays at 3pm their time" is the
// fact, so we render in that zone with its label rather than converting to the
// viewer's clock.
import { isoWeekdayFromDate } from '../../../shared/constants/submissionTracker';

const WEEKDAY_SHORT = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

const WEEKDAY_PLURAL = {
  1: 'Mondays',
  2: 'Tuesdays',
  3: 'Wednesdays',
  4: 'Thursdays',
  5: 'Fridays',
  6: 'Saturdays',
  7: 'Sundays',
};

export const weekdayShort = (weekday) => WEEKDAY_SHORT[weekday] || '';
export const weekdayPlural = (weekday) => WEEKDAY_PLURAL[weekday] || '';

/** 900 → "3 PM"; 930 → "3:30 PM"; 0 → "12 AM". */
export function formatMinute(minute) {
  if (minute == null || !Number.isFinite(Number(minute))) return null;
  const total = Number(minute);
  const hours24 = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return minutes === 0 ? `${hours12} ${period}` : `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Generic zone label ("ET"), falling back to the DST-specific one ("EDT") and
 * finally the raw IANA name — never throws on an unknown zone.
 */
export function timezoneLabel(timezone, referenceDate = new Date()) {
  for (const timeZoneName of ['shortGeneric', 'short']) {
    try {
      const part = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName })
        .formatToParts(referenceDate)
        .find((p) => p.type === 'timeZoneName');
      if (part?.value && !/^GMT/.test(part.value)) {
        return part.value.replace(/^Eastern Time$/, 'ET');
      }
    } catch {
      // fall through to the next form, then the raw zone
    }
  }
  return timezone || '';
}

/**
 * "3–4 PM ET", "10–11 AM ET", "3:30–5 PM ET". When both ends share a period
 * the first drops it. Null start (day published, time not) → null.
 */
export function formatTimeRange(window, referenceDate = new Date()) {
  const start = formatMinute(window.startMinute);
  if (!start) return null;
  const end = formatMinute(window.endMinute);
  const zone = timezoneLabel(window.timezone, referenceDate);
  if (!end) return `${start}${zone ? ` ${zone}` : ''}`;
  const [startTime, startPeriod] = [start.slice(0, -3), start.slice(-2)];
  const [, endPeriod] = [end.slice(0, -3), end.slice(-2)];
  const range = startPeriod === endPeriod ? `${startTime}–${end}` : `${start}–${end}`;
  return `${range}${zone ? ` ${zone}` : ''}`;
}

/** "Thu · 3–4 PM ET" (compact) — for the per-agency plate line and card rows. */
export function formatWindowCompact(window, referenceDate = new Date()) {
  const day = weekdayShort(window.weekday);
  const time = formatTimeRange(window, referenceDate);
  return time ? `${day} · ${time}` : day;
}

/** "Thursdays 3–4 PM ET" (prose) — for sentences. */
export function formatWindowProse(window, referenceDate = new Date()) {
  const day = weekdayPlural(window.weekday);
  const time = formatTimeRange(window, referenceDate);
  return time ? `${day} ${time}` : day;
}

/** Days from `today` (0-6) until the window's next occurrence, in the window's own zone. */
export function daysUntilNext(window, referenceDate = new Date()) {
  let todayIso;
  try {
    const weekdayName = new Intl.DateTimeFormat('en-US', {
      timeZone: window.timezone,
      weekday: 'short',
    }).format(referenceDate);
    const lookup = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    todayIso = lookup[weekdayName] || isoWeekdayFromDate(referenceDate);
  } catch {
    todayIso = isoWeekdayFromDate(referenceDate);
  }
  return (window.weekday - todayIso + 7) % 7;
}

/** Windows ordered soonest-first from today, ties broken by start time then name. */
export function sortByNextOccurrence(windows, referenceDate = new Date()) {
  return [...windows].sort((a, b) => {
    const days = daysUntilNext(a, referenceDate) - daysUntilNext(b, referenceDate);
    if (days !== 0) return days;
    const start = (a.startMinute ?? Infinity) - (b.startMinute ?? Infinity);
    if (start !== 0) return start;
    return String(a.displayName).localeCompare(String(b.displayName));
  });
}
