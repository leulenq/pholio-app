import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  CircleDashed,
  Clock,
  Eye,
  ExternalLink,
  FileText,
  IdCard,
  Image,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Send,
  UserCheck,
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

function profileDisplayName(profile) {
  const parts = [profile?.first_name, profile?.last_name].filter(Boolean);
  return parts.length ? parts.join(' ') : 'Your profile';
}

function profileLocation(profile) {
  return [profile?.city, profile?.state || profile?.region, profile?.country]
    .filter(Boolean)
    .join(', ') || profile?.location || 'Location pending';
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

function heightLabel(profile) {
  const heightCm = measurementValue(profile, ['height_cm']);
  if (!heightCm) return 'Missing height';
  const totalInches = Math.round(Number(heightCm) / 2.54);
  if (!Number.isFinite(totalInches)) return `${heightCm} cm`;
  return `${Math.floor(totalInches / 12)}'${totalInches % 12}"`;
}

function bodyStatsLabel(profile) {
  const bust = measurementValue(profile, ['bust', 'bust_cm']);
  const waist = measurementValue(profile, ['waist', 'waist_cm']);
  const hips = measurementValue(profile, ['hips', 'hips_cm']);
  if (!bust || !waist || !hips) return 'Measurements incomplete';
  return `${bust} / ${waist} / ${hips}`;
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
  const [activeStep, setActiveStep] = useState('agency');
  const hasAgencies = agencies.length > 0;
  const site = websiteUrl(selectedAgency?.agency_website);
  const profileName = profileDisplayName(profile);
  const visibleImages = images.filter((image) => !image.exclude_from_agency && imageUrl(image));
  const selectedImages = selectedMediaSetId === 'current'
    ? visibleImages
    : visibleImages.filter((image) => image.set_id === selectedMediaSetId);
  const previewImages = selectedImages.length ? selectedImages.slice(0, 6) : visibleImages.slice(0, 6);
  const hasHeadshot = selectedImages.some((image) => hasShotType(image, ['headshot']));
  const hasFullBody = selectedImages.some((image) =>
    hasShotType(image, ['full_length', 'full_body', 'three_quarter']),
  );
  const hasMeasurements = !!measurementValue(profile, ['height_cm']) &&
    !!measurementValue(profile, ['bust', 'bust_cm']) &&
    !!measurementValue(profile, ['waist', 'waist_cm']) &&
    !!measurementValue(profile, ['hips', 'hips_cm']);
  const hasContact = !!profile?.email && !!profile?.phone;
  const checks = [
    { label: 'Agency selected', detail: selectedAgency?.name || 'Choose an agency', complete: !!selectedAgency },
    { label: 'Headshot image', detail: 'One agency-visible headshot', complete: hasHeadshot },
    { label: 'Full-body image', detail: 'One full-length or three-quarter frame', complete: hasFullBody },
    { label: 'Measurements', detail: 'Height plus bust, waist, and hips', complete: hasMeasurements },
    { label: 'Contact details', detail: 'Email and phone available to the agency', complete: hasContact },
  ];
  const missingChecks = checks.filter((check) => !check.complete);
  const readinessLabel = missingChecks.length === 0
    ? 'Ready'
    : `Missing ${missingChecks.length} ${missingChecks.length === 1 ? 'item' : 'items'}`;
  const compCardOptions = [
    { id: 'current', label: 'Current comp card', detail: profile?.pdf_theme || 'Default Pholio card' },
    { id: 'agency', label: 'Agency review card', detail: 'Stats-forward layout' },
    { id: 'editorial', label: 'Editorial card', detail: 'Image-led presentation' },
  ];
  const selectedMediaSetName =
    selectedMediaSetId === 'current'
      ? 'Current book'
      : mediaSets.find((set) => set.id === selectedMediaSetId)?.name || 'Selected image set';
  const selectedCompCardName =
    compCardOptions.find((option) => option.id === selectedCompCardId)?.label || 'Current comp card';
  const canSubmit = hasAgencies && selectedAgency && !isBlocked && missingChecks.length === 0 && hasSubmissionConsent;
  const packagePayload = {
    agencyName: selectedAgency?.name || null,
    agencyLocation: selectedAgency?.agency_location || null,
    mediaSetId: selectedMediaSetId,
    mediaSetName: selectedMediaSetName,
    compCardId: selectedCompCardId,
    compCardName: selectedCompCardName,
    imageIds: selectedImages.map((image) => image.id),
    readiness: readinessLabel,
    consentConfirmed: hasSubmissionConsent,
  };
  const packageItems = [
    {
      icon: FileText,
      label: profileName,
      detail: profileLocation(profile),
    },
    {
      icon: BookOpen,
      label: selectedMediaSetName,
      detail: `${selectedImages.length || visibleImages.length} agency-visible images`,
    },
    {
      icon: IdCard,
      label: selectedCompCardName,
      detail: bodyStatsLabel(profile),
    },
    {
      icon: Mail,
      label: 'Contact',
      detail: profile?.email && profile?.phone ? 'Email and phone included' : 'Contact details incomplete',
    },
  ];
  const steps = [
    { id: 'agency', label: 'Agency' },
    { id: 'package', label: 'Package' },
    { id: 'checks', label: 'Checks' },
    { id: 'preview', label: 'Preview' },
    { id: 'note', label: 'Note' },
    { id: 'confirm', label: 'Confirm' },
  ];
  const activeStepIndex = Math.max(0, steps.findIndex((step) => step.id === activeStep));
  const isFirstStep = activeStepIndex === 0;
  const isFinalStep = activeStepIndex === steps.length - 1;
  const goToPreviousStep = () => {
    if (!isFirstStep) setActiveStep(steps[activeStepIndex - 1].id);
  };
  const goToNextStep = () => {
    if (!isFinalStep) setActiveStep(steps[activeStepIndex + 1].id);
  };

  return (
    <div className="app-application-modal" role="dialog" aria-modal="true" aria-labelledby="app-apply-modal-title">
      <button type="button" className="app-application-modal__backdrop" aria-label="Close application" onClick={onClose} />
      <div className="app-application-modal__panel">
        <div className="app-application-modal__chrome">
          <span className="app-kicker">Apply New</span>
          <button type="button" className="app-modal-close" onClick={onClose} aria-label="Close application">
            <XCircle size={18} aria-hidden />
          </button>
        </div>

        {submittedApplication ? (
          <div className="app-submit-success" role="status">
            <div className="app-submit-success__mark">
              <Check size={22} aria-hidden />
            </div>
            <span className="app-kicker">Submitted</span>
            <h2>{submittedApplication.agency?.name || selectedAgency?.name || 'Agency'} has your package.</h2>
            <p>
              Submitted {dateLabel(submittedApplication.submittedAt)}. This now appears in Application history as an
              active submission while the agency reviews your materials.
            </p>
            <div className="app-submit-success__next">
              <div>
                <span>Package</span>
                <strong>{selectedMediaSetName}</strong>
              </div>
              <div>
                <span>Comp Card</span>
                <strong>{selectedCompCardName}</strong>
              </div>
              <div>
                <span>Next</span>
                <strong>Agency review</strong>
              </div>
            </div>
            <button type="button" className="app-primary-action" onClick={onClose}>
              Back to Market
            </button>
          </div>
        ) : !hasAgencies ? (
          <div className="app-application-empty">
            <CircleDashed size={26} strokeWidth={1.4} aria-hidden />
            <h3>No open agencies are available right now</h3>
            <p>Every current agency is already represented in your ledger.</p>
          </div>
        ) : (
          <>
            <div className="app-application-shell">
              <aside className="app-application-rail">
                <div className={`app-readiness-badge ${missingChecks.length === 0 ? 'app-readiness-badge--ready' : ''}`}>
                  <span>{readinessLabel}</span>
                  <strong>{monthlyLimitLabel} this month</strong>
                </div>

                <div className="app-stepper" aria-label="Application sections">
                  {steps.map((step, index) => (
                    <button
                      key={step.id}
                      type="button"
                      className={`app-stepper__item ${activeStep === step.id ? 'app-stepper__item--active' : ''}`}
                      onClick={() => setActiveStep(step.id)}
                    >
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      {step.label}
                    </button>
                  ))}
                </div>

                <div className="app-rail-summary">
                  <span className="app-kicker">Sending To</span>
                  <strong>{selectedAgency?.name || 'Select agency'}</strong>
                  <p>{selectedMediaSetName} / {selectedCompCardName}</p>
                </div>
              </aside>

              <main className="app-application-stage">
                <div className="app-modal-step">
                  {activeStep === 'agency' && (
                    <section className="app-modal-section app-modal-section--agency" aria-label="Agency context">
                      <div className="app-modal-section__head">
                        <span className="app-kicker">Agency Context</span>
                        {site && (
                          <a href={site} target="_blank" rel="noreferrer" aria-label="Open agency site">
                            <ExternalLink size={14} aria-hidden />
                          </a>
                        )}
                      </div>
                      <div className="app-modal-agency">
                        <div className="app-modal-agency__mark" aria-hidden>
                          {selectedAgency?.profile_image ? (
                            <img src={selectedAgency.profile_image} alt="" />
                          ) : (
                            <Building2 size={22} strokeWidth={1.4} aria-hidden />
                          )}
                        </div>
                        <div>
                          <h3>{selectedAgency?.name || 'Select an agency'}</h3>
                          <p>
                            <MapPin size={13} aria-hidden />
                            {selectedAgency?.agency_location || 'Global'}
                          </p>
                          <strong>{agencyTypeLabel(selectedAgency)}</strong>
                        </div>
                      </div>
                      <p className="app-modal-agency__note">
                        {selectedAgency?.agency_description || 'Accepting polished profile packages from new talent.'}
                      </p>
                      <div className="app-agency-select-wrap">
                        <label htmlFor="agency-select">Change agency</label>
                        <select id="agency-select" value={selectedAgencyId || ''} onChange={(event) => onSelectAgency(event.target.value)}>
                          {agencies.map((agency) => (
                            <option key={agency.id} value={agency.id}>
                              {agency.name || 'Unnamed Agency'}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} aria-hidden />
                      </div>
                    </section>
                  )}

                  {activeStep === 'package' && (
                    <section className="app-modal-section" aria-label="What Pholio will send">
                      <div className="app-modal-section__head">
                        <span className="app-kicker">What Pholio Will Send</span>
                      </div>
                      <div className="app-send-list">
                        {packageItems.map((item) => {
                          const ItemIcon = item.icon;
                          return (
                            <div key={item.label}>
                              <ItemIcon size={15} strokeWidth={1.5} aria-hidden />
                              <span>{item.label}</span>
                              <strong>{item.detail}</strong>
                            </div>
                          );
                        })}
                      </div>

                      <div className="app-package-controls">
                        <label>
                          <span>Image set</span>
                          <select value={selectedMediaSetId} onChange={(event) => onSelectedMediaSetIdChange(event.target.value)}>
                            <option value="current">{mediaSetsLoading ? 'Loading image sets' : 'Current book'}</option>
                            {mediaSets.map((set) => (
                              <option key={set.id} value={set.id}>
                                {set.name || `${set.kind || 'Image'} set`}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Comp card</span>
                          <select value={selectedCompCardId} onChange={(event) => onSelectedCompCardIdChange(event.target.value)}>
                            {compCardOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </section>
                  )}

                  {activeStep === 'checks' && (
                    <section className="app-modal-section" aria-label="Required checks">
                      <div className="app-modal-section__head">
                        <span className="app-kicker">Required Checks</span>
                      </div>
                      <div className="app-check-list">
                        {checks.map((check) => (
                          <div key={check.label} className={check.complete ? 'app-check app-check--complete' : 'app-check'}>
                            {check.complete ? <Check size={14} aria-hidden /> : <AlertCircle size={14} aria-hidden />}
                            <span>{check.label}</span>
                            <strong>{check.detail}</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {activeStep === 'preview' && (
                    <section className="app-modal-section app-modal-section--preview" aria-label="Agency package preview">
                      <div className="app-modal-section__head">
                        <span className="app-kicker">Agency Preview</span>
                        <Eye size={15} aria-hidden />
                      </div>
                      <div className="app-package-preview">
                        <div className="app-package-preview__identity">
                          <h3>{profileName}</h3>
                          <p>{profileLocation(profile)}</p>
                          <dl>
                            <div>
                              <dt>Height</dt>
                              <dd>{heightLabel(profile)}</dd>
                            </div>
                            <div>
                              <dt>Stats</dt>
                              <dd>{bodyStatsLabel(profile)}</dd>
                            </div>
                            <div>
                              <dt>Comp</dt>
                              <dd>{selectedCompCardName}</dd>
                            </div>
                          </dl>
                        </div>
                        <div className="app-preview-images" aria-label="Selected images">
                          {previewImages.length > 0 ? (
                            previewImages.map((image) => (
                              <div key={image.id} className="app-preview-image">
                                <img src={imageUrl(image)} alt="" />
                              </div>
                            ))
                          ) : (
                            <div className="app-preview-image app-preview-image--empty">
                              <Image size={18} aria-hidden />
                              No images selected
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  )}

                  {activeStep === 'note' && (
                    <section className="app-modal-section app-modal-section--note" aria-label="Submission note">
                      <label className="app-application-note">
                        <span className="app-kicker">Submission Note</span>
                        <textarea
                          value={applicationNote}
                          onChange={(event) => onApplicationNoteChange(event.target.value.slice(0, 1200))}
                          placeholder="Add a concise professional note or leave blank."
                          rows={4}
                        />
                        <small>{applicationNote.length}/1200</small>
                      </label>
                    </section>
                  )}

                  {activeStep === 'confirm' && (
                    <section className="app-modal-section app-modal-section--consent" aria-label="Consent and confirmation">
                      <div className="app-modal-section__head">
                        <span className="app-kicker">Consent And Confirmation</span>
                      </div>
                      <label className="app-consent-check">
                        <input
                          type="checkbox"
                          checked={hasSubmissionConsent}
                          onChange={(event) => onSubmissionConsentChange(event.target.checked)}
                        />
                        <span>
                          I agree to submit my selected profile assets, measurements, images, comp card, and contact details
                          to {selectedAgency?.name || 'this agency'} for review.
                        </span>
                      </label>
                      {isBlocked && (
                        <p className="app-modal-warning">Complete required profile fields before applying through Market.</p>
                      )}
                      {!isBlocked && missingChecks.length > 0 && (
                        <p className="app-modal-warning">Resolve the missing checks before submitting this package.</p>
                      )}
                    </section>
                  )}
                </div>

                <div className="app-application-modal__actions">
                  <div className="app-step-status">
                    {isFinalStep ? <UserCheck size={14} aria-hidden /> : <span>{activeStepIndex + 1} / {steps.length}</span>}
                    <span>
                      {isFinalStep && canSubmit
                        ? 'Package is ready for agency review.'
                        : isFinalStep
                          ? 'Review the package requirements before sending.'
                          : steps[activeStepIndex + 1]
                            ? `Next: ${steps[activeStepIndex + 1].label}`
                            : 'Ready to confirm'}
                    </span>
                  </div>
                  <div className="app-step-actions">
                    <button
                      type="button"
                      className="app-secondary-action"
                      onClick={goToPreviousStep}
                      disabled={isFirstStep}
                    >
                      <ArrowLeft size={13} aria-hidden />
                      Back
                    </button>
                    {isFinalStep ? (
                  <button
                    type="button"
                    className="app-primary-action"
                    onClick={() => onSubmit(selectedAgency, packagePayload)}
                    disabled={!canSubmit || isSubmitting}
                  >
                    {isBlocked ? (
                      <>
                        <Lock size={14} aria-hidden />
                        Locked
                      </>
                    ) : isSubmitting ? (
                      <>
                        <Loader2 size={14} className="app-spin" aria-hidden />
                        Sending
                      </>
                    ) : (
                      <>
                        <Send size={14} aria-hidden />
                        Submit Application
                      </>
                    )}
                  </button>
                ) : (
                  <button type="button" className="app-primary-action" onClick={goToNextStep}>
                    Next
                    <ArrowUpRight size={14} aria-hidden />
                  </button>
                )}
                  </div>
                </div>
              </main>
            </div>
          </>
        )}
      </div>
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
