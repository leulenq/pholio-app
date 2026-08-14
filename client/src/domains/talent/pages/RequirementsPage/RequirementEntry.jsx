import React, { useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ChevronDown, Download } from 'lucide-react';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import {
  formatRegistryDate,
  groupFindings,
  readFreshnessNotice,
  readShotCoverage,
  readSummary,
  sourceNeedsReview,
} from '../../lib/specRegistry';
import styles from './RequirementsPage.module.css';

/**
 * One agency in the directory.
 *
 * The framing is *requirement*, never submission. Nothing here is sent — for a
 * reference agency there is no destination Pholio can deliver to, and telling a
 * talent to "prepare a package for Elite" on a surface that cannot send it is
 * the misdirection this rebuild exists to remove. The entry answers the two
 * questions the talent actually has: what does this agency want, and am I
 * ready?
 */

function externalLinkProps(href) {
  return /^https?:\/\//i.test(String(href || ''))
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};
}

/**
 * "Your current set covers 2 of 3."
 *
 * `matched` is how many of the talent's images the matcher placed in a
 * published slot; `published` is how many slots the agency publishes. Anything
 * else — a percentage, a score — would be Pholio inventing a judgement on top
 * of the agency's own list.
 */
function coverageSentence(coverage) {
  if (!coverage || coverage.published == null || coverage.matched == null) return null;
  if (coverage.published === 0) return 'This agency does not publish a shot list.';
  return `Your current set covers ${coverage.matched} of ${coverage.published}.`;
}

