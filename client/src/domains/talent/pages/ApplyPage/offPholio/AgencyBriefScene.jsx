import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import PholioButton from '../../../../../shared/components/ui/PholioButton';
import { Accordion } from '../../../../../shared/components/ui';
import { talentApi } from '../../../api/talent';
import { briefForSeries, checkedOn as packCheckedOn } from '../../../content/agencyBriefs';
import {
  buildAgencyView,
  formatRegistryDate,
  joinPhrases,
  readFreshnessNotice,
  readLabels,
  readVerificationNotice,
  sourceNeedsReview,
} from '../../../lib/specRegistry';
import styles from './AgencyBriefScene.module.css';

const SPRING = { type: 'spring', stiffness: 55, damping: 16 };
const UNKNOWN = 'The agency doesn’t say.';
// The fallback path has no per-agency evidence about response habits, so the
// default keeps the claim at the industry, not pinned on this agency.
const DEFAULT_AFTER_SUBMIT =
  'The agency doesn’t publish what happens next. Across the industry, silence is the common outcome — don’t read it as a mistake.';

/**
 * Same request `RegistryPreflight` makes, kept overridable for tests exactly
 * the way that component does it.
 */
async function defaultEvaluationQuery(seriesId) {
  return talentApi.preflightSpecRegistry({ seriesId });
}

function envelopeOf(payload) {
  return payload?.data ?? payload;
}

/** The evaluation out of a preflight response — single or multi-route shaped. */
function evaluationFrom(payload) {
  const envelope = envelopeOf(payload) || {};
  if (Array.isArray(envelope.results) && envelope.results.length) return envelope.results[0];
  return envelope;
}

/**
 * The authored entry, in the shape this scene renders. `entry.brief` carries
 * the prose; everything else is metadata already sitting on the entry.
 */
function fromAuthoredEntry(entry) {
  const b = entry.brief || {};
  return {
    name: entry.name,
    registrationText: entry.registration
      ? `Registered · ${entry.registration.authority} ${entry.registration.cert}`
      : null,
    officialUrl: entry.officialApplyUrl || null,
    howYouApply: b.howYouApply || null,
    channelDifferences: b.channelDifferences || null,
    photos: b.photos || null,
    videos: b.videos?.summary || null,
    yourDetails: b.yourDetails || null,
    extras: b.extras || null,
    whoTheyWant: b.whoTheyWant ? [b.whoTheyWant] : null,
    under18: b.under18 || null,
    afterYouSubmit: b.afterYouSubmit || null,
    headsUps: b.headsUps || [],
    finePrint: b.finePrint || [],
  };
}

/**
 * How the brief names the channel. `channelSentence` (offPholioIntake) speaks
 * about "the archive" because it narrates the prepare step — before anything
 * has been prepared, the brief keeps to what the agency does.
 */
function briefChannelSentence(route) {
  const type = route?.channelType || '';
  if (/email/i.test(type)) return 'They take applications by email.';
  if (/walk/i.test(type)) return 'They see people in person at their open call.';
  return 'They take applications through their own online form.';
}

/** Proper nouns keep their capital inside the composed fields sentence. */
const PROPER_FIELD_WORDS = /^(Instagram|TikTok|YouTube|Facebook|X|WhatsApp)\b/;

function fieldsSentence(list) {
  const words = (list || []).map((item) =>
    PROPER_FIELD_WORDS.test(item) ? item : item.charAt(0).toLowerCase() + item.slice(1),
  );
  return words.length ? `Their form asks for ${joinPhrases(words)}.` : null;
}

/**
 * The fallback content, built from nothing but the published route and its
 * findings — no authored copy exists for this series yet. Every section reads
 * from `buildAgencyView`, the same builder `RegistryPreflight` uses, so a
 * talent who has seen the preflight panel recognises the same words here.
 * Descriptive only: the evaluative "your profile is inside/outside" mirror
 * belongs to the preflight panel, never to the brief.
 */
