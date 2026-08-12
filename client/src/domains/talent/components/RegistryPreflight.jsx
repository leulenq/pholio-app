import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../shared/lib/api-client';
import PholioButton from '../../../shared/components/ui/PholioButton';
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

function normalizePayload(value, selectedRevisionId = null) {
  const envelope = asObject(value?.data ?? value);
  const routeOptions = asArray(envelope.results);
  const response = routeOptions.length > 0
    ? asObject(
        routeOptions.find((item) => item?.revisionId === selectedRevisionId) ||
        routeOptions[0],
      )
    : envelope;
  const findings = asArray(response.findings ?? response.assertions);
  return {
    ...response,
    findings,
    routeOptions,
    resolution: envelope.resolution || response.resolution,
    available:
      envelope.available !== false &&
      response.available !== false &&
      response.status !== 'unavailable',
  };
}

function findingLabel(finding) {
  return finding.label || finding.requirement || finding.sourceLabel || 'Published requirement';
}

function findingGuidance(finding) {
  return finding.guidance || finding.message || finding.detail || null;
}

function findingAction(finding) {
  const target = asObject(finding.target ?? finding.action);
  const href = target.href || finding.actionHref || null;
  const label = target.label || finding.actionLabel || 'Open details';
  return href ? { href, label } : null;
}

function externalLinkProps(href) {
  return /^https?:\/\//i.test(String(href || ''))
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};
}

function factualShotCoverage(response) {
  const coverage = asObject(response.shotCoverage ?? response.coverage);
  const selected = Number.isFinite(coverage.selected)
    ? coverage.selected
    : Number.isFinite(coverage.selectedCount)
      ? coverage.selectedCount
      : null;
  const published = Number.isFinite(coverage.published)
    ? coverage.published
    : Number.isFinite(coverage.slotCount)
      ? coverage.slotCount
      : null;

  if (selected === null && published === null) return null;
  return { selected, published };
}

function LedgerRow({ finding, onAction }) {
  const action = findingAction(finding);
  const guidance = findingGuidance(finding);

  return (
    <li className={styles.row}>
      <div className={styles.rowCopy}>
        <p className={styles.rowTitle}>{findingLabel(finding)}</p>
        {guidance ? <p className={styles.rowDetail}>{guidance}</p> : null}
      </div>
      {action ? (
        <PholioButton
          as="a"
          href={action.href}
          {...externalLinkProps(action.href)}
          variant="tertiary"
          className={styles.rowAction}
          onClick={() => onAction?.(finding)}
        >
          {action.label}
        </PholioButton>
      ) : null}
    </li>
  );
}

