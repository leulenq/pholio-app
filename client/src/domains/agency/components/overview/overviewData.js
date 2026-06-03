// Maps the real /api/agency/overview + /overview/recent-applicants payloads into
// render-ready shapes, with safe fallbacks for empty/new agencies.
//
// Pipeline statuses arrive as display labels (Submitted, Shortlisted, Booked,
// Passed, Declined); we key colors off the lowercased label.
const PIPELINE_COLORS = {
  submitted: '#c4bba8',
  shortlisted: '#C9A55A',
  booked: '#7d9b82',
  passed: '#16130D',
  declined: '#e3dac9',
};

export function selectKpis(data) {
  const k = data?.kpis || {};
  return {
    pendingReview: k.pendingReview ?? 0,
    activeCastings: k.activeCastings ?? 0,
    rosterSize: k.rosterSize ?? 0,
    placementRate: k.placementRate ?? 0,
    utilization: k.utilization ?? 0,
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
  };
}
