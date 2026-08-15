import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { talentApi } from '../../api/talent';
import {
  CHANNEL_TYPE,
  formatRegistryDate,
  groupFindings,
  readFreshnessNotice,
  readVerificationNotice,
  sourceNeedsReview,
} from '../../lib/specRegistry';
import { formatWindowProse } from '../../utils/callWindows';
import {
  DEFAULT_TRACKER_CHANNEL,
  isTrackerChannel,
} from '../../../../shared/constants/submissionTracker';
import styles from './RequirementsPage.module.css';

/**
 * One agency, in full, opened from the ledger above.
 *
 * The framing is *requirement*, never submission. Nothing is sent from this
 * surface — for a reference agency there is no destination Pholio can deliver
 * to at all — so the plate states what the agency published, how this talent's
 * set measures against it, and where that agency does take applications.
 *
 * The full check is shown for every agency, customer or not. The talent's need
 * is identical either way, and withholding it to protect a business boundary is
 * the pattern Pholio differentiates against.
 */

function externalLinkProps(href) {
  return /^https?:\/\//i.test(String(href || ''))
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};
}

const EASE = [0.4, 0, 0.2, 1];
const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

/**
 * The talent's own calendar day, not UTC's. A set exported at 8pm in Los
 * Angeles was submitted that evening, and a tracker row dated tomorrow would
 * be wrong on the one field the talent can check.
 */
function todayIso() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * How this agency takes applications, said before the set is built.
 *
 * A reference agency is one Pholio cannot deliver to, and the errand differs by
 * channel: an emailed application is a message the talent sends, not a form
 * they fill in, and the sentence has to arrive early enough to be useful.
 */
function channelSentence(route) {
  if (route.acceptsPholioSubmissions) return null;
  if (route.channelType === CHANNEL_TYPE.OFFICIAL_EMAIL) {
    return 'Applies by email — we prepare the message and attachments.';
  }
  return 'Applies via their own site — we prepare a conforming set.';
}

/** "Walk-in open call: Thursdays 3–4 PM ET · 35 W 36th St · bring digitals" */
function callWindowSentence(window) {
  const when = formatWindowProse(window);
  const head = window.label ? `${window.label}: ${when}` : when;
  return [head, window.location, window.instructions].filter(Boolean).join(' · ');
}

/**
 * The one thing Pholio cannot see: whether the talent actually sent it.
 *
 * An exported set is evidence of intent, never of a submission — the sending
 * happens on the agency's own site, off Pholio entirely. So the prompt asks
 * rather than assumes, and it stays a line of text with a text action: a
 * talent who did not send it should be able to ignore this without deciding
 * anything.
 */
