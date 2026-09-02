/**
 * Discover filter editing.
 *
 * The server builds every filter chip's text, unit and edit seed
 * (`discover_v2.filters[]`), so nothing here formats a label or a value. What
 * stays on the client is the one thing the server cannot do: turn an edit or a
 * removal back into brief text, so the words in the bar and the filters applied
 * can never diverge.
 *
 * A filter entry is:
 *   { id, field, op, value, text, span, editable, unit, edit_value }
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Lowercase word for a field, used only inside a rewritten brief phrase. */
function fieldWord(field) {
  const base = String(field || '').split('.').pop();
  return base.replace(/_cm$/, '').replace(/_/g, ' ').toLowerCase();
}

function cleanupBrief(text) {
  return String(text)
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
}

/**
 * The phrase a numeric or date edit writes into the brief.
 * @param {object} filter discover_v2 filters[] entry
 * @param {*} rawValue new value (a number-ish string, or { from, to } for dates)
 * @returns {string}
 */
export function filterEditPhrase(filter, rawValue) {
  const field = filter?.field;
  const op = filter?.op;
  const unit = filter?.unit || '';

  if (field === 'height_cm') {
    const cm = Number(rawValue);
    if (op === 'max') return `under ${cm}cm`;
    if (op === 'approx') return `around ${cm}cm`;
    return `${cm}cm and up`;
  }
  if (field === 'playing_age') return `age ${rawValue}`;
  if (field === 'shoe') return `size ${rawValue} shoe`;
  if (field === 'availability') {
    const from = shortDate(rawValue?.from);
    const to = shortDate(rawValue?.to);
    if (from && to) return `available ${from} through ${to}`;
    if (from) return `available from ${from}`;
    return 'available';
  }
  return `${fieldWord(field)} ${rawValue}${unit}`;
}

/**
 * Amended brief for an edited filter value.
 * A known span is spliced in place; without one the phrase is appended.
 * @param {string} brief current submitted brief
 * @param {object} filter the filters[] entry being edited (carries span + op)
 * @param {*} rawValue new value (number-ish string, or { from, to })
 * @returns {string} brief to re-query
 */
export function amendBriefValue(brief, filter, rawValue) {
  const phrase = filterEditPhrase(filter, rawValue);
  const span = filter?.span;
  if (Array.isArray(span) && span.length === 2) {
    return cleanupBrief(`${brief.slice(0, span[0])}${phrase}${brief.slice(span[1])}`);
  }
  return cleanupBrief(`${brief} (edited: ${phrase})`);
}

/**
 * Amended brief for a removed filter.
 * A known span is cut; without one an ignore phrase is appended.
 */
export function amendBriefRemove(brief, filter) {
  const span = filter?.span;
  if (Array.isArray(span) && span.length === 2) {
    return cleanupBrief(`${brief.slice(0, span[0])}${brief.slice(span[1])}`);
  }
  const what = (filter?.text || fieldWord(filter?.field)).toLowerCase();
  return cleanupBrief(`${brief} (edited: ignore ${what})`);
}
