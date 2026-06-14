// Maps the real /api/agency/overview + /overview/recent-applicants payloads into
// render-ready shapes, with safe fallbacks for empty/new agencies.
//
// Pipeline statuses arrive as display labels (Submitted, Shortlisted, Booked,
// Passed, Declined); we key colors off the lowercased label.
const PIPELINE_COLORS = {
  booked: '#050505',
  shortlisted: '#C9A55A',
  submitted: '#2D2A26',
  passed: '#6B6560',
  declined: '#C8C2BA',
};

// The overview endpoint returns each KPI as a wrapper object, not a scalar:
//   pendingReview { count, oldestDaysAgo }   activeCastings { count, closingToday }
//   rosterSize { count, trend, changeThisMonth }   placementRate { current, lastSeason }
//   utilization { active, total, pct }
// We flatten to the scalar each surface renders, plus the useful sub-fields for deltas.
export function selectKpis(data) {
  const k = data?.kpis || {};
  const pendingReview = k.pendingReview || {};
  const activeCastings = k.activeCastings || {};
  const rosterSize = k.rosterSize || {};
  const placementRate = k.placementRate || {};
  const utilization = k.utilization || {};
  return {
    pendingReview: pendingReview.count ?? 0,
    pendingOldestDaysAgo: pendingReview.oldestDaysAgo ?? null,
    activeCastings: activeCastings.count ?? 0,
    castingsClosingToday: activeCastings.closingToday ?? 0,
    rosterSize: rosterSize.count ?? 0,
    rosterChangeThisMonth: rosterSize.changeThisMonth ?? 0,
    placementRate: placementRate.current ?? 0,
    placementLastSeason: placementRate.lastSeason ?? null,
    utilization: utilization.active ?? 0,
    utilizationPct: utilization.pct ?? 0,
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
    idleTalent: p.idleTalent ?? 0,
    avgMatchScore: p.avgMatchScore ?? null,
    discoverableCount: p.discoverableCount ?? 0,
    newTalentWeek: p.newTalentWeek ?? 0,
  };
}

export function selectTalentMix(data) {
  return Array.isArray(data?.talentMix) ? data.talentMix : [];
}

// "Where to go next" — derive recommended actions from pulse + roster mix, by urgency.
export function buildNextMoves(pulse, talentMix = []) {
  const moves = [];
  if (pulse.closingWeek > 0) {
    moves.push({
      id: 'closing', tone: 'urgent',
      text: `${pulse.closingWeek} board${pulse.closingWeek === 1 ? '' : 's'} close this week — finalize submissions`,
      cta: { label: 'Review casting', to: '/dashboard/agency/casting' },
    });
  }
  if (pulse.idleTalent > 0) {
    moves.push({
      id: 'idle', tone: 'default',
      text: `${pulse.idleTalent} signed talent not submitted in 30 days`,
      cta: { label: 'Activate roster', to: '/dashboard/agency/roster' },
    });
  }
  const thin = [...talentMix].sort((a, b) => a.pct - b.pct)[0];
  if (thin && talentMix.length > 1 && thin.pct <= 15) {
    moves.push({
      id: 'thin', tone: 'default',
      text: `Low ${thin.name} representation on roster (${thin.pct}%)`,
      cta: { label: 'Scout talent', to: '/dashboard/agency/discover' },
    });
  }
  if (pulse.newTalentWeek > 0) {
    moves.push({
      id: 'newtalent', tone: 'positive',
      text: `${pulse.newTalentWeek} new discoverable talent joined this week`,
      cta: { label: 'Discover', to: '/dashboard/agency/discover' },
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
// strong figure + a specific statement (real boards, real ages, real scores)
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
      avgMatch: pulse.avgMatchScore,
      faces,
      to: '/dashboard/agency/applicants',
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
      avgMatch: null,
      to: '/dashboard/agency/casting',
      cta: 'Open casting',
      tone: todayCount > 0 ? 'urgent' : 'default',
    });
  }

  if (pulse.newToday > 0) {
    const strong = incoming.filter((a) => (a.match || 0) >= 85).length;
    rows.push({
      key: 'new',
      figure: pulse.newToday,
      statement: `new applicant${pulse.newToday === 1 ? '' : 's'} today`,
      sub: strong ? `${strong} scoring 85 or higher` : null,
      avgMatch: null,
      faces,
      to: '/dashboard/agency/applicants',
      cta: 'Triage inbox',
      tone: 'positive',
    });
  }

  if (pulse.idleTalent > 0) {
    rows.push({
      key: 'idle',
      figure: pulse.idleTalent,
      statement: `talent idle on the bench`,
      sub: kpis.rosterSize
        ? `Of ${kpis.rosterSize} on roster · no submissions in 30 days`
        : 'No submissions in 30 days',
      avgMatch: null,
      to: '/dashboard/agency/roster',
      cta: 'Activate roster',
      tone: 'default',
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
// { applicationId, profileId, name, location, profileImage, matchScore, slug, isNew }
export function mapApplicant(a) {
  const img = a.profileImage || a.avatar || a.photo || null;
  const isDefault = typeof img === 'string' && img.includes('default-avatar');
  return {
    id: a.applicationId ?? a.id,
    applicationId: a.applicationId ?? a.id,
    profileId: a.profileId ?? a.profile_id ?? a.id,
    name: a.name,
    photo: isDefault ? null : img,
    type: (a.archetype || 'editorial').toLowerCase(),
    typeLabel: a.archetype || 'Editorial',
    city: a.location || a.city || null,
    location: a.location || a.city || null,
    status: a.status || a.application_status || 'available',
    match: a.matchScore ?? a.match ?? a.match_score ?? 0,
    slug: a.slug || null,
  };
}