function TrackerPrompt({ route, exportState }) {
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  const logSubmission = useMutation({
    mutationFn: () =>
      talentApi.logTrackedSubmission({
        agencyName: route.agencyName,
        seriesId: route.seriesId,
        channel: isTrackerChannel(route.channelType)
          ? route.channelType
          : DEFAULT_TRACKER_CHANNEL,
        submittedOn: todayIso(),
        // Ruling R2: what was sent, as far as Pholio honestly knows it.
        sentSummary: {
          revisionId: route.revisionId ?? null,
          fileCount: exportState?.fileCount ?? null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracker'] });
    },
  });

  if (dismissed) return null;

  return (
    <motion.div
      className={styles.plateLog}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : SPRING}
    >
      {logSubmission.isSuccess ? (
        <p className={styles.plateLogLine} role="status">
          Logged — see your submission history.
        </p>
      ) : (
        <>
          <p className={styles.plateLogLine}>Submitted it? Log it in your tracker.</p>
          <button
            type="button"
            className={styles.plateLogAction}
            disabled={logSubmission.isPending}
            onClick={() => logSubmission.mutate()}
          >
            {logSubmission.isPending ? 'Logging…' : 'Log it'}
          </button>
          <button
            type="button"
            className={styles.plateLogDismiss}
            onClick={() => setDismissed(true)}
          >
            Not yet
          </button>
        </>
      )}
      {logSubmission.isError ? (
        <p className={styles.plateLogProblem} role="alert">
          That couldn’t be logged. Your export is unaffected.
        </p>
      ) : null}
    </motion.div>
  );
}

function FindingRows({ findings }) {
  return (
    <ul className={styles.findings}>
      {findings.map((finding) => (
        <li key={finding.id} className={styles.finding}>
          <span className={styles.findingLabel}>{finding.label}</span>
          {finding.guidance ? (
            <span className={styles.findingGuidance}>{finding.guidance}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Against real registry data one agency's "confirm yourself" group runs to 33
 * entries — every application field they publish. Inline, that buries the one
 * thing to act on. What needs doing stays open; the long, lower-urgency groups
 * announce their size and wait to be asked.
 */
function FindingGroup({ title, findings, collapsible = false }) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  if (!findings.length) return null;

  const heading = `${title} · ${findings.length}`;

  if (!collapsible) {
    return (
      <section className={styles.group}>
        <h3 className={styles.groupTitle}>{heading}</h3>
        <FindingRows findings={findings} />
      </section>
    );
  }

  return (
    <section className={`${styles.group} ${styles.groupCollapsible}`}>
      <h3 className={styles.groupTitleRow}>
        <button
          type="button"
          className={styles.groupToggle}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={styles.groupTitle}>{heading}</span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`${styles.groupChevron}${open ? ` ${styles.groupChevronOpen}` : ''}`}
          />
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className={styles.groupBody}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE }}
          >
            <FindingRows findings={findings} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export default function AgencyPlate({
  route,
  evaluation,
  isLoading,
  error,
  onExport,
  exportState,
  onOutboundClick,
}) {
  const reduceMotion = useReducedMotion();
  const groups = evaluation ? groupFindings(evaluation.findings) : null;
  const hasFindings = groups
    ? Object.values(groups).some((findings) => findings.length > 0)
    : false;
  const checkedOn = formatRegistryDate(route.sourceCheckedOn);
  const freshness = readFreshnessNotice(route);
  const exporting = exportState?.status === 'pending';
  const channelLine = channelSentence(route);
  // Ruling R3: a null claim renders nothing at all. There is no "unverified".
  const registryLine = readVerificationNotice(route.verification);
  const callWindows = Array.isArray(route.callWindows) ? route.callWindows : [];

  return (
    <motion.section
      className={styles.plate}
      aria-labelledby="agency-plate-title"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.15, ease: EASE }}
    >
      <header className={styles.plateHead}>
        <div className={styles.plateIdentity}>
          <h2 id="agency-plate-title" className={styles.plateName}>
            {route.agencyName}
          </h2>
          {route.marketLabel ? (
            <p className={styles.plateOffice}>{route.marketLabel}</p>
          ) : null}
          {/*
            Stated in plain text rather than marked with a chip. A talent who
            reads this line and then cannot find a Send button on Pholio has
            been misled by the interface, so the sentence has to arrive before
            they build the package, not after.
          */}
          {channelLine ? <p className={styles.plateChannel}>{channelLine}</p> : null}
          {/*
            The registration, stated as plainly as the channel above it. It is
            a fact from a public register, not a Pholio endorsement and not a
            tier — so it is a sentence, never a badge, and an agency Pholio
            holds no match for simply has no line here.
          */}
          {registryLine ? <p className={styles.plateRegistry}>{registryLine}</p> : null}
          {callWindows.length ? (
            <ul className={styles.plateWindows}>
              {callWindows.map((window) => (
                <li key={window.id} className={styles.plateWindow}>
                  {callWindowSentence(window)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {checkedOn ? (
          <p className={styles.plateVerified}>Verified on {checkedOn}</p>
        ) : null}
      </header>

      <div className={styles.plateBody}>
        {isLoading ? (
          <p className={styles.plateNote} role="status">
            Checking your set against this route…
          </p>
        ) : error ? (
          <p className={styles.plateNote}>
            This check couldn’t load. The agency’s own page is the source of truth.
          </p>
        ) : hasFindings ? (
          <>
            <FindingGroup title="Attention" findings={groups.attention} />
            <FindingGroup title="Confirm" findings={groups.confirm} />
            <FindingGroup title="Guidance" findings={groups.guidance} collapsible />
            <FindingGroup title="Included" findings={groups.included} collapsible />
          </>
        ) : (
          <p className={styles.plateNote}>
            {route.agencyName} publishes no requirements Pholio can check yet. Read their
            submission page before you send anything.
          </p>
        )}
      </div>

      <div className={styles.plateFoot}>
        {/*
          Never gated behind Studio+. A spec-correct set exists to get the
          talent into an agency's hands, which puts it in the submission
          pipeline the plan's A1-2 invariant protects.
        */}
        <PholioButton
          type="button"
          variant="primary"
          loading={exporting}
          aria-label={`Export the ${route.agencyName} conforming set`}
          onClick={() => onExport?.(route)}
        >
          {exporting ? 'Preparing…' : 'Export conforming set'}
        </PholioButton>

        {route.sourceUrl ? (
          <a
            href={route.sourceUrl}
            {...externalLinkProps(route.sourceUrl)}
            className={styles.plateOut}
            onClick={() => onOutboundClick?.(route)}
          >
            Open their application page
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        ) : null}
        {/*
          What the registration is actually *for*, on the surface where it
          matters: the link below goes to the agency the register names, so a
          lookalike site collecting applications is not this one.
        */}
        {route.sourceUrl && registryLine ? (
          <p className={styles.plateOutNote}>Registry-verified official channel.</p>
        ) : null}
      </div>

      {exportState?.status === 'error' ? (
        <p className={styles.plateProblem} role="alert">
          {exportState.message}
        </p>
      ) : null}
      {exportState?.status === 'done' ? (
        <p className={styles.plateDone} role="status">
          {exportState.fileCount} file{exportState.fileCount === 1 ? '' : 's'} downloaded as{' '}
          {exportState.filename}.
        </p>
      ) : null}
      {/* Keyed on the export, so a second one is a second chance to log it —
          while a prompt the talent put down stays down for that export. */}
      <AnimatePresence initial={false}>
        {exportState?.status === 'done' ? (
          <TrackerPrompt
            key={exportState.filename || 'export'}
            route={route}
            exportState={exportState}
          />
        ) : null}
      </AnimatePresence>

      {/*
        Provenance, never behind a disclosure. This is the difference between
        "we catalogued Elite's published requirements" and "we speak for Elite",
        and it is the protection when a spec changes and someone's set is
        turned away.
      */}
      <p className={styles.plateProvenance}>
        Requirements as published by {route.agencyName}. Pholio is not affiliated with{' '}
        {route.agencyName}.
      </p>
      {sourceNeedsReview(route) && freshness ? (
        <p className={styles.plateCaution}>{freshness}</p>
      ) : null}
    </motion.section>
  );
}
