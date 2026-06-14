/**
 * Discover match score + breakdown helpers.
 * Handles hybrid rerank scores and legacy vibe_distance shapes.
 */

const ATTRIBUTE_KIND = {
  visual: 'Visual',
  vibe: 'Energy',
  casting: 'Casting',
  market: 'Market',
  lexical: 'Trait',
};

const CONSTRAINT_KIND = {
  gender: 'Gender',
  hair_color: 'Hair',
  eye_color: 'Eyes',
  city: 'Location',
  heritage: 'Heritage',
  min_height: 'Build',
  max_height: 'Build',
  archetype: 'Look',
  experience_level: 'Experience',
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');

/** Cosine distance (0 = identical) → match %. Legacy semantic path. */
export function distanceToMatchPct(distance) {
  if (distance == null) return null;
  const dist = parseFloat(distance);
  if (Number.isNaN(dist)) return null;
  return Math.max(0, Math.min(100, Math.round((1 - dist) * 100)));
}

/** Resolve 0–100 match from hybrid `match_score` or legacy `vibe_distance`. */
export function resolveMatchScore(profile) {
  if (!profile) return null;
  const ms = profile.match_score;
  if (ms != null && Number.isFinite(Number(ms))) {
    return Math.max(0, Math.min(100, Math.round(Number(ms))));
  }
  return distanceToMatchPct(profile.vibe_distance);
}

export function isHybridBreakdown(breakdown) {
  return !!(breakdown && (breakdown.legs != null || breakdown.rrf != null || breakdown.rerank != null));
}

function fmtScoreValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (n <= 1 && n >= 0) return `${Math.round(n * 100)}%`;
  return String(Math.round(n));
}

/** Normalized rows for tooltip / aria description. */
export function formatBreakdownLines(breakdown) {
  if (!breakdown) return [];

  if (isHybridBreakdown(breakdown)) {
    const lines = [];
    if (breakdown.rerank != null) {
      lines.push({ label: 'Rerank', value: fmtScoreValue(breakdown.rerank) });
    }
    if (breakdown.rrf != null) {
      lines.push({ label: 'Fusion', value: fmtScoreValue(breakdown.rrf) });
    }
    const legs = breakdown.legs || {};
    const legLabels = {
      dense_visual: 'Visual',
      visual: 'Visual',
      dense_casting: 'Casting',
      casting: 'Casting',
      dense_market: 'Market',
      market: 'Market',
      lexical: 'Lexical',
      structured: 'Structured',
    };
    for (const [key, label] of Object.entries(legLabels)) {
      if (legs[key] != null && !lines.some((l) => l.label === label)) {
        lines.push({ label, value: fmtScoreValue(legs[key]) });
      }
    }
    return lines;
  }

  const lines = [];
  if (breakdown.text != null) {
    lines.push({ label: 'Text', value: `${distanceToMatchPct(breakdown.text) ?? '—'}%` });
  }
  if (breakdown.image != null) {
    lines.push({ label: 'Image', value: `${distanceToMatchPct(breakdown.image) ?? '—'}%` });
  }
  return lines;
}

export function breakdownAriaLabel(breakdown, rationale) {
  const parts = formatBreakdownLines(breakdown).map((l) => `${l.label} ${l.value}`);
  if (rationale) parts.unshift(rationale);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Facet chips for "Reading your brief" — server query_understanding when present,
 * else legacy parsed_intent, else client parseIntent facets.
 */
export function facetsFromMeta(meta, clientFacets = []) {
  const qu = meta?.query_understanding;
  if (qu && (qu.attributes?.length || qu.constraints?.length)) {
    const facets = [];
    for (const attr of qu.attributes || []) {
      facets.push({
        kind: ATTRIBUTE_KIND[attr.type] || cap(attr.type || 'Trait'),
        value: attr.term,
        key: `a-${attr.type}-${attr.term}`,
      });
    }
    for (const c of qu.constraints || []) {
      const field = String(c.field || '');
      facets.push({
        kind: CONSTRAINT_KIND[field] || cap(field.replace(/_/g, ' ')),
        value: String(c.value),
        key: `c-${field}-${c.value}`,
      });
    }
    return facets;
  }

  if (meta?.parsed_intent?.facets?.length) {
    return meta.parsed_intent.facets.map((f) => ({ ...f, key: f.kind }));
  }

  return (clientFacets || []).map((f) => ({ ...f, key: f.kind }));
}