function fromRegistryView(route, view) {
  const shots = view?.shots || [];
  const setRules = view?.setRules || [];
  const eligibility = view?.eligibility || [];
  const formFields = view?.formFields;
  return {
    name: route?.agencyName || 'This agency',
    registrationText: readVerificationNotice(route?.verification),
    officialUrl: route?.sourceUrl || null,
    howYouApply: briefChannelSentence(route),
    channelDifferences: null,
    photos: shots.length
      ? {
          slots: shots.map((shot) => shot.label),
          rules: setRules
            .map((rule) => [rule.modality, rule.text].filter(Boolean).join(' — '))
            .filter(Boolean),
        }
      : null,
    videos: null,
    yourDetails: fieldsSentence(formFields?.list),
    extras: null,
    // Published wording only — `item.sentence` is the preflight mirror and
    // judges the talent's own numbers, which the brief never does.
    whoTheyWant: eligibility.length
      ? eligibility.map((item) => item.marginalia || item.sentence).filter(Boolean)
      : null,
    under18: null,
    afterYouSubmit: DEFAULT_AFTER_SUBMIT,
    headsUps: sourceNeedsReview(route)
      ? [readFreshnessNotice(route) || 'Some published details could not be confirmed — check their page.']
      : [],
    finePrint: view?.notPublished ? [view.notPublished] : [],
  };
}

