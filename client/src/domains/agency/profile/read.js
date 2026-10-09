/**
 * Turns the agency's talent payload into the shape this page is drawn from.
 * Pure: no React, no fetching.
 */

const DAY = 86_400_000;

export const src = (img) => img?.path || img?.url || img?.public_url || null;

const cap = (s) => String(s ?? '').replace(/[_-]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());

export function ago(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  const d = Math.max(0, Math.floor((Date.now() - t) / DAY));
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 70) return `${Math.round(d / 7)} weeks ago`;
  if (d < 365) return `${Math.round(d / 30)} months ago`;
  return `${Math.round(d / 365)} yr ago`;
}

export function date(value, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', opts);
}

/* ── frames ─────────────────────────────────────────────────────────── */

export const SLOTS = [
  { key: 'headshot', label: 'Headshot', match: ['headshot', 'close_up', 'beauty'], body: false },
  { key: 'profile', label: 'Profile', match: ['profile', 'profile_left', 'profile_right'], body: false },
  { key: 'three_quarter', label: 'Three-quarter', match: ['three_quarter', 'waist_up', 'mid_length', 'half_body'], body: true },
  { key: 'full_length', label: 'Full length', match: ['full_length', 'portrait_length'], body: true },
  { key: 'back', label: 'Back', match: ['back', 'full_back'], body: true },
];

const isDigital = (img) => String(img?.image_type || '').toLowerCase() === 'digital';

const KIND = {
  digital: 'Digital', portfolio: 'Book', editorial: 'Editorial', runway: 'Runway',
  campaign: 'Campaign', tearsheet: 'Tearsheet', test: 'Test', comp_card: 'Comp card', headshot: 'Headshot',
};

export function frameLabel(img) {
  const kind = KIND[String(img?.image_type || '').toLowerCase()] || 'Book';
  const shot = img?.shot_type ? cap(img.shot_type) : null;
  return shot && shot !== kind ? `${kind} · ${shot}` : kind;
}

export function frameWhen(img) {
  if (img?.captured_at) return `Shot ${ago(img.captured_at)}`;
  return img?.created_at ? `Added ${ago(img.created_at)}` : '';
}

function readFrames(images, withholdBody) {
  const all = images.filter((img) => src(img));
  const hero = all.find((img) => img.is_primary) || all.find((img) => !isDigital(img)) || all[0] || null;
  const digitals = all.filter(isDigital);
  const taken = new Set();
  const slots = SLOTS.filter((s) => !(withholdBody && s.body)).map((slot) => {
    const frame = digitals.find((img) => !taken.has(img) && slot.match.includes(String(img.shot_type || '').toLowerCase()));
    if (frame) taken.add(frame);
    return { ...slot, frame: frame || null };
  });
  const book = all.filter((img) => !isDigital(img));
  return { all, hero, digitals, slots, book, filled: slots.filter((s) => s.frame).length };
}

/* ── body ───────────────────────────────────────────────────────────── */

function readBody(talent) {
  const st = talent.stats || {};
  const cm = st.height?.cm ?? talent.height_cm ?? null;
  const core = st.bust || st.chest || st.core || null;
  const measure = (key, label, m) => (m?.cm ? { key, label, cm: m.cm, inches: m.inches } : null);
  const measures = [
    measure(core?.key || 'bust', core?.label || 'Bust', core),
    measure('waist', 'Waist', st.waist),
    measure('hips', 'Hips', st.hips),
  ].filter(Boolean);
  const sizes = [
    st.dress_size || talent.dress_size ? { label: 'Dress', value: st.dress_size || talent.dress_size } : null,
    st.suit_size || talent.suit_size ? { label: 'Suit', value: st.suit_size || talent.suit_size } : null,
    st.inseam?.cm ? { label: 'Inseam', value: `${st.inseam.cm} cm` } : null,
    st.shoe_size || talent.shoe_size ? { label: 'Shoe', value: st.shoe_size || talent.shoe_size } : null,
    st.weight?.kg ? { label: 'Weight', value: `${st.weight.kg} kg` } : null,
  ].filter(Boolean);
  const hair = st.hair_color || talent.hair_color || null;
  const eyes = st.eye_color || talent.eye_color || null;
  const track = st.track || talent.stats_track || null;
  return {
    heightCm: cm,
    heightImperial: st.height?.feet_inches || null,
    measures,
    sizes,
    hair: hair ? cap(hair) : null,
    eyes: eyes ? cap(eyes) : null,
    track,
    updated: st.measurements_updated_at || talent.measurements_updated_at || null,
    stale: Boolean(st.is_stale),
  };
}

