/** Discover natural-language constraint presentation and brief editing. */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');

const OP_SYMBOL = { min: '≥', max: '≤', approx: '≈', between: '', exact: '' };

function imperial(cm) {
  if (cm == null) return null;
  const inch = Math.round(Number(cm) / 2.54);
  return `${Math.floor(inch / 12)}'${inch % 12}"`;
}

/** Short human field label for a discover_v2 applied[] entry / constraint. */
export function chipFieldLabel(field) {
  const LABELS = {
    gender_presentation: 'Gender',
    height_cm: 'Height',
    playing_age: 'Age',
    location: 'Market',
    availability: 'Available',
    visible_tattoos: 'Tattoos',
    boards: 'Board',
    hair_color: 'Hair',
    eye_color: 'Eyes',
    union: 'Union',
    representation_status: 'Representation',
    credentials: 'Credentials',
    experience_level: 'Experience',
    shoe: 'Shoe',
  };
  if (LABELS[field]) return LABELS[field];
  const base = String(field).split('.').pop();
  return cap(base.replace(/_cm$/, '').replace(/_/g, ' '));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Display value string for an applied[] chip (never edits — display only). */
export function chipValueText(applied) {
  const { field, op, value } = applied || {};
  if (value == null) return '';
  if (Array.isArray(value)) {
    if (field === 'availability') {
      return value
        .map((w) => {
          const from = shortDate(w.from);
          const to = shortDate(w.to);
          if (from && to) return `${from}–${to}`;
          return from || to || (w.kind || 'window');
        })
        .join(', ');
    }
    return value.map((v) => cap(String(v).replace(/_/g, ' '))).join(', ');
  }
  const sym = OP_SYMBOL[op] ? `${OP_SYMBOL[op]} ` : '';
  if (field === 'height_cm') {
    if (typeof value === 'object') {
      if (value.b != null) return `${imperial(value.a)}–${imperial(value.b)}`;
      return `${sym}${imperial(value.a)}`;
    }
    return `${sym}${imperial(value)}`;
  }
  if (field === 'playing_age') {
    if (typeof value === 'object') {
      if (value.b != null) return `${value.a}–${value.b}`;
      return `${value.a}+`;
    }
    return String(value);
  }
  if (field === 'shoe') {
    if (typeof value === 'object') return `${value.region ? value.region + ' ' : ''}${value.size}`;
    return String(value);
  }
  if (field === 'visible_tattoos') return value === false ? 'None visible' : 'Visible';
  if (typeof value === 'object') {
    if (value.b != null) return `${sym}${value.a}–${value.b}`;
    if (value.a != null) return `${sym}${value.a}`;
    if (value.value != null) return `${sym}${value.value}`;
    return JSON.stringify(value);
  }
  return `${sym}${cap(String(value).replace(/_/g, ' '))}`;
}

/** Numeric-input chips edit an inline number; date chips edit native dates. */
export function chipEditKind(field) {
  if (field === 'availability') return 'date';
  if (field === 'height_cm' || field === 'playing_age' || field === 'shoe') return 'number';
  if (String(field).startsWith('measurements.')) return 'number';
  return null; // enum / boolean — removable but not value-edited
}

/** Unit suffix shown beside a numeric edit input. */
export function chipEditUnit(field) {
  if (field === 'height_cm') return 'cm';
  if (String(field).startsWith('measurements.')) return 'cm';
  if (field === 'playing_age') return 'yrs';
  return '';
}

/** Current numeric edit seed (in the edit unit — cm for heights/measurements). */
export function chipEditValue(applied) {
  const { value } = applied || {};
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value.a != null) return String(value.a);
    if (value.size != null) return String(value.size);
    if (value.value != null) return String(value.value);
    return '';
  }
  return String(value);
}

// ── constraint-truth annotations (per-card + detail) ─────────────────────────

/**
 * Plain-text annotation for one constraint_truth entry (pass omitted upstream).
 * e.g. "availability unconfirmed" · `5'10" — below 5'11" ask`.
 */
