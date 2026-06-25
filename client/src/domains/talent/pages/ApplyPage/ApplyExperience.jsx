import React, { Fragment, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleDashed,
  Loader2,
  Lock,
  MapPin,
  Plus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { TALENT_NOTIFICATIONS_QUERY_KEY } from '../../../../shared/components/NotificationCenter/NotificationCenter';
import { useAuth } from '../../../auth/hooks/useAuth';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import WritingAssistToolbar from '../../../../shared/components/writing/WritingAssistToolbar';
import ProfileGateBanner from '../../../../shared/components/gating/ProfileGateBanner';
import { checkGatingStatus, getProfileGateFeature } from '../../../../shared/utils/profileGating';
import { sendBlockerLabel } from '../../../../shared/utils/sendReadiness';
import {
  analyzeDigitalsReadiness,
  isHeadshotImage,
  isFullBodyImage,
} from '../../../../shared/utils/profileReadinessImages';
import { auditSubmissionPackage } from '../../../../shared/utils/packageIntelligence';
import { DIGITALS_ADVISORY_ITEMS } from '../../../../shared/constants/frameTaxonomy';
import { talentApi } from '../../api/talent';
import '../../components/ApplicationsView.css';
import './ApplyExperience.css';

/* The submission is composed across three editorial scenes, then sent.
   Same ledger language as the /applications market — full screen. */

const SCENES = [
  {
    id: 'address',
    waypoint: 'Address',
    title: 'Address your submission.',
    standfirst: 'Choose the house your package is addressed to. Nothing is sent until you say so.',
  },
  {
    id: 'curate',
    waypoint: 'Curate',
    title: 'Curate the book.',
    standfirst: 'Compose the frames that represent you best. Select an image to hold it back.',
  },
  {
    id: 'send',
    waypoint: 'Send',
    title: 'Your submission, composed.',
    standfirst: 'A last look at the package, a note in your own voice, and it’s on its way.',
  },
];

const COMP_CARD_OPTIONS = [
  { id: 'current', label: 'Current comp card', detail: 'Your live agency-facing card' },
  { id: 'agency', label: 'Agency review card', detail: 'Formatted for representation review' },
  { id: 'editorial', label: 'Editorial card', detail: 'A lighter editorial presentation' },
];

const DIGITALS_ADVISORY = DIGITALS_ADVISORY_ITEMS;

/* ── helpers ─────────────────────────────────────────────── */

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

function dateLabel(value) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function websiteUrl(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

function agencyInitial(name) {
  return String(name || 'Agency').trim().charAt(0).toUpperCase() || 'A';
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

function measurementValue(profile, keys) {
  for (const key of keys) {
    const value = profile?.[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function buildFitSignals({ checks, untypedCount, recencyIsFresh }) {
  const has = (label) => !!checks.find((check) => check.label === label)?.complete;

  const requirements = [
    {
      label: 'A clean, current headshot',
      met: has('Digital headshot'),
      note: 'Tag a digital headshot in your book',
    },
    {
      label: 'A full-length digital, head to toe',
      met: has('Full-length digital'),
      note: 'Add a clean digital full-length shot',
    },
    {
      label: 'Accurate measurements',
      met: has('Measurements'),
      note: 'Complete your stats',
    },
    {
      label: 'Recent digitals',
      met: recencyIsFresh,
      note: 'Refresh your digitals — agencies expect a current set',
    },
  ];

  const metCount = requirements.filter((req) => req.met).length;
  const ratio = requirements.length ? metCount / requirements.length : 0;
  const label = ratio >= 1 ? 'Strong fit' : ratio >= 0.5 ? 'Promising fit' : 'Needs curation';

  const firstOpen = requirements.find((req) => !req.met);
  const pressure = firstOpen
    ? `Strengthen this submission by adding ${firstOpen.label.toLowerCase()}.`
    : untypedCount > 0
      ? `You meet every expectation — type your ${untypedCount} remaining frame${untypedCount === 1 ? '' : 's'} for a sharper read.`
      : 'You meet every expectation this house looks for. Curate a precise edit and send.';

  return { requirements, metCount, total: requirements.length, label, pressure };
}

/* ════════════════════════════════════════════════════════════
   Orchestrator
   ════════════════════════════════════════════════════════════ */

export default function ApplyExperience() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { profile, subscription, images: authImages = [] } = useAuth();

  const [sceneIndex, setSceneIndex] = useState(0);
  const [selectedAgencyId, setSelectedAgencyId] = useState(searchParams.get('agency'));
  const [selectedMediaSetId, setSelectedMediaSetId] = useState('current');
  const [selectedCompCardId, setSelectedCompCardId] = useState('current');
  const [excludedImageIds, setExcludedImageIds] = useState(() => new Set());
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  // "Compose" arrives with ?agency= and locks to that house; "Apply New" opens the chooser.
  const chooserOpen = !searchParams.get('agency');

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
    staleTime: 1000 * 60 * 3,
    retry: 1,
  });

  const applyMutation = useMutation({
    mutationFn: talentApi.createApplication,
    onSuccess: (_data, variables) => {
      setSubmitted({
        agency: { name: variables?.submissionPackage?.agencyName },
        submittedAt: new Date().toISOString(),
        mediaSetName: variables?.submissionPackage?.mediaSetName,
        compCardName: variables?.submissionPackage?.compCardName,
        frameCount: variables?.submissionPackage?.imageIds?.length || 0,
      });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['talent-agencies'] });
      queryClient.invalidateQueries({ queryKey: TALENT_NOTIFICATIONS_QUERY_KEY });
    },
    onError: (err) => {
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
  const gating = useMemo(() => checkGatingStatus(profile, authImages), [profile, authImages]);
  const applicationGate = getProfileGateFeature('/dashboard/talent/applications');

  const appliedAgencyIds = useMemo(
    () =>
      new Set(
        applications
          .filter((app) => app.status !== 'withdrawn')
          .map((app) => app.agency_id)
          .filter(Boolean),
      ),
    [applications],
  );
  const openAgencies = useMemo(
    () => agencies.filter((agency) => !appliedAgencyIds.has(agency.id)),
    [agencies, appliedAgencyIds],
  );

  // Pre-selected from the market deep-link (?agency=) via the initializer.
  const selectedAgency = openAgencies.find((agency) => agency.id === selectedAgencyId) || null;
  const site = websiteUrl(selectedAgency?.agency_website);

  const selectMediaSet = (id) => {
    setSelectedMediaSetId(id);
    setExcludedImageIds(new Set());
  };

  /* ── derived submission state ── */

  const monthCount = applications.filter((app) => {
    if (!app.created_at) return false;
    const created = new Date(app.created_at);
    const now = new Date();
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;
  const monthlyLimitLabel = subscription?.isPro
    ? 'Unlimited submissions this month'
    : `${monthCount}/5 submissions this month`;

  const visibleImages = useMemo(
    () => authImages.filter((image) => !image.exclude_from_agency && imageUrl(image)),
    [authImages],
  );
  const setImages = useMemo(
    () =>
      selectedMediaSetId === 'current'
        ? visibleImages
        : visibleImages.filter((image) => image.set_id === selectedMediaSetId),
    [visibleImages, selectedMediaSetId],
  );
  const packageImages = useMemo(
    () => setImages.filter((image) => !excludedImageIds.has(image.id)),
    [setImages, excludedImageIds],
  );

  const packageAudit = useMemo(
    () => auditSubmissionPackage({ images: packageImages }),
    [packageImages],
  );

  const checks = useMemo(() => {
    const hasHeadshot = packageImages.some(isHeadshotImage);
    const hasFullBody = packageImages.some(isFullBodyImage);
    const hasMeasurements =
      !!measurementValue(profile, ['height_cm']) &&
      !!measurementValue(profile, ['bust', 'bust_cm', 'chest', 'chest_cm']) &&
      !!measurementValue(profile, ['waist', 'waist_cm']) &&
      !!measurementValue(profile, ['hips', 'hips_cm']);
    const hasContact = !!profile?.email && !!profile?.phone;
    return [
      {
        key: 'photo_headshot',
        label: 'Digital headshot',
        complete: hasHeadshot,
        note: 'Tag a digital headshot in your package',
      },
      {
        key: 'photo_full_body',
        label: 'Full-length digital',
        complete: hasFullBody,
        note: 'Add a clean digital full-length shot to your package',
      },
      {
        key: 'digitals_recency',
        label: 'Current digitals',
        complete: !packageAudit.recency.isStale,
        note: 'Refresh your digitals — agencies expect a current set',
      },
      {
        key: 'measurements',
        label: 'Measurements',
        complete: hasMeasurements,
        note: 'Complete height and core measurements',
      },
      {
        key: 'contact',
        label: 'Contact',
        complete: hasContact,
        note: 'Add email and phone in settings',
      },
    ];
  }, [packageImages, profile, packageAudit]);

  const sendBlockers = useMemo(() => {
    const packageGaps = checks
      .filter((check) => !check.complete)
      .map((check) => ({
        key: check.key,
        label: check.label,
        task: check.note,
      }));

    if (Array.isArray(gating.sendBlockers)) {
      const coveredKeys = new Set(gating.sendBlockers.map((blocker) => blocker.key));
      return [
        ...gating.sendBlockers,
        ...packageGaps.filter((gap) => !coveredKeys.has(gap.key)),
      ];
    }

    return packageGaps;
  }, [checks, gating.sendBlockers]);

  const isSendReady = useMemo(() => {
    const packageReady = checks.every((check) => check.complete);
    if (typeof gating.isSendReady === 'boolean') {
      return gating.isSendReady && packageReady;
    }
    return gating.isCoreReady && packageReady;
  }, [checks, gating.isCoreReady, gating.isSendReady]);

  const missingChecks = useMemo(
    () => checks.filter((check) => !check.complete),
    [checks],
  );

  const digitalsReadiness = useMemo(() => analyzeDigitalsReadiness(packageImages), [packageImages]);
  const digitalsGaps = useMemo(
    () => DIGITALS_ADVISORY.filter((item) => !digitalsReadiness[item.key]),
    [digitalsReadiness],
  );
  const untypedPackageCount = useMemo(
    () => packageImages.filter((img) => !normalizeToken(img?.shot_type)).length,
    [packageImages],
  );
  const recencyIsFresh = !packageAudit.recency.isStale;

  const selectedMediaSetName =
    selectedMediaSetId === 'current'
      ? 'Current book'
      : mediaSets.find((set) => set.id === selectedMediaSetId)?.name || 'Selected image set';
  const selectedCompCardName =
    COMP_CARD_OPTIONS.find((option) => option.id === selectedCompCardId)?.label || 'Current comp card';

  const reachable = useMemo(() => {
    const canCurate = !!selectedAgency;
    const canSend = canCurate && packageImages.length > 0;
    return [true, canCurate, canSend];
  }, [selectedAgency, packageImages.length]);

  const canSubmit =
    !!selectedAgency && isSendReady && consent && !applyMutation.isPending;

  /* ── navigation ── */

  const goTo = (index) => setSceneIndex(index);
  const exitToMarket = () => navigate('/dashboard/talent/applications');
  const handleBack = () => (sceneIndex === 0 ? exitToMarket() : goTo(sceneIndex - 1));
  const handleContinue = () => {
    if (sceneIndex < SCENES.length - 1 && reachable[sceneIndex + 1]) goTo(sceneIndex + 1);
  };

  const toggleImage = (imageId) =>
    setExcludedImageIds((current) => {
      const next = new Set(current);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });

  const handleSubmit = () => {
    if (!gating.isCoreReady) {
      toast.info('Complete your required profile fields before submitting to an agency.');
      return;
    }
    if (!isSendReady) {
      toast.info('Complete send requirements before submitting — contact, digitals, and your package.');
      return;
    }
    if (!selectedAgency?.id || !canSubmit) return;
    applyMutation.mutate({
      agencyId: selectedAgency.id,
      note: note.trim() || undefined,
      submissionPackage: {
        agencyName: selectedAgency?.name || null,
        agencyLocation: selectedAgency?.agency_location || null,
        mediaSetId: selectedMediaSetId,
        mediaSetName: selectedMediaSetName,
        compCardId: selectedCompCardId,
        compCardName: selectedCompCardName,
        imageIds: packageImages.map((img) => img.id),
        readiness: missingChecks.length === 0 ? 'Ready' : `Missing ${missingChecks.length}`,
        digitalsGaps: digitalsGaps.map((g) => g.label),
        untypedImageCount: untypedPackageCount,
        consentConfirmed: consent,
      },
    });
  };

  /* ── terminal & guard states ── */

  if (applicationsQuery.isError || agenciesQuery.isError) {
    return (
      <div className="applications-view-container apply-experience">
        <section className="app-error-state" role="alert">
          <h1>Couldn’t open the submission studio.</h1>
          <p>The applications service didn’t respond. Return to the market and try again.</p>
          <div className="app-error-actions">
            <PholioButton variant="secondary" onClick={exitToMarket}>
              <ArrowLeft size={14} aria-hidden /> Back to market
            </PholioButton>
          </div>
        </section>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="applications-view-container apply-experience">
        <section className="app-submit-success" role="status">
          <div className="app-submit-success__mark" aria-hidden>
            <Check size={24} strokeWidth={1.4} />
          </div>
          <h2>Submitted to {submitted.agency?.name || selectedAgency?.name || 'Agency'}</h2>
          <p>
            Your package is now with the agency. {dateLabel(submitted.submittedAt)} ·{' '}
            {submitted.frameCount} frames · Under review
          </p>
          <dl className="app-package-readiness">
            <div>
              <span>Book</span>
              <strong>{submitted.mediaSetName || selectedMediaSetName}</strong>
            </div>
            <div>
              <span>Comp card</span>
              <strong>{submitted.compCardName || selectedCompCardName}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>Under review</strong>
            </div>
          </dl>
          <PholioButton variant="solid" onClick={exitToMarket}>
            Return to market <ArrowUpRight size={14} aria-hidden />
          </PholioButton>
        </section>
      </div>
    );
  }

  const initialLoading =
    (applicationsQuery.isLoading || agenciesQuery.isLoading) && openAgencies.length === 0;

  if (!initialLoading && openAgencies.length === 0) {
    return (
      <div className="applications-view-container apply-experience">
        <section className="app-application-empty">
          <CircleDashed size={28} strokeWidth={1.4} aria-hidden />
          <h3>Every house is already in your ledger.</h3>
          <p>Withdraw an active submission to reopen a slot, or return to follow the conversations you’ve started.</p>
          <PholioButton variant="secondary" onClick={exitToMarket}>
            <ArrowLeft size={14} aria-hidden /> Back to market
          </PholioButton>
        </section>
      </div>
    );
  }

  const scene = SCENES[sceneIndex];
  const addressLocked = scene.id === 'address' && !chooserOpen && !!selectedAgency;
  // The locked review suppresses the mast (agency is the hero); these drive the
  // other scenes' masts only.
  const mastTitle = scene.title;
  const mastStandfirst = scene.standfirst;

  return (
    <div className="applications-view-container apply-experience">
      <div className="apply-head">
        <button type="button" className="app-flow-back" onClick={handleBack} aria-label="Back">
          <ArrowLeft size={16} aria-hidden />
        </button>
        <nav className="apply-waypoints" aria-label="Submission progress">
          {SCENES.map((item, index) => {
            const state = index === sceneIndex ? 'is-on' : index < sceneIndex ? 'is-done' : '';
            const jumpable = index < sceneIndex || reachable[index];
            return (
              <Fragment key={item.id}>
                {index > 0 && <span className="apply-waypoints__dot" aria-hidden>·</span>}
                <button
                  type="button"
                  className={state}
                  disabled={!jumpable}
                  aria-current={index === sceneIndex ? 'step' : undefined}
                  onClick={() => jumpable && goTo(index)}
                >
                  {item.waypoint}
                </button>
              </Fragment>
            );
          })}
        </nav>
      </div>

      {!gating.isCoreReady && (
        <ProfileGateBanner
          variant="compact"
          featureName={applicationGate.featureName}
          featureLabel={applicationGate.featureLabel}
          description={applicationGate.description}
          {...gating}
        />
      )}

      {gating.isCoreReady && !isSendReady && sendBlockers.length > 0 && (
        <section className="apply-send-gate" aria-label="Send requirements">
          <p className="apply-foot__meta">Send requirements</p>
          <ul className="apply-readyline">
            {sendBlockers.map((blocker) => (
              <li key={blocker.key || blocker.label} className="is-need">
                <X size={12} aria-hidden />
                {sendBlockerLabel(blocker)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* On the locked review the agency becomes the page's own hero (rendered
          inside the dossier), so the generic mast is suppressed there. */}
      {!addressLocked && (
        <header key={`${scene.id}-mast`} className="apply-mast">
          <div className="apply-mast__lede">
            <h1 className="apply-mast__title">{mastTitle}</h1>
            <p className="apply-mast__standfirst">{mastStandfirst}</p>
          </div>
          {scene.id !== 'address' && selectedAgency && (
            <aside className="apply-recipient" aria-label="Addressed to">
              <span className="apply-recipient__crest" aria-hidden>
                {selectedAgency.profile_image ? (
                  <img src={selectedAgency.profile_image} alt="" />
                ) : (
                  agencyInitial(selectedAgency.name)
                )}
              </span>
              <span className="apply-recipient__copy">
                <strong>{selectedAgency.name || 'Agency'}</strong>
                <span className="apply-recipient__loc">
                  <MapPin size={11} aria-hidden />
                  {selectedAgency.agency_location || 'Global'}
                </span>
              </span>
            </aside>
          )}
        </header>
      )}

      <div key={scene.id} className="apply-scene">
        {scene.id === 'address' && (
          <AddressScene
            agencies={openAgencies}
            isLoading={agenciesQuery.isLoading}
            selectedAgency={selectedAgency}
            onSelect={setSelectedAgencyId}
            site={site}
            locked={addressLocked}
            checks={checks}
            digitalsGaps={digitalsGaps}
            untypedCount={untypedPackageCount}
            recencyIsFresh={recencyIsFresh}
          />
        )}

        {scene.id === 'curate' && (
          <CurateScene
            profile={profile}
            mediaSets={mediaSets}
            visibleImages={visibleImages}
            setImages={setImages}
            packageImages={packageImages}
            excludedImageIds={excludedImageIds}
            selectedMediaSetId={selectedMediaSetId}
            onSelectSet={selectMediaSet}
            compCardId={selectedCompCardId}
            onSelectCompCard={setSelectedCompCardId}
            onToggleImage={toggleImage}
            mediaSetName={selectedMediaSetName}
            compCardName={selectedCompCardName}
            missingChecks={missingChecks}
            digitalsGaps={digitalsGaps}
            untypedCount={untypedPackageCount}
          />
        )}

        {scene.id === 'send' && (
          <SendScene
            agency={selectedAgency}
            profile={profile}
            packageImages={packageImages}
            mediaSetName={selectedMediaSetName}
            compCardName={selectedCompCardName}
            checks={checks}
            packageAudit={packageAudit}
            note={note}
            onNoteChange={(v) => setNote(v.slice(0, 1200))}
            consent={consent}
            onConsentChange={setConsent}
          />
        )}
      </div>

      <footer className="apply-foot">
        <p className="apply-foot__meta">
          {monthlyLimitLabel}
          {sceneIndex === 2 && !isSendReady && sendBlockers.length > 0
            ? ` · ${sendBlockers.map((blocker) => sendBlockerLabel(blocker)).join(', ')} still needed`
            : ''}
        </p>
        <div className="apply-foot__actions">
          {sceneIndex > 0 && (
            <PholioButton variant="secondary" onClick={handleBack}>
              Back
            </PholioButton>
          )}
          {sceneIndex < SCENES.length - 1 ? (
            <PholioButton
              variant="solid"
              onClick={handleContinue}
              disabled={!reachable[sceneIndex + 1]}
            >
              {sceneIndex === 0 ? 'Curate the book' : 'Review & send'}
              <ArrowUpRight size={14} aria-hidden />
            </PholioButton>
          ) : (
            <PholioButton variant="solid" onClick={handleSubmit} disabled={!canSubmit}>
              {!gating.isCoreReady ? (
                <>
                  <Lock size={14} aria-hidden /> Profile incomplete
                </>
              ) : !isSendReady ? (
                <>
                  <Lock size={14} aria-hidden /> Send requirements
                </>
              ) : applyMutation.isPending ? (
                <>
                  <Loader2 size={14} className="app-spin" aria-hidden /> Sending
                </>
              ) : (
                <>
                  Send submission <ArrowUpRight size={14} aria-hidden />
                </>
              )}
            </PholioButton>
          )}
        </div>
      </footer>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Scene 1 — Address
   ════════════════════════════════════════════════════════════ */

function AddressScene({
  agencies,
  isLoading,
  selectedAgency,
  onSelect,
  site,
  locked,
  checks,
  digitalsGaps,
  untypedCount,
  recencyIsFresh,
}) {
  if (locked && selectedAgency) {
    return (
      <div className="apply-address apply-address--focused">
        <AgencyDossier
          agency={selectedAgency}
          site={site}
          focused
          checks={checks}
          digitalsGaps={digitalsGaps}
          untypedCount={untypedCount}
          recencyIsFresh={recencyIsFresh}
        />
      </div>
    );
  }

  return (
    <div className="apply-address">
      <div className="apply-houses-col">
        <span className="apply-houses__label">Open agencies</span>
        <div className="apply-houses" role="listbox" aria-label="Agencies">
          {isLoading
            ? [1, 2, 3].map((i) => (
                <div key={i} className="apply-house apply-house--skeleton" aria-hidden />
              ))
            : agencies.map((agency, index) => {
                const selected = selectedAgency?.id === agency.id;
                return (
                  <button
                    key={agency.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`apply-house ${selected ? 'apply-house--on' : ''}`}
                    onClick={() => onSelect(agency.id)}
                  >
                    <span className="apply-house__num">{String(index + 1).padStart(2, '0')}</span>
                    <span className="apply-house__copy">
                      <strong className="apply-house__name">{agency.name || 'Unnamed Agency'}</strong>
                      <span className="apply-house__loc">
                        <MapPin size={12} aria-hidden />
                        {agency.agency_location || 'Global'}
                      </span>
                    </span>
                  </button>
                );
              })}
        </div>
      </div>

      {selectedAgency && (
        <AgencyDossier
          agency={selectedAgency}
          site={site}
          checks={checks}
          digitalsGaps={digitalsGaps}
          untypedCount={untypedCount}
          recencyIsFresh={recencyIsFresh}
        />
      )}
    </div>
  );
}

function siteHost(site) {
  try {
    return new URL(site).hostname.replace(/^www\./, '');
  } catch {
    return 'Agency site';
  }
}

/* Match score as an editorial signal — presence through typographic scale,
   not a SaaS gauge. */
function MatchMark({ score }) {
  const tier = score >= 85 ? 'Strong affinity' : score >= 70 ? 'Close affinity' : 'Worth a look';
  return (
    <div className="apply-match" role="img" aria-label={`Match score ${score} out of 100`}>
      <span className="apply-match__label">Match</span>
      <span className="apply-match__num">{score}</span>
      <span className="apply-match__tier">{tier}</span>
    </div>
  );
}

/* The house being applied to — decision-support, not a sparse card:
   a confident masthead (name, prominent location, site, match signal), the
   boards the agency is currently scouting, and the submission expectations
   that drive how to curate the package. */
function AgencyDossier({ agency, site, focused = false, checks = [], digitalsGaps = [], untypedCount = 0, recencyIsFresh = false }) {
  const fit = buildFitSignals({ checks, untypedCount, recencyIsFresh });
  const openBoards = Array.isArray(agency.open_boards) ? agency.open_boards.filter(Boolean) : [];

  return (
    <aside className={`apply-dossier ${focused ? 'apply-dossier--focused' : ''}`} aria-label="Agency detail">
      <header className="apply-dossier__hero">
        <span className="apply-dossier__crest" aria-hidden>
          {agency.profile_image ? <img src={agency.profile_image} alt="" /> : agencyInitial(agency.name)}
        </span>
        <div className="apply-dossier__herocopy">
          <h2 className="apply-dossier__name">{agency.name || 'Agency'}</h2>
          <p className="apply-dossier__location">
            <MapPin size={18} aria-hidden />
            {agency.agency_location || 'Global'}
          </p>
          {site && (
            <a href={site} target="_blank" rel="noreferrer" className="apply-dossier__site">
              {siteHost(site)}
              <ArrowUpRight size={14} aria-hidden />
            </a>
          )}
        </div>
        {agency.matchScore ? <MatchMark score={agency.matchScore} /> : null}
      </header>

      <div className="apply-dossier__info">
        <p className="apply-dossier__desc">
          {agency.agency_description ||
            'Open to new talent submissions. Your package arrives directly in their inbox for review.'}
        </p>

        {openBoards.length > 0 && (
          <div className="apply-boards">
            <span className="apply-boards__label">Boards now open</span>
            <ul className="apply-boards__list">
              {openBoards.map((board) => (
                <li key={board}>{board}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <section className="apply-fit">
        <div className="apply-fit__head">
          <h3>What this house looks for</h3>
          <span className="apply-fit__verdict">
            {fit.label}
            <em>
              {fit.metCount}/{fit.total}
            </em>
          </span>
        </div>
        <ul className="apply-fit__list">
          {fit.requirements.map((req) => (
            <li key={req.label} className={req.met ? 'is-met' : 'is-open'}>
              <span className="apply-fit__mark" aria-hidden>
                {req.met ? <Check size={13} /> : null}
              </span>
              <span className="apply-fit__req">{req.label}</span>
              <span className="apply-fit__status">{req.met ? 'Ready' : req.note}</span>
            </li>
          ))}
        </ul>
        <p className="apply-fit__pressure">{fit.pressure}</p>
      </section>
    </aside>
  );
}

/* ════════════════════════════════════════════════════════════
   Scene 2 — Curate
   ════════════════════════════════════════════════════════════ */

function CurateScene({
  profile,
  mediaSets,
  visibleImages,
  setImages,
  packageImages,
  excludedImageIds,
  selectedMediaSetId,
  onSelectSet,
  compCardId,
  onSelectCompCard,
  onToggleImage,
  mediaSetName,
  compCardName,
  missingChecks,
  digitalsGaps,
  untypedCount,
}) {
  const setOptions = [
    { id: 'current', name: 'Current book', count: visibleImages.length },
    ...mediaSets.map((set) => ({
      id: set.id,
      name: set.name || `${set.kind || 'Image'} set`,
      count: visibleImages.filter((image) => image.set_id === set.id).length,
    })),
  ];

  return (
    <div className="apply-curate">
      <div className="apply-curate__main">
        <div className="apply-set-row" role="group" aria-label="Image set">
          {setOptions.map((set) => (
            <button
              key={set.id}
              type="button"
              className={`apply-set ${selectedMediaSetId === set.id ? 'is-on' : ''}`}
              onClick={() => onSelectSet(set.id)}
            >
              {set.name}
              <span>{set.count}</span>
            </button>
          ))}
        </div>

        <p className="apply-curate__count">
          <strong>{packageImages.length}</strong> of {setImages.length} frames included
        </p>

        <div className="apply-frames">
          {setImages.length > 0 ? (
            setImages.map((image) => {
              const included = !excludedImageIds.has(image.id);
              return (
                <button
                  key={image.id}
                  type="button"
                  className={`apply-frame ${included ? '' : 'is-out'}`}
                  aria-pressed={included}
                  aria-label={included ? 'Hold this frame back' : 'Add this frame'}
                  onClick={() => onToggleImage(image.id)}
                >
                  <img src={imageUrl(image)} alt="" loading="lazy" />
                  <span className="apply-frame__toggle" aria-hidden>
                    {included ? <X size={13} /> : <Plus size={13} />}
                  </span>
                  {!included && <span className="apply-frame__held">Held back</span>}
                </button>
              );
            })
          ) : (
            <div className="apply-frames__empty">
              <CircleDashed size={14} aria-hidden /> No images in this set
            </div>
          )}
        </div>
      </div>

      <aside className="apply-curate__aside">
        <section>
          <div className="apply-block__head">
            <h3>Comp card</h3>
          </div>
          <div className="apply-cardpreview">
            <CardThumb profile={profile} />
            <span className="apply-cardpreview__cap">{compCardName}</span>
          </div>
          <div className="apply-cardpicks">
            {COMP_CARD_OPTIONS.map((option) => {
              const on = compCardId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`apply-cardpick ${on ? 'apply-cardpick--on' : ''}`}
                  onClick={() => onSelectCompCard(option.id)}
                >
                  <span className="apply-cardpick__text">
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </span>
                  {on ? <Check size={15} aria-hidden /> : <span aria-hidden />}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="apply-block__head">
            <h3>Readiness</h3>
          </div>
          <dl className="app-package-readiness">
            <div>
              <span>Book</span>
              <strong>{mediaSetName}</strong>
            </div>
            <div>
              <span>Comp card</span>
              <strong>{compCardName}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{missingChecks.length === 0 ? 'Ready' : `${missingChecks.length} gaps`}</strong>
            </div>
          </dl>
          {(digitalsGaps.length > 0 || untypedCount > 0) && (
            <p className="apply-curate__count">
              {untypedCount > 0
                ? `${untypedCount} frame${untypedCount === 1 ? '' : 's'} not typed yet — `
                : ''}
              {digitalsGaps.length > 0
                ? `agencies also like to see ${digitalsGaps.map((g) => g.label.toLowerCase()).join(', ')}.`
                : 'tag photo types on your media page to strengthen the package.'}
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Scene 3 — Send
   ════════════════════════════════════════════════════════════ */

function SendScene({
  agency,
  profile,
  packageImages,
  mediaSetName,
  compCardName,
  checks,
  packageAudit,
  note,
  onNoteChange,
  consent,
  onConsentChange,
}) {
  const name = agency?.name || 'this agency';

  const [assistBusy, setAssistBusy] = useState(false);
  const [assistMode, setAssistMode] = useState(null);
  const [previousNote, setPreviousNote] = useState(null);

  const trimmedNote = note.trim();
  const noteLen = trimmedNote.length;

  const runAssist = async (mode) => {
    setAssistMode(mode);
    setAssistBusy(true);
    const snapshot = note;
    try {
      const agencyPayload = {
        agencyId: agency?.id || undefined,
        agencyName: agency?.name || undefined,
      };
      let data;
      if (mode === 'draft') {
        data = await talentApi.draftSubmissionNote({
          ...agencyPayload,
          note: trimmedNote || undefined,
        });
      } else if (mode === 'sharpen') {
        data = await talentApi.sharpenSubmissionNote({
          ...agencyPayload,
          note: trimmedNote,
        });
      } else {
        data = await talentApi.shortenSubmissionNote({ note: trimmedNote });
      }

      const next = (data?.note || '').slice(0, 1200);
      if (!next) {
        toast.error('No note returned. Please try again.');
        return;
      }
      setPreviousNote(snapshot);
      onNoteChange(next);
      toast.success(
        mode === 'draft'
          ? 'Note drafted'
          : mode === 'sharpen'
            ? 'Note sharpened'
            : 'Note shortened',
      );
    } catch (err) {
      if (err?.data?.details?.code === 'STUDIO_PLUS_REQUIRED') {
        toast.error('Studio+ is required to use the note assistant.');
      } else {
        toast.error(err?.message || 'Could not update the note. Please try again.');
      }
    } finally {
      setAssistBusy(false);
      setAssistMode(null);
    }
  };

  const handleUndoAssist = () => {
    if (previousNote === null) return;
    onNoteChange(previousNote);
    setPreviousNote(null);
    toast.info('Reverted to your original note');
  };

  const assistActions = [];
  if (noteLen < 10) {
    assistActions.push({
      id: 'draft',
      label: 'Draft a note',
      onClick: () => runAssist('draft'),
    });
  } else {
    assistActions.push({
      id: 'sharpen',
      label: 'Sharpen',
      onClick: () => runAssist('sharpen'),
    });
    if (noteLen >= 50) {
      assistActions.push({
        id: 'shorten',
        label: 'Shorten',
        onClick: () => runAssist('shorten'),
      });
    }
  }

  const busyLabel =
    assistMode === 'draft'
      ? 'Drafting…'
      : assistMode === 'sharpen'
        ? 'Sharpening…'
        : assistMode === 'shorten'
          ? 'Shortening…'
          : 'Working…';

  return (
    <div className="apply-review">
      <div className="apply-review__main">
        <dl className="app-package-readiness">
          <div>
            <span>Book</span>
            <strong>{mediaSetName}</strong>
          </div>
          <div>
            <span>Comp card</span>
            <strong>{compCardName}</strong>
          </div>
          <div>
            <span>Frames</span>
            <strong>{packageImages.length}</strong>
          </div>
        </dl>

        <ul className="apply-readyline" aria-label="Profile readiness">
          {checks.map((check) => (
            <li key={check.label} className={check.complete ? 'is-ok' : 'is-need'}>
              {check.complete ? <Check size={12} aria-hidden /> : <X size={12} aria-hidden />}
              {check.label}
            </li>
          ))}
        </ul>

        {packageAudit?.advisories?.length > 0 && (
          <ul className="apply-package-audit" aria-label="Package notes">
            {packageAudit.advisories.map((item) => (
              <li key={`${item.id}-${item.imageIds?.[0] || 'global'}`}>{item.message}</li>
            ))}
          </ul>
        )}

        <div className="app-application-note">
          <span className="apply-note-lbl">A note to {name}</span>
          <WritingAssistToolbar
            className="apply-note-assist"
            actions={assistActions}
            busy={assistBusy}
            busyLabel={busyLabel}
            showUndo={previousNote !== null}
            onUndo={handleUndoAssist}
          />
          <textarea
            id="apply-note"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={`A few honest lines for ${name} — who you are, why them.`}
            rows={5}
          />
          <small>{note.length} / 1200</small>
        </div>

        <label className="app-consent-check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => onConsentChange(e.target.checked)}
          />
          <span>I consent to sharing my profile, book, and comp card with {name}.</span>
        </label>
      </div>

      <aside className="apply-card" aria-label="Comp card preview">
        <CardThumb profile={profile} />
        <span className="apply-card__cap">{compCardName}</span>
      </aside>
    </div>
  );
}

/* A static, controls-free preview of the live comp card (the real rendered
   card front), scaled down — not the full /media atelier. */
function CardThumb({ profile }) {
  const slug = profile?.slug;
  if (!slug) {
    return (
      <div className="apply-cardthumb" aria-hidden>
        <CircleDashed size={20} aria-hidden style={{ position: 'absolute', inset: 0, margin: 'auto', color: 'var(--app-text-faint)' }} />
      </div>
    );
  }
  return (
    <div className="apply-cardthumb">
      <iframe
        src={`/pdf/view/${slug}?seed=profile:${encodeURIComponent(slug)}`}
        title="Comp card preview"
        scrolling="no"
        tabIndex={-1}
        loading="lazy"
      />
    </div>
  );
}
