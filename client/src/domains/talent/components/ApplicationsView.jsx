import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  CircleDashed,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  Send,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { TALENT_NOTIFICATIONS_QUERY_KEY } from '../../../shared/components/NotificationCenter/NotificationCenter';
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

function asMediaSets(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.sets)) return payload.sets;
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

function imageUrl(image) {
  return image?.public_url || image?.url || image?.path || null;
}

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function hasShotType(image, types) {
  const shot = normalizeToken(image?.shot_type);
  const imageType = normalizeToken(image?.image_type);
  return types.includes(shot) || types.includes(imageType);
}

function measurementValue(profile, keys) {
  for (const key of keys) {
    const value = profile?.[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}


function agencyTypeLabel(agency) {
  return agency?.division || agency?.type || agency?.agency_type || 'Open representation';
}

export default function ApplicationsView() {
  const queryClient = useQueryClient();
  const { profile, subscription, images: authImages = [] } = useAuth();
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [withdrawingApplication, setWithdrawingApplication] = useState(null);
  const [applyingId, setApplyingId] = useState(null);
  const [isApplyFlowOpen, setIsApplyFlowOpen] = useState(false);
  const [selectedAgencyId, setSelectedAgencyId] = useState(null);
  const [selectedMediaSetId, setSelectedMediaSetId] = useState('current');
  const [selectedCompCardId, setSelectedCompCardId] = useState('current');
  const [applicationNote, setApplicationNote] = useState('');
  const [hasSubmissionConsent, setHasSubmissionConsent] = useState(false);
  const [submittedApplication, setSubmittedApplication] = useState(null);

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

  const mediaSetsQuery = useQuery({
    queryKey: ['talent-media-sets'],
    queryFn: talentApi.getMediaSets,
    enabled: isApplyFlowOpen,
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
    onSuccess: (_data, variables) => {
      setApplyingId(null);
      setApplicationNote('');
      setHasSubmissionConsent(false);
      setSubmittedApplication({
        agency: {
          id: variables?.agencyId,
          name: variables?.submissionPackage?.agencyName,
          agency_location: variables?.submissionPackage?.agencyLocation,
        },
        submittedAt: new Date().toISOString(),
        mediaSetId: variables?.submissionPackage?.mediaSetId,
        compCardId: variables?.submissionPackage?.compCardId,
      });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['talent-agencies'] });
      queryClient.invalidateQueries({ queryKey: TALENT_NOTIFICATIONS_QUERY_KEY });
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
  const mediaSets = useMemo(() => asMediaSets(mediaSetsQuery.data), [mediaSetsQuery.data]);
  const gating = useMemo(() => checkGatingStatus(profile), [profile]);
  const applicationGate = getProfileGateFeature('/dashboard/talent/applications');

  const selectedApplication = applications.find((app) => app.id === selectedId) || applications[0] || null;
  const filteredApplications = applications.filter((app) => applicationMatchesFilter(app, activeFilter));
  const appliedAgencyIds = new Set(applications.map((app) => app.agency_id).filter(Boolean));
  const openAgencies = agencies
    .filter((agency) => !appliedAgencyIds.has(agency.id))
    .slice(0, 6);
  const selectedAgency = agencies.find((agency) => agency.id === selectedAgencyId) || openAgencies[0] || null;

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
    if (agency?.id) {
      setSelectedAgencyId(agency.id);
    } else if (!selectedAgencyId && openAgencies[0]?.id) {
      setSelectedAgencyId(openAgencies[0].id);
    }
    setSubmittedApplication(null);
    setHasSubmissionConsent(false);
    setIsApplyFlowOpen(true);
  };

  const closeApplyFlow = () => {
    setIsApplyFlowOpen(false);
    setApplicationNote('');
    setHasSubmissionConsent(false);
    setSubmittedApplication(null);
  };

  const handleApply = (agency, submissionPackage) => {
    if (gating.isBlocked) {
      toast.info('Complete your required profile fields before submitting to an agency.');
      return;
    }
    if (!agency?.id) return;
    setApplyingId(agency.id);
    applyMutation.mutate({
      agencyId: agency.id,
      note: applicationNote.trim() || undefined,
      submissionPackage,
    });
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
        <div className="app-hero__copy" data-tour="market-hero">
          <span className="app-kicker">Market</span>
          <h1 className="app-title">
            The <em>Market.</em>
          </h1>
          <div className="app-hero__sweep" aria-hidden />
          <p className="app-standfirst">Market submissions, decisions, and next moves.</p>
          <button type="button" className="app-primary-action" onClick={() => openApplyFlow()}>
            <Send size={14} aria-hidden />
            Apply New
          </button>
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
          <div className="app-section-head" data-tour="app-ledger">
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
        <div className="app-section-head app-section-head--discovery" data-tour="agency-discovery">
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
                  onClick={() => openApplyFlow(agency)}
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

      {isApplyFlowOpen &&
        createPortal(
          <AgencyApplicationModal
            agencies={openAgencies}
            selectedAgency={selectedAgency}
            selectedAgencyId={selectedAgencyId}
            onSelectAgency={setSelectedAgencyId}
            onClose={closeApplyFlow}
            onSubmit={handleApply}
            isSubmitting={applyMutation.isPending && applyingId === selectedAgency?.id}
            isBlocked={gating.isBlocked}
            profile={profile}
            images={authImages}
            mediaSets={mediaSets}
            mediaSetsLoading={mediaSetsQuery.isLoading}
            selectedMediaSetId={selectedMediaSetId}
            onSelectedMediaSetIdChange={setSelectedMediaSetId}
            selectedCompCardId={selectedCompCardId}
            onSelectedCompCardIdChange={setSelectedCompCardId}
            monthlyLimitLabel={monthlyLimitLabel}
            applicationNote={applicationNote}
            onApplicationNoteChange={setApplicationNote}
            hasSubmissionConsent={hasSubmissionConsent}
            onSubmissionConsentChange={setHasSubmissionConsent}
            submittedApplication={submittedApplication}
          />,
          document.body,
        )}
    </div>
  );
}

function AgencyApplicationModal({
  agencies,
  selectedAgency,
  selectedAgencyId,
  onSelectAgency,
  onClose,
  onSubmit,
  isSubmitting,
  isBlocked,
  profile,
  images,
  mediaSets,
  mediaSetsLoading,
  selectedMediaSetId,
  onSelectedMediaSetIdChange,
  selectedCompCardId,
  onSelectedCompCardIdChange,
  monthlyLimitLabel,
  applicationNote,
  onApplicationNoteChange,
  hasSubmissionConsent,
  onSubmissionConsentChange,
  submittedApplication,
}) {
  const [noteOpen, setNoteOpen] = useState(false);

  const hasAgencies = agencies.length > 0;
  const site = websiteUrl(selectedAgency?.agency_website);
  const visibleImages = images.filter((image) => !image.exclude_from_agency && imageUrl(image));
  const selectedImages = selectedMediaSetId === 'current'
    ? visibleImages
    : visibleImages.filter((image) => image.set_id === selectedMediaSetId);

  const hasHeadshot     = selectedImages.some((img) => hasShotType(img, ['headshot']));
  const hasFullBody     = selectedImages.some((img) => hasShotType(img, ['full_length', 'full_body', 'three_quarter']));
  const hasMeasurements = !!measurementValue(profile, ['height_cm'])  &&
                          !!measurementValue(profile, ['bust', 'bust_cm'])  &&
                          !!measurementValue(profile, ['waist', 'waist_cm']) &&
                          !!measurementValue(profile, ['hips', 'hips_cm']);
  const hasContact = !!profile?.email && !!profile?.phone;

  const checks = [
    { label: 'Headshot',     complete: hasHeadshot },
    { label: 'Full-body',    complete: hasFullBody },
    { label: 'Measurements', complete: hasMeasurements },
    { label: 'Contact',      complete: hasContact },
  ];
  const missingChecks = checks.filter((c) => !c.complete);

  const compCardOptions = [
    { id: 'current',   label: 'Current comp card' },
    { id: 'agency',    label: 'Agency review card' },
    { id: 'editorial', label: 'Editorial card' },
  ];
  const selectedMediaSetName = selectedMediaSetId === 'current'
    ? 'Current book'
    : mediaSets.find((s) => s.id === selectedMediaSetId)?.name || 'Selected image set';
  const selectedCompCardName = compCardOptions.find((o) => o.id === selectedCompCardId)?.label || 'Current comp card';

  const canSubmit = hasAgencies && selectedAgency && !isBlocked && missingChecks.length === 0 && hasSubmissionConsent;
  const packagePayload = {
    agencyName:       selectedAgency?.name           || null,
    agencyLocation:   selectedAgency?.agency_location || null,
    mediaSetId:       selectedMediaSetId,
    mediaSetName:     selectedMediaSetName,
    compCardId:       selectedCompCardId,
    compCardName:     selectedCompCardName,
    imageIds:         selectedImages.map((img) => img.id),
    readiness:        missingChecks.length === 0 ? 'Ready' : `Missing ${missingChecks.length}`,
    consentConfirmed: hasSubmissionConsent,
  };

  // portfolio frames: fill a 3×3 contact sheet (9 cells); empty cells stay dark
  const frames = Array.from({ length: 9 }, (_, i) => selectedImages[i] || visibleImages[i] || null);

  const agencyMeta = [
    selectedAgency?.agency_location,
    agencyTypeLabel(selectedAgency),
  ].filter(Boolean).join(' · ');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    /* Backdrop — clicking it closes the modal */
    <div
      className="agnapp"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agnapp-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal box — all content lives here, no z-index fights */}
      <div className="agnapp__box" onMouseDown={(e) => e.stopPropagation()}>

        {/* Close button — inside the box, always on top */}
        <button
          type="button"
          className="agnapp__close"
          onClick={onClose}
          aria-label="Close"
          disabled={isSubmitting}
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>

        {/* ── Success ───────────────────────────────────────── */}
        {submittedApplication ? (
          <div className="agnapp__sent" role="status">
            <span className="agnapp__sent-check" aria-hidden>&#10003;</span>
            <p className="agnapp__sent-pre">Submitted to</p>
            <h2 id="agnapp-title" className="agnapp__sent-name">
              {submittedApplication.agency?.name || selectedAgency?.name || 'Agency'}
            </h2>
            <p className="agnapp__sent-when">{dateLabel(submittedApplication.submittedAt)}</p>
            <dl className="agnapp__sent-meta">
              <div><dt>Portfolio</dt><dd>{selectedMediaSetName}</dd></div>
              <div><dt>Comp card</dt><dd>{selectedCompCardName}</dd></div>
              <div><dt>Status</dt><dd>Under review</dd></div>
            </dl>
            <button type="button" className="agnapp__sent-done" onClick={onClose}>Done</button>
          </div>

        ) : !hasAgencies ? (
          <div className="agnapp__none">
            <CircleDashed size={26} strokeWidth={1.3} aria-hidden />
            <p>Every available agency is already in your ledger.</p>
          </div>

        ) : (
          <>
            {/* ── Left: controls ──────────────────────────────── */}
            <div className="agnapp__left">
              <div className="agnapp__left-body">
                <p className="agnapp__pre">Submitting to</p>

                <div className="agnapp__who">
                  {selectedAgency?.profile_image && (
                    <div className="agnapp__who-thumb" aria-hidden>
                      <img src={selectedAgency.profile_image} alt="" />
                    </div>
                  )}
                  <h2 id="agnapp-title" className="agnapp__who-name">
                    {selectedAgency?.name || 'Select an agency'}
                  </h2>
                </div>

                {agencyMeta && <p className="agnapp__who-meta">{agencyMeta}</p>}
                {site && (
                  <a href={site} target="_blank" rel="noreferrer" className="agnapp__who-site">
                    View agency ↗
                  </a>
                )}

                {agencies.length > 1 && (
                  <div className="agnapp__swap">
                    <select
                      value={selectedAgencyId || ''}
                      onChange={(e) => onSelectAgency(e.target.value)}
                      aria-label="Change agency"
                    >
                      {agencies.map((a) => (
                        <option key={a.id} value={a.id}>{a.name || 'Unnamed Agency'}</option>
                      ))}
                    </select>
                    <ChevronDown size={11} aria-hidden />
                  </div>
                )}

                <div className="agnapp__pkg">
                  <div className="agnapp__sel">
                    <select
                      value={selectedMediaSetId}
                      onChange={(e) => onSelectedMediaSetIdChange(e.target.value)}
                      aria-label="Image set"
                    >
                      <option value="current">{mediaSetsLoading ? 'Loading…' : 'Current book'}</option>
                      {mediaSets.map((s) => (
                        <option key={s.id} value={s.id}>{s.name || `${s.kind || 'Image'} set`}</option>
                      ))}
                    </select>
                    <ChevronDown size={11} aria-hidden />
                  </div>
                  <div className="agnapp__sel">
                    <select
                      value={selectedCompCardId}
                      onChange={(e) => onSelectedCompCardIdChange(e.target.value)}
                      aria-label="Comp card"
                    >
                      {compCardOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={11} aria-hidden />
                  </div>
                </div>

                {missingChecks.length > 0 && (
                  <p className="agnapp__missing">
                    {missingChecks.map((c) => c.label).join(' · ')} not complete
                  </p>
                )}

                {noteOpen ? (
                  <div className="agnapp__note-wrap">
                    <textarea
                      className="agnapp__note"
                      value={applicationNote}
                      onChange={(e) => onApplicationNoteChange(e.target.value.slice(0, 1200))}
                      placeholder={`A note to ${selectedAgency?.name || 'the agency'}…`}
                      rows={4}
                      autoFocus
                    />
                    <small className="agnapp__note-ct">{applicationNote.length} / 1200</small>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="agnapp__note-trigger"
                    onClick={() => setNoteOpen(true)}
                  >
                    + Add a note
                  </button>
                )}
              </div>

              <div className="agnapp__left-foot">
                <label className="agnapp__consent">
                  <input
                    type="checkbox"
                    checked={hasSubmissionConsent}
                    onChange={(e) => onSubmissionConsentChange(e.target.checked)}
                  />
                  <span>
                    I consent to sharing my profile with {selectedAgency?.name || 'this agency'}.
                  </span>
                </label>

                <button
                  type="button"
                  className="agnapp__submit"
                  onClick={() => onSubmit(selectedAgency, packagePayload)}
                  disabled={!canSubmit || isSubmitting}
                >
                  {isBlocked ? (
                    <><Lock size={13} aria-hidden />Profile incomplete</>
                  ) : isSubmitting ? (
                    <><Loader2 size={13} className="app-spin" aria-hidden />Submitting</>
                  ) : (
                    'Submit'
                  )}
                </button>

                <p className="agnapp__limit">{monthlyLimitLabel} this month</p>
              </div>
            </div>

            {/* ── Right: portfolio contact sheet ──────────────── */}
            <div className="agnapp__right" aria-hidden="true">
              <div className="agnapp__sheet">
                {frames.map((img, i) => (
                  <div key={i} className="agnapp__frame">
                    {img && <img src={imageUrl(img)} alt="" />}
                  </div>
                ))}
              </div>
              <div className="agnapp__sheet-bar">
                <span>{selectedImages.length || visibleImages.length} images</span>
                <span className="agnapp__sheet-sep" />
                <span>{selectedMediaSetName}</span>
              </div>
            </div>
          </>
        )}

      </div>{/* .agnapp__box */}
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
                <X size={13} aria-hidden />
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
