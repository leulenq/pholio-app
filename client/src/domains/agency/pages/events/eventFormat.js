/**
 * Event copy formatting.
 *
 * Lives here rather than inline because the same three values are printed on
 * the list, the call masthead and the export summary, and three
 * near-identical date joins is how "Sep 4 – Sep 7" and "4–7 Sept" end up on
 * the same screen. Returns finished strings only for values that carry no
 * further structure; anything measured goes through `components/meta`.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * `event_starts_on` / `event_ends_on` are DATE columns: PostgreSQL hands back
 * a full ISO timestamp, SQLite a "YYYY-MM-DD" string. Parse the date part only
 * — reading it as a timestamp shifts the day across timezones, and an event
 * that starts a day early on the organizer's screen is not a rounding error.
 */
function parseDateOnly(value) {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function short(parts) {
  return `${MONTHS[parts.m - 1]} ${parts.d}`;
}

/** "Sep 4–7, 2026" · "Sep 28 – Oct 2, 2026" · "Dates not set". */
export function formatEventDates(event) {
  const start = parseDateOnly(event?.startsOn);
  const end = parseDateOnly(event?.endsOn);
  if (!start && !end) return 'Dates not set';
  if (!start) return `Until ${short(end)}, ${end.y}`;
  if (!end) return `From ${short(start)}, ${start.y}`;
  if (start.y === end.y && start.m === end.m) {
    return `${short(start)}–${end.d}, ${start.y}`;
  }
  if (start.y === end.y) return `${short(start)} – ${short(end)}, ${start.y}`;
  return `${short(start)}, ${start.y} – ${short(end)}, ${end.y}`;
}

/**
 * Compensation is restated in the applicant's consent copy verbatim, so the
 * organizer must see the same sentence they are making people agree to.
 */
export function formatCompensation(compensation) {
  if (!compensation?.type) return 'Compensation not stated';
  const label = {
    paid: 'Paid',
    unpaid: 'Unpaid',
    stipend: 'Stipend',
  }[compensation.type] || compensation.type;
  return compensation.details ? `${label} — ${compensation.details}` : label;
}
