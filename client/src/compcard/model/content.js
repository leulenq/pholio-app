/**
 * Card content — what the card says, independent of how it is set.
 *
 * Stats follow agency convention per track (womenswear / menswear / kids),
 * in the market's units with the other system alongside. Values are kept
 * structured ({ label, value, alt }) so each direction can set them in its
 * own typographic voice (a tabular column, a caption, a single line).
 *
 * Never printed: weight, date of birth (adults), home address, personal
 * phone unless the talent turns it on.
 */

const CM_PER_IN = 2.54;

const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** 5′10″ — true primes, never apostrophes. */
export function feetInches(cm) {
  const totalIn = cm / CM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round((totalIn - ft * 12) * 2) / 2;
  if (inch >= 12) {
    ft += 1;
    inch -= 12;
  }
  const inStr = Number.isInteger(inch) ? `${inch}` : `${Math.floor(inch)}½`;
  return `${ft}′${inStr}″`;
}

/** Circumference in inches, to the half inch: 32, 24½. */
export function inches(cm) {
  const v = Math.round((cm / CM_PER_IN) * 2) / 2;
  return Number.isInteger(v) ? `${v}` : `${Math.floor(v)}½`;
}

export function ageOn(dob, at = new Date()) {
  if (!dob) return null;
  const d = new Date(typeof dob === 'string' && dob.length === 10 ? `${dob}T12:00:00Z` : dob);
  if (Number.isNaN(d.getTime())) return null;
  let a = at.getUTCFullYear() - d.getUTCFullYear();
  const m = at.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

/** Which stats set this talent's card uses. */
export function resolveTrack(profile) {
  const age = ageOn(profile.date_of_birth);
  if (age != null && age < 16) return 'kids';
  const t = String(profile.stats_track || '').toLowerCase();
  if (t.startsWith('women')) return 'women';
  if (t.startsWith('men')) return 'men';
  // Data first: a profile that carries a dress size and hips is a womenswear card.
  const hasWomen = num(profile.dress_size) != null || num(profile.hips_cm) != null;
  const hasMen = profile.suit_size || num(profile.chest_cm) != null || num(profile.inseam_cm) != null;
  if (hasWomen && !hasMen) return 'women';
  if (hasMen && !hasWomen) return 'men';
  const g = String(profile.gender || '').toLowerCase();
  if (g.startsWith('f') || g === 'woman') return 'women';
  if (g.startsWith('m') || g === 'man') return 'men';
  return 'women';
}

function shoe(profile, track, units) {
  const raw = profile.shoe_size;
  if (!raw) return null;
  const n = num(raw);
  if (n == null) return { label: 'Shoes', value: String(raw).trim() };
  const region = String(profile.shoe_region || (/eu/i.test(raw) ? 'EU' : /uk/i.test(raw) ? 'UK' : n >= 32 ? 'EU' : 'US')).toUpperCase();
  const offset = track === 'men' ? 33 : 31;
  const fmt = (v) => (Number.isInteger(v) ? `${v}` : `${Math.floor(v)}½`);
  let us;
  let eu;
  if (region === 'EU') {
    eu = Math.round(n);
    us = Math.round((n - offset) * 2) / 2;
  } else if (region === 'UK') {
    us = n + (track === 'men' ? 1 : 2);
    eu = Math.round(us + offset);
  } else {
    us = n;
    eu = Math.round(n + offset);
  }
  if (track === 'kids') return { label: 'Shoes', value: `${fmt(n)} ${region}` };
  return units === 'metric'
    ? { label: 'Shoes', value: `${eu}`, alt: `US ${fmt(us)}`, unit: 'EU' }
    : { label: 'Shoes', value: fmt(us), alt: `EU ${eu}`, unit: 'US' };
}

function length(label, cm, units) {
  const v = num(cm);
  if (v == null) return null;
  return units === 'metric'
    ? { label, value: `${Math.round(v)}`, alt: inches(v), unit: 'cm' }
    : { label, value: inches(v), alt: `${Math.round(v)}`, unit: 'in' };
}

const titleCase = (s) => String(s).trim().toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());

/**
 * Build the stats list.
 * @param {object} profile  profile row
 * @param {{track?:string, units?:'imperial'|'metric'}} opts
 */