function Prose({ items, className }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return <p className={className}>{list[0]}</p>;
  return (
    <ul className={className}>
      {list.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Section({ title, children }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

/**
 * The Agency Brief — the first thing an off-Pholio target opens to.
 *
 * Merges the authored pack (when a brief exists for this series) with the
 * live route DTO already resolved by `useOffPholioTarget`; falls back to a
 * plain reading of what the registry itself published when no authored copy
 * exists yet. Fixed section order throughout (design §Tier 2) — scannability
 * is consistency, so every agency reads the same shape.
 */
export default function AgencyBriefScene({
  route,
  seriesId,
  onStartPreparing,
  onOutboundClick,
  queryFn = defaultEvaluationQuery,
}) {
  const reduceMotion = useReducedMotion();
  const entry = useMemo(() => briefForSeries(seriesId), [seriesId]);
  const hasAuthoredBrief = Boolean(entry);

  const evaluationQuery = useQuery({
    queryKey: ['agency-brief-fallback', seriesId],
    queryFn: () => queryFn(seriesId),
    enabled: !hasAuthoredBrief && Boolean(seriesId),
    staleTime: 60_000,
    retry: 1,
  });

  const fallbackView = useMemo(() => {
    if (hasAuthoredBrief || !evaluationQuery.data) return null;
    const evaluation = evaluationFrom(evaluationQuery.data);
    const labels = readLabels(evaluationQuery.data);
    return buildAgencyView({ route: route || {}, evaluation, labels });
  }, [hasAuthoredBrief, evaluationQuery.data, route]);

  // While the fallback evaluation is still on the wire, "loading" must never
  // read as "the agency doesn't say" — absence is a finding, waiting is not.
  const fallbackLoading = !hasAuthoredBrief && Boolean(seriesId) && evaluationQuery.isLoading;

  const content = hasAuthoredBrief
    ? fromAuthoredEntry(entry)
    : fromRegistryView(route, fallbackView);

  const agencyName = content.name || route?.agencyName || 'This agency';
  const market = route?.marketLabel || null;
  // The stamp certifies what is on screen. An authored brief was checked on the
  // pack's date; only the registry fallback is vouched for by the route's date.
  const checkedText = hasAuthoredBrief
    ? formatRegistryDate(packCheckedOn) || packCheckedOn
    : formatRegistryDate(route?.sourceCheckedOn) || formatRegistryDate(packCheckedOn) || packCheckedOn;
  const under18Text = content.under18 || UNKNOWN;
  const officialUrl = content.officialUrl || route?.sourceUrl || null;
  const isExternalUrl = /^https?:\/\//i.test(String(officialUrl || ''));

  const body = fallbackLoading ? (
    <>
      <header className={styles.header}>
        <h1 className={styles.name}>{agencyName}</h1>
        <p className={styles.meta}>
          {market ? <span>{market}</span> : null}
          {checkedText ? <span>Checked {checkedText}</span> : null}
        </p>
      </header>
      <p className={styles.prose}>Reading what {agencyName} publishes…</p>
    </>
  ) : (
    <>
      <header className={styles.header}>
        <h1 className={styles.name}>{agencyName}</h1>
        <p className={styles.meta}>
          {market ? <span>{market}</span> : null}
          {content.registrationText ? <span>{content.registrationText}</span> : null}
          {checkedText ? <span>Checked {checkedText}</span> : null}
        </p>
      </header>

      <div className={styles.ctaRow}>
        <PholioButton variant="primary" onClick={onStartPreparing}>
          Start preparing
        </PholioButton>
        {officialUrl ? (
          <PholioButton
            variant="secondary"
            as="a"
            href={officialUrl}
            target={isExternalUrl ? '_blank' : undefined}
            rel={isExternalUrl ? 'noopener noreferrer' : undefined}
            onClick={onOutboundClick}
          >
            Open their application page <ArrowUpRight size={14} aria-hidden />
          </PholioButton>
        ) : null}
      </div>

      <Section title="How you apply">
        <p className={styles.prose}>{content.howYouApply || UNKNOWN}</p>
        {content.channelDifferences ? (
          <dl className={styles.diffRows}>
            {content.channelDifferences.rows.map((row) => (
              <div key={row.fact} className={styles.diffRow}>
                <dt className={styles.diffFact}>{row.fact}</dt>
                <dd className={styles.diffValues}>
                  {row.values
                    .map((value, index) => `${content.channelDifferences.labels[index]}: ${value}`)
                    .join(' · ')}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Section>

      <Section title="Get ready">
        {content.photos ? (
          <div className={styles.group}>
            <h3 className={styles.groupTitle}>Photos</h3>
            <ul className={styles.wordList}>
              {content.photos.slots.map((slot) => (
                <li key={slot}>{slot}</li>
              ))}
            </ul>
            {content.photos.rules?.length ? (
              <ul className={styles.rules}>
                {content.photos.rules.slice(0, 5).map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {content.videos ? (
          <div className={styles.group}>
            <h3 className={styles.groupTitle}>Videos</h3>
            <p className={styles.prose}>{content.videos}</p>
          </div>
        ) : null}

        <div className={styles.group}>
          <h3 className={styles.groupTitle}>Your details</h3>
          <p className={styles.prose}>{content.yourDetails || UNKNOWN}</p>
        </div>

        {content.extras ? (
          <div className={styles.group}>
            <h3 className={styles.groupTitle}>Extras</h3>
            <p className={styles.prose}>{content.extras}</p>
          </div>
        ) : null}
      </Section>

      <Section title="Who they’re looking for">
        <Prose items={content.whoTheyWant || [UNKNOWN]} className={styles.prose} />
      </Section>

      <Section title="Under 18?">
        <p className={styles.prose}>{under18Text}</p>
      </Section>

      <Section title="After you submit">
        <p className={styles.prose}>{content.afterYouSubmit || UNKNOWN}</p>
      </Section>

      {content.headsUps.length ? (
        <Section title="Worth knowing">
          <ul className={styles.rules}>
            {content.headsUps.slice(0, 3).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {content.finePrint.length ? (
        <div className={styles.finePrint}>
          <Accordion title="Fine print">
            <ul className={styles.rules}>
              {content.finePrint.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Accordion>
        </div>
      ) : null}

      <p className={styles.provenance}>
        Based on requirements published by {agencyName}
        {checkedText ? `, checked ${checkedText}` : ''}. Pholio is not affiliated with{' '}
        {agencyName}.
      </p>
    </>
  );

  return (
    <div className={styles.scene}>
      {reduceMotion ? (
        <div>{body}</div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
        >
          {body}
        </motion.div>
      )}
    </div>
  );
}
