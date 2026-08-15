import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { apiClient } from '../../../shared/lib/api-client';
import PholioButton from '../../../shared/components/ui/PholioButton';
import PholioCustomSelect from '../../../shared/components/ui/forms/PholioCustomSelect';
import {
  MATRIX_CELL,
  OUTCOME,
  formatRegistryDate,
  groupFindings,
  readFinding,
  readFreshnessNotice,
  readShotCoverage,
  sourceNeedsReview,
} from '../lib/specRegistry';
import { SpecMark } from './spec-marks';
import styles from './RegistryPreflight.module.css';

/**
 * Read-only preview of the current package against an agency-route registry
 * revision. Keeping the request here makes the component usable before the
 * talent API grows a named wrapper; callers can replace it with `queryFn`.
 */
async function defaultRegistryPreflightQuery(payload) {
  return apiClient.post('/spec-registry/preflight', payload);
}

const EASE = [0.4, 0, 0.2, 1];
const REQUIREMENTS_HREF = '/dashboard/talent/applications/requirements';

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * A multi-route request answers with `results`; a single-route request answers
 * with the evaluation itself. Both shapes come from `evaluationDto`, so once
 * the right entry is picked there is nothing left to normalize.
 */
function selectEvaluation(payload, selectedRevisionId) {
  const envelope = asObject(payload?.data ?? payload);
  const results = asArray(envelope.results);
  const evaluation =
    results.length > 0
      ? asObject(
          results.find((item) => item?.revisionId === selectedRevisionId) || results[0],
        )
      : envelope;
  return {
    evaluation,
    routeOptions: results,
    resolution: envelope.resolution ?? evaluation.resolution ?? null,
    available: envelope.available !== false && evaluation.available !== false,
  };
}

function externalLinkProps(href) {
  return /^https?:\/\//i.test(String(href || ''))
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};
}

/** "Elite Models’ published route", not "Elite Models's published route". */
function possessive(name) {
  const value = String(name || '').trim();
  if (!value) return 'this agency’s';
  return /s$/i.test(value) ? `${value}’` : `${value}’s`;
}

/** The one figure the talent came for, as a sentence rather than a scoreboard. */
function coverageSentence(coverage) {
  if (!coverage || !coverage.published) return null;
  const matched = coverage.matched ?? 0;
  return `${matched} of ${coverage.published} shot${coverage.published === 1 ? '' : 's'} matched`;
}

/**
 * Published shot slots, in the order the server listed them.
 *
 * `not_applicable` is dropped for the same reason `groupFindings` drops it: a
 * requirement that does not apply to this talent is noise, and a mark for it
 * would make the schematic count slots nobody is asking them to fill.
 */
function readShotSlots(findings) {
  return asArray(findings)
    .map(readFinding)
    .filter(
      (finding) =>
        finding.categoryKey === 'shots' && finding.outcome !== OUTCOME.NOT_APPLICABLE,
    )
    .map((finding) => ({
      id: finding.id,
      label: finding.label,
      outcome: finding.outcome,
    }));
}

function FindingRow({ finding, withMark = false, onAction }) {
  return (
    <li className={styles.row}>
      {withMark ? (
        <SpecMark state={MATRIX_CELL.WANTED} size={12} className={styles.rowMark} />
      ) : null}
      <span className={styles.rowLabel}>{finding.label}</span>
      {finding.guidance ? (
        <span className={styles.rowGuidance}>{finding.guidance}</span>
      ) : null}
      {finding.target ? (
        <a
          href={finding.target.href}
          {...externalLinkProps(finding.target.href)}
          className={styles.rowAction}
          onClick={() => onAction?.(finding)}
        >
          {finding.target.label}
        </a>
      ) : null}
    </li>
  );
}