export function buildStats(profile, opts = {}) {
  const track = opts.track || resolveTrack(profile);
  const units = opts.units || 'imperial';
  const out = [];
  const h = num(profile.height_cm);
  if (h) {
    out.push(
      units === 'metric'
        ? { key: 'height', label: 'Height', value: `${Math.round(h)}`, alt: feetInches(h), unit: 'cm' }
        : { key: 'height', label: 'Height', value: feetInches(h), alt: `${Math.round(h)}`, unit: '' },
    );
  }
  const add = (key, item) => item && out.push({ key, ...item });
  if (track === 'women') {
    add('bust', length('Bust', profile.bust_cm, units));
    add('waist', length('Waist', profile.waist_cm, units));
    add('hips', length('Hips', profile.hips_cm, units));
    if (profile.dress_size) {
      const d = num(profile.dress_size);
      add('dress', d != null && d < 30
        ? units === 'metric'
          ? { label: 'Dress', value: `${Math.round(d + 32)}`, alt: `US ${d}`, unit: 'EU' }
          : { label: 'Dress', value: `${d}`, alt: `EU ${Math.round(d + 32)}`, unit: 'US' }
        : { label: 'Dress', value: String(profile.dress_size).trim() });
    }
  } else if (track === 'men') {
    add('chest', length('Chest', profile.chest_cm || profile.bust_cm, units));
    add('waist', length('Waist', profile.waist_cm, units));
    add('inseam', length('Inseam', profile.inseam_cm, units));
    const chest = num(profile.chest_cm || profile.bust_cm);
    if (profile.suit_size) add('suit', { label: 'Suit', value: String(profile.suit_size).trim() });
    else if (chest && h) {
      const letter = h < 173 ? 'S' : h > 183 ? 'L' : 'R';
      add('suit', { label: 'Suit', value: `${Math.round(chest / CM_PER_IN)}${letter}` });
    }
  }
  add('shoes', shoe(profile, track, units));
  if (profile.hair_color && !/^other$/i.test(profile.hair_color)) add('hair', { label: 'Hair', value: titleCase(profile.hair_color) });
  if (profile.eye_color && !/^other$/i.test(profile.eye_color)) add('eyes', { label: 'Eyes', value: titleCase(profile.eye_color) });
  return { track, units, items: out };
}

/** Default unit system from the talent's market. */
export function defaultUnits(profile) {
  const place = `${profile.market || ''} ${profile.city || ''}`.toLowerCase();
  if (/(united states|usa|\bus\b|new york|nyc|los angeles|\bla\b|miami|chicago|atlanta|, [a-z]{2}$)/.test(place)) return 'imperial';
  if (place.trim()) return 'metric';
  return 'imperial';
}

/**
 * Representation & contact. Represented talent route bookings through the
 * agency; freelance talent through their own email and Pholio portfolio.
 */
export function buildContact(data, opts = {}) {
  const { profile, agency, email, portfolioUrl } = data;
  const age = ageOn(profile.date_of_birth);
  const minor = age != null && age < 18;
  const lines = [];
  if (agency?.name) {
    const web = agency.website ? agency.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') : null;
    return {
      mode: 'agency',
      agencyName: agency.name,
      label: 'Represented by',
      lines: [agency.location, web, agency.support_email].filter(Boolean),
      portfolio: portfolioUrl,
      logo: agency.logo_url || null,
    };
  }
  if (profile.current_agency && !opts.freelance) {
    return { mode: 'agency', agencyName: profile.current_agency, label: 'Represented by', lines: [], portfolio: portfolioUrl };
  }
  if (email && opts.showEmail !== false) lines.push(email);
  if (profile.phone && opts.showPhone && !minor) lines.push(formatPhone(profile.phone));
  return {
    mode: 'direct',
    label: minor ? 'Guardian contact' : 'Bookings',
    lines,
    portfolio: portfolioUrl,
  };
}

function formatPhone(p) {
  const d = String(p).replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return String(p).trim();
}

export function displayName(profile, style = 'full') {
  const first = String(profile.first_name || '').trim();
  const last = String(profile.last_name || '').trim();
  if (style === 'first' || !last) return { first, last: '', full: first };
  return { first, last, full: `${first} ${last}` };
}

/** "Los Angeles" from "Los Angeles, CA"; "New York" from "New York, United States". */
export function cityName(profile) {
  const c = String(profile.city || '').split(',')[0].trim();
  return c || null;
}
