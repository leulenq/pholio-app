import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../shared/lib/api-client';
import PholioButton from '../../../shared/components/ui/PholioButton';
import {
  formatRegistryDate,
  groupFindings,
  readShotCoverage,
  readSummary,
  readFreshnessNotice,
  sourceNeedsReview,
} from '../lib/specRegistry';
import styles from './RegistryPreflight.module.css';

/**
 * Read-only preview of the current package against an agency-route registry
 * revision. Keeping the request here makes the component usable before the
 * talent API grows a named wrapper; callers can replace it with `queryFn`.
 */
async function defaultRegistryPreflightQuery(payload) {
  return apiClient.post('/spec-registry/preflight', payload);
}

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

function Row({ finding, index, onAction }) {
  return (
    <li className={styles.row} style={{ '--row-index': index }}>
      <div className={styles.rowCopy}>
        {/* The server already sorts every requirement into Shots, Files,
            Eligibility and so on. Showing it turns a flat list into something
            a talent can act on: what kind of thing is this, before what to do. */}
        {finding.category ? <p className={styles.rowCategory}>{finding.category}</p> : null}
        <p className={styles.rowTitle}>{finding.label}</p>
        {finding.guidance ? <p className={styles.rowDetail}>{finding.guidance}</p> : null}
      </div>
      {finding.target ? (
        <PholioButton
          as="a"
          href={finding.target.href}
          {...externalLinkProps(finding.target.href)}
          variant="tertiary"
          className={styles.rowAction}
          onClick={() => onAction?.(finding)}
        >
          {finding.target.label}
        </PholioButton>
      ) : null}
    </li>
  );
}

function Group({ id, title, findings, tone, onAction, collapsible = false }) {
  if (!findings.length) return null;

  const body = (
    <ul className={styles.list}>
      {findings.map((finding, index) => (
        <Row key={finding.id} finding={finding} index={index} onAction={onAction} />
      ))}
    </ul>
  );

  // Everything already satisfied is the least urgent thing on the panel and the
  // longest list. Collapsing it is what gives the groups above it hierarchy.
  if (collapsible) {
    return (
      <details className={`${styles.group} ${styles[tone]}`}>
        <summary className={styles.groupSummary}>
          <h3 id={id} className={styles.groupTitle}>{title}</h3>
          <span className={styles.groupCount}>{findings.length}</span>
        </summary>
        {body}
      </details>
    );
  }

  return (
    <section className={`${styles.group} ${styles[tone]}`} aria-labelledby={id}>
      <div className={styles.groupHeader}>
        <h3 id={id} className={styles.groupTitle}>{title}</h3>
        <span className={styles.groupCount}>{findings.length}</span>
      </div>
      {body}
    </section>
  );
}

