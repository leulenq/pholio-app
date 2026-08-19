import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, CalendarDays, Clock, Shield, ShieldCheck } from 'lucide-react';
import { talentApi } from '../../api/talent';
import { Section } from '../../components/profile-index';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { PholioInput } from '../../../../shared/components/ui/forms';
import PholioMultiSelect from '../../../../shared/components/ui/forms/PholioMultiSelect';
import { pholioToast } from '../../../../shared/lib/pholio-toast';
import { computeAge } from '../../../../shared/utils/talentAge';
import {
  AGE_VERIFICATION_STATES,
  AGE_VERIFICATION_TONES,
  CONSENT_NOTE,
  DATA_STORY,
  DOB_INVALIDATION_NOTE,
  PRIVACY_BOUNDARY,
  isPollingStatus,
  nextPollDelay,
  resolveAgeVerificationState,
} from './ageVerificationState';
import { startIdentityHandoff } from './stripeIdentity';
import stripeWordmark from '../../../../assets/stripe-wordmark-slate.svg';
import styles from './VerifiedAdultSection.module.css';

const CONTENT_BOUNDARY_OPTIONS = [
  { value: 'Swimwear', label: 'Swimwear' },
  { value: 'Lingerie', label: 'Lingerie' },
  { value: 'Implied Nudity', label: 'Implied Nudity' },
  { value: 'Artistic Nudity', label: 'Artistic Nudity' },
  { value: 'Fitness/Athletic', label: 'Fitness / Athletic' },
  { value: 'Body Paint', label: 'Body Paint' },
];

const PANEL_ID = 'private-context-panel';

const TONE_CLASS = {
  [AGE_VERIFICATION_TONES.NEUTRAL]: 'toneNeutral',
  [AGE_VERIFICATION_TONES.PROGRESS]: 'toneProgress',
  [AGE_VERIFICATION_TONES.SETTLED]: 'toneSettled',
  [AGE_VERIFICATION_TONES.ATTENTION]: 'toneAttention',
};

const MARK_SIZE = 16;
const MARK_STROKE = 1.5;

/**
 * The panel's one glyph. It follows the tone, except for the single state whose
 * subject is the profile rather than the check.
 */
function StateMark({ state }) {
  if (state.id === AGE_VERIFICATION_STATES.DOB_MISSING) {
    return <CalendarDays size={MARK_SIZE} strokeWidth={MARK_STROKE} />;
  }
  if (state.tone === AGE_VERIFICATION_TONES.PROGRESS) {
    return <Clock size={MARK_SIZE} strokeWidth={MARK_STROKE} />;
  }
  if (state.tone === AGE_VERIFICATION_TONES.SETTLED) {
    return <ShieldCheck size={MARK_SIZE} strokeWidth={MARK_STROKE} />;
  }
  if (state.tone === AGE_VERIFICATION_TONES.ATTENTION) {
    return <AlertTriangle size={MARK_SIZE} strokeWidth={MARK_STROKE} />;
  }
  return <Shield size={MARK_SIZE} strokeWidth={MARK_STROKE} />;
}

/**
 * Stripe's own wordmark, unmodified, set against Pholio's "Powered by".
 *
 * The mark is the attribution for the handoff — it is deliberately NOT a
 * facsimile of Stripe's UI, and the artwork is never recoloured or redrawn
 * (see client/src/assets/stripe-wordmark-slate.svg for provenance). The whole
 * lockup exposes one accessible name so screen readers hear the sentence
 * rather than "Powered by, image".
 */
function StripeLockup() {
  return (
    <span className={styles.stripeLockup} role="img" aria-label="Powered by Stripe">
      <span className={styles.stripeLockupPrefix}>Powered by</span>
      <img
        className={styles.stripeWordmark}
        src={stripeWordmark}
        alt=""
        aria-hidden="true"
        width="41"
        height="17"
        draggable="false"
      />
    </span>
  );
}

/**
 * Private context — voluntary, contextual, never scored.
 *
 * Collapsed it is one quiet row in the profile: a sentence and a text link. It
 * never prompts, never nags, and deliberately feeds nothing into submission
 * readiness (see client/src/shared/utils/profileScoring.js — no adult field is
 * read there, and none should be added).
 *
 * Opened it becomes the trust surface: what Stripe sees, what Pholio keeps,
 * what happens to the documents afterwards. The handoff itself is Stripe's own
 * UI — we never draw a facsimile of it.
 */