export function formatConstraintTruth(entry) {
  if (!entry) return null;
  const { field, status, actual } = entry;
  if (field === 'availability') {
    return status === 'unknown' ? 'availability unconfirmed' : 'unavailable in window';
  }
  if (field === 'location') return 'outside preferred market';
  if (field === 'union') return 'union status differs';
  if (field === 'experience_level') return 'experience differs';
  if (field === 'representation_status') {
    return status === 'unknown' ? 'representation unknown' : 'representation differs';
  }
  if (field === 'height_cm' && actual != null) {
    return `${imperial(actual)} — below ask`;
  }
  if (String(field).startsWith('measurements.') && actual != null) {
    return `${chipFieldLabel(field).toLowerCase()} ${actual} — off ask`;
  }
  const label = chipFieldLabel(field).toLowerCase();
  return status === 'unknown' ? `${label} unconfirmed` : `${label} off ask`;
}

/** All constraint-truth annotations for a result (deduped, order preserved). */
export function constraintAnnotations(constraintTruth) {
  if (!Array.isArray(constraintTruth)) return [];
  const seen = new Set();
  const out = [];
  for (const e of constraintTruth) {
    const t = formatConstraintTruth(e);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

// ── authoritative chip edits → amended brief text (re-query) ─────────────────
// The backend GET /api/agency/discover accepts only `q` (it re-parses the brief
// with the strict LLM contract). So an authoritative chip edit is serialised
// back into the brief: when the applied[].span is known we splice in place so
// the visible brief and the filter can never diverge (LB-9); when the span is
// null we append a normalised "(edited: …)" amendment the parser re-reads.

function cleanupBrief(text) {
  return String(text)
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
}

/** Human phrase for a numeric/date edit, spliced over the span or appended. */
function editPhrase(field, op, rawValue, unit) {
  if (field === 'height_cm') {
    const cm = Number(rawValue);
    if (op === 'max') return `under ${cm}cm`;
    if (op === 'approx') return `around ${cm}cm`;
    return `${cm}cm and up`;
  }
  if (field === 'playing_age') return `age ${rawValue}`;
  if (field === 'shoe') return `size ${rawValue} shoe`;
  if (String(field).startsWith('measurements.')) {
    return `${chipFieldLabel(field).toLowerCase()} ${rawValue}${unit}`;
  }
  if (field === 'availability') {
    // rawValue = { from, to } ISO strings
    const from = shortDate(rawValue?.from);
    const to = shortDate(rawValue?.to);
    if (from && to) return `available ${from} through ${to}`;
    if (from) return `available from ${from}`;
    return 'available';
  }
  return `${chipFieldLabel(field).toLowerCase()} ${rawValue}${unit}`;
}

/**
 * Produce the amended brief for an authoritative value edit.
 * @param {string} brief current submitted brief
 * @param {object} applied the applied[] entry being edited (carries span + op)
 * @param {*} rawValue new primary value (number, or {from,to} for dates)
 * @returns {string} new brief to re-query
 */
export function amendBriefValue(brief, applied, rawValue) {
  const unit = chipEditUnit(applied.field);
  const phrase = editPhrase(applied.field, applied.op, rawValue, unit);
  const span = applied.span;
  if (Array.isArray(span) && span.length === 2) {
    const before = brief.slice(0, span[0]);
    const after = brief.slice(span[1]);
    return cleanupBrief(`${before}${phrase}${after}`);
  }
  return cleanupBrief(`${brief} (edited: ${phrase})`);
}

/**
 * Produce the amended brief for an authoritative chip removal.
 * span known → cut the substring; span null → append an "ignore" amendment.
 */
export function amendBriefRemove(brief, applied) {
  const span = applied.span;
  if (Array.isArray(span) && span.length === 2) {
    return cleanupBrief(`${brief.slice(0, span[0])}${brief.slice(span[1])}`);
  }
  return cleanupBrief(`${brief} (edited: ignore ${chipFieldLabel(applied.field).toLowerCase()})`);
}
