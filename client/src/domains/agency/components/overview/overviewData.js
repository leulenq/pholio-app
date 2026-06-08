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

export function selectAlerts(data) {
  return Array.isArray(data?.alerts) ? data.alerts : [];
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

const ATTENTION_PRIORITY = ['review', 'closing', 'new', 'idle'];

function attentionScore(item) {
  let score = item.n || 0;
  if (item.tone === 'urgent') score += 1000;
  if (item.tone === 'positive') score += 100;
  return score;
}

export function buildAttentionItems(kpis, pulse) {
  return [
    {
      key: 'review',
      n: kpis.pendingReview,
      label: 'Awaiting review',
      sub: kpis.pendingOldestDaysAgo ? `oldest ${kpis.pendingOldestDaysAgo}d` : 'all current',
      to: '/dashboard/agency/applicants',
      tone: (kpis.pendingOldestDaysAgo || 0) >= 14 ? 'urgent' : 'default',
      cta: 'Review applications',
      context: kpis.activeCastings > 0
        ? { n: kpis.activeCastings, label: kpis.activeCastings === 1 ? 'active casting' : 'active castings' }
        : null,
    },
    {
      key: 'closing',
      n: pulse.closingWeek,
      label: 'Close this week',
      sub: kpis.castingsClosingToday ? `${kpis.castingsClosingToday} today` : 'across boards',
      to: '/dashboard/agency/casting',
      tone: kpis.castingsClosingToday > 0 ? 'urgent' : 'default',
      cta: 'Open casting',
      context: kpis.activeCastings > 0
        ? { n: kpis.activeCastings, label: 'active total' }
        : null,
    },
    {
      key: 'new',
      n: pulse.newToday,
      label: 'New today',
      sub: 'awaiting triage',
      to: '/dashboard/agency/applicants',
      tone: 'positive',
      cta: 'Triage inbox',
      context: kpis.pendingReview > 0
        ? { n: kpis.pendingReview, label: 'total pending' }
        : null,
    },
    {
      key: 'idle',
      n: pulse.idleTalent,
      label: 'Idle bench',
      sub: 'unsubmitted 30d',
      to: '/dashboard/agency/roster',
      tone: 'default',
      cta: 'Activate roster',
      context: kpis.rosterSize > 0
        ? { n: kpis.rosterSize, label: 'on roster' }
        : null,
    },
  ];
}

export function pickOverviewHero(attention) {
  const active = attention.filter((a) => a.n > 0);
  if (!active.length) {
    return {
      kind: 'clear',
      key: 'clear',
      label: 'All caught up',
      sub: 'No boards closing today and inbox is current.',
      to: '/dashboard/agency/discover',
      cta: 'Scout talent',
      tone: 'positive',
    };
  }

  const sorted = [...active].sort((a, b) => {
    const toneDiff = attentionScore(b) - attentionScore(a);
    if (toneDiff !== 0) return toneDiff;
    return ATTENTION_PRIORITY.indexOf(a.key) - ATTENTION_PRIORITY.indexOf(b.key);
  });

  const top = sorted[0];
  return { kind: 'action', ...top };
}

export function buildHealthStats(kpis) {
  const rosterHint = kpis.rosterChangeThisMonth
    ? `+${kpis.rosterChangeThisMonth} this month`
    : null;
  const castingHint = kpis.castingsClosingToday
    ? `${kpis.castingsClosingToday} close today`
    : kpis.activeCastings ? 'active now' : null;
  const placementHint = kpis.placementLastSeason != null
    ? `was ${kpis.placementLastSeason}%`
    : null;

  return [
    {
      label: 'Active castings',
      value: kpis.activeCastings,
      hint: castingHint,
    },
    {
      label: 'Roster',
      value: kpis.rosterSize,
      hint: rosterHint,
    },
    {
      label: 'Placement rate',
      value: kpis.placementRate,
      suffix: '%',
      hint: placementHint,
    },
    {
      label: 'In market',
      value: kpis.utilization,
      hint: kpis.utilizationPct ? `${kpis.utilizationPct}% of roster` : 'on submission',
    },
  ];
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
