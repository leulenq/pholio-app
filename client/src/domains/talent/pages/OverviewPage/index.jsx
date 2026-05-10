import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../auth/hooks/useAuth';
import { useProfileStrength } from '../../hooks/useProfileStrength';
import { useAnalytics } from '../../hooks/useAnalytics';
import { talentApi } from '../../api/talent';
import { TierBadgeFromSubscription } from '../../../../shared/components/ui/TierBadge';
import PresencePanel from '../../../../shared/components/PresencePanel';
import ModuleCard from '../../../../shared/components/ModuleCard';
import StatBlock from '../../../../shared/components/StatBlock';
import { normalizeStrengthActions, getStrengthInterpretation } from '../../utils/strengthActions';
import './OverviewPage.css';

function applicationsFromPayload(data) {
  if (Array.isArray(data)) return data;
  if (data?.data && Array.isArray(data.data)) return data.data;
  return [];
}

export default function OverviewPage() {
  const { profile, images, subscription, isLoading: authLoading } = useAuth();
  const { score, nextSteps } = useProfileStrength();
  const { summary } = useAnalytics();

  const { data: applicationsPayload } = useQuery({
    queryKey: ['applications'],
    queryFn: () => talentApi.getApplications(),
    staleTime: 1000 * 60,
    retry: 1,
  });

  // ── Identity ──────────────────────────────────────────────────────────────
  const firstName = profile?.first_name || profile?.name?.split(' ')[0] || 'You';
  const joinDate  = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  // ── Presence panel ────────────────────────────────────────────────────────
  const actions        = normalizeStrengthActions(nextSteps);
  const interpretation = getStrengthInterpretation(score, actions.length);
  const photoUrl       = images?.[0]?.url ?? images?.[0]?.path ?? null;

  // ── Applications ──────────────────────────────────────────────────────────
  const applications = applicationsFromPayload(applicationsPayload);
  const pending   = applications.filter(a => a.status === 'pending').length;
  const accepted  = applications.filter(a => ['accepted', 'active'].includes(a.status)).length;
  const declined  = applications.filter(a => ['declined', 'rejected'].includes(a.status)).length;

  // ── Traction — summary.views is { total, changePct, ... } ─────────────────
  const profileViews   = summary?.views?.total ?? 0;
  const viewsDelta     = summary?.views?.changePct ?? summary?.views?.changePercent ?? null;
  const portfolioOpens = summary?.portfolioOpens ?? summary?.portfolio_opens ?? summary?.portfolioClicks ?? 0;
  const agencyCount    = summary?.agencyCount ?? summary?.agency_count ?? null;

  if (authLoading) {
    return (
      <div className="ov-loading">
        <div className="ov-spinner" />
      </div>
    );
  }

  return (
    <div className="ov-page">

      {/* Greeting */}
      <div className="ov-greeting">
        <div className="ov-greeting-left">
          <span className="ov-eyebrow">Welcome back,</span>
          <h1 className="ov-name">
            {firstName}
            <TierBadgeFromSubscription
              subscription={subscription}
              size="md"
              className="ov-tier-badge"
            />
          </h1>
        </div>
        {joinDate && (
          <div className="ov-greeting-meta">
            <span className="ov-meta-label">Member since</span>
            <span className="ov-meta-value">{joinDate}</span>
          </div>
        )}
      </div>

      {/* Identity Presence Panel */}
      <PresencePanel
        score={score}
        interpretation={interpretation}
        actions={actions}
        photoUrl={photoUrl}
      />

      {/* Supporting modules */}
      <div className="ov-modules">

        <ModuleCard label="Applications">
          {applications.length === 0 ? (
            <p className="ov-empty">No applications yet.</p>
          ) : (
            <div className="ov-stat-row">
              <StatBlock number={pending}  label="Pending"  color="pending"  />
              <div className="ov-stat-divider" />
              <StatBlock number={accepted} label="Accepted" color="accepted" />
              <div className="ov-stat-divider" />
              <StatBlock number={declined} label="Declined" color="declined" />
            </div>
          )}
        </ModuleCard>

        <ModuleCard label="Traction this week">
          {!summary ? (
            <p className="ov-empty">Stats appear after your first week active.</p>
          ) : (
            <div className="ov-stat-row">
              <StatBlock
                number={profileViews >= 1000
                  ? `${(profileViews / 1000).toFixed(1)}k`
                  : profileViews}
                label="Profile Views"
                delta={viewsDelta > 0
                  ? { text: `+${viewsDelta}%`, direction: 'up' }
                  : null}
                subLine={viewsDelta > 0 ? 'Highest week in last 30 days' : null}
              />
              <div className="ov-stat-divider" />
              <StatBlock
                number={portfolioOpens}
                label="Portfolio Opens"
                subLine={agencyCount
                  ? `From ${agencyCount} ${agencyCount === 1 ? 'agency' : 'agencies'} this week`
                  : null}
              />
            </div>
          )}
        </ModuleCard>

      </div>
    </div>
  );
}