export function VerifiedAdultSection({ dateOfBirth, onEditDateOfBirth }) {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();

  const age = computeAge(dateOfBirth);
  const isAdult = age != null && age >= 18;

  const [open, setOpen] = useState(false);
  const [contentBoundaries, setContentBoundaries] = useState(null);
  const [onlyfansUrl, setOnlyfansUrl] = useState(null);
  const pollAttemptsRef = useRef(0);

  const verificationQuery = useQuery({
    queryKey: ['age-verification'],
    queryFn: () => talentApi.getAgeVerification(),
    enabled: isAdult,
    staleTime: 15_000,
    // Two ways the page keeps itself current while Stripe reviews: a backing-off
    // poll, and an immediate refetch whenever the tab regains focus (the common
    // case — the talent finished on their phone and came back to this tab).
    refetchOnWindowFocus: (query) =>
      isPollingStatus(query.state.data?.status) ? 'always' : true,
    refetchInterval: (query) => {
      if (!isPollingStatus(query.state.data?.status)) {
        pollAttemptsRef.current = 0;
        return false;
      }
      const delay = nextPollDelay(pollAttemptsRef.current);
      pollAttemptsRef.current += 1;
      return delay;
    },
  });

  const verification = verificationQuery.data;
  const state = useMemo(
    () => resolveAgeVerificationState({ verification, age }),
    [verification, age],
  );

  const contextQuery = useQuery({
    queryKey: ['adult-context'],
    queryFn: () => talentApi.getAdultContext(),
    enabled: isAdult && state.id === AGE_VERIFICATION_STATES.VERIFIED,
  });

  const displayedBoundaries = contentBoundaries ?? contextQuery.data?.contentBoundaries ?? [];
  const displayedOnlyfansUrl = onlyfansUrl ?? contextQuery.data?.onlyfansUrl ?? '';

  const refetchVerification = verificationQuery.refetch;

  // Stripe's hosted flow returns to ?age_verification=return. Reopen the panel
  // the talent left, pull the fresh status, then drop the param so a reload
  // does not re-open it.
  const returnedFromStripe = searchParams.get('age_verification') === 'return';
  const handledReturnRef = useRef(false);
  useEffect(() => {
    if (!returnedFromStripe || handledReturnRef.current) return;
    handledReturnRef.current = true;
    setOpen(true);
    void refetchVerification();
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.delete('age_verification');
        return next;
      },
      { replace: true },
    );
  }, [returnedFromStripe, refetchVerification, setSearchParams]);

  const startVerification = useMutation({
    mutationFn: async () => {
      const session = await talentApi.createAgeVerificationSession();
      return startIdentityHandoff(session);
    },
    onSuccess: (result) => {
      // A redirect handoff has already navigated away; only the modal path
      // comes back here with something to report.
      if (result?.mode !== 'modal') return;
      if (result.error?.message) pholioToast.error(result.error.message);
      void queryClient.invalidateQueries({ queryKey: ['age-verification'] });
    },
    onError: (error) =>
      pholioToast.error(error?.message || 'Age verification could not start'),
  });

  const saveContext = useMutation({
    mutationFn: () =>
      talentApi.updateAdultContext({
        contentBoundaries: displayedBoundaries,
        onlyfansUrl: displayedOnlyfansUrl,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['adult-context'], data);
      setContentBoundaries(data.contentBoundaries || []);
      setOnlyfansUrl(data.onlyfansUrl || '');
      pholioToast.success('Private context saved');
    },
    onError: (error) =>
      pholioToast.error(error?.message || 'Private context could not be saved'),
  });

  const handleEditDateOfBirth = useCallback(() => {
    if (typeof onEditDateOfBirth === 'function') onEditDateOfBirth();
  }, [onEditDateOfBirth]);

  if (age != null && age < 18) return null;

  const panelMotion = reduceMotion
    ? {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: {
          type: 'spring',
          stiffness: 55,
          damping: 16,
          opacity: { duration: 0.15 },
        },
      };

  const startPending = startVerification.isPending;
  const toneClass = styles[TONE_CLASS[state.tone] || 'toneNeutral'];
  // Everything except "we still need your date of birth" is a Stripe story.
  const showStripeLockup = state.id !== AGE_VERIFICATION_STATES.DOB_MISSING;

  return (
    <Section
      id="verified-adult"
      title="Private context"
      titleEmphasis="context"
      description="A private, Stripe-verified statement that you are 18 or older — plus the boundaries and links you only share on purpose."
      showDivider={false}
    >
      <div className={styles.wrap}>
        <div className={styles.entryRow}>
          <span
            className={`${styles.entryCopy} ${
              state.tone === AGE_VERIFICATION_TONES.SETTLED ? styles.entryCopySettled : ''
            }`}
          >
            {state.summaryLine}
          </span>
          {state.entryLabel ? (
            <button
              type="button"
              className={styles.entryLink}
              onClick={() => setOpen((wasOpen) => !wasOpen)}
              aria-expanded={open}
              aria-controls={PANEL_ID}
            >
              {open ? 'Close' : state.entryLabel}
            </button>
          ) : null}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.div
              key={state.id}
              id={PANEL_ID}
              className={`${styles.panel} ${toneClass}`}
              {...panelMotion}
            >
              <div className={styles.head}>
                <span className={styles.headMark} aria-hidden="true">
                  <StateMark state={state} />
                </span>
                <div className={styles.headText}>
                  {state.panelTitle ? (
                    <h3 className={styles.panelTitle}>{state.panelTitle}</h3>
                  ) : null}
                  <p className={styles.statusLine} role="status" aria-live="polite">
                    {state.statusLine}
                  </p>
                </div>
              </div>

              {state.id === AGE_VERIFICATION_STATES.PROCESSING ? (
                <span className={styles.progressRule} aria-hidden="true" />
              ) : null}

              {state.id === AGE_VERIFICATION_STATES.DOB_MISSING ? (
                <div className={styles.fixBox}>
                  <p className={styles.fix}>
                    <button
                      type="button"
                      className={styles.inlineLink}
                      onClick={handleEditDateOfBirth}
                    >
                      Add your date of birth
                    </button>{' '}
                    in Identity, then come back here.
                  </p>
                </div>
              ) : null}

              {/* Data Story: Clean 3-item bulleted security cards */}
              {state.showExplainer ? (
                <div className={styles.storyWrap}>
                  <ol className={styles.story}>
                    {DATA_STORY.map((line) => (
                      <li key={line} className={styles.storyItem}>
                        {line}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {state.showDobFix && state.id === AGE_VERIFICATION_STATES.DOB_MISMATCH ? (
                <div className={styles.fixBox}>
                  <p className={styles.fix}>
                    Two ways forward:{' '}
                    <button
                      type="button"
                      className={styles.inlineLink}
                      onClick={handleEditDateOfBirth}
                    >
                      correct the date of birth on your profile
                    </button>
                    , or run the check again with the ID that matches it.
                  </p>
                </div>
              ) : null}

              {state.id === AGE_VERIFICATION_STATES.PROCESSING ? (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.inlineLink}
                    onClick={() => {
                      void refetchVerification();
                    }}
                  >
                    Check now
                  </button>
                </div>
              ) : null}

              {state.actionLabel ? (
                <div className={styles.handoff}>
                  <div className={styles.actions}>
                    <PholioButton
                      type="button"
                      variant={state.actionVariant || 'secondary'}
                      loading={startPending}
                      disabled={startPending}
                      onClick={() => startVerification.mutate()}
                    >
                      {state.actionLabel}
                    </PholioButton>
                  </div>
                  <div className={styles.disclaimerStack}>
                    <p className={styles.consent}>{CONSENT_NOTE}</p>
                    <p className={styles.fineprint}>{DOB_INVALIDATION_NOTE}</p>
                  </div>
                </div>
              ) : null}

              {state.showForm ? (
                <div className={styles.form}>
                  <PholioMultiSelect
                    label="Content boundaries"
                    id="adult_content_boundaries"
                    options={CONTENT_BOUNDARY_OPTIONS}
                    value={displayedBoundaries}
                    onChange={setContentBoundaries}
                    placeholder="Select the work you are open to discussing"
                  />
                  <PholioInput
                    label="OnlyFans"
                    id="adult_onlyfans_url"
                    type="url"
                    placeholder="https://onlyfans.com/username"
                    value={displayedOnlyfansUrl}
                    onChange={(event) => setOnlyfansUrl(event.target.value)}
                  />
                  <div className={styles.formActions}>
                    <PholioButton
                      type="button"
                      variant="secondary"
                      loading={saveContext.isPending}
                      disabled={saveContext.isPending}
                      onClick={() => saveContext.mutate()}
                    >
                      Save private context
                    </PholioButton>
                  </div>
                </div>
              ) : null}

              <footer className={styles.footer}>
                <p className={styles.boundary}>{PRIVACY_BOUNDARY}</p>
                {showStripeLockup ? <StripeLockup /> : null}
              </footer>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </Section>
  );
}