function Coverage({ coverage }) {
  if (!coverage) return null;
  const figures = [
    { label: 'Selected', value: coverage.selected },
    { label: 'Matched to a slot', value: coverage.matched },
    { label: 'Published slots', value: coverage.published },
  ].filter((figure) => figure.value !== null);
  if (!figures.length) return null;

  return (
    <dl className={styles.coverage}>
      {figures.map((figure) => (
        <div key={figure.label} className={styles.coverageItem}>
          <dt>{figure.label}</dt>
          <dd>{figure.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LoadingLedger() {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <p>Checking published requirements…</p>
      <div className={styles.skeletonList} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function UnavailableState({ agencyName, sourceUrl, reason }) {
  return (
    <div className={styles.state}>
      <p>
        {reason === 'choice_required'
          ? `${agencyName || 'This agency'} has more than one published submission route. Choose the route in Agency requirements.`
          : agencyName
            ? `Pholio does not yet have published requirements for ${agencyName}'s selected route.`
            : 'Pholio does not yet have published requirements for this selected route.'}
      </p>
      <p>Check the agency&apos;s submission page before sending.</p>
      {reason === 'choice_required' ? (
        <PholioButton
          as="a"
          href="/dashboard/talent/applications/requirements"
          variant="tertiary"
          className={styles.sourceAction}
        >
          Open Agency requirements
        </PholioButton>
      ) : null}
      {sourceUrl ? (
        <PholioButton
          as="a"
          href={sourceUrl}
          {...externalLinkProps(sourceUrl)}
          variant="tertiary"
          className={styles.sourceAction}
        >
          View agency source
        </PholioButton>
      ) : null}
    </div>
  );
}

/**
 * Score-free, advisory registry preflight for a selected application package.
 * Findings never prevent a caller from continuing their submission flow.
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
  const [internalRevisionId, setInternalRevisionId] = useState(null);
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

  const handleRevisionChange = (event) => {
    const revisionId = event.target.value || null;
    if (!revisionIsControlled) setInternalRevisionId(revisionId);
    announcedRevisionId.current = revisionId;
    onRevisionChange?.(revisionId);
  };

  const heading = (
    <h2 id="registry-preflight-title" className={styles.title}>
      Prepare this package for {resolvedAgencyName}
    </h2>
  );

  if (loading) {
    return (
      <section className={styles.preflight} aria-labelledby="registry-preflight-title">
        <header className={styles.header}>{heading}</header>
        <LoadingLedger />
      </section>
    );
  }

  if (requestError) {
    return (
      <section className={styles.preflight} aria-labelledby="registry-preflight-title">
        <header className={styles.header}>{heading}</header>
        <div className={styles.state} role="alert">
          <p>Requirements couldn&apos;t load. You can continue—the agency&apos;s site is the source of truth.</p>
          {hasExternalState && typeof onRetry !== 'function' ? null : (
            <PholioButton
              variant="secondary"
              onClick={hasExternalState ? onRetry : () => preflightQuery.refetch()}
            >
              Try again
            </PholioButton>
          )}
        </div>
      </section>
    );
  }

  if (!available) {
    return (
      <section className={styles.preflight} aria-labelledby="registry-preflight-title">
        <header className={styles.header}>{heading}</header>
        <UnavailableState
          agencyName={agencyName}
          sourceUrl={resolvedSourceUrl}
          reason={resolution}
        />
      </section>
    );
  }

  const groups = groupFindings(evaluation.findings);
  const summary = readSummary(evaluation.summary);
  const coverage = readShotCoverage(evaluation.shotCoverage);
  const checkedOn = formatRegistryDate(evaluation.sourceCheckedOn);
  const freshnessNotice = readFreshnessNotice(evaluation);
  const hasFindings = Object.values(groups).some((findings) => findings.length > 0);

  return (
    <section className={styles.preflight} aria-labelledby="registry-preflight-title">
      <header className={styles.header}>
        {heading}
        {checkedOn ? (
          <p className={styles.provenance}>
            Based on requirements published by the agency, checked {checkedOn}.
          </p>
        ) : null}
        {sourceNeedsReview(evaluation) ? (
          <p className={styles.caution}>
            {freshnessNotice ||
              'Some published details could not be confirmed. Review the agency’s wording.'}
          </p>
        ) : null}
        {/* The server counts these buckets already. Leading with them means the
            talent reads the shape of the work before the list of it. */}
        {summary && hasFindings ? (
          <p className={styles.tally}>
            {[
              summary.needsAttention ? `${summary.needsAttention} need attention` : null,
              summary.confirm ? `${summary.confirm} to confirm` : null,
              summary.included ? `${summary.included} already included` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
        <Coverage coverage={coverage} />
      </header>

      {routeOptions.length > 1 ? (
        <div className={styles.routeChoice}>
          <label htmlFor="registry-route-select">Submission route</label>
          <select
            id="registry-route-select"
            className={styles.routeSelect}
            value={evaluation.revisionId || ''}
            onChange={handleRevisionChange}
          >
            {routeOptions.map((option) => (
              <option key={option.revisionId} value={option.revisionId}>
                {option.agencyName} — {option.marketLabel || 'Published route'}
              </option>
            ))}
          </select>
          <p>Choose the exact market or application channel you plan to use.</p>
        </div>
      ) : null}

      {hasFindings ? (
        <div className={styles.ledger}>
          <Group
            id="registry-attention"
            title="Needs attention"
            tone="toneAttention"
            findings={groups.attention}
            onAction={onAction}
          />
          <Group
            id="registry-confirm"
            title="Confirm before sending"
            tone="toneConfirm"
            findings={groups.confirm}
            onAction={onAction}
          />
          <Group
            id="registry-guidance"
            title="Published guidance"
            tone="toneGuidance"
            findings={groups.guidance}
            onAction={onAction}
          />
          <Group
            id="registry-included"
            title="Included in this package"
            tone="toneIncluded"
            findings={groups.included}
            onAction={onAction}
            collapsible
          />
        </div>
      ) : (
        <p className={styles.empty}>No published requirements need action for this package.</p>
      )}

      {resolvedSourceUrl ? (
        <PholioButton
          as="a"
          href={resolvedSourceUrl}
          {...externalLinkProps(resolvedSourceUrl)}
          variant="tertiary"
          className={styles.sourceAction}
        >
          View agency source
        </PholioButton>
      ) : null}
    </section>
  );
}