function LedgerGroup({ id, title, findings, onAction }) {
  if (!findings.length) return null;

  return (
    <section className={styles.group} aria-labelledby={id}>
      <h3 id={id} className={styles.groupTitle}>{title}</h3>
      <ul className={styles.list}>
        {findings.map((finding, index) => (
          <LedgerRow
            key={finding.id || finding.assertionId || `${findingLabel(finding)}-${index}`}
            finding={finding}
            onAction={onAction}
          />
        ))}
      </ul>
    </section>
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
  const sourceEnvelope = asObject(sourcePayload?.data ?? sourcePayload);
  const firstRevisionId =
    asArray(sourceEnvelope.results)[0]?.revisionId || sourceEnvelope.revisionId || null;
  const revisionIsControlled = selectedRevisionId !== undefined;
  const activeRevisionId =
    (revisionIsControlled ? selectedRevisionId : internalRevisionId) || firstRevisionId;
  const response = normalizePayload(
    sourcePayload,
    activeRevisionId,
  );
  const resolvedAgencyName = agencyName || response.agencyName || response.agency?.name || 'this agency';
  const resolvedSourceUrl = sourceUrl || response.sourceUrl || response.source?.url || null;
  const loading = hasExternalState ? Boolean(isLoading) : preflightQuery.isLoading;
  const requestError = hasExternalState ? error : preflightQuery.error;

  useEffect(() => {
    if (
      !hasTarget ||
      loading ||
      requestError ||
      !response.available ||
      !response.revisionId ||
      typeof onRevisionChange !== 'function' ||
      announcedRevisionId.current === response.revisionId
    ) {
      return;
    }
    announcedRevisionId.current = response.revisionId;
    onRevisionChange(response.revisionId);
  }, [
    hasTarget,
    loading,
    onRevisionChange,
    requestError,
    response.available,
    response.revisionId,
  ]);

  if (!hasTarget) return null;

  const handleRevisionChange = (event) => {
    const revisionId = event.target.value || null;
    if (!revisionIsControlled) setInternalRevisionId(revisionId);
    announcedRevisionId.current = revisionId;
    onRevisionChange?.(revisionId);
  };

  if (loading) {
    return (
      <section className={styles.preflight} aria-labelledby="registry-preflight-title">
        <header className={styles.header}>
          <h2 id="registry-preflight-title" className={styles.title}>
            Prepare this package for {resolvedAgencyName}
          </h2>
        </header>
        <LoadingLedger />
      </section>
    );
  }

  if (requestError) {
    return (
      <section className={styles.preflight} aria-labelledby="registry-preflight-title">
        <header className={styles.header}>
          <h2 id="registry-preflight-title" className={styles.title}>
            Prepare this package for {resolvedAgencyName}
          </h2>
        </header>
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

  if (!response.available) {
    return (
      <section className={styles.preflight} aria-labelledby="registry-preflight-title">
        <header className={styles.header}>
          <h2 id="registry-preflight-title" className={styles.title}>
            Prepare this package for {resolvedAgencyName}
          </h2>
        </header>
        <UnavailableState
          agencyName={agencyName}
          sourceUrl={resolvedSourceUrl}
          reason={response.unavailableReason || response.resolution}
        />
      </section>
    );
  }

  const groups = {
    attention: response.findings.filter((finding) =>
      finding.requiresAttention === true ||
      (finding.severity == null && ['missing', 'violates'].includes(finding.outcome)),
    ),
    guidance: response.findings.filter((finding) => finding.severity === 'informational'),
    confirm: response.findings.filter((finding) => finding.outcome === 'unknown'),
    included: response.findings.filter((finding) => finding.outcome === 'satisfied'),
  };
  const coverage = factualShotCoverage(response);
  const hasFindings = Object.values(groups).some((findings) => findings.length > 0);
  const checkedOn = response.sourceCheckedOn || response.checkedOn || response.lifecycle?.reviewedOn;

  return (
    <section className={styles.preflight} aria-labelledby="registry-preflight-title">
      <header className={styles.header}>
        <h2 id="registry-preflight-title" className={styles.title}>
          Prepare this package for {resolvedAgencyName}
        </h2>
        {checkedOn ? <p className={styles.provenance}>Based on requirements published by the agency, checked {checkedOn}.</p> : null}
        {response.sourceStatus === 'provisional' ||
        response.sourceStatus === 'conflicting' ||
        ['review_due', 'expired'].includes(response.sourceFreshness?.state) ? (
          <p className={styles.caution}>Some published details could not be confirmed. Review the agency&apos;s wording.</p>
        ) : null}
        {coverage ? (
          <p className={styles.coverage}>
            {coverage.selected !== null ? `Selected images: ${coverage.selected}` : null}
            {coverage.selected !== null && coverage.published !== null ? ' · ' : null}
            {coverage.published !== null ? `Published shot slots: ${coverage.published}` : null}
          </p>
        ) : null}
      </header>

      {response.routeOptions.length > 1 ? (
        <div className={styles.routeChoice}>
          <label htmlFor="registry-route-select">Submission route</label>
          <select
            id="registry-route-select"
            className={styles.routeSelect}
            value={response.revisionId || ''}
            onChange={handleRevisionChange}
          >
            {response.routeOptions.map((option) => (
              <option key={option.revisionId} value={option.revisionId}>
                {option.agencyName || option.organization?.name || 'Agency'} — {option.marketLabel || option.market?.city || option.market?.code || 'Published route'}
              </option>
            ))}
          </select>
          <p>Choose the exact market or application channel you plan to use.</p>
        </div>
      ) : null}

      {hasFindings ? (
        <div className={styles.ledger}>
          <LedgerGroup id="registry-attention" title="Needs attention" findings={groups.attention} onAction={onAction} />
          <LedgerGroup id="registry-guidance" title="Published guidance" findings={groups.guidance} onAction={onAction} />
          <LedgerGroup id="registry-confirm" title="Confirm before sending" findings={groups.confirm} onAction={onAction} />
          <LedgerGroup id="registry-included" title="Included in this package" findings={groups.included} onAction={onAction} />
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
