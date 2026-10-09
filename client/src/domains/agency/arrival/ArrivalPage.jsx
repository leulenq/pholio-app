import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { addAgencyTeamMember, getAgencyLegalStatus } from '../api/agency';
import { commitArrival, getArrival } from './api';
import {
  accentFrom,
  buildScenes,
  clearDraft,
  formatDay,
  initialAnswers,
  isSceneComplete,
  readDraft,
  writeDraft,
} from './model';
import Lockup from './Lockup';
import {
  BoardsScene,
  DoorsScene,
  MarkScene,
  MinorsScene,
  NameScene,
  TeamScene,
  TermsScene,
  WaitingScene,
  WindowScene,
} from './scenes';
import './arrival.css';

const SCENES = {
  name: NameScene,
  mark: MarkScene,
  boards: BoardsScene,
  minors: MinorsScene,
  window: WindowScene,
  team: TeamScene,
  terms: TermsScene,
  doors: DoorsScene,
  waiting: WaitingScene,
};

const EASE_OUT = [0.16, 1, 0.3, 1];

export default function ArrivalPage() {
  const introQuery = useQuery({ queryKey: ['agency', 'arrival'], queryFn: getArrival, retry: false });
  const legalQuery = useQuery({ queryKey: ['agency', 'legal-status'], queryFn: getAgencyLegalStatus, retry: false });

  if (introQuery.isLoading || legalQuery.isLoading) {
    return <main className="arv" aria-busy="true" />;
  }

  if (introQuery.isError || !introQuery.data) {
    return (
      <main className="arv arv--fault">
        <div className="arv-fault">
          <h1>Your agency record could not be loaded.</h1>
          <p>Nothing has been changed. Try again, or contact support@pholio.studio if it keeps happening.</p>
          <Advance label="Try again" onClick={() => introQuery.refetch()} />
        </div>
      </main>
    );
  }

  if (introQuery.data.agency.completedAt) {
    return <Navigate to="/dashboard/agency" replace />;
  }

  return <Arrival intro={introQuery.data} legal={legalQuery.data || null} />;
}

/**
 * `preview` (dev only, see ArrivalPreview) plays the whole first run without
 * writing anything: no draft, no upload, no policy acceptance, no commit.
 */
