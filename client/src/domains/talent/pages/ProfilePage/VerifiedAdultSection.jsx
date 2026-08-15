import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { talentApi } from '../../api/talent';
import { Section } from '../../components/profile-index';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { PholioInput } from '../../../../shared/components/ui/forms';
import PholioMultiSelect from '../../../../shared/components/ui/forms/PholioMultiSelect';
import { pholioToast } from '../../../../shared/lib/pholio-toast';
import { computeAge } from '../../../../shared/utils/talentAge';
import {
  AGE_VERIFICATION_STATES,
  CONSENT_NOTE,
  DATA_STORY,
  DOB_INVALIDATION_NOTE,
  PRIVACY_BOUNDARY,
  isPollingStatus,
  nextPollDelay,
  resolveAgeVerificationState,
} from './ageVerificationState';
import { startIdentityHandoff } from './stripeIdentity';
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

  return (
    <Section
      id="verified-adult"
      title="Private context"
      titleEmphasis="context"
      showDivider={false}
    >
      <div className={styles.wrap}>
        <div className={styles.entryRow}>
          <span className={styles.entryCopy}>{state.summaryLine}</span>
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
              className={styles.panel}
              {...panelMotion}
            >
              <p className={styles.statusLine} role="status" aria-live="polite">
                {state.statusLine}
              </p>

              {state.id === AGE_VERIFICATION_STATES.DOB_MISSING ? (
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
              ) : null}

              {state.showExplainer ? (
                <ul className={styles.story}>
                  {DATA_STORY.map((line) => (
                    <li key={line} className={styles.storyItem}>
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}

              {state.showDobFix && state.id === AGE_VERIFICATION_STATES.DOB_MISMATCH ? (
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
                  <span className={styles.poweredBy}>Powered by Stripe</span>
                </div>
              ) : null}

              {state.actionLabel ? (
                <>
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
                    <span className={styles.poweredBy}>Powered by Stripe</span>
                  </div>
                  <p className={styles.fineprint}>
                    {CONSENT_NOTE} {DOB_INVALIDATION_NOTE}
                  </p>
                </>
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

              <p className={styles.boundary}>{PRIVACY_BOUNDARY}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </Section>
  );
}
