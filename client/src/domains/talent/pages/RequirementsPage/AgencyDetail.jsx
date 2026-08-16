import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { talentApi } from '../../api/talent';
import {
  CHANNEL_TYPE,
  SLOT_STATE,
  SLOT_STATE_WORD,
  formatRegistryDate,
  joinPhrases,
  readFreshnessNotice,
  readVerificationNotice,
  sourceNeedsReview,
} from '../../lib/specRegistry';
import { SpecMark } from '../../components/spec-marks';
import { formatWindowProse } from '../../utils/callWindows';
import {
  DEFAULT_TRACKER_CHANNEL,
  isTrackerChannel,
} from '../../../../shared/constants/submissionTracker';
import styles from './RequirementsPage.module.css';

/**
 * One agency, in full — organised by what they asked for, not by how sure
 * Pholio is (ruling R-C).
 *
 * The four confidence buckets it replaces ("Attention / Confirm / Guidance /
 * Included") described Pholio's own certainty, which is not a thing a talent
 * can act on. Shots, set rules, files, eligibility and the form are, and each
 * of those is a section here.
 *
 * The framing is *requirement*, never submission. Nothing is sent from this
 * surface — for a reference agency there is no destination Pholio can deliver
 * to at all — so the detail states what the agency published, how this talent's
 * set measures against it, and where that agency does take applications. The
 * full check is shown for every agency, customer or not: the talent's need is
 * identical either way, and withholding it to protect a business boundary is
 * the pattern Pholio differentiates against.
 */

const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

function externalLinkProps(href) {
  return /^https?:\/\//i.test(String(href || ''))
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};
}

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

/** "They ask for exactly 6 images — you have 5 in your current set." */
function shotCountSentence(shotCount, coverage) {
  if (!shotCount) return null;
  const { minimum, maximum } = shotCount;
  const images = (value) => `${value} ${value === 1 ? 'image' : 'images'}`;
  let asked = null;
  if (minimum != null && maximum != null) {
    asked =
      minimum === maximum
        ? `They ask for exactly ${images(minimum)}`
        : `They ask for ${minimum}–${maximum} images`;
  } else if (minimum != null) {
    asked = `They ask for at least ${images(minimum)}`;
  } else if (maximum != null) {
    asked = `They take up to ${images(maximum)}`;
  }
  if (!asked) return null;
  const selected = coverage?.selected;
  return selected == null
    ? `${asked}.`
    : `${asked} — you have ${images(selected)} in your current set.`;
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
        // Ruling R2: what was sent, as far as Pholio honestly knows it. Images
        // only — the archive's README/STATS/EMAIL packaging is not submission
        // content an agency received.
        sentSummary: {
          revisionId: route.revisionId ?? null,
          fileCount: exportState?.imageCount ?? exportState?.fileCount ?? null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracker'] });
    },
  });

  if (dismissed) return null;

  return (
    <motion.div
      className={styles.log}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : SPRING}
    >
      {logSubmission.isSuccess ? (
        <p className={styles.logLine} role="status">
          Logged — see your submission history.
        </p>
      ) : (
        <>
          <p className={styles.logLine}>Submitted it? Log it in your tracker.</p>
          <button
            type="button"
            className={styles.logAction}
            disabled={logSubmission.isPending}
            onClick={() => logSubmission.mutate()}
          >
            {logSubmission.isPending ? 'Logging…' : 'Log it'}
          </button>
          <button
            type="button"
            className={styles.logDismiss}
            onClick={() => setDismissed(true)}
          >
            Not yet
          </button>
        </>
      )}
      {logSubmission.isError ? (
        <p className={styles.logProblem} role="alert">
          That couldn’t be logged. Your export is unaffected.
        </p>
      ) : null}
    </motion.div>
  );
}

/**
 * A section of the detail. The action lives on the section, not on every row:
 * every shot in a list shares one destination (the book), so twenty-two copies
 * of "Open profile" is noise where one is an instruction.
 */
function Section({ title, note, action, onAction, children }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {action ? (
          <a
            href={action.href}
            {...externalLinkProps(action.href)}
            className={styles.sectionAction}
            onClick={() => onAction?.(action)}
          >
            {action.label}
          </a>
        ) : null}
      </div>
      {note ? <p className={styles.sectionNote}>{note}</p> : null}
      {children}
    </section>
  );
}

