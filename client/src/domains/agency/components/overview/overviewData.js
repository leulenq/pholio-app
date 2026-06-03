const PIPELINE_COLORS = {
  submitted: '#c4bba8', under_review: '#C9A55A', shortlisted: '#16130D',
  booked: '#7d9b82', passed: '#e3dac9',
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
  return rows.map((r) => ({
    label: r.label || r.stage || '',
    count: r.count || 0,
    pct: Math.round(((r.count || 0) / total) * 100),
    color: PIPELINE_COLORS[(r.key || r.stage || '').toLowerCase()] || '#c4bba8',
  }));
}

export function selectAlerts(data) {
  return Array.isArray(data?.alerts) ? data.alerts : [];
}

export function mapApplicant(a) {
  return {
    id: a.id,
    profileId: a.profile_id ?? a.id,
    name: a.name,
    photo: a.avatar || a.photo || null,
    type: (a.archetype || 'editorial').toLowerCase(),
    typeLabel: a.archetype || 'Editorial',
    city: a.city || null,
    match: a.match ?? a.match_score ?? 0,
  };
}
