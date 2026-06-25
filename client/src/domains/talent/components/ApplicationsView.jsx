import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Check,
  CircleDashed,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  Send,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/hooks/useAuth';
import ConfirmationDialog from '../../../shared/components/ui/ConfirmationDialog';
import PholioButton from '../../../shared/components/ui/PholioButton';
import ProfileGateBanner from '../../../shared/components/gating/ProfileGateBanner';
import { checkGatingStatus, getProfileGateFeature } from '../../../shared/utils/profileGating';
import { talentApi } from '../api/talent';
import { statusConfig } from '../utils/applicationStatus';
import ApplicationInterviews from './ApplicationInterviews';
import ApplicationMessages from './ApplicationMessages';
import './ApplicationsView.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'accepted', label: 'Won' },
  { id: 'closed', label: 'Closed' },
];

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function dateLabel(value, options = {}) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: options.year === false ? undefined : 'numeric',
  });
}

function daysSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function relativeDate(value) {
  const days = daysSince(value);
  if (days === null) return 'Date pending';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  return dateLabel(value);
}

function websiteUrl(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

function applicationMatchesFilter(app, filter) {
  if (filter === 'all') return true;
  const config = statusConfig(app.status);
  if (filter === 'active') return config.tone === 'pending';
  if (filter === 'accepted') return config.tone === 'accepted';
  if (filter === 'closed') return config.tone === 'closed';
  return true;
}

function agencyInitial(name) {
  return String(name || 'Agency').trim().charAt(0).toUpperCase() || 'A';
}

function metricLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function ApplicationsView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, subscription, images } = useAuth();
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [withdrawingApplication, setWithdrawingApplication] = useState(null);

  const applicationsQuery = useQuery({
    queryKey: ['applications'],
    queryFn: talentApi.getApplications,
    staleTime: 1000 * 60,
    retry: 1,
  });

  const agenciesQuery = useQuery({
    queryKey: ['talent-agencies'],
    queryFn: talentApi.getAgencies,
    staleTime: 1000 * 60 * 3,
    retry: 1,
  });

  const withdrawMutation = useMutation({
    mutationFn: talentApi.withdrawApplication,
    onSuccess: () => {
      setWithdrawingApplication(null);
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.success('Application withdrawn');
    },
    onError: (err) => {
      toast.error(err?.message || 'Failed to withdraw application');
    },
  });

  const applications = useMemo(
    () =>
      asArray(applicationsQuery.data).sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
      ),
    [applicationsQuery.data],
  );

  const [searchParams] = useSearchParams();
  const deepLinkId = searchParams.get('application');

  const agencies = useMemo(() => asArray(agenciesQuery.data), [agenciesQuery.data]);
  const gating = useMemo(() => checkGatingStatus(profile, images), [profile, images]);
  const applicationGate = getProfileGateFeature('/dashboard/talent/applications');

  const selectedApplication =
    applications.find((app) => app.id === selectedId) ||
    (deepLinkId ? applications.find((app) => app.id === deepLinkId) : null) ||
    applications[0] ||
    null;
  const filteredApplications = applications.filter((app) => applicationMatchesFilter(app, activeFilter));
  const appliedAgencyIds = new Set(
    applications
      .filter((app) => app.status !== 'withdrawn')
      .map((app) => app.agency_id)
      .filter(Boolean),
  );
  const openAgencies = agencies
    .filter((agency) => !appliedAgencyIds.has(agency.id))
    .slice(0, 6);

  const activeCount = applications.filter((app) => statusConfig(app.status).tone === 'pending').length;
  const acceptedCount = applications.filter((app) => statusConfig(app.status).tone === 'accepted').length;
  const closedCount = applications.filter((app) => statusConfig(app.status).tone === 'closed').length;
  const monthCount = applications.filter((app) => {
    if (!app.created_at) return false;
    const created = new Date(app.created_at);
    const now = new Date();
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;
  const isPro = !!subscription?.isPro;
  const monthlyLimitLabel = isPro ? 'Unlimited' : `${monthCount}/5`;

  const openApplyFlow = (agency = null) => {
    const params = agency?.id ? `?agency=${encodeURIComponent(agency.id)}` : '';
    navigate(`/dashboard/talent/applications/apply${params}`);
  };

  const confirmWithdraw = () => {
    if (!withdrawingApplication) return;
    withdrawMutation.mutate(withdrawingApplication.id);
  };

  if (applicationsQuery.isError) {
    const isProfileMissing = applicationsQuery.error?.status === 404;
    return (
      <div className="applications-view-container">
        <section className="app-error-state" role="alert">
          <h1>Couldn&apos;t load the market ledger.</h1>
          <p>
            {isProfileMissing
              ? 'Profile setup needs attention before applications can load.'
              : 'The applications service did not respond.'}
          </p>
          <div className="app-error-actions">
            {isProfileMissing && (
              <PholioButton as="a" href="/dashboard/talent/profile" variant="solid">
                Profile
                <ArrowUpRight size={14} aria-hidden />
              </PholioButton>
            )}
            <PholioButton
              variant="secondary"
              onClick={() => applicationsQuery.refetch()}
              disabled={applicationsQuery.isFetching}
            >
              {applicationsQuery.isFetching ? 'Checking...' : 'Try Again'}
            </PholioButton>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="applications-view-container">
      <header className="app-hero">
        <div className="app-hero__copy" data-tour="market-hero">
          <h1 className="app-title">
            The <em>Market.</em>
          </h1>
          <div className="app-hero__sweep" aria-hidden />
          <p className="app-standfirst">Market submissions, decisions, and next moves.</p>
          <PholioButton variant="solid" onClick={() => openApplyFlow()}>
            Apply New <Send size={14} aria-hidden />
          </PholioButton>
        </div>

        <dl className="app-market-index" aria-label="Application summary">
          <div>
            <dt>Total</dt>
            <dd>{applicationsQuery.isLoading ? '-' : applications.length}</dd>
          </div>
          <div>
            <dt>Active</dt>
            <dd>{applicationsQuery.isLoading ? '-' : activeCount}</dd>
          </div>
          <div>
            <dt>Won</dt>
            <dd>{applicationsQuery.isLoading ? '-' : acceptedCount}</dd>
          </div>
          <div>
            <dt>This Month</dt>
            <dd>{applicationsQuery.isLoading ? '-' : monthlyLimitLabel}</dd>
          </div>
        </dl>
      </header>

      <section className="app-proofline" aria-label="Application status summary">
        <div className="app-proofline__lead">
          <strong>{metricLabel(activeCount, 'live submission', 'live submissions')}</strong>
        </div>
        <div className="app-proofline__track" aria-hidden>
          <span style={{ width: `${applications.length ? (activeCount / applications.length) * 100 : 0}%` }} />
        </div>
        <div className="app-proofline__states">
          <span>{metricLabel(activeCount, 'under review', 'under review')}</span>
          <span>{metricLabel(acceptedCount, 'won', 'won')}</span>
          <span>{metricLabel(closedCount, 'closed', 'closed')}</span>
        </div>
      </section>

      <div className="app-workspace">
        <section className="app-ledger" aria-labelledby="application-ledger-title">
          <div className="app-section-head" data-tour="app-ledger">
            <h2 id="application-ledger-title">Application history</h2>
            <div className="app-filter-row" aria-label="Filter applications">
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`app-filter ${activeFilter === filter.id ? 'app-filter--active' : ''}`}
                  onClick={() => setActiveFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {applicationsQuery.isLoading ? (
            <div className="app-ledger-list" aria-label="Loading applications">
              {[1, 2, 3].map((item) => (
                <div key={item} className="app-ledger-card app-ledger-card--skeleton" />
              ))}
            </div>
          ) : filteredApplications.length > 0 ? (
            <ol className="app-ledger-list">
              {filteredApplications.map((app, index) => {
                const config = statusConfig(app.status);
                const StatusIcon = config.icon;
                const isSelected = selectedApplication?.id === app.id;
                return (
                  <li key={app.id} className={`app-ledger-item app-ledger-item--${config.tone}`}>
                    <button
                      type="button"
                      className={`app-ledger-card ${isSelected ? 'app-ledger-card--selected' : ''}`}
                      onClick={() => setSelectedId(app.id)}
                    >
                      <span className="app-ledger-card__index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="app-ledger-card__main">
                        <span className="app-ledger-card__agency">{app.agency_name || 'Unknown Agency'}</span>
                        <span className="app-ledger-card__meta">
                          <MapPin size={13} aria-hidden />
                          {app.agency_location || 'Location pending'}
                        </span>
                      </span>
                      <span className={`app-status app-status--${config.tone}`}>
                        <StatusIcon size={13} aria-hidden />
                        {config.short}
                      </span>
                      <span className="app-ledger-card__date">{relativeDate(app.created_at)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : applications.length === 0 ? (
            <div className="app-empty-state">
              <CircleDashed size={28} strokeWidth={1.4} aria-hidden />
              <h3>You haven&apos;t applied yet</h3>
              <p>Browse agencies below and submit your first application.</p>
            </div>
          ) : (
            <div className="app-empty-state">
              <CircleDashed size={28} strokeWidth={1.4} aria-hidden />
              <h3>No applications in this view</h3>
            </div>
          )}
        </section>

        <aside className="app-detail-panel" aria-label="Application detail">
          {selectedApplication ? (
            <ApplicationDetail
              app={selectedApplication}
              onWithdraw={() => setWithdrawingApplication(selectedApplication)}
              isWithdrawing={withdrawMutation.isPending && withdrawingApplication?.id === selectedApplication.id}
            />
          ) : (
            <div className="app-detail-empty">
              <p>No application selected.</p>
            </div>
          )}
        </aside>
      </div>

      <section className="app-discovery" id="app-discovery" aria-labelledby="application-discovery-title">
        <div className="app-section-head app-section-head--discovery" data-tour="agency-discovery">
          <h2 id="application-discovery-title">Next submissions</h2>
          <p>{agenciesQuery.isLoading ? 'Loading agencies' : `${openAgencies.length} available`}</p>
        </div>

        {gating.isBlocked && (
          <ProfileGateBanner
            variant="compact"
            featureName={applicationGate.featureName}
            featureLabel={applicationGate.featureLabel}
            description={applicationGate.description}
            {...gating}
          />
        )}

        {agenciesQuery.isLoading ? (
          <div className="app-agency-grid">
            {[1, 2, 3].map((item) => (
              <div key={item} className="app-agency-card app-agency-card--skeleton" />
            ))}
          </div>
        ) : openAgencies.length > 0 ? (
          <div className="app-agency-grid">
            {openAgencies.map((agency) => (
              <article key={agency.id} className="app-agency-card">
                <div className="app-agency-card__mark" aria-hidden>
                  {agency.profile_image ? (
                    <img src={agency.profile_image} alt="" />
                  ) : (
                    <span>{agencyInitial(agency.name)}</span>
                  )}
                </div>
                <div className="app-agency-card__body">
                  <h3>{agency.name || 'Unnamed Agency'}</h3>
                  <p className="app-agency-card__location">
                    <MapPin size={13} aria-hidden />
                    {agency.agency_location || 'Global'}
                  </p>
                  <p className="app-agency-card__desc">
                    {agency.agency_description || 'Open to new talent submissions.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="app-agency-card__apply"
                  onClick={() => openApplyFlow(agency)}
                  disabled={gating.isBlocked}
                >
                  {gating.isBlocked ? (
                    <>
                      <Lock size={14} aria-hidden />
                      Locked
                    </>
                  ) : (
                    <>
                      Compose
                      <ArrowUpRight size={14} aria-hidden />
                    </>
                  )}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="app-empty-state app-empty-state--discovery">
            <Check size={28} strokeWidth={1.4} aria-hidden />
            <h3>Every available agency is already in your ledger</h3>
          </div>
        )}
      </section>

      <ConfirmationDialog
        isOpen={withdrawingApplication !== null}
        title="Withdraw Application?"
        message={`Withdraw the application to ${withdrawingApplication?.agency_name || 'this agency'}?`}
        confirmLabel="Withdraw"
        cancelLabel="Keep"
        variant="warning"
        onConfirm={confirmWithdraw}
        onCancel={() => setWithdrawingApplication(null)}
      />
    </div>
  );
}

function ApplicationDetail({ app, onWithdraw, isWithdrawing }) {
  const config = statusConfig(app.status);
  const StatusIcon = config.icon;
  const site = websiteUrl(app.agency_website);
  const canWithdraw = config.tone === 'pending';
  const age = daysSince(app.created_at);

  // No scheduler exists to auto-expire stale applications, so surface a calm,
  // truthful cue when an active application has gone quiet for a while.
  const daysWaiting = daysSince(app.updated_at || app.created_at);
  const isStale = config.tone === 'pending' && daysWaiting !== null && daysWaiting >= 21;

  const activityQuery = useQuery({
    queryKey: ['application-activity', app.id],
    queryFn: () => talentApi.getApplicationActivity(app.id),
    enabled: !!app.id,
    staleTime: 1000 * 30,
  });
  const history = asArray(activityQuery.data);

  return (
    <div className="app-detail">
      <div className="app-detail__mast">
        <div className="app-detail__agency">
          <div className="app-detail__mark" aria-hidden>
            {app.agency_logo ? <img src={app.agency_logo} alt="" /> : <span>{agencyInitial(app.agency_name)}</span>}
          </div>
          <div>
            <h2>{app.agency_name || 'Unknown Agency'}</h2>
            <p>
              <MapPin size={13} aria-hidden />
              {app.agency_location || 'Location pending'}
            </p>
          </div>
        </div>
      </div>

      <div className={`app-detail__status app-detail__status--${config.tone}`}>
        <StatusIcon size={16} aria-hidden />
        <span>{config.label}</span>
      </div>

      <p className="app-detail__summary">{config.detail}</p>

      <div className="app-detail__timeline">
        <div>
          <span>Submitted</span>
          <strong>{dateLabel(app.created_at)}</strong>
        </div>
        <div>
          <span>Updated</span>
          <strong>{dateLabel(app.updated_at || app.created_at)}</strong>
        </div>
        <div>
          <span>Age</span>
          <strong>{age === null ? 'Pending' : `${age}d`}</strong>
        </div>
      </div>

      <div className="app-detail__next">
        <p>{config.next}</p>
        {isStale && (
          <p className="app-detail__stale">
            It&apos;s been {daysWaiting} days without an update. You can reach out via the
            agency&apos;s site, or withdraw to free this slot.
          </p>
        )}
      </div>

      <ApplicationInterviews applicationId={app.id} />

      <ApplicationMessages applicationId={app.id} agencyName={app.agency_name} />

      <div className="app-detail__history">
        <span className="app-detail__history-title">History</span>
        <ol className="app-detail__history-list">
          <li className="app-detail__history-row">
            <span className="app-detail__history-dot" aria-hidden />
            <span className="app-detail__history-label">Submitted</span>
            <span className="app-detail__history-date">{dateLabel(app.created_at)}</span>
          </li>
          {history.map((row) => (
            <li key={row.id} className="app-detail__history-row">
              <span className="app-detail__history-dot" aria-hidden />
              <span className="app-detail__history-label">
                {statusConfig(row.metadata?.new_status).label}
              </span>
              <span className="app-detail__history-date">{dateLabel(row.created_at)}</span>
            </li>
          ))}
        </ol>
      </div>

      {app.note && (
        <div className="app-detail__note">
          <span className="app-detail__note-title">Your note</span>
          <p className="app-detail__note-text">{app.note}</p>
        </div>
      )}

      <div className="app-detail__actions">
        {site && (
          <PholioButton as="a" href={site} target="_blank" rel="noreferrer" variant="secondary">
            Visit Agency
            <ArrowUpRight size={14} aria-hidden />
          </PholioButton>
        )}
        {canWithdraw && (
          <PholioButton variant="danger" onClick={onWithdraw} disabled={isWithdrawing}>
            {isWithdrawing ? (
              <>
                <Loader2 size={13} className="app-spin" aria-hidden />
                Withdrawing
              </>
            ) : (
              <>
                <X size={13} aria-hidden />
                Withdraw
              </>
            )}
          </PholioButton>
        )}
      </div>

      <div className="app-detail__package">
        <a href="/dashboard/talent/media">Book</a>
        <a href="/dashboard/talent/profile">Profile</a>
        <a href="/dashboard/talent/media">Comp Card</a>
      </div>
    </div>
  );
}