/** The first destination this section's findings point at, if any. */
function firstTarget(items) {
  return items.find((item) => item?.target?.href)?.target || null;
}

export default function AgencyDetail({
  route,
  view,
  panelId,
  labelledBy,
  panelRole = 'tabpanel',
  isLoading,
  error,
  onExport,
  exportState,
  onOutboundClick,
  thumbFor,
}) {
  const reduceMotion = useReducedMotion();
  const checkedOn = formatRegistryDate(route.sourceCheckedOn);
  const freshness = readFreshnessNotice(route);
  const exporting = exportState?.status === 'pending';
  const channelLine = channelSentence(route);
  // Ruling R3: a null claim renders nothing at all. There is no "unverified".
  const registryLine = readVerificationNotice(route.verification);
  const callWindows = Array.isArray(route.callWindows) ? route.callWindows : [];
  const countLine = shotCountSentence(view?.shotCount, view?.coverage);

  return (
    <motion.section
      className={styles.detail}
      id={panelId}
      role={panelRole}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      /*
        One spring on the pane change, and only one. `AnimatePresence
        mode="wait"` made every agency switch a fade-out then a fade-in — two
        animations and a blank frame to read one row of a rail.
      */
      key={route.seriesId}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : SPRING}
    >
      <header className={styles.detailHead}>
        <div className={styles.detailIdentity}>
          {/* A heading now, not a button — the rail does the selecting. */}
          <h2 id={`${panelId}-title`} className={styles.detailName}>
            {route.agencyName}
          </h2>
          {route.marketLabel ? (
            <p className={styles.detailMarket}>{route.marketLabel}</p>
          ) : null}
          {channelLine ? <p className={styles.detailLine}>{channelLine}</p> : null}
          {/*
            The registration, stated as plainly as the channel above it. It is
            a fact from a public register, not a Pholio endorsement and not a
            tier — so it is a sentence, never a badge, and an agency Pholio
            holds no match for simply has no line here.
          */}
          {registryLine ? <p className={styles.detailLine}>{registryLine}</p> : null}
          {callWindows.length ? (
            <ul className={styles.detailWindows}>
              {callWindows.map((window) => (
                <li key={window.id} className={styles.detailWindow}>
                  {callWindowSentence(window)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {checkedOn ? (
          <p className={styles.detailVerified}>Verified on {checkedOn}</p>
        ) : null}
      </header>

      {isLoading ? (
        <p className={styles.note} role="status">
          Checking your set against this route…
        </p>
      ) : error ? (
        <p className={styles.note}>
          This check couldn’t load. The agency’s own page is the source of truth.
        </p>
      ) : !view?.hasAnything ? (
        <p className={styles.note}>
          {route.agencyName} publishes no requirements Pholio can check yet. Read their
          submission page before you send anything.
        </p>
      ) : (
        <>
          {/*
            The lede: the answer first, in the Intel lockup — figure, hairline,
            qualifier — then the one list that says what to do about it.
          */}
          {view.published > 0 ? (
            <div className={styles.lede}>
              <p className={styles.ledeFigure}>
                {view.covered} <span className={styles.ledeOf}>of</span> {view.published}
              </p>
              <span className={styles.ledeRule} aria-hidden="true" />
              <p className={styles.ledeQualifier}>
                of the shots <b className={styles.emph}>{route.agencyName}</b> publishes
                are in your current set.
              </p>
              {view.missingLabels.length ? (
                <p className={styles.ledeMissing}>
                  Missing: {view.missingLabels.join(' · ')}
                </p>
              ) : null}
            </div>
          ) : (
            <p className={styles.note}>
              {route.agencyName} publishes no shot list — form details only.
            </p>
          )}

          {view.shots.length ? (
            <Section
              title="Shots"
              note={countLine}
              action={firstTarget(
                view.shots.filter((shot) => shot.state === SLOT_STATE.NEEDED),
              )}
            >
              <ul className={styles.slots}>
                {view.shots.map((shot) => {
                  const src = shot.imageId ? thumbFor?.(shot.imageId) : null;
                  return (
                    <li key={shot.key} className={styles.slot}>
                      <span
                        className={`${styles.slotFrame}${
                          src ? '' : ` ${styles.slotFrameEmpty}`
                        }`}
                      >
                        {src ? (
                          <img
                            className={styles.slotImg}
                            src={src}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                          />
                        ) : null}
                      </span>
                      <span className={styles.slotText}>
                        <span className={styles.slotName}>{shot.label}</span>
                        {/* The agency's own wording, only where it says
                            something the canonical name does not. */}
                        {shot.marginalia ? (
                          <span className={styles.marginalia}>
                            They call it “{shot.marginalia}”
                          </span>
                        ) : null}
                      </span>
                      <span className={styles.slotState}>
                        <SpecMark state={shot.state} size={11} />
                        {SLOT_STATE_WORD[shot.state]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {view.setRules.length ? (
            <Section
              title="Set rules"
              note={`How ${route.agencyName} asks the pictures to be taken, in their own words.`}
            >
              <ul className={styles.rules}>
                {view.setRules.map((rule) => (
                  <li key={rule.key} className={styles.rule}>
                    <span className={styles.ruleSubject}>{rule.subject}</span>
                    <span className={styles.ruleText}>{rule.text}</span>
                    {rule.modality ? (
                      <span className={styles.ruleModality}>{rule.modality}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {view.files ? (
            <Section title="Files">
              <p className={styles.prose}>
                Their form publishes limits on {joinPhrases(view.files.subjects)} — your
                export is converted and resized to fit.
              </p>
              {view.files.published.length ? (
                <p className={styles.marginalia}>
                  As published: {view.files.published.map((text) => `“${text}”`).join(' · ')}
                </p>
              ) : null}
            </Section>
          ) : null}

          {view.eligibility.length ? (
            <Section title="Eligibility" action={firstTarget(view.eligibility)}>
              <ul className={styles.plainList}>
                {view.eligibility.map((item) => (
                  <li key={item.key} className={styles.plainItem}>
                    <span className={styles.plainText}>{item.sentence}</span>
                    {item.marginalia ? (
                      <span className={styles.marginalia}>
                        They publish it as “{item.marginalia}”
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {view.formFields ? (
            <Section
              title="Their form asks for"
              action={{ href: '/dashboard/talent/profile', label: 'Open profile' }}
            >
              <p className={styles.prose}>{joinPhrases(view.formFields.list)}.</p>
              {/*
                One sentence for the whole group. The same list rendered as
                rows ran to thirty-three lines, every one of them repeating
                "Pholio cannot verify this" — which is a rendering choice, not
                a server obligation.
              */}
              {view.formFields.unverifiable ? (
                <p className={styles.prose}>
                  Pholio can’t check these from your profile — have them ready.
                </p>
              ) : null}
            </Section>
          ) : null}

          {view.notPublished ? (
            <Section title="Not published">
              <p className={styles.prose}>{view.notPublished}</p>
            </Section>
          ) : null}
        </>
      )}

      <div className={styles.foot}>
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
            className={styles.out}
            onClick={() => onOutboundClick?.(route)}
          >
            Open their application page
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        ) : null}
        {/*
          What the registration is actually *for*, on the surface where it
          matters: the link beside it goes to the agency the register names, so
          a lookalike site collecting applications is not this one.
        */}
        {route.sourceUrl && registryLine ? (
          <p className={styles.outNote}>Registry-verified official channel.</p>
        ) : null}
      </div>

      {exportState?.status === 'error' ? (
        <p className={styles.problem} role="alert">
          {exportState.message}
        </p>
      ) : null}
      {exportState?.status === 'done' ? (
        <p className={styles.done} role="status">
          {exportState.fileCount} file{exportState.fileCount === 1 ? '' : 's'} downloaded as{' '}
          {exportState.filename}.
        </p>
      ) : null}
      {/* Keyed on the export, so a second one is a second chance to log it —
          while a prompt the talent put down stays down for that export. */}
      {exportState?.status === 'done' ? (
        <TrackerPrompt
          key={exportState.filename || 'export'}
          route={route}
          exportState={exportState}
        />
      ) : null}

      {/*
        Provenance, never behind a disclosure. This is the difference between
        "we catalogued Elite's published requirements" and "we speak for Elite",
        and it is the protection when a spec changes and someone's set is
        turned away.
      */}
      <p className={styles.provenance}>
        Requirements as published by {route.agencyName}. Pholio is not affiliated with{' '}
        {route.agencyName}.
      </p>
      {sourceNeedsReview(route) && freshness ? (
        <p className={styles.caution}>{freshness}</p>
      ) : null}
    </motion.section>
  );
}
