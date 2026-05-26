import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CircleDashed,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  Send,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/hooks/useAuth';
import ConfirmationDialog from '../../../shared/components/ui/ConfirmationDialog';
import ProfileGateBanner from '../../../shared/components/gating/ProfileGateBanner';
import { checkGatingStatus, getProfileGateFeature } from '../../../shared/utils/profileGating';
import { talentApi } from '../api/talent';
import './ApplicationsView.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'accepted', label: 'Accepted' },
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

function statusConfig(status) {
  const normalized = String(status || 'pending').toLowerCase();
  const configs = {
    pending: {
      label: 'Under Review',
      short: 'Review',
      tone: 'pending',
      icon: Clock,
      next: 'Agency review is open.',
      detail: 'The agency has your current profile and book.',
    },
    reviewing: {
      label: 'In Review',
      short: 'Review',
      tone: 'pending',
      icon: Clock,
      next: 'Agency review is active.',
      detail: 'Your application is moving through the agency queue.',
    },
    shortlisted: {
      label: 'Shortlisted',
      short: 'Shortlist',
      tone: 'accepted',
      icon: Check,
      next: 'Watch for a direct agency signal.',
      detail: 'Your application has been marked for closer review.',
    },
    accepted: {
      label: 'Accepted',
      short: 'Accepted',
      tone: 'accepted',
      icon: Check,
      next: 'Prepare for agency follow-up.',
      detail: 'The agency has accepted your application.',
    },
    declined: {
      label: 'Not Selected',
      short: 'Closed',
      tone: 'closed',
      icon: AlertCircle,
      next: 'This thread is closed.',
      detail: 'Keep the book current for future submissions.',
    },
    rejected: {
      label: 'Not Selected',
      short: 'Closed',
      tone: 'closed',
      icon: AlertCircle,
      next: 'This thread is closed.',
      detail: 'Keep the book current for future submissions.',
    },
  };
  return configs[normalized] || configs.pending;
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
  const queryClient = useQueryClient();
  const { profile, subscription } = useAuth();
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [withdrawingApplication, setWithdrawingApplication] = useState(null);
  const [applyingId, setApplyingId] = useState(null);

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

  const applyMutation = useMutation({
    mutationFn: talentApi.createApplication,
    onSuccess: () => {
      setApplyingId(null);
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['talent-agencies'] });
      toast.success('Application submitted');
    },
    onError: (err) => {
      setApplyingId(null);
      if (err?.data?.upgradeRequired) {
        toast.error('Monthly application limit reached.');
        return;
      }
      toast.error(err?.message || 'Failed to submit application');
    },
  });

  const applications = useMemo(
    () =>
      asArray(applicationsQuery.data).sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
      ),
    [applicationsQuery.data],
  );

  const agencies = useMemo(() => asArray(agenciesQuery.data), [agenciesQuery.data]);
  const gating = useMemo(() => checkGatingStatus(profile), [profile]);
  const applicationGate = getProfileGateFeature('/dashboard/talent/applications');

  const selectedApplication = applications.find((app) => app.id === selectedId) || applications[0] || null;
  const filteredApplications = applications.filter((app) => applicationMatchesFilter(app, activeFilter));
  const appliedAgencyIds = new Set(applications.map((app) => app.agency_id).filter(Boolean));
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

  const handleApply = (agency) => {
    if (gating.isBlocked) {
      toast.info('Complete your required profile fields before submitting to an agency.');
      return;
    }
    setApplyingId(agency.id);
    applyMutation.mutate({ agencyId: agency.id });
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
          <span className="app-kicker">Market</span>
          <h1>Couldn&apos;t load the market ledger.</h1>
          <p>
            {isProfileMissing
              ? 'Profile setup needs attention before applications can load.'
              : 'The applications service did not respond.'}
          </p>
          <div className="app-error-actions">
            {isProfileMissing && (
              <a href="/dashboard/talent/profile" className="app-primary-action">
                Profile
                <ArrowUpRight size={14} aria-hidden />
              </a>
            )}
            <button
              type="button"
              className="app-secondary-action"
              onClick={() => applicationsQuery.refetch()}
              disabled={applicationsQuery.isFetching}
            >
              {applicationsQuery.isFetching ? 'Retrying' : 'Retry'}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="applications-view-container">
      <header className="app-hero">
        <div className="app-hero__copy">
          <span className="app-kicker">Market</span>
          <h1 className="app-title">
            The <em>Market.</em>
          </h1>
          <div className="app-hero__sweep" aria-hidden />
          <p className="app-standfirst">Market submissions, decisions, and next moves.</p>
          <a href="#app-discovery" className="app-primary-action">
            <Send size={14} aria-hidden />
            Apply New
          </a>
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
            <dt>Accepted</dt>
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
          <span className="app-kicker">Signal</span>
          <strong>{metricLabel(activeCount, 'live submission', 'live submissions')}</strong>
        </div>
        <div className="app-proofline__track" aria-hidden>
          <span style={{ width: `${applications.length ? (activeCount / applications.length) * 100 : 0}%` }} />
        </div>
        <div className="app-proofline__states">
          <span>{metricLabel(activeCount, 'under review', 'under review')}</span>
          <span>{metricLabel(acceptedCount, 'accepted', 'accepted')}</span>
          <span>{metricLabel(closedCount, 'closed', 'closed')}</span>
        </div>
      </section>

      <div className="app-workspace">
        <section className="app-ledger" aria-labelledby="application-ledger-title">
          <div className="app-section-head">
            <span className="app-kicker">Ledger</span>
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
              <span className="app-kicker">Detail</span>
              <p>No application selected.</p>
            </div>
          )}
        </aside>
      </div>

      <section className="app-discovery" id="app-discovery" aria-labelledby="application-discovery-title">
        <div className="app-section-head app-section-head--discovery">
          <span className="app-kicker">Open Agencies</span>
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
                  onClick={() => handleApply(agency)}
                  disabled={applyMutation.isPending || gating.isBlocked}
                >
                  {gating.isBlocked ? (
                    <>
                      <Lock size={14} aria-hidden />
                      Locked
                    </>
                  ) : applyingId === agency.id ? (
                    <>
                      <Loader2 size={14} className="app-spin" aria-hidden />
                      Applying
                    </>
                  ) : (
                    <>
                      Apply
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

  return (
    <div className="app-detail">
      <div className="app-detail__mast">
        <span className="app-kicker">Selected Application</span>
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
        <span className="app-kicker">Next Signal</span>
        <p>{config.next}</p>
      </div>

      <div className="app-detail__actions">
        {site && (
          <a href={site} target="_blank" rel="noreferrer" className="app-secondary-action">
            Agency Site
            <ExternalLink size={13} aria-hidden />
          </a>
        )}
        {canWithdraw && (
          <button type="button" className="app-withdraw-action" onClick={onWithdraw} disabled={isWithdrawing}>
            {isWithdrawing ? (
              <>
                <Loader2 size={13} className="app-spin" aria-hidden />
                Withdrawing
              </>
            ) : (
              <>
                <XCircle size={13} aria-hidden />
                Withdraw
              </>
            )}
          </button>
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
