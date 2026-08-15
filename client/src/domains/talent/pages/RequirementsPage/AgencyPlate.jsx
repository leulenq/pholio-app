import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Download } from 'lucide-react';
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
 * One agency, in full, opened from the grid above.
 *
 * The framing is *requirement*, never submission. Nothing is sent from this
 * surface — for a reference agency there is no destination Pholio can deliver
 * to at all — so the plate answers what the agency published and how this
 * talent's set measures against it, and then points at wherever that agency
 * does take applications.
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

function pad(value) {
  return String(value).padStart(2, '0');
}

function FindingGroup({ title, findings, collapsed = false }) {
  if (!findings.length) return null;

  const heading = (
    <>
      <h4 className={styles.groupTitle}>{title}</h4>
      <span className={styles.groupCount}>{pad(findings.length)}</span>
    </>
  );

  const body = (
    <ul className={styles.findings}>
      {findings.map((finding, index) => (
        <li key={finding.id} className={styles.finding} style={{ '--rq-row-index': index }}>
          <span className={styles.findingIndex} aria-hidden="true">{pad(index + 1)}</span>
          <p className={styles.findingLabel}>{finding.label}</p>
          {finding.guidance ? (
            <p className={styles.findingGuidance}>{finding.guidance}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );

  /*
    Against real registry data one agency's "confirm yourself" group runs to 33
    entries — every application field they publish. Inline, that buries the one
    thing to act on and pushes the provenance line out of sight. What is still
    needed stays open; the long, lower-urgency groups announce their size.
  */
  if (collapsed) {
    return (
      <details className={styles.group}>
        <summary className={styles.groupSummary}>
          {heading}
          <span className={styles.groupMark} aria-hidden="true">+</span>
        </summary>
        {body}
      </details>
    );
  }

  return (
    <section className={styles.group}>
      <div className={styles.groupHead}>{heading}</div>
      {body}
    </section>
  );
}

export default function AgencyPlate({
  route,
  evaluation,
  isLoading,
  error,
  index = 0,
  onExport,
  exportState,
  onOutboundClick,
}) {
  const [showAll, setShowAll] = useState(false);
  const reduceMotion = useReducedMotion();

  const groups = evaluation ? groupFindings(evaluation.findings) : null;
  const summary = evaluation ? readSummary(evaluation.summary) : null;
  const coverage = evaluation ? readShotCoverage(evaluation.shotCoverage) : null;
  const checkedOn = formatRegistryDate(route.sourceCheckedOn);
  const freshness = readFreshnessNotice(route);
  const exporting = exportState?.status === 'pending';

  /*
    The figure counts shot slots, so the line under it names shots — not the
    file limits and social handles that also need attention. Unfiltered, this
    read "Image count · Close-up · Waist-up · Instagram · TikTok · YouTube URL ·
    Facebook · Twitter · Twitch" beneath a count of four, which is two different
    questions in one sentence.
  */
  const missing =
    groups?.attention
      ?.filter((finding) => finding.categoryKey === 'shots')
      .map((finding) => finding.label) ?? [];
  const otherAttention = groups?.attention?.length ? groups.attention.length - missing.length : 0;

  return (
    <motion.section
      key={route.seriesId}
      className={styles.plate}
      aria-labelledby="agency-plate-title"
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 54, damping: 17 }
      }
    >
      <header className={styles.plateHead}>
        <div className={styles.plateIdentity}>
          <span className={styles.plateIndex} aria-hidden="true">{pad(index + 1)}</span>
          <h2 id="agency-plate-title" className={styles.plateName}>{route.agencyName}</h2>
          <p className={styles.plateMeta}>
            {route.marketLabel ? (
              <>
                <span>{route.marketLabel}</span>
                <span className={styles.plateMetaRule} aria-hidden="true" />
              </>
            ) : null}
            {/*
              Marked per entry as inline plain text in the ledger's metadata
              voice. The direction called this a badge; root CLAUDE.md bans
              badge and chip patterns and names the alternative directly.
            */}
            <span className={route.acceptsPholioSubmissions ? styles.plateMetaOn : undefined}>
              {route.acceptsPholioSubmissions
                ? 'Accepts applications through Pholio'
                : 'Applies on their own site'}
            </span>
          </p>
        </div>

        <div className={styles.plateStatus}>
          {isLoading ? (
            <p className={styles.checking} role="status">Checking your set…</p>
          ) : error ? (
            <p className={styles.problem}>
              This check couldn’t load. The agency’s own page is the source of truth.
            </p>
          ) : coverage?.published ? (
            <div className={styles.coverage}>
              <p className={styles.coverageFigure}>
                {coverage.matched}
                <span>&thinsp;/&thinsp;{coverage.published}</span>
              </p>
              <span className={styles.coverageOf}>shots covered</span>
            </div>
          ) : (
            <p className={styles.coverageNone}>This agency publishes no shot list.</p>
          )}
        </div>
      </header>

      {missing.length || otherAttention ? (
        <p className={styles.plateMissing}>
          {missing.length ? (
            <>
              <strong>Still needed</strong> {missing.join(' · ')}
            </>
          ) : null}
          {otherAttention ? (
            <span className={styles.plateOther}>
              {missing.length ? ' · ' : null}
              {otherAttention} other published requirement
              {otherAttention === 1 ? '' : 's'} to check
            </span>
          ) : null}
        </p>
      ) : null}

      <div className={styles.plateActions}>
        {/*
          Never gated behind Studio+. A spec-correct set exists to get the
          talent into an agency's hands, which puts it in the submission
          pipeline invariant A1-2 protects and inside the §1701 analysis in C1.
        */}
        <PholioButton
          type="button"
          variant="secondary"
          loading={exporting}
          icon={<Download size={13} aria-hidden="true" />}
          aria-label={`Download the ${route.agencyName}-ready set`}
          onClick={() => onExport?.(route)}
        >
          {exporting ? 'Preparing…' : 'Download the set'}
        </PholioButton>

        {route.sourceUrl ? (
          <PholioButton
            as="a"
            href={route.sourceUrl}
            {...externalLinkProps(route.sourceUrl)}
            variant="meta"
            className={styles.actionOut}
            onClick={() => onOutboundClick?.(route)}
          >
            Apply on their site
            <ArrowUpRight size={12} aria-hidden="true" />
          </PholioButton>
        ) : null}

        <PholioButton
          type="button"
          variant="meta"
          aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? 'Hide the full check' : 'See the full check'}
        </PholioButton>
      </div>

      {exportState?.status === 'error' ? (
        <p className={styles.problem} role="alert">{exportState.message}</p>
      ) : null}
      {exportState?.status === 'done' ? (
        <p className={styles.done} role="status">
          {exportState.fileCount} file{exportState.fileCount === 1 ? '' : 's'} downloaded as{' '}
          {exportState.filename}.
        </p>
      ) : null}

      {showAll && groups ? (
        <div className={styles.check}>
          {summary ? (
            <p className={styles.tally}>
              {[
                summary.needsAttention ? `${summary.needsAttention} to add` : null,
                summary.confirm ? `${summary.confirm} to confirm yourself` : null,
                summary.included ? `${summary.included} already covered` : null,
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </p>
          ) : null}
          <FindingGroup title="Still needed" findings={groups.attention} />
          <FindingGroup title="Confirm yourself" findings={groups.confirm} collapsed />
          <FindingGroup title="Published guidance" findings={groups.guidance} collapsed />
          <FindingGroup title="Already covered" findings={groups.included} collapsed />
        </div>
      ) : null}

      {/*
        Provenance, always visible — not behind the disclosure. This is the
        difference between "we catalogued Elite's published requirements" and
        "we speak for Elite", and it is the protection when a spec changes and
        someone's set is rejected.
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
    </motion.section>
  );
}