function FindingList({ findings }) {
  return (
    <ul className={styles.findings}>
      {findings.map((finding) => (
        <li key={finding.id} className={styles.finding}>
          <p className={styles.findingLabel}>{finding.label}</p>
          {finding.guidance ? (
            <p className={styles.findingGuidance}>{finding.guidance}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * `collapsed` groups open on demand.
 *
 * Against real registry data one agency's "confirm yourself" group runs to 33
 * entries — every application field they publish. Rendered inline that buries
 * the one thing the talent has to act on and pushes the provenance line off the
 * bottom of the entry. What is still needed stays open; the long, lower-urgency
 * groups announce their size and wait to be asked.
 */
function FindingGroup({ title, findings, collapsed = false }) {
  if (!findings.length) return null;

  const heading = (
    <>
      {title} <span className={styles.findingGroupCount}>{findings.length}</span>
    </>
  );

  if (collapsed) {
    return (
      <details className={styles.findingGroup}>
        <summary className={styles.findingGroupSummary}>
          <h4 className={styles.findingGroupTitle}>{heading}</h4>
        </summary>
        <FindingList findings={findings} />
      </details>
    );
  }

  return (
    <section className={styles.findingGroup}>
      <h4 className={styles.findingGroupTitle}>{heading}</h4>
      <FindingList findings={findings} />
    </section>
  );
}

export default function RequirementEntry({
  route,
  evaluation,
  isLoading,
  error,
  index = 0,
  onExport,
  exportState,
  onOutboundClick,
}) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const reduceMotion = useReducedMotion();

  const groups = evaluation ? groupFindings(evaluation.findings) : null;
  const summary = evaluation ? readSummary(evaluation.summary) : null;
  const coverage = evaluation ? readShotCoverage(evaluation.shotCoverage) : null;
  const checkedOn = formatRegistryDate(route.sourceCheckedOn);
  const freshness = readFreshnessNotice(route);
  /*
    The headline pair has to be about one thing. "Covers 2 of 3" counts shot
    slots, so the line under it names the shots that are missing — not the file
    limits and social handles that also need attention. Against real registry
    data the unfiltered list read "Missing: Image count · Close-up · Waist-up ·
    Instagram · TikTok · YouTube URL · Facebook · Twitter · Twitch" beneath a
    count of four, which is two different questions in one sentence. Everything
    else is still shown, in the full check below, under its own heading.
  */
  const missing =
    groups?.attention
      ?.filter((finding) => finding.categoryKey === 'shots')
      .map((finding) => finding.label) ?? [];
  const otherAttention = groups?.attention?.length ? groups.attention.length - missing.length : 0;
  const exporting = exportState?.status === 'pending';

  return (
    <motion.li
      className={styles.entry}
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0.2 }
          : { type: 'spring', stiffness: 55, damping: 16, delay: Math.min(index * 0.05, 0.4) }
      }
    >
      <div className={styles.entryHead}>
        <div className={styles.entryIdentity}>
          <h3 className={styles.entryName}>{route.agencyName}</h3>
          {route.marketLabel ? (
            <p className={styles.entryMarket}>{route.marketLabel}</p>
          ) : null}
        </div>

        <div className={styles.entryStatus}>
          {isLoading ? (
            <p className={styles.entryChecking} role="status">Checking your set…</p>
          ) : error ? (
            <p className={styles.entryProblem}>
              This check couldn’t load. The agency’s own page is the source of truth.
            </p>
          ) : (
            <>
              <p className={styles.entryCoverage}>{coverageSentence(coverage)}</p>
              {missing.length ? (
                <p className={styles.entryMissing}>Missing: {missing.join(' · ')}</p>
              ) : coverage?.published && !otherAttention ? (
                <p className={styles.entryComplete}>
                  Everything this agency publishes is covered.
                </p>
              ) : null}
              {otherAttention ? (
                <p className={styles.entryComplete}>
                  {otherAttention} other published requirement
                  {otherAttention === 1 ? '' : 's'} to check.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/*
        Marked per entry, as inline plain text. The direction called this a
        badge; root CLAUDE.md bans badge and chip patterns (4, 5, 7, 10) and
        names the alternative directly — render it as plain text inline. The
        information survives, the banned treatment does not. It also stays with
        the entry rather than splitting the directory into two labelled groups,
        which would front-load a distinction the talent does not care about
        until the moment they act.
      */}
      <p className={styles.entryDelivery}>
        {route.acceptsPholioSubmissions
          ? 'Accepts applications through Pholio.'
          : 'Applies on their own site.'}
      </p>

      <div className={styles.entryActions}>
        <PholioButton
          type="button"
          variant="secondary"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Hide requirements' : 'See requirements'}
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`${styles.chevron}${open ? ` ${styles.chevronOpen}` : ''}`}
          />
        </PholioButton>

        {/*
          Never gated behind Studio+. A spec-correct set exists to get the
          talent into an agency's hands, which puts it in the submission
          pipeline invariant A1-2 protects and inside the §1701 analysis in C1.
        */}
        <PholioButton
          type="button"
          variant="primary"
          loading={exporting}
          onClick={() => onExport?.(route)}
        >
          <Download size={14} aria-hidden="true" />
          {exporting ? 'Preparing…' : `Download ${route.agencyName}-ready set`}
        </PholioButton>

        {route.sourceUrl ? (
          <PholioButton
            as="a"
            href={route.sourceUrl}
            {...externalLinkProps(route.sourceUrl)}
            variant="tertiary"
            onClick={() => onOutboundClick?.(route)}
          >
            Apply on their site
            <ArrowUpRight size={14} aria-hidden="true" />
          </PholioButton>
        ) : null}
      </div>

      {exportState?.status === 'error' ? (
        <p className={styles.entryProblem} role="alert">{exportState.message}</p>
      ) : null}
      {exportState?.status === 'done' ? (
        <p className={styles.entryDone} role="status">
          {exportState.fileCount} file{exportState.fileCount === 1 ? '' : 's'} downloaded as{' '}
          {exportState.filename}.
        </p>
      ) : null}

      {open ? (
        <div className={styles.entryDetail} id={detailId}>
          {groups ? (
            <>
              {summary ? (
                <p className={styles.detailTally}>
                  {[
                    summary.needsAttention ? `${summary.needsAttention} to add` : null,
                    summary.confirm ? `${summary.confirm} to confirm yourself` : null,
                    summary.included ? `${summary.included} already covered` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}
              <FindingGroup title="Still needed" findings={groups.attention} />
              <FindingGroup title="Confirm yourself" findings={groups.confirm} collapsed />
              <FindingGroup title="Published guidance" findings={groups.guidance} collapsed />
              <FindingGroup title="Already covered" findings={groups.included} collapsed />
            </>
          ) : (
            <p className={styles.detailEmpty}>
              Pholio has this agency’s route but no requirements check for it yet.
            </p>
          )}

          {/*
            Provenance, on every entry. This is the difference between "we
            catalogued Elite's published requirements" and "we speak for Elite",
            and it is the protection when a spec changes and someone's set is
            rejected.
          */}
          <p className={styles.provenance}>
            Requirements as published by {route.agencyName}
            {checkedOn ? `, checked ${checkedOn}` : ''}.{' '}
            {route.sourceUrl ? (
              <a
                href={route.sourceUrl}
                {...externalLinkProps(route.sourceUrl)}
                className={styles.provenanceLink}
                onClick={() => onOutboundClick?.(route)}
              >
                View their page
              </a>
            ) : null}{' '}
            Pholio is not affiliated with {route.agencyName}.
          </p>
          {sourceNeedsReview(route) && freshness ? (
            <p className={styles.provenanceCaution}>{freshness}</p>
          ) : null}
        </div>
      ) : null}
    </motion.li>
  );
}
