/**
 * intentParser — client-side casting intelligence for Discover search.
 *
 * Three exports:
 *   parseIntent(text)        → structured facets (used internally for scoring)
 *   predictCompletion(text)  → ghosted inline suffix (Tab to accept)
 *   suggestRefinements(text) → Array<{value, label}> casting briefs, always complete
 */

// ── Vocabulary ────────────────────────────────────────────────────────────────
const LEXICON = {
  location: {
    kind: 'Location',
    terms: {
      Paris: ['paris', 'parisian'],
      Milan: ['milan', 'milano'],
      'New York': ['new york', 'nyc', 'manhattan', 'brooklyn'],
      London: ['london'],
      Tokyo: ['tokyo'],
      'Los Angeles': ['los angeles', 'l.a.'],
      Berlin: ['berlin'],
      Copenhagen: ['copenhagen'],
      Seoul: ['seoul'],
      Sydney: ['sydney'],
    },
  },
  look: {
    kind: 'Look',
    terms: {
      Editorial: ['editorial'],
      Commercial: ['commercial'],
      Runway: ['runway', 'catwalk', 'show model'],
      Fitness: ['fitness', 'athletic', 'activewear', 'sport'],
      Beauty: ['beauty', 'skincare', 'cosmetic'],
      Lifestyle: ['lifestyle'],
      'Avant-garde': ['avant-garde', 'avant garde', 'experimental', 'alternative'],
    },
  },
  gender: {
    kind: 'Gender',
    terms: {
      Female: ['female', 'women', 'woman', 'womenswear'],
      Male: ['male', 'men', 'man', 'menswear'],
      'Non-binary': ['non-binary', 'nonbinary', 'androgynous'],
    },
  },
  experience: {
    kind: 'Experience',
    terms: {
      'New face': ['new face', 'new faces', 'fresh face', 'emerging', 'undiscovered'],
      Established: ['established', 'signed', 'experienced', 'agency experience'],
    },
  },
  vibe: {
    kind: 'Energy',
    terms: {
      Soft: ['soft', 'gentle', 'tender'],
      Natural: ['natural', 'effortless', 'warm', 'approachable'],
      Striking: ['striking', 'bold', 'strong', 'dramatic'],
      Refined: ['refined', 'elegant', 'polished', 'luxurious', 'luxury'],
      Ethereal: ['ethereal', 'luminous', 'delicate'],
    },
  },
};

// Flat lookup — longest forms first so "new face" beats "new".
const FLAT_TERMS = [];
for (const group of Object.values(LEXICON)) {
  for (const [canonical, forms] of Object.entries(group.terms)) {
    for (const form of forms) FLAT_TERMS.push({ form, canonical, kind: group.kind });
  }
}
FLAT_TERMS.sort((a, b) => b.form.length - a.form.length);

// ── Curated casting briefs ────────────────────────────────────────────────────
// Written the way a casting director actually thinks. These are the suggestions
// shown on focus and the targets for inline completion.
const CASTING_BRIEFS = [
  'Female new faces — soft beauty, 5\'9 and above',
  'High editorial presence, Paris or New York',
  'Runway specialists for FW26, European market',
  'Athletic build for a luxury activewear campaign',
  'Striking androgynous look for a fashion editorial',
  'Commercial warmth — approachable and photogenic',
  'Established signed talent with show-ready proportions',
  'Male editorial faces for a menswear campaign',
  'Natural elegance for a high-end skincare lookbook',
  'Refined, minimal look — emerging female talent',
  'Experienced commercial talent, broad market appeal',
  'Luminous, ethereal — fine jewellery campaign',
];

// ── parseIntent ─────────────────────────────────────────────────────────────
export function parseIntent(text) {
  if (!text || !text.trim()) return { facets: [], coverage: 0 };
  const lower = ` ${text.toLowerCase()} `;
  const facets = [];
  const seenKinds = new Set();

  if (/\btall\b/i.test(text)) {
    facets.push({ kind: 'Build', value: 'Tall' });
    seenKinds.add('Build');
  }
  const heightMatch = text.match(/(\d['']\s?\d{0,2}[""]?|\d{3}\s?cm)/);
  if (heightMatch && /above|over|min|tall|\d['']/i.test(text) && !seenKinds.has('Build')) {
    facets.push({ kind: 'Build', value: heightMatch[1].replace(/\s+/g, '') });
    seenKinds.add('Build');
  }

  for (const { form, canonical, kind } of FLAT_TERMS) {
    if (seenKinds.has(kind)) continue;
    if (lower.includes(` ${form} `) || lower.includes(` ${form},`) || lower.endsWith(` ${form}`)) {
      facets.push({ kind, value: canonical });
      seenKinds.add(kind);
    }
  }

  return { facets, coverage: Math.min(1, facets.length / 4) };
}

// ── predictCompletion ──────────────────────────────────────────────────────
// Returns only the suffix to ghost after the caret, or '' if no strong match.
export function predictCompletion(text) {
  if (!text) return '';
  const lower = text.toLowerCase();

  for (const brief of CASTING_BRIEFS) {
    if (brief.toLowerCase().startsWith(lower) && brief.length > text.length) {
      return brief.slice(text.length);
    }
  }

  const trailing = text.match(/([a-zà-ÿ'-]+)$/i);
  if (trailing) {
    const tok = trailing[1].toLowerCase();
    if (tok.length >= 2) {
      for (const { form } of FLAT_TERMS) {
        if (!form.includes(' ') && form.startsWith(tok) && form.length > tok.length) {
          return form.slice(tok.length);
        }
      }
    }
  }
  return '';
}

// ── suggestRefinements ─────────────────────────────────────────────────────
// Always returns complete casting briefs — no append/replace mechanics.
// Cold: four curated briefs. Typing: top three most related briefs.
export function suggestRefinements(text) {
  const trimmed = (text || '').trim();

  if (!trimmed) {
    return CASTING_BRIEFS.slice(0, 4).map((v) => ({ value: v, label: v }));
  }

  const { facets } = parseIntent(trimmed);
  const facetValues = facets.map((f) => f.value.toLowerCase());
  const lowerText = trimmed.toLowerCase();

  const scored = CASTING_BRIEFS
    .filter((b) => b.toLowerCase() !== lowerText)
    .map((brief) => {
      const bl = brief.toLowerCase();
      let score = 0;
      for (const val of facetValues) if (bl.includes(val)) score += 2;
      const words = lowerText.split(/\s+/).filter((w) => w.length > 3);
      for (const w of words) if (bl.includes(w)) score += 1;
      return { brief, score };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 3);
  const items = top.length ? top : scored.slice(0, 3);
  return items.map((s) => ({ value: s.brief, label: s.brief }));
}