/* ── standing ───────────────────────────────────────────────────────── */

const WORD = {
  submitted: 'New', pending: 'New', new: 'New',
  shortlisted: 'Shortlisted',
  requested_more: 'Waiting on digitals',
  meeting_requested: 'Meeting asked',
  accepted: 'Offer out',
  development: 'Development offer out',
  represented: 'Represented',
  confirmed: 'Confirmed',
  kept_on_file: 'On file',
  passed: 'Passed', declined: 'Passed', archived: 'Archived',
  withdrawn: 'Withdrawn', closed_no_response: 'No response', declined_by_talent: 'They declined',
};

function readStanding(dossier) {
  const app = dossier.application || {};
  const st = dossier.standing || {};
  const status = String(app.status || 'submitted').toLowerCase();
  const days = st.days_since_submitted;
  return {
    status,
    word: WORD[status] || cap(status),
    day: days == null ? null : days,
    idle: st.days_since_last_action ?? null,
    submittedAt: st.submitted_at || app.created_at || null,
    openedAt: st.viewed_at || app.viewed_at || null,
    lastAt: st.last_action_at || null,
    lastWhat: st.last_action_type ? cap(st.last_action_type) : null,
    offeredAt: app.accepted_at || null,
    passedAt: app.declined_at || null,
    board: st.board || null,
    boardId: st.board?.id || app.board_id || null,
    tags: st.tags || [],
    notes: st.notes?.length || 0,
    messages: st.messages || null,
    invited: Boolean(st.invited || app.invited_by_agency_id),
    timeline: st.timeline || [],
  };
}

/* ── representation ─────────────────────────────────────────────────── */

const REP = {
  represented: 'Represented',
  exclusive_elsewhere: 'Exclusive elsewhere',
  seeking: 'Looking for an agency',
  unrepresented: 'Not represented',
};

function readRepresentation(rep) {
  const status = rep?.status || 'unrepresented';
  const lines = (rep?.lines || []).map((l) => ({
    role: l.relationship_type === 'mother' ? 'Mother agency' : 'Placement',
    who: l.agency_name || (l.is_this_agency ? 'Your agency' : 'Name not shared'),
    where: [l.market && cap(l.market), l.territory, l.division].filter(Boolean).join(' · '),
    exclusive: Boolean(l.is_exclusive),
    active: l.status !== 'ended',
    since: l.started_on,
    until: l.ended_on,
  }));
  return { status, headline: REP[status] || cap(status), lines };
}

/* ── calendar ───────────────────────────────────────────────────────── */

