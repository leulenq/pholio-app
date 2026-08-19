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
  marginaliaAddsInformation,
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

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function countWord(n) {
  return n >= 0 && n < COUNT_WORDS.length ? COUNT_WORDS[n] : String(n);
}

/**
 * The whole scoreboard as one sentence. This panel sits above a slot grid that
 * already counts things — a second running total ("2 of 5", "0 of 3") turns
 * the step into arithmetic. One line of prose says what their set is and how
 * far along this one already is, and the rows below carry the rest.
 */
function setSentence(view) {
  const total = view?.published || 0;
  if (!total) return 'They publish form details, not a shot list.';
  const covered = Math.min(view.covered || 0, total);
  const opening =
    total === 1 ? 'One shot makes their set' : `${countWord(total)} shots make their set`;
  const sentence =
    covered === 0
      ? `${opening} — none are in yours yet.`
      : covered >= total
        ? total === 1
          ? `${opening} — and it’s in yours.`
          : `${opening} — all of them in yours already.`
        : `${opening} — ${countWord(covered)} of them in yours already.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
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
 * The panel is a preparation list, not a registry report: one row per
 * published shot, named canonically, with the agency's own wording appearing
 * inline only when it changes the instruction (`marginaliaAddsInformation`).
 * Every source phrase stays reachable — behind the one disclosure, attributed —
 * so provenance survives without sitting beside the instruction as a
 * duplicate requirement.
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

  /*
    One row per published shot. The wording rides under the canonical label
    only when it genuinely changes the instruction; everything else the agency
    wrote waits in the disclosure, attributed. `sourceWording` is the
    unfiltered phrase — `marginalia` pre-drops anything the canonical name
    subsumes, which would also drop wording that adds to it.
  */
  const flat = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const shotRows = view
    ? view.shots.map((shot) => ({
        ...shot,
        note:
          shot.sourceWording && marginaliaAddsInformation(shot.sourceWording, shot.label)
            ? shot.sourceWording
            : null,
      }))
    : [];
  const sourceWording = view
    ? view.shots
        .filter((shot) => shot.sourceWording && flat(shot.sourceWording) !== flat(shot.label))
        .map((shot) => ({ key: shot.key, label: shot.label, wording: shot.sourceWording }))
    : [];
  const detailBlocks = view
    ? [
        view.setRules.length > 0,
        view.eligibility.length > 0,
        Boolean(view.formFields),
        sourceWording.length > 0,
        Boolean(view.notPublished),
      ].filter(Boolean).length
    : 0;
  const formTarget = view ? firstTarget(view.eligibility) : null;
  const filesLine = ready ? filesSentence(view.files) : null;
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
        <p className={styles.summary}>{setSentence(view)}</p>

        {shotRows.length ? (
          <ul className={styles.list} aria-label="Their set">
            {shotRows.map((shot) => {
              const needed = shot.state === SLOT_STATE.NEEDED;
              const action = needed ? shot.target : null;
              return (
                <li key={shot.key} className={styles.item}>
                  <SpecMark state={shot.state} size={12} className={styles.itemMark} />
                  <span className={styles.itemBody}>
                    <span className={styles.itemLabel}>{shot.label}</span>
                    {shot.note ? <span className={styles.itemNote}>{shot.note}</span> : null}
                  </span>
                  <span className={styles.itemState} data-needed={needed || undefined}>
                    {SLOT_STATE_WORD[shot.state]}
                  </span>
                  {action ? (
                    <a
                      href={action.href}
                      {...externalLinkProps(action.href)}
                      className={styles.itemAction}
                      onClick={() => onAction?.(shot)}
                    >
                      {action.label}
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {filesLine ? <p className={styles.filesLine}>{filesLine}</p> : null}

        {detailBlocks > 0 ? (
          <div className={styles.details}>
            <button
              type="button"
              className={styles.detailsToggle}
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((value) => !value)}
            >
              Everything they publish
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
                      <ul className={styles.detailRows}>
                        {view.setRules.map((rule) => (
                          <li key={rule.key} className={styles.detailRow}>
                            <span className={styles.detailText}>{rule.text}</span>
                            {rule.modality ? (
                              <span className={styles.detailAside}>{rule.modality}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </DetailBlock>
                  ) : null}

                  {view.eligibility.length ? (
                    <DetailBlock title="Eligibility">
                      <ul className={styles.detailRows}>
                        {view.eligibility.map((item) => (
                          <li key={item.key} className={styles.detailRow}>
                            <span className={styles.detailText}>{item.sentence}</span>
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

                  {sourceWording.length ? (
                    <DetailBlock title="In their words">
                      <ul className={styles.detailRows}>
                        {sourceWording.map((entry) => (
                          <li key={entry.key} className={styles.detailRow}>
                            <span className={styles.detailText}>{entry.label}</span>
                            <span className={styles.detailWording}>“{entry.wording}”</span>
                          </li>
                        ))}
                      </ul>
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
          <h2 className={styles.title}>For {resolvedAgencyName}</h2>
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
        </div>
      ) : null}

      {/* Keyed remount, single entrance fade — never an exit/enter double-fade. */}
      <motion.div
        key={viewKey}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.15, ease: EASE }}
      >
        {body}
      </motion.div>
    </section>
  );
}
