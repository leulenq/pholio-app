import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { apiClient } from '../../../shared/lib/api-client';
import PholioButton from '../../../shared/components/ui/PholioButton';
import PholioCustomSelect from '../../../shared/components/ui/forms/PholioCustomSelect';
import {
  SLOT_STATE,
  SLOT_STATE_WORD,
  buildAgencyView,
  formatRegistryDate,
  joinPhrases,
  readFreshnessNotice,
  readLabels,
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
function coverageSentence(view) {
  if (!view?.published) return null;
  return `${view.covered} of ${view.published} shots in your set`;
}

/** The first destination a group of items points at, if any. */
function firstTarget(items) {
  return items.find((item) => item?.target?.href)?.target || null;
}

/**
 * The files block as one sentence, never a raw list of rows. `view.files`
 * already carries the agency's own figures settled by `publishedWording`
 * (ruling R-E) — this only decides how they read together. Absent a stated
 * figure the sentence says so plainly rather than dropping the section.
 */
function filesSentence(files) {
  if (!files) return null;
  const subjects = joinPhrases(files.subjects);
  return files.published.length
    ? `Their form publishes limits on ${subjects} (${joinPhrases(files.published)}) — we convert and resize on export.`
    : `Their form asks about ${subjects}, with no stated limit — we convert and resize on export.`;
}

/** A titled block inside the details disclosure. */
function DetailBlock({ title, children }) {
  return (
    <div className={styles.detailGroup}>
      <h3 className={styles.detailTitle}>{title}</h3>
      {children}
    </div>
  );
}

/**
 * Score-free, advisory registry preflight for a selected application package.
 * Findings never prevent a caller from continuing their submission flow.
 *
 * Presented as a well panel rather than a card: this sits inside a wizard step
 * beside the talent's actual work, and advisory furniture that carries card
 * weight starts competing with the thing it is advising about.
 *
 * It reads the same three states, the same canonical shot names and the same
 * section vocabulary as the Agency requirements page, through the same library
 * (ruling R-D/R-E). A talent who studied that page an hour ago should recognise
 * the answer here without translating it.
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

  const ready = !loading && !requestError && available;
  // Plain calls, not `useMemo`: both are pure reads over a payload the query
  // already caches, and hand-memoizing them only stops the compiler optimizing
  // the component around them.
  const labels = readLabels(sourcePayload);
  const view = ready
    ? buildAgencyView({ route: { agencyName: resolvedAgencyName }, evaluation, labels })
    : null;

  if (!hasTarget) return null;

  const handleRevisionChange = (revisionId) => {
    const next = revisionId || null;
    if (!revisionIsControlled) setInternalRevisionId(next);
    announcedRevisionId.current = next;
    onRevisionChange?.(next);
  };

  const stillNeeded = view
    ? view.shots.filter((shot) => shot.state === SLOT_STATE.NEEDED)
    : [];
  const detailBlocks = view
    ? [
        view.setRules.length > 0,
        Boolean(view.files),
        view.eligibility.length > 0,
        Boolean(view.formFields),
        Boolean(view.notPublished),
      ].filter(Boolean).length
    : 0;
  const formTarget = view ? firstTarget(view.eligibility) : null;
  const coverage = ready ? coverageSentence(view) : null;
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
            ? `${resolvedAgencyName} publishes more than one route, and Pholio can’t tell which one applies to you. Their submission page is the source of truth.`
            : `Pholio has no published requirements for ${possessive(resolvedAgencyName)} selected route yet. Check their submission page before sending.`}
        </p>
        <span className={styles.noteLinks}>
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
        {view.shots.length ? (
          <ul className={styles.slots} aria-label="Published shots">
            {view.shots.map((shot) => (
              <li key={shot.key} className={styles.slot}>
                <SpecMark state={shot.state} subject={shot.label} size={12} />
              </li>
            ))}
          </ul>
        ) : null}

        {stillNeeded.length ? (
          <ul className={styles.rows}>
            {stillNeeded.map((shot) => {
              const action = shot.target;
              return (
                <li key={shot.key} className={styles.row}>
                  <SpecMark
                    state={SLOT_STATE.NEEDED}
                    size={12}
                    className={styles.rowMark}
                  />
                  <span className={styles.rowLabel}>{shot.label}</span>
                  {shot.marginalia ? (
                    <span className={styles.rowMarginalia}>“{shot.marginalia}”</span>
                  ) : null}
                  <span className={styles.rowGuidance}>
                    {SLOT_STATE_WORD[SLOT_STATE.NEEDED]}
                  </span>
                  {action ? (
                    <a
                      href={action.href}
                      {...externalLinkProps(action.href)}
                      className={styles.rowAction}
                      onClick={() => onAction?.(shot)}
                    >
                      {action.label}
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.noteLine}>
            {view.shots.length
              ? 'Every shot they publish is in your set.'
              : 'They publish no shot list — form details only.'}
          </p>
        )}

        {detailBlocks > 0 ? (
          <div className={styles.details}>
            <button
              type="button"
              className={styles.detailsToggle}
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((value) => !value)}
            >
              What else they published ({detailBlocks})
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
                  {view.setRules.length ? (
                    <DetailBlock title="Set rules">
                      <ul className={styles.rows}>
                        {view.setRules.map((rule) => (
                          <li key={rule.key} className={styles.row}>
                            <span className={styles.rowLabel}>{rule.text}</span>
                            {rule.modality ? (
                              <span className={styles.rowGuidance}>{rule.modality}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </DetailBlock>
                  ) : null}

                  {view.files ? (
                    <DetailBlock title="Files">
                      <p className={styles.noteLine}>{filesSentence(view.files)}</p>
                    </DetailBlock>
                  ) : null}

                  {view.eligibility.length ? (
                    <DetailBlock title="Eligibility">
                      <ul className={styles.rows}>
                        {view.eligibility.map((item) => (
                          <li key={item.key} className={styles.row}>
                            <span className={styles.rowLabel}>{item.sentence}</span>
                          </li>
                        ))}
                      </ul>
                    </DetailBlock>
                  ) : null}

                  {view.formFields ? (
                    <DetailBlock title="Their form asks for">
                      <p className={styles.noteLine}>
                        {joinPhrases(view.formFields.list)}.
                      </p>
                      {view.formFields.unverifiable ? (
                        <p className={styles.noteLine}>
                          Pholio can’t check these from your profile — have them ready.
                        </p>
                      ) : null}
                      {formTarget ? (
                        <a
                          href={formTarget.href}
                          {...externalLinkProps(formTarget.href)}
                          className={styles.link}
                          onClick={() => onAction?.(formTarget)}
                        >
                          {formTarget.label}
                        </a>
                      ) : null}
                    </DetailBlock>
                  ) : null}

                  {view.notPublished ? (
                    <DetailBlock title="Not published">
                      <p className={styles.noteLine}>{view.notPublished}</p>
                    </DetailBlock>
                  ) : null}
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
