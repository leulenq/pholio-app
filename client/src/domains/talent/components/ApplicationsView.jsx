import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Check,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/hooks/useAuth';
import ConfirmationDialog from '../../../shared/components/ui/ConfirmationDialog';
import PholioButton, {
  PholioToggleButton,
  PholioToggleGroup,
} from '../../../shared/components/ui/PholioButton';
import ProfileGateBanner from '../../../shared/components/gating/ProfileGateBanner';
import { checkGatingStatus, getProfileGateFeature } from '../../../shared/utils/profileGating';
import { sendBlockerLabel, sendBlockerTarget } from '../../../shared/utils/sendReadiness';
import { calculateProfileStrength } from '../../../shared/utils/profileScoring';
import { talentApi } from '../api/talent';
import { readRoutes } from '../lib/specRegistry';
import { buildMarketDirectory, sortMarketDirectory } from '../lib/marketDirectory';
import {
  canAnswerSlotOffer,
  canWithdrawApplication,
  isEventApplication,
  statusConfig,
} from '../utils/applicationStatus';

import ApplicationMessages from './ApplicationMessages';
import SubmissionLedger from './market/SubmissionLedger';
import MarketBoard from './market/MarketBoard';
import LogSubmissionOverlay from './tracker/LogSubmissionOverlay';
import TrackerDetail from './tracker/TrackerDetail';
import './ApplicationsView.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'inReview', label: 'In Review' },
  { id: 'advancing', label: 'Advancing' },
  { id: 'represented', label: 'Represented' },
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

function websiteUrl(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

// Bare domain for an editorial site fact (e.g. "marilynagency.com").
function domainLabel(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

// The agency's lead board/division — the "Review focus" a booker reviews against.
function firstBoard(value) {
  if (!value) return null;
  let list = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list)) return null;
  const cleaned = list.filter(Boolean);
  return cleaned.length ? cleaned[0] : null;
}

function ledgerEntry(record, kind) {
  return kind === 'tracker'
    ? {
        kind,
        id: record.id,
        key: `tracker:${record.id}`,
        sortDate: record.submittedOn || record.createdAt || null,
        row: record,
      }
    : {
        kind,
        id: record.id,
        key: `application:${record.id}`,
        sortDate: record.created_at || null,
        app: record,
      };
}

// An event row is about the event, not the organizer's city.
function eventDateRange(event) {
  if (!event?.startsOn) return null;
  const from = dateLabel(event.startsOn, { year: false });
  const to = event.endsOn ? dateLabel(event.endsOn) : null;
  if (!to || to === from) return dateLabel(event.startsOn);
  return `${from} – ${to}`;
}

function metricLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function ApplicationsView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, images } = useAuth();
  const [loggingSubmission, setLoggingSubmission] = useState(false);
  const [messagingApplication, setMessagingApplication] = useState(null);
  const [deletingTrackerRow, setDeletingTrackerRow] = useState(null);
  const [withdrawingApplication, setWithdrawingApplication] = useState(null);
  // { application, confirmed } — the slot answer awaiting its confirm dialog.
  const [slotAnswer, setSlotAnswer] = useState(null);

  const applicationsQuery = useQuery({
    queryKey: ['applications'],
    queryFn: talentApi.getApplications,
    staleTime: 1000 * 60,
    retry: 1,
  });

  // ['tracker'] exactly — the post-export prompt on the requirements page
  // invalidates this key after logging a submission from there.
  const trackerQuery = useQuery({
    queryKey: ['tracker'],
    queryFn: talentApi.listTrackedSubmissions,
    staleTime: 1000 * 60,
    retry: 1,
  });

  const agenciesQuery = useQuery({
    queryKey: ['talent-agencies', 'apply-content-v2'],
    queryFn: talentApi.getAgencies,
    staleTime: 1000 * 60 * 3,
    retry: 1,
  });

  // The researched market. Its absence is never an error state here — a market
  // without the registry is a shorter market, not a broken page — so a failure
  // reads as zero routes and the Pholio agencies still render.
  const registryRoutesQuery = useQuery({
    queryKey: ['spec-registry-routes'],
    queryFn: talentApi.getSpecRegistryRoutes,
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const draftsQuery = useQuery({
    queryKey: ['application-drafts'],
    queryFn: talentApi.listDrafts,
    staleTime: 0,
    retry: 1,
    refetchOnMount: 'always',
  });

  const deleteTrackerMutation = useMutation({
    mutationFn: (id) => talentApi.deleteTrackedSubmission(id),
    onSuccess: () => {
      setDeletingTrackerRow(null);
      queryClient.invalidateQueries({ queryKey: ['tracker'] });
      toast.success('Record removed.');
    },
    onError: (err) => {
      setDeletingTrackerRow(null);
      toast.error(err?.message || 'That record could not be removed.');
    },
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

  // Confirming or declining a slot is the only status a talent ever writes, and
  // it is final — hence the dialog in front of it and the refetch behind it.
  const slotAnswerMutation = useMutation({
    mutationFn: ({ application, confirmed }) =>
      confirmed
        ? talentApi.confirmApplicationSlot(application.id)
        : talentApi.declineApplicationSlot(application.id),
    onSuccess: (_data, variables) => {
      setSlotAnswer(null);
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.success(
        variables.confirmed
          ? 'Slot confirmed — the organizer has been told.'
          : 'Slot declined — the organizer can offer it to someone else.',
      );
    },
    onError: (err) => {
      toast.error(err?.message || 'Could not record your answer. Try again.');
    },
  });

  const applications = useMemo(
    () =>
      asArray(applicationsQuery.data).sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
      ),
    [applicationsQuery.data],
  );
  const drafts = useMemo(() => {
    const lifecycleOrder = { active: 0, expired: 1, deleted: 2 };
    return asArray(draftsQuery.data)
      .filter(
        (draft) =>
          draft.lifecycleState === 'active' ||
          ((draft.lifecycleState === 'deleted' || draft.lifecycleState === 'expired') &&
            draft.isRecoverable),
      )
      .sort((a, b) => {
        const stateDelta =
          (lifecycleOrder[a.lifecycleState] ?? 3) - (lifecycleOrder[b.lifecycleState] ?? 3);
        if (stateDelta !== 0) return stateDelta;
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      });
  }, [draftsQuery.data]);
  const activeDraftByAgencyId = useMemo(
    () =>
      new Map(
        drafts
          .filter((draft) => draft.lifecycleState === 'active' && draft.agencyId)
          .map((draft) => [draft.agencyId, draft]),
      ),
    [drafts],
  );

  const [searchParams] = useSearchParams();
  // Deep link, kept: ?application=<id> opens that record where the side panel
  // used to select it.
  const deepLinkKey = searchParams.get('application')
    ? `application:${searchParams.get('application')}`
    : null;

  const agencies = useMemo(() => asArray(agenciesQuery.data), [agenciesQuery.data]);
  const gating = useMemo(() => checkGatingStatus(profile, images), [profile, images]);
  const applicationGate = getProfileGateFeature('/dashboard/talent/applications');

  const { isSendReady, sendBlockers } = useMemo(() => {
    if (typeof gating.isSendReady === 'boolean') {
      return {
        isSendReady: gating.isSendReady,
        sendBlockers: gating.sendBlockers || [],
      };
    }

    const strength = calculateProfileStrength({ ...profile, images: images ?? [] });
    const blockers = [];

    if (!strength.fieldCompletion.contact) {
      blockers.push({
        key: 'contact',
        label: 'Email & Phone',
        task: 'Add email and phone in settings',
      });
    }
    if (!strength.fieldCompletion.digitals_recency) {
      blockers.push({
        key: 'digitals_recency',
        label: 'Current Digitals',
        task: 'Refresh your digitals — agencies expect a current set',
      });
    }

    return {
      isSendReady: strength.isCoreReady && blockers.length === 0,
      sendBlockers: blockers,
    };
  }, [gating.isSendReady, gating.sendBlockers, profile, images]);

  const trackedSubmissions = useMemo(() => asArray(trackerQuery.data), [trackerQuery.data]);

  const ledgerEntries = useMemo(
    () =>
      [
        ...applications.map((app) => ledgerEntry(app, 'application')),
        ...trackedSubmissions.map((row) => ledgerEntry(row, 'tracker')),
      ].sort((a, b) => new Date(b.sortDate || 0) - new Date(a.sortDate || 0)),
    [applications, trackedSubmissions],
  );

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
  /*
    One market. Pholio agencies and researched routes are the same errand to a
    talent — a house that publishes what it wants — and differ only in who
    carries the package the last inch. A Pholio agency already in the ledger
    drops out because its submission is made; a researched route never does,
    since the tracker is a log the talent keeps, not a claim on the agency.
  */
  const marketEntries = useMemo(
    () =>
      sortMarketDirectory(
        buildMarketDirectory({
          agencies,
          routes: readRoutes(registryRoutesQuery.data),
        }),
        { hasDraft: (entry) => activeDraftByAgencyId.has(entry.agencyId) },
      ),
    [agencies, registryRoutesQuery.data, activeDraftByAgencyId],
  );
  // Both sources feed one grid, so the grid waits for both rather than popping
  // the researched half in a beat late.
  const marketIsLoading = agenciesQuery.isLoading || registryRoutesQuery.isLoading;

  const activeCount = applications.filter((app) =>
    ['inReview', 'advancing'].includes(
      statusConfig(app.status, { purpose: app.call_purpose }).group,
    ),
  ).length;
  const representedCount = applications.filter(
    (app) => statusConfig(app.status, { purpose: app.call_purpose }).group === 'represented',
  ).length;
  const monthCount = applications.filter((app) => {
    if (!app.created_at) return false;
    const created = new Date(app.created_at);
    const now = new Date();
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;
  // The discovery allowance is identical on every plan — no tier lifts it.
  const monthlyLimitLabel = `${monthCount}/5`;

  /**
   * Recorded, never blocking: the link opens on its own, and a failed count is
   * not the talent's problem.
   */
  const recordOutboundClick = (entry) => {
    if (!entry?.seriesId) return;
    talentApi.recordSpecRegistryOutboundClick(entry.seriesId).catch(() => {});
  };

  /**
   * One workspace, two ways in. `?agency=` is a house Pholio delivers to and
   * runs the full submission; `?series=` is a researched route and runs the
   * prepare-and-send-it-yourself variant. A destination that is both is always
   * the former — if Pholio can carry it, it should.
   */
  const openApplyFlow = (entry = null) => {
    const params = entry?.agencyId
      ? `?agency=${encodeURIComponent(entry.agencyId)}`
      : entry?.seriesId
        ? `?series=${encodeURIComponent(entry.seriesId)}`
        : '?new=1';
    navigate(`/dashboard/talent/applications/apply${params}`);
  };

  const confirmWithdraw = () => {
    if (!withdrawingApplication) return;
    withdrawMutation.mutate(withdrawingApplication.id);
  };

  const confirmSlotAnswer = () => {
    if (!slotAnswer) return;
    slotAnswerMutation.mutate(slotAnswer);
  };

  if (applicationsQuery.isError) {
    const isProfileMissing = applicationsQuery.error?.status === 404;
    return (
      <div className="applications-view-container">
        <section className="app-error-state" role="alert">
          <h1>Couldn&apos;t load the market.</h1>
          <p>
            {isProfileMissing
              ? 'Profile setup needs attention before applications can load.'
              : 'The applications service did not respond.'}
          </p>
          <div className="app-error-actions">
            {isProfileMissing && (
              <PholioButton
                as="a"
                href="/dashboard/talent/profile"
                variant="primary"
              >
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
          <p className="app-standfirst">
            Open agencies, work in progress, and every submission on record.
          </p>
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
            <dt>Represented</dt>
            <dd>{applicationsQuery.isLoading ? '-' : representedCount}</dd>
          </div>
          <div>
            <dt>This Month</dt>
            <dd>{applicationsQuery.isLoading ? '-' : monthlyLimitLabel}</dd>
          </div>
        </dl>
      </header>

      <section className="app-discovery" id="app-discovery" aria-label="Open agencies">
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
          <section
            className="app-preflight"
            role="status"
            aria-labelledby="app-preflight-title"
          >
            <div className="app-preflight__head">
              <h2 id="app-preflight-title">Clear this before you send</h2>
              <span>{metricLabel(sendBlockers.length, 'requirement', 'requirements')}</span>
            </div>
            <ol className="app-preflight__list">
              {sendBlockers.map((blocker, index) => {
                const target = sendBlockerTarget(blocker);
                return (
                  <li
                    key={blocker.key || target.label}
                    className="app-preflight__row"
                    style={{ '--app-row-index': index }}
                  >
                    <span className="app-preflight__index" aria-hidden>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="app-preflight__label">{target.label}</span>
                    <p className="app-preflight__task">{sendBlockerLabel(blocker)}</p>
                    <Link className="app-preflight__action" to={target.href}>
                      {target.actionLabel}
                      <ArrowUpRight size={13} aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <MarketBoard
          entries={marketEntries}
          isLoading={marketIsLoading}
          images={images}
          appliedAgencyIds={appliedAgencyIds}
          isCoreReady={gating.isCoreReady}
          isSendReady={isSendReady}
          onOpen={openApplyFlow}
          onOutbound={recordOutboundClick}
        />
      </section>

      <SubmissionLedger
        entries={ledgerEntries}
        isLoading={applicationsQuery.isLoading || trackerQuery.isLoading}
        initialOpenKey={deepLinkKey}
        onLogSubmission={() => setLoggingSubmission(true)}
        onMessage={setMessagingApplication}
        onWithdraw={setWithdrawingApplication}
        isWithdrawing={withdrawMutation.isPending}
        onAnswerSlot={(application, confirmed) => setSlotAnswer({ application, confirmed })}
        isAnsweringSlot={slotAnswerMutation.isPending}
        onDelete={setDeletingTrackerRow}
      />

      {messagingApplication && (
        <MessageDock app={messagingApplication} onClose={() => setMessagingApplication(null)} />
      )}

      <ConfirmationDialog
        isOpen={deletingTrackerRow !== null}
        title="Remove this record?"
        message={`This removes your own record of ${deletingTrackerRow?.agencyName || 'this submission'} and cannot be recovered. It never reached the agency either way — they were never told you logged it.`}
        confirmLabel={deleteTrackerMutation.isPending ? 'Deleting…' : 'Delete'}
        cancelLabel="Keep it"
        variant="destructive"
        onConfirm={() => deleteTrackerMutation.mutate(deletingTrackerRow.id)}
        onCancel={() => setDeletingTrackerRow(null)}
      />

      {/* Mounted only while open, so the form is blank every time. */}
      {loggingSubmission && (
        <LogSubmissionOverlay
          open
          onClose={() => setLoggingSubmission(false)}
          onLogged={() => {}}
        />
      )}

      <ConfirmationDialog
        isOpen={slotAnswer !== null}
        title={slotAnswer?.confirmed ? 'Confirm this slot?' : 'Decline this slot?'}
        message={
          slotAnswer?.confirmed
            ? `Confirm the slot ${slotAnswer?.application?.agency_name || 'the organizer'} offered you${
                slotAnswer?.application?.event?.name
                  ? ` for ${slotAnswer.application.event.name}`
                  : ''
              }. They will build the line-up around you, so only confirm dates you can genuinely work.`
            : `Decline the slot ${slotAnswer?.application?.agency_name || 'the organizer'} offered you${
                slotAnswer?.application?.event?.name
                  ? ` for ${slotAnswer.application.event.name}`
                  : ''
              }. The slot is released immediately and cannot be taken back.`
        }
        confirmLabel={slotAnswer?.confirmed ? 'Confirm slot' : 'Decline slot'}
        cancelLabel="Not yet"
        variant={slotAnswer?.confirmed ? 'info' : 'warning'}
        onConfirm={confirmSlotAnswer}
        onCancel={() => setSlotAnswer(null)}
      />

      <ConfirmationDialog
        isOpen={withdrawingApplication !== null}
        title="Withdraw submission?"
        message={`Withdraw the submission to ${withdrawingApplication?.agency_name || 'this agency'}? Pholio will immediately revoke the agency's platform access, redact the submitted package, and delete its message thread. Copies already downloaded by the agency cannot be recalled.`}
        confirmLabel="Withdraw"
        cancelLabel="Keep"
        variant="warning"
        onConfirm={confirmWithdraw}
        onCancel={() => setWithdrawingApplication(null)}
      />
    </div>
  );
}

function ApplicationDetail({
  app,
  onWithdraw,
  isWithdrawing,
  onAnswerSlot,
  isAnsweringSlot,
}) {
  const isEvent = isEventApplication(app);
  const config = statusConfig(app.status, { purpose: app.call_purpose });
  const StatusIcon = config.icon;
  const site = websiteUrl(app.agency_website);
  const domain = domainLabel(site);
  const board = firstBoard(app.agency_open_boards);
  const canWithdraw = canWithdrawApplication(app.status);
  const canAnswer = canAnswerSlotOffer(app);
  const age = daysSince(app.created_at);
  const eventDates = isEvent ? eventDateRange(app.event) : null;

  // No scheduler exists to auto-expire stale applications, so surface a calm,
  // truthful cue when an active submission has gone quiet for a while.
  const daysWaiting = daysSince(app.updated_at || app.created_at);
  const isStale = config.tone === 'pending' && daysWaiting !== null && daysWaiting >= 21;

  const [messagesOpen, setMessagesOpen] = useState(false);
  const agencyShort = app.agency_name ? app.agency_name.split(' ')[0] : 'agency';

  return (
    <div className="app-detail">
      {/* A real mark or none. A generated initial is a fabricated logo — it
          makes an agency that has published no branding look like it has, and
          the name set as a name is both honest and better. */}
      <div className="app-detail__mast">
        {app.agency_logo ? (
          <span className="app-detail__mark">
            <img src={app.agency_logo} alt="" />
          </span>
        ) : null}
        <h2 className="app-detail__name">{app.agency_name || 'Unknown Agency'}</h2>
      </div>

      <div className={`app-detail__status app-detail__status--${config.tone}`}>
        <StatusIcon size={15} aria-hidden />
        <span>{config.label}</span>
      </div>

      <p className="app-detail__next">{config.next}</p>
      {isStale && (
        <p className="app-detail__stale">
          {daysWaiting} days without a reply — message {agencyShort}, or withdraw to free the slot.
        </p>
      )}

      <dl className="app-detail__facts">
        {isEvent && app.event?.name && (
          <div>
            <dt>Event</dt>
            <dd>{app.event.name}</dd>
          </div>
        )}
        {eventDates && (
          <div>
            <dt>Dates</dt>
            <dd>{eventDates}</dd>
          </div>
        )}
        <div>
          <dt>{isEvent ? 'Location' : 'Market'}</dt>
          <dd>
            {(isEvent ? app.event?.location : null) || app.agency_location || 'Global'}
          </dd>
        </div>
        {board && (
          <div>
            <dt>Review focus</dt>
            <dd>{board}</dd>
          </div>
        )}
        <div>
          <dt>Submitted</dt>
          <dd>{dateLabel(app.created_at)}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {isEvent
              ? 'Event casting call'
              : app.source === 'open_call'
                ? 'Open call — invited'
                : 'Pholio discovery'}
          </dd>
        </div>
        <div>
          <dt>Age</dt>
          <dd>{age === null ? 'Pending' : `${age} days`}</dd>
        </div>
        {domain && (
          <div>
            <dt>Agency site</dt>
            <dd>
              <a href={site} target="_blank" rel="noreferrer">
                {domain}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {app.note && (
        <div className="app-detail__note">
          <span className="app-detail__note-title">Your note</span>
          <p className="app-detail__note-text">{app.note}</p>
        </div>
      )}

      {/* A live slot offer is the one thing on this panel with a deadline, so
          it sits above the standing actions rather than beside them. */}
      {canAnswer && (
        <div className="app-detail__actions app-detail__actions--offer">
          <PholioButton
            type="button"
            variant="primary"
            className="app-detail__act"
            onClick={() => onAnswerSlot?.(true)}
            disabled={isAnsweringSlot}
          >
            <Check size={14} aria-hidden />
            {isAnsweringSlot ? 'Sending…' : 'Confirm slot'}
          </PholioButton>
          <PholioButton
            type="button"
            variant="secondary"
            className="app-detail__act"
            onClick={() => onAnswerSlot?.(false)}
            disabled={isAnsweringSlot}
          >
            <X size={14} aria-hidden />
            Decline slot
          </PholioButton>
        </div>
      )}

      <div className="app-detail__actions">
        <PholioButton
          type="button"
          variant="secondary"
          className="app-detail__act"
          onClick={() => setMessagesOpen(true)}
        >
          <MessageSquare size={14} aria-hidden />
          Message {agencyShort}
        </PholioButton>
        {canWithdraw && (
          <PholioButton
            type="button"
            variant="destructive"
            className="app-detail__withdraw"
            onClick={onWithdraw}
            disabled={isWithdrawing}
          >
            {isWithdrawing ? 'Withdrawing…' : 'Withdraw submission'}
          </PholioButton>
        )}
      </div>

      <div className="app-detail__package">
        <a href="/dashboard/talent/media">Book</a>
        <a href="/dashboard/talent/profile">Profile</a>
        <a href="/dashboard/talent/media">Comp Card</a>
      </div>

      {messagesOpen && <MessageDock app={app} onClose={() => setMessagesOpen(false)} />}
    </div>
  );
}

// On-demand messaging — a focused dock anchored bottom-right, opened from the
// submission detail. Keeps the conversation out of the panel until it's wanted.
function MessageDock({ app, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div
        className="app-msgdock__scrim"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        className="app-msgdock"
        role="dialog"
        aria-label={`Messages with ${app.agency_name || 'agency'}`}
      >
        <header className="app-msgdock__head">
          <span className="app-msgdock__identity">
            <span className="app-msgdock__title">{app.agency_name || 'Agency'}</span>
            <span className="app-msgdock__meta">Submission thread</span>
          </span>
          <button
            type="button"
            className="app-msgdock__close"
            onClick={onClose}
            aria-label="Close messages"
          >
            <X size={14} strokeWidth={1.5} aria-hidden />
          </button>
        </header>
        <div className="app-msgdock__body">
          <ApplicationMessages applicationId={app.id} agencyName={app.agency_name} hideTitle />
        </div>
      </aside>
    </>,
    document.body,
  );
}