function readCalendar(availability) {
  const n = availability?.window_days || 90;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: n }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY);
    return { i, date: d, dow: d.getDay(), dom: d.getDate(), month: d.getMonth(), marks: [] };
  });
  const spans = [];
  const place = (from, to, kind, label) => {
    const a = new Date(from);
    a.setHours(0, 0, 0, 0);
    const b = to ? new Date(to) : new Date(start.getTime() + (n - 1) * DAY);
    b.setHours(0, 0, 0, 0);
    if (Number.isNaN(a.getTime())) return;
    const i0 = Math.max(0, Math.round((a - start) / DAY));
    const i1 = Math.min(n - 1, Math.round((b - start) / DAY));
    if (i1 < 0 || i0 > n - 1 || i1 < i0) return;
    spans.push({ kind, label, from, to, i0, i1 });
    for (let i = i0; i <= i1; i += 1) days[i].marks.push(kind);
  };
  for (const b of availability?.bookouts || []) place(b.starts_on, b.ends_on, 'bookout', b.note || 'Bookout');
  for (const c of availability?.commitments || []) {
    const kind = String(c.kind || 'hold').toLowerCase();
    const tier = kind === 'option' && c.option_tier ? `${['', '1st', '2nd', '3rd'][c.option_tier] || `${c.option_tier}th`} option` : cap(kind);
    place(c.start_date, c.end_date, kind, c.client_ref ? `${tier} · ${c.client_ref}` : tier);
  }
  spans.sort((a, b) => a.i0 - b.i0);
  const free = days.filter((d) => d.marks.length === 0).length;
  return { n, days, spans, free, status: availability?.status || null };
}

/* ── everything ─────────────────────────────────────────────────────── */

export function readSitting(dossier) {
  const t = dossier.talent || {};
  const pro = t.professional || {};
  const minor = Boolean(t.is_minor || dossier.compliance?.is_minor);
  const consent = dossier.compliance?.guardian_consent_at || null;
  const first = String(t.first_name || '').trim();
  const last = String(t.last_name || '').trim();
  const full = [first, last].filter(Boolean).join(' ') || 'Unnamed talent';
  const place = t.city || (t.market ? cap(t.market) : null);
  const languages = (t.languages?.length ? t.languages : pro.languages) || [];
  const freshness = dossier.digitalsFreshness || null;

  return {
    id: dossier.application?.id,
    slug: t.slug || null,
    name: { first: first || full, last: first ? last : '', full },
    age: minor ? null : t.age ?? null,
    minor,
    consent,
    place,
    secondBase: pro.city_secondary || null,
    nationality: t.nationality || null,
    discipline: pro.discipline ? cap(pro.discipline) : null,
    level: pro.experience_level ? cap(pro.experience_level) : null,
    bio: t.bio_curated || t.bio_raw || null,
    languages,
    particulars: [
      ['Specialties', [...(pro.specialties || []), ...(pro.specializations || [])].map(cap).join(', ')],
      ['Training', (pro.training || []).map(cap).join(', ')],
      ['Playing age', pro.playing_age_min || pro.playing_age_max ? [pro.playing_age_min, pro.playing_age_max].filter(Boolean).join('–') : null],
      ['Travel', pro.availability_travel ? cap(String(pro.availability_travel)) : null],
      ['Union', pro.union_membership ? cap(pro.union_membership) : null],
      ['Hair length', pro.hair_length ? cap(pro.hair_length) : null],
      ['Tattoos', pro.tattoos ? cap(String(pro.tattoos)) : null],
      ['Piercings', pro.piercings ? cap(String(pro.piercings)) : null],
    ].filter(([, v]) => v),
    socials: (t.social || []).filter((s) => s.handle || s.url),
    body: readBody(t),
    frames: readFrames(dossier.images || [], minor && !consent),
    freshness: freshness
      ? { state: freshness.state, label: freshness.label, guidance: freshness.guidance, has: freshness.hasDigitals !== false }
      : null,
    compCard: dossier.submissionPackage?.compCard?.viewUrl ? dossier.submissionPackage.compCard : null,
    standing: readStanding(dossier),
    representation: readRepresentation(dossier.representation),
    calendar: readCalendar(dossier.availability),
    contact: dossier.contact || null,
    identity: {
      disputed: Boolean(dossier.identityDisputed),
      fromSubmission: dossier.identitySource === 'submission',
      emailVerified: typeof dossier.emailVerified === 'boolean' ? dossier.emailVerified : null,
      canMessage: !(dossier.identitySource === 'submission' && dossier.identityClaimed === false),
    },
  };
}