export function Arrival({ intro, legal, preview = null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const agencyKey = intro.agency.name;

  const [draft] = useState(() => (preview ? null : readDraft(agencyKey)));
  const [answers, setAnswers] = useState(() => ({ ...initialAnswers(intro), ...(draft?.answers || {}) }));
  const [logoPath, setLogoPath] = useState(intro.agency.logoPath);
  const [legalDone, setLegalDone] = useState(!legal?.needsAcceptance);
  const scenes = useMemo(() => buildScenes({ intro, legal }), [intro, legal]);
  const [index, setIndex] = useState(() => {
    const at = draft ? scenes.indexOf(draft.scene) : -1;
    return at >= 0 ? at : 0;
  });
  const [phase, setPhase] = useState(draft ? 'docked' : 'opening');
  const [direction, setDirection] = useState(1);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState(null);
  const [termsRequest, setTermsRequest] = useState(0);

  const scene = scenes[index];
  const accent = accentFrom(intro.agency.brandColor);
  const Scene = SCENES[scene];

  useEffect(() => {
    if (phase === 'docked' && !preview) writeDraft(agencyKey, scene, answers);
  }, [agencyKey, scene, answers, phase, preview]);

  const update = useCallback((patch) => {
    setAnswers((current) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }));
  }, []);

  const go = useCallback(
    (step) => {
      setDirection(step);
      setCommitError(null);
      setIndex((current) => Math.min(scenes.length - 1, Math.max(0, current + step)));
    },
    [scenes.length],
  );

  const open = useCallback(async () => {
    if (committing) return;
    setCommitting(true);
    setCommitError(null);
    if (preview) {
      setPhase('leaving');
      await new Promise((resolve) => window.setTimeout(resolve, reduceMotion ? 200 : 1900));
      preview.onDone();
      return;
    }
    try {
      const result = await commitArrival({
        name: answers.name,
        location: answers.location,
        openBoards: answers.openBoards,
        acceptsMinors: answers.acceptsMinors,
        minorCustodyAccepted: answers.minorCustodyAccepted,
        reviewWindowDays: answers.reviewWindowDays,
        invited: answers.invites.map((invite) => invite.email),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        units: intro.units,
      });
      clearDraft();
      setPhase('leaving');

      // Invitations go out once the agency exists on Pholio. A failed one
      // never holds the agency closed; it is reported and can be resent
      // from Team.
      const failures = [];
      for (const invite of answers.invites) {
        try {
          await addAgencyTeamMember({ email: invite.email, membership_role: invite.role });
        } catch (error) {
          failures.push(`${invite.email}: ${error?.data?.message || error.message}`);
        }
      }

      // The session gate wraps this page differently once setup is complete,
      // so the cached session is only updated after the stage has opened, in
      // the same tick as the navigation, and refetched from the server after.
      await new Promise((resolve) => window.setTimeout(resolve, reduceMotion ? 200 : 1900));
      queryClient.setQueryData(['session', 'agency'], (session) =>
        session ? { ...session, agencyOnboardingCompletedAt: new Date().toISOString() } : session,
      );
      navigate(result?.redirect || '/dashboard/agency', { replace: true });
      queryClient.invalidateQueries({ queryKey: ['session', 'agency'] });
      queryClient.invalidateQueries({ queryKey: ['agency-profile'] });
      queryClient.removeQueries({ queryKey: ['agency', 'arrival'] });
      failures.forEach((line) =>
        toast.error('Invitation not sent', { description: `${line}. Invite them again from Team.` }),
      );
    } catch (error) {
      setCommitting(false);
      setCommitError(error?.message || 'The agency could not be opened. Nothing was changed. Try again.');
    }
  }, [answers, committing, intro.units, navigate, queryClient, reduceMotion, preview]);

  const [termsReady, setTermsReady] = useState(false);
  const canContinue = isSceneComplete(scene, answers) && (scene !== 'terms' || legalDone || termsReady);

  const submitTerms = useCallback(() => setTermsRequest((n) => n + 1), []);

  const primary = useMemo(() => {
    if (scene === 'waiting') return null;
    if (scene === 'doors') return { label: committing ? 'Opening' : 'Open to applications', action: open };
    if (scene === 'terms' && !legalDone) {
      return { label: 'Accept policies', action: submitTerms };
    }
    if (scene === 'team' && answers.invites.length === 0) return { label: 'Just me for now', action: () => go(1) };
    return { label: 'Continue', action: () => go(1) };
  }, [scene, committing, open, legalDone, answers.invites.length, go, submitTerms]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      if (event.target?.dataset?.enter === 'local' || event.target?.tagName === 'BUTTON' || event.target?.tagName === 'A') return;
      if (phase === 'opening') {
        event.preventDefault();
        setPhase('docked');
        return;
      }
      if (phase === 'docked' && primary && canContinue && scene !== 'doors' && scene !== 'terms') {
        event.preventDefault();
        primary.action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, primary, canContinue, scene]);

  const glow = glowFor({ phase, scene, answers });
  const progress = phase === 'opening' ? 0 : (index + 1) / scenes.length;
  const transition = reduceMotion ? { duration: 0.01 } : { duration: 0.7, ease: EASE_OUT };

  return (
    <main
      className={`arv arv--${phase}`}
      style={{ '--arv-accent': accent }}
      aria-label={`${intro.agency.name} on Pholio`}
    >
      <div className="arv-doors" aria-hidden="true">
        <motion.div
          className="arv-door arv-door--left"
          animate={{ x: phase === 'leaving' ? '-101%' : 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 1.15, delay: reduceMotion ? 0 : 0.55, ease: [0.76, 0, 0.24, 1] }}
        />
        <motion.div
          className="arv-door arv-door--right"
          animate={{ x: phase === 'leaving' ? '101%' : 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 1.15, delay: reduceMotion ? 0 : 0.55, ease: [0.76, 0, 0.24, 1] }}
        />
      </div>

      <motion.div
        className="arv-light"
        aria-hidden="true"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={glow}
        transition={{ type: 'spring', stiffness: 22, damping: 14, opacity: { duration: 1.6 } }}
      />
      <motion.div
        className="arv-light arv-light--cool"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === 'docked' && scene === 'minors' && answers.acceptsMinors ? 0.55 : 0 }}
        transition={{ duration: 1.2 }}
      />

      <motion.div
        className="arv-spine"
        aria-hidden="true"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: phase === 'leaving' ? 0 : progress }}
        transition={{ type: 'spring', stiffness: 55, damping: 16 }}
      />

      <Lockup
        phase={phase}
        name={answers.name || intro.agency.name}
        logoPath={logoPath}
        animateIn={!draft}
        reduceMotion={reduceMotion}
      />

      <AnimatePresence>
        {phase === 'opening' ? (
          <OpeningCredits key="credits" intro={intro} onContinue={() => setPhase('docked')} reduceMotion={reduceMotion} />
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait" custom={direction}>
        {phase === 'docked' ? (
          <motion.section
            key={scene}
            className={`arv-scene arv-scene--${scene}`}
            custom={direction}
            initial={{ opacity: 0, y: direction * 48, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { ...transition, delay: 0.1 } }}
            exit={{ opacity: 0, y: direction * -36, filter: 'blur(6px)', transition: { duration: reduceMotion ? 0.01 : 0.35, ease: [0.4, 0, 1, 1] } }}
          >
            <Scene
              intro={intro}
              legal={legal}
              answers={answers}
              update={update}
              logoPath={logoPath}
              setLogoPath={setLogoPath}
              legalDone={legalDone}
              onLegalAccepted={() => {
                setLegalDone(true);
                go(1);
              }}
              onTermsReady={setTermsReady}
              termsRequest={termsRequest}
              reduceMotion={reduceMotion}
              preview={Boolean(preview)}
            />
          </motion.section>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'docked' ? (
          <motion.footer
            key="controls"
            className="arv-controls"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.5, duration: 0.5 } }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
          >
            <div className="arv-controls-back">
              {index > 0 && !committing ? (
                <button type="button" className="arv-back" onClick={() => go(-1)}>
                  Back
                </button>
              ) : null}
            </div>
            <div className="arv-controls-primary">
              {commitError ? (
                <p className="arv-error" role="alert">
                  {commitError}
                </p>
              ) : null}
              {primary ? (
                <Advance
                  label={primary.label}
                  final={scene === 'doors'}
                  busy={committing}
                  disabled={!canContinue || committing}
                  onClick={primary.action}
                />
              ) : null}
            </div>
          </motion.footer>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

/**
 * The light is the agency's colour, and it answers the agency: it gathers
 * behind the names at the opening, settles to one side while questions are
 * asked, grows with each board opened, slides along the reply window, and
 * centres again on the threshold.
 */
function glowFor({ phase, scene, answers }) {
  if (phase === 'opening') return { opacity: 0.9, scale: 1, x: '0vw', y: '-6vh' };
  if (phase === 'leaving') return { opacity: 0, scale: 2.4, x: '0vw', y: '0vh' };
  switch (scene) {
    case 'boards':
      return { opacity: 0.45 + Math.min(answers.openBoards.length, 6) * 0.08, scale: 0.8 + Math.min(answers.openBoards.length, 6) * 0.12, x: '22vw', y: '6vh' };
    case 'minors':
      return { opacity: answers.acceptsMinors ? 0.25 : 0.55, scale: 0.9, x: answers.acceptsMinors === true ? '18vw' : answers.acceptsMinors === false ? '-6vw' : '6vw', y: '10vh' };
    case 'window': {
      const days = Math.min(90, answers.reviewWindowDays || 30);
      return { opacity: 0.6, scale: 0.7 + days / 90, x: `${-18 + days * 0.7}vw`, y: '18vh' };
    }
    case 'doors':
      return { opacity: 0.95, scale: 1.35, x: '0vw', y: '-4vh' };
    case 'terms':
      return { opacity: 0.3, scale: 0.8, x: '26vw', y: '-10vh' };
    default:
      return { opacity: 0.6, scale: 0.9, x: '24vw', y: '-6vh' };
  }
}

/**
 * The verdict.
 *
 * The last thing the agency read on pholio-site was "Request received.",
 * with one gold italic word to a headline. Here the answer sits under the
 * PHOLIO | AGENCY lockup, in the same voice, and the foot of the stage
 * carries a few lines of the request the agency drew up, in the form's own
 * term and value grammar.
 */
function OpeningCredits({ intro, onContinue, reduceMotion }) {
  const at = (seconds) => (reduceMotion ? 0 : seconds);
  const approval = intro.approval || {};
  const requested = formatDay(approval.requestedAt);
  const approved = formatDay(approval.approvedAt);
  const word = 'Approved';

  const record = [
    { term: 'Boards', value: (approval.boards || []).join(', ') },
    { term: 'Roster', value: approval.rosterSize },
    { term: 'Team', value: approval.teamSize },
  ].filter((row) => row.value);

  const out = { opacity: 0, y: -24, filter: 'blur(10px)', transition: { duration: 0.5, ease: [0.4, 0, 1, 1] } };

  return (
    <>
      <motion.div className="arv-verdict" exit={out}>
        <h1 className="arv-verdict-word" aria-label={`${word}.`}>
          <span className="arv-verdict-letters" aria-hidden="true">
            {[...word].map((letter, i) => (
              <span className="arv-verdict-mask" key={i}>
                <motion.span
                  className="arv-verdict-letter"
                  initial={{ y: '112%', rotate: 6 }}
                  animate={{ y: '0%', rotate: 0 }}
                  transition={{ delay: at(2.15 + i * 0.055), duration: reduceMotion ? 0.01 : 1.15, ease: EASE_OUT }}
                >
                  {letter}
                </motion.span>
              </span>
            ))}
            <span className="arv-verdict-mask">
              <motion.span
                className="arv-verdict-stop"
                initial={{ y: '112%' }}
                animate={{ y: '0%' }}
                transition={{ delay: at(2.15 + word.length * 0.055 + 0.1), duration: reduceMotion ? 0.01 : 0.9, ease: EASE_OUT }}
              >
                .
              </motion.span>
            </span>
          </span>
          {/* One pass of light across the word once it has landed. */}
          {!reduceMotion ? (
            <motion.span
              className="arv-verdict-sheen"
              aria-hidden="true"
              initial={{ backgroundPosition: '130% 0', opacity: 0 }}
              animate={{ backgroundPosition: '-30% 0', opacity: [0, 1, 1, 0] }}
              transition={{ delay: 3.35, duration: 1.6, ease: [0.45, 0, 0.25, 1], opacity: { delay: 3.35, duration: 1.6, times: [0, 0.15, 0.8, 1] } }}
            >
              {word}
            </motion.span>
          ) : null}
        </h1>

        {requested || approved ? (
          <motion.p
            className="arv-verdict-dates"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: at(3.1), duration: 1, ease: EASE_OUT }}
          >
            {requested ? <span>Requested {requested}</span> : null}
            {requested && approved ? <i aria-hidden="true" /> : null}
            {approved ? <span>Approved {approved}</span> : null}
          </motion.p>
        ) : null}
      </motion.div>

      {record.length ? (
        <motion.dl className="arv-record" aria-label="Your request" exit={out}>
          {record.map((row, i) => (
            <motion.div
              key={row.term}
              className="arv-record-row"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: at(3.5 + i * 0.12), duration: 0.9, ease: EASE_OUT }}
            >
              <motion.i
                className="arv-record-rule"
                aria-hidden="true"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: at(3.45 + i * 0.12), duration: 1, ease: EASE_OUT }}
              />
              <dt>{row.term}</dt>
              <dd>{row.value}</dd>
            </motion.div>
          ))}
        </motion.dl>
      ) : null}

      <motion.div
        className="arv-begin"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: { delay: at(4.4), duration: 1, ease: EASE_OUT } }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
      >
        <Advance label="Continue" onClick={onContinue} />
      </motion.div>
    </>
  );
}

/**
 * The one way forward, everywhere in arrival: the word alone. A hairline
 * draws beneath it as the hand arrives; the last step, the one that opens
 * the agency, is set in gold.
 */
function Advance({ label, onClick, disabled = false, final = false, busy = false }) {
  return (
    <button
      type="button"
      className={`arv-advance${final ? ' arv-advance--final' : ''}${busy ? ' is-busy' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