function DetailGroup({ title, findings, onAction }) {
  if (!findings.length) return null;
  return (
    <div className={styles.detailGroup}>
      <h3 className={styles.detailTitle}>
        {title} · {findings.length}
      </h3>
      <ul className={styles.rows}>
        {findings.map((finding) => (
          <FindingRow key={finding.id} finding={finding} onAction={onAction} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Score-free, advisory registry preflight for a selected application package.
 * Findings never prevent a caller from continuing their submission flow.
 *
 * Presented as a well panel rather than a card: this sits inside a wizard step
 * beside the talent's actual work, and advisory furniture that carries card
 * weight starts competing with the thing it is advising about. The three-state
 * marks are the same ones the Agency requirements ledger uses — a talent who
 * studied the grid an hour ago should recognise the answer here at a glance.
 */
export default function RegistryPreflight({
  seriesId,
  agencyId,
  imageIds = [],
  agencyName,
  sourceUrl,
  result,
  isLoading,
  error,
  onRetry,
  queryFn = defaultRegistryPreflightQuery,
  onAction,
  selectedRevisionId,
  onRevisionChange,
}) {
  const reduceMotion = useReducedMotion();
  const [internalRevisionId, setInternalRevisionId] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const announcedRevisionId = useRef(null);
  const normalizedImageIds = useMemo(
    () => asArray(imageIds).filter(Boolean).map(String).sort(),
    [imageIds],
  );
  const hasTarget = Boolean(seriesId || agencyId);
  const request = useMemo(
    () => ({ seriesId, agencyId, imageIds: normalizedImageIds }),
    [seriesId, agencyId, normalizedImageIds],
  );
  // A parent may load every registry series in one request, then hand a selected
  // result to this component. In that controlled mode, never also issue a
  // per-agency request.
  const hasExternalState =
    result !== undefined || isLoading !== undefined || error !== undefined || onRetry !== undefined;

  const preflightQuery = useQuery({
    queryKey: ['registry-preflight', seriesId || null, agencyId || null, normalizedImageIds],
    queryFn: () => queryFn(request),
    enabled: hasTarget && !hasExternalState,
    staleTime: 30_000,
    retry: 1,
  });
  const sourcePayload = hasExternalState ? result : preflightQuery.data;
  const envelope = asObject(sourcePayload?.data ?? sourcePayload);
  const firstRevisionId = asArray(envelope.results)[0]?.revisionId || envelope.revisionId || null;
  const revisionIsControlled = selectedRevisionId !== undefined;
  const activeRevisionId =
    (revisionIsControlled ? selectedRevisionId : internalRevisionId) || firstRevisionId;

  const { evaluation, routeOptions, resolution, available } = selectEvaluation(
    sourcePayload,
    activeRevisionId,
  );
  const resolvedAgencyName = agencyName || evaluation.agencyName || 'this agency';
  const resolvedSourceUrl = sourceUrl || evaluation.sourceUrl || null;
  const loading = hasExternalState ? Boolean(isLoading) : preflightQuery.isLoading;
  const requestError = hasExternalState ? error : preflightQuery.error;

  useEffect(() => {
    if (
      !hasTarget ||
      loading ||
      requestError ||
      !available ||
      !evaluation.revisionId ||
      typeof onRevisionChange !== 'function' ||
      announcedRevisionId.current === evaluation.revisionId
    ) {
      return;
    }
    announcedRevisionId.current = evaluation.revisionId;
    onRevisionChange(evaluation.revisionId);
  }, [hasTarget, loading, onRevisionChange, requestError, available, evaluation.revisionId]);

  if (!hasTarget) return null;

  const handleRevisionChange = (revisionId) => {
    const next = revisionId || null;
    if (!revisionIsControlled) setInternalRevisionId(next);
    announcedRevisionId.current = next;
    onRevisionChange?.(next);
  };

  const ready = !loading && !requestError && available;
  const groups = ready ? groupFindings(evaluation.findings) : null;
  const slots = ready ? readShotSlots(evaluation.findings) : [];
  const coverage = ready ? coverageSentence(readShotCoverage(evaluation.shotCoverage)) : null;
  const detailCount = groups
    ? groups.confirm.length + groups.guidance.length + groups.included.length
    : 0;
  const checkedOn = ready ? formatRegistryDate(evaluation.sourceCheckedOn) : null;
  const freshnessNotice = ready ? readFreshnessNotice(evaluation) : null;

  const viewKey = loading
    ? 'loading'
    : requestError
      ? 'error'
      : !available
        ? 'unavailable'
        : `ready:${evaluation.revisionId || 'single'}`;

  let body;

  if (loading) {
    body = (
      <p className={styles.note} role="status" aria-live="polite">
        Checking published requirements…
      </p>
    );
  } else if (requestError) {
    body = (
      <div className={styles.note} role="alert">
        <p className={styles.noteLine}>
          Requirements couldn’t load. You can continue — the agency’s site is the source of
          truth.
        </p>
        {hasExternalState && typeof onRetry !== 'function' ? null : (
          <PholioButton
            variant="secondary"
            className={styles.retry}
            onClick={hasExternalState ? onRetry : () => preflightQuery.refetch()}
          >
            Try again
          </PholioButton>
        )}
      </div>
    );
  } else if (!available) {
    // Honest sentence, then the page that can actually resolve it. No panel
    // chrome: there is nothing here to look at, only somewhere to go.
    body = (
      <div className={styles.note}>
        <p className={styles.noteLine}>
          {resolution === 'choice_required'
            ? `${resolvedAgencyName} publishes more than one route — pick the one you plan to use in Agency requirements.`
            : `Pholio has no published requirements for ${possessive(resolvedAgencyName)} selected route yet. Check their submission page before sending.`}
        </p>
        <span className={styles.noteLinks}>
          <a className={styles.link} href={REQUIREMENTS_HREF}>
            Agency requirements
          </a>
          {resolvedSourceUrl ? (
            <a
              className={styles.link}
              href={resolvedSourceUrl}
              {...externalLinkProps(resolvedSourceUrl)}
            >
              Their submission page
            </a>
          ) : null}
        </span>
      </div>
    );
  } else {
    body = (
      <>
        {slots.length ? (
          <ul className={styles.slots} aria-label="Published shots">
            {slots.map((slot) => (
              <li key={slot.id} className={styles.slot}>
                <SpecMark outcome={slot.outcome} subject={slot.label} size={12} />
              </li>
            ))}
          </ul>
        ) : null}

        {groups.attention.length ? (
          <ul className={styles.rows}>
            {groups.attention.map((finding) => (
              <FindingRow key={finding.id} finding={finding} withMark onAction={onAction} />
            ))}
          </ul>
        ) : (
          <p className={styles.noteLine}>
            No published requirement needs action for this package.
          </p>
        )}

        {detailCount > 0 ? (
          <div className={styles.details}>
            <button
              type="button"
              className={styles.detailsToggle}
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((value) => !value)}
            >
              Details ({detailCount})
              <ChevronDown
                size={13}
                aria-hidden="true"
                className={`${styles.detailsChevron}${
                  detailsOpen ? ` ${styles.detailsChevronOpen}` : ''
                }`}
              />
            </button>
            <AnimatePresence initial={false}>
              {detailsOpen ? (
                <motion.div
                  className={styles.detailsBody}
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE }}
                >
                  <DetailGroup title="Confirm" findings={groups.confirm} onAction={onAction} />
                  <DetailGroup title="Guidance" findings={groups.guidance} onAction={onAction} />
                  <DetailGroup title="Included" findings={groups.included} onAction={onAction} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}

        {/* Provenance stays on the panel: this is Pholio reading an agency's
            published page, not Pholio speaking for the agency. */}
        <p className={styles.provenance}>
          Published by {resolvedAgencyName}
          {checkedOn ? `, checked ${checkedOn}` : ''}.
          {resolvedSourceUrl ? (
            <>
              {' '}
              <a
                className={styles.link}
                href={resolvedSourceUrl}
                {...externalLinkProps(resolvedSourceUrl)}
              >
                Their page
              </a>
            </>
          ) : null}
        </p>
        {sourceNeedsReview(evaluation) ? (
          <p className={styles.caution}>
            {freshnessNotice ||
              'Some published details could not be confirmed. Review the agency’s wording.'}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <section
      className={styles.panel}
      aria-label={`Published requirements for ${resolvedAgencyName}`}
    >
      {available ? (
        <div className={styles.head}>
          <h2 className={styles.title}>
            Checked against {possessive(resolvedAgencyName)} published route
          </h2>
          {routeOptions.length > 1 ? (
            <div className={styles.route}>
              <PholioCustomSelect
                id="registry-route-select"
                label="Submission route"
                value={evaluation.revisionId || ''}
                onChange={handleRevisionChange}
                options={routeOptions.map((option) => ({
                  value: option.revisionId,
                  label: `${option.agencyName} — ${option.marketLabel || 'Published route'}`,
                }))}
              />
            </div>
          ) : null}
          {coverage ? <p className={styles.coverage}>{coverage}</p> : null}
        </div>
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={viewKey}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.15, ease: EASE }}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
