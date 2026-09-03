// Maps the real /api/agency/overview + /overview/recent-applicants payloads into
// render-ready shapes, with safe fallbacks for empty/new agencies.
//
// Pipeline statuses arrive as display labels (Submitted, Shortlisted, Offered,
// Passed, Declined); we key colors off the lowercased label.
const PIPELINE_COLORS = {
  represented: '#050505',
  offered: '#8A7A55',
  shortlisted: '#C9A55A',
  submitted: '#2D2A26',
  passed: '#6B6560',
  declined: '#C8C2BA',
};

// The overview endpoint returns each KPI as a wrapper object, not a scalar:
//   pendingReview { count, oldestDaysAgo }   activeCastings { count, closingToday }
// We flatten to the scalar each surface renders, plus the useful sub-fields for deltas.
export function selectKpis(data) {
  const k = data?.kpis || {};
  const pendingReview = k.pendingReview || {};
  const activeCastings = k.activeCastings || {};
  return {
    pendingReview: pendingReview.count ?? 0,
    pendingOldestDaysAgo: pendingReview.oldestDaysAgo ?? null,
    activeCastings: activeCastings.count ?? 0,
    castingsClosingToday: activeCastings.closingToday ?? 0,
  };
}

export function selectPipeline(data) {
  const rows = Array.isArray(data?.pipeline) ? data.pipeline : [];
  const total = rows.reduce((s, r) => s + (r.count || 0), 0) || 1;
  return rows.map((r) => {
    const key = (r.key || r.label || '').toLowerCase();
    return {
      label: r.label || '',
      count: r.count || 0,
      pct: r.sharePct ?? Math.round(((r.count || 0) / total) * 100),
      color: PIPELINE_COLORS[key] || '#c4bba8',
    };
  });
}

export function selectPulse(data) {
  const p = data?.pulse || {};
  return {
    newToday: p.newToday ?? 0,
    closingWeek: p.closingWeek ?? 0,
    discoverableCount: p.discoverableCount ?? 0,
    newTalentWeek: p.newTalentWeek ?? 0,
  };
}

// "Where to go next" — derive recommended actions from intake pressure, by
// urgency. Each move renders as an agenda row: a serif figure, a statement,
// and the destination it opens. Tone colors the figure only.
export function buildNextMoves(pulse) {
  const moves = [];
  if (pulse.closingWeek > 0) {
    moves.push({
      id: 'closing', tone: 'urgent',
      figure: pulse.closingWeek,
      text: `board${pulse.closingWeek === 1 ? '' : 's'} close this week — finalize submissions`,
      where: 'Signing room',
      to: '/dashboard/agency/signing',
    });
  }
  if (pulse.newTalentWeek > 0) {
    moves.push({
      id: 'newtalent', tone: 'positive',
      figure: pulse.newTalentWeek,
      text: `new discoverable talent joined this week`,
      where: 'Discover',
      to: '/dashboard/agency/discover',
    });
  }
  return moves;
}

const DOCKET_PRIORITY = ['review', 'closing', 'new', 'idle'];

// "today" / "tomorrow" / weekday name for a board close date within the week.
function closesWhen(date) {
  const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
  if (days <= 0) return 'closes today';
  if (days === 1) return 'closes tomorrow';
  return `closes ${date.toLocaleDateString('en-US', { weekday: 'long' })}`;
}

// Boards closing in the next 7 days, soonest first, with valid dates only.
function closingBoards(boards) {
  const now = Date.now();
  const horizon = now + 7 * 86400000;
  return boards
    .filter((b) => b.is_active !== false && b.closes_at)
    .map((b) => ({ name: b.name, date: new Date(b.closes_at) }))
    .filter((b) => !Number.isNaN(b.date.getTime()))
    .filter((b) => b.date.getTime() <= horizon && b.date.getTime() >= now - 86400000)
    .sort((a, b) => a.date - b.date);
}

// Today's docket — the prioritized daily agenda above the fold. Each row is a
// strong figure + a specific statement (real boards, real ages)
// + one direct action. Rows appear only when actionable; urgent first.
export function buildDocket(kpis, pulse, boards = [], incoming = []) {
  const rows = [];
  const faces = incoming.map((a) => a.photo).filter(Boolean).slice(0, 5);

  if (kpis.pendingReview > 0) {
    const oldest = kpis.pendingOldestDaysAgo;
    rows.push({
      key: 'review',
      figure: kpis.pendingReview,
      statement: `applicant${kpis.pendingReview === 1 ? '' : 's'} awaiting review`,
      sub: oldest ? `Oldest waiting ${oldest} day${oldest === 1 ? '' : 's'}` : null,
      faces,
      to: '/dashboard/agency/submissions',
      cta: 'Review applications',
      tone: (oldest || 0) >= 14 ? 'urgent' : 'default',
    });
  }

  if (pulse.closingWeek > 0) {
    const closing = closingBoards(boards);
    const named = closing.slice(0, 2)
      .map((b) => `“${b.name}” ${closesWhen(b.date)}`)
      .join(', ');
    const more = closing.length > 2 ? ` · ${closing.length - 2} more` : '';
    const todayCount = kpis.castingsClosingToday
      || closing.filter((b) => closesWhen(b.date) === 'closes today').length;
    rows.push({
      key: 'closing',
      figure: pulse.closingWeek,
      statement: `board${pulse.closingWeek === 1 ? '' : 's'} close this week`,
      sub: named ? `${named}${more}` : null,
      to: '/dashboard/agency/signing',
      cta: 'Open casting',
      tone: todayCount > 0 ? 'urgent' : 'default',
    });
  }

  if (pulse.newToday > 0) {
    rows.push({
      key: 'new',
      figure: pulse.newToday,
      statement: `new applicant${pulse.newToday === 1 ? '' : 's'} today`,
      sub: null,
      faces,
      to: '/dashboard/agency/submissions',
      cta: 'Triage inbox',
      tone: 'positive',
    });
  }


  rows.sort((a, b) => {
    const urgency = (a.tone === 'urgent' ? 0 : 1) - (b.tone === 'urgent' ? 0 : 1);
    if (urgency !== 0) return urgency;
    return DOCKET_PRIORITY.indexOf(a.key) - DOCKET_PRIORITY.indexOf(b.key);
  });

  return { rows: rows.slice(0, 4), allClear: rows.length === 0 };
}

// /overview/recent-applicants returns:
// { applicationId, profileId, name, location, profileImage, slug, isNew }
export function mapApplicant(a) {
  const img = a.profileImage || a.avatar || a.photo || null;
  const isDefault = typeof img === 'string' && img.includes('default-avatar');
  return {
    id: a.applicationId ?? a.id,
    applicationId: a.applicationId ?? a.id,
    // `a.profileId` is explicitly `null` for an identity-backed applicant (no
    // Pholio account yet) — never fall through to the application id there,
    // or an unrelated id starts posing as a profile id.
    profileId: a.profileId ?? a.profile_id ?? null,
    name: a.name,
    photo: isDefault ? null : img,
    // Height, age and city are the whole facts line — no archetype, because
    // the endpoint never returned one and `Editorial` was therefore a word
    // invented for every card (talent-card metadata spec §8).
    heightCm: a.heightCm ?? a.height ?? a.height_cm ?? null,
    age: a.age ?? null,
    city: a.location || a.city || null,
    location: a.location || a.city || null,
    // No `'available'` fallback: an application with no status is not a
    // talent who is free to book, and the panel reads this to place a person
    // on the pipeline stepper.
    status: a.status || a.application_status || null,
    slug: a.slug || null,
  };
}
