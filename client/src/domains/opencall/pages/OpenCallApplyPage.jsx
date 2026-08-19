import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useParams } from 'react-router-dom';

import OpenCallArrivalPage from '../../onboarding/pages/OpenCallArrivalPage';
import { isEventCastingCallKind } from '../../../shared/constants/eventCasting';
import { INTAKE_REQUIREMENTS } from '../../../shared/constants/openCallIntake';
import {
  attachEmail,
  getCall,
  getDraft,
  saveDraft,
  submitApplication,
  uploadMedia,
} from '../api/opencall';
import ActionDock from '../components/ActionDock';
import AttestationStatement from '../components/AttestationStatement';
import GenderTiles from '../components/GenderTiles';
import MediaFrames from '../components/MediaFrames';
import Question from '../components/Question';
import SpotlightField from '../components/SpotlightField';
import StageShell from '../components/StageShell';
import { buildConsentCopy } from '../components/consentCopy';
import {
  MARKETING_SITE_URL,
  blockerMessage,
  compensationLine,
  fieldErrorMessage,
  formatDate,
  formatEventDates,
  listSentence,
} from '../components/callCopy';
import { stepMotion } from '../components/motion';

/*
 * The anonymous open-call application
 * (`docs/open-call-applicant-flow-design-2026-08.md` §2.5, §5.1–§5.3).
 *
 * This route used to mount the arrival page directly — a screen whose only
 * output was another screen, in front of a signup wall (critique C1). It now
 * mounts the form, and the arrival page becomes the fallback for every case
 * the anonymous flow is not for: a link whose `identity_policy` is still
 * `account_required`, a closed or invalid code, and a visitor who is already
 * signed in to Pholio. Those people see exactly what they saw before.
 *
 * SCREEN ORDER, and why it is not simply the spec's order:
 *
 *   1. the call AND the first question, on one stage — no "Begin" button that
 *      leads to another page of prose (§5.1);
 *   2..n typed apply-stage fields in spec order, one thought per screen;
 *   then  the organizer's custom questions, if the call carries any;
 *   then  email (+ optional phone) — uploads are server-gated behind it (§7);
 *   then  the digitals, LAST, so every typed answer is banked in the draft
 *         before the highest-abandonment step (ruling Q7);
 *   then  consent, then the payoff.
 *
 * The email screen never branches on whether the address has an account, and
 * neither does anything downstream of it (§5.3 — that answer, given to an
 * anonymous visitor, is an account-existence oracle).
 */

const PHASES = {
  LOADING: 'loading',
  FALLBACK: 'fallback',
  FLOW: 'flow',
  ALREADY: 'already',
  SENT: 'sent',
};

/** Looks-like-an-address, only enough to keep the dock honest. The server decides. */
function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

/**
 * The screens, in the order they are asked. Media last, email immediately
 * before it, consent at the end.
 */
function buildSteps(call) {
  const fields = (call?.spec?.fields || []).filter(
    (field) => field.requirement !== INTAKE_REQUIREMENTS.HIDDEN,
  );

  const media = fields.filter((field) => field.kind === 'media');
  const typed = fields.filter(
    (field) => field.kind !== 'media' && field.key !== 'email' && field.key !== 'phone',
  );
  const emailField =
    fields.find((field) => field.key === 'email') || {
      key: 'email',
      kind: 'email',
      label: 'Email',
      requirement: INTAKE_REQUIREMENTS.REQUIRED,
    };
  const phoneField = fields.find((field) => field.key === 'phone') || null;

  // Custom question definitions are not on the call payload yet (the server
  // publishes only `customQuestionLimits`). Read them defensively so the flow
  // renders them the day the authoring surface starts sending them.
  const maxQuestions = call?.spec?.customQuestionLimits?.maxQuestions ?? 5;
  const custom = (Array.isArray(call?.customQuestions) ? call.customQuestions : [])
    .filter((question) => question && question.key && question.label)
    .slice(0, maxQuestions);

  return [
    ...typed.map((field) => ({ id: `field:${field.key}`, kind: 'field', field })),
    ...custom.map((question) => ({ id: `custom:${question.key}`, kind: 'custom', question })),
    { id: 'email', kind: 'email', field: emailField, phoneField },
    ...(media.length ? [{ id: 'media', kind: 'media', fields: media }] : []),
    { id: 'consent', kind: 'consent' },
  ];
}

export default function OpenCallApplyPage() {
  const { code } = useParams();
  const reduceMotion = useReducedMotion();

  const [phase, setPhase] = useState(PHASES.LOADING);
  const [call, setCall] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [customAnswers, setCustomAnswers] = useState({});
  const [mediaPresent, setMediaPresent] = useState([]);
  const [identityAttached, setIdentityAttached] = useState(false);
  const [fingerprint, setFingerprint] = useState(null);
  const [blockers, setBlockers] = useState([]);
  const [resumed, setResumed] = useState(false);

  const [saving, setSaving] = useState(false);
  const [stepError, setStepError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [mediaBusy, setMediaBusy] = useState({});
  const [mediaErrors, setMediaErrors] = useState({});
  const [previews, setPreviews] = useState({});

  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);
  const [adultConfirmed, setAdultConfirmed] = useState(false);

  const objectUrls = useRef([]);
  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const steps = useMemo(() => (call ? buildSteps(call) : []), [call]);
  const step = steps[index] || null;

  const labelsByKey = useMemo(() => {
    const map = {};
    (call?.spec?.fields || []).forEach((field) => {
      map[field.key] = field.label;
    });
    return map;
  }, [call]);

  /* ------------------------------------------------------------------ load */

  const hydrate = useCallback((draft) => {
    if (!draft) return;
    setAnswers(draft.answers || {});
    setCustomAnswers(draft.customAnswers || {});
    setMediaPresent(draft.mediaPresent || []);
    setIdentityAttached(Boolean(draft.identityAttached));
    setFingerprint(draft.packageFingerprint || null);
    setBlockers(draft.blockers || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getCall(code);
        if (cancelled) return;

        // Everything the anonymous flow is not for goes back to the arrival
        // page, which already handles invalid, closed, already-applied and
        // signed-in visitors — and does it in the voice they have always seen.
        if (!data?.valid || data.accountRequired || data.closed || data.authenticated) {
          setPhase(PHASES.FALLBACK);
          return;
        }

        setCall(data);

        if (data.resume?.hasDraft) {
          if (data.resume.submitted) {
            setPhase(PHASES.ALREADY);
            return;
          }
          hydrate(data.resume);
          setResumed(true);
        }
        setPhase(PHASES.FLOW);
      } catch {
        if (!cancelled) setPhase(PHASES.FALLBACK);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, hydrate]);

  /* --------------------------------------------------- resume: where to land */

  const firstUnansweredIndex = useCallback(
    (list, state) => {
      for (let i = 0; i < list.length; i += 1) {
        const candidate = list[i];
        if (candidate.kind === 'field') {
          const { field } = candidate;
          if (field.requirement !== INTAKE_REQUIREMENTS.REQUIRED) continue;
          if (field.kind === 'attestation') {
            if (state.answers[field.key] !== true) return i;
            continue;
          }
          if (field.kind === 'date_range') {
            const range = state.answers[field.key];
            if (!range?.from || !range?.to) return i;
            continue;
          }
          if (isBlank(state.answers[field.key])) return i;
          continue;
        }
        if (candidate.kind === 'custom') {
          if (
            candidate.question.requirement === INTAKE_REQUIREMENTS.REQUIRED &&
            isBlank(state.customAnswers[candidate.question.key])
          ) {
            return i;
          }
          continue;
        }
        if (candidate.kind === 'email') {
          if (!state.identityAttached) return i;
          continue;
        }
        if (candidate.kind === 'media') {
          const missing = candidate.fields.some(
            (field) =>
              field.requirement === INTAKE_REQUIREMENTS.REQUIRED &&
              !state.mediaPresent.includes(field.key),
          );
          if (missing) return i;
          continue;
        }
        return i;
      }
      return Math.max(list.length - 1, 0);
    },
    [],
  );

  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !resumed || !steps.length) return;
    jumped.current = true;
    setIndex(firstUnansweredIndex(steps, { answers, customAnswers, mediaPresent, identityAttached }));
    // Deliberately runs once, on the first render after a resumed draft loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumed, steps]);

  /* ------------------------------------------------------- consent freshness */

  useEffect(() => {
    if (phase !== PHASES.FLOW || step?.kind !== 'consent') return;
    let cancelled = false;
    (async () => {
      try {
        const draft = await getDraft(code);
        if (!cancelled) {
          setFingerprint(draft?.packageFingerprint || null);
          setBlockers(draft?.blockers || []);
        }
      } catch {
        /* the submit call will report anything that matters */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, step?.kind, code]);

  /* ----------------------------------------------------------- state writers */

  const setAnswer = useCallback((key, value) => {
    setAnswers((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => ({ ...previous, [key]: null }));
    setStepError(null);
  }, []);

  const applySaveResult = useCallback((result) => {
    if (!result) return;
    if (Array.isArray(result.mediaPresent)) setMediaPresent(result.mediaPresent);
    if (Array.isArray(result.blockers)) setBlockers(result.blockers);
    if (typeof result.identityAttached === 'boolean') {
      setIdentityAttached(result.identityAttached);
    }
    if ('packageFingerprint' in result) setFingerprint(result.packageFingerprint);
  }, []);

  const handleFailure = useCallback(
    (error) => {
      switch (error?.code) {
        case 'ALREADY_APPLIED':
          setPhase(PHASES.ALREADY);
          return;
        case 'CALL_CLOSED':
          setPhase(PHASES.FALLBACK);
          return;
        case 'INTAKE_VALIDATION_FAILED': {
          const next = {};
          (error.errors || []).forEach((entry) => {
            next[entry.key] = fieldErrorMessage(entry.code, labelsByKey[entry.key] || 'That answer');
          });
          setFieldErrors(next);
          if (!Object.keys(next).length) setStepError(error.message);
          return;
        }
        case 'INTAKE_INCOMPLETE':
          setBlockers(error.blockers || []);
          setStepError('A few things still need answering before this can go.');
          return;
        case 'CONSENT_PACKAGE_CHANGED':
          setConsentConfirmed(false);
          setAccuracyConfirmed(false);
          setAdultConfirmed(false);
          getDraft(code)
            .then((draft) => {
              setFingerprint(draft?.packageFingerprint || null);
              setBlockers(draft?.blockers || []);
            })
            .catch(() => {});
          setStepError('Your application changed after you confirmed it. Read it once more, then send.');
          return;
        case 'EMAIL_REQUIRED': {
          const emailIndex = steps.findIndex((entry) => entry.kind === 'email');
          if (emailIndex >= 0) setIndex(emailIndex);
          setStepError('Add your email address first — that is where your receipt goes.');
          return;
        }
        default:
          setStepError(error?.message || 'That did not save. Try again.');
      }
    },
    [code, labelsByKey, steps],
  );

  /* -------------------------------------------------------------- the answer */

  const valueForField = useCallback(
    (field) => {
      const raw = answers[field.key];
      if (field.kind === 'attestation') return raw === true;
      if (field.kind === 'date_range') {
        const range = raw || {};
        return range.from && range.to ? { from: range.from, to: range.to } : null;
      }
      return isBlank(raw) ? null : raw;
    },
    [answers],
  );

  const satisfied = useMemo(() => {
    if (!step) return false;
    if (step.kind === 'field') {
      const { field } = step;
      if (field.requirement !== INTAKE_REQUIREMENTS.REQUIRED) return true;
      if (field.kind === 'attestation') return answers[field.key] === true;
      if (field.kind === 'date_range') {
        const range = answers[field.key] || {};
        return Boolean(range.from && range.to);
      }
      return !isBlank(answers[field.key]);
    }
    if (step.kind === 'custom') {
      if (step.question.requirement !== INTAKE_REQUIREMENTS.REQUIRED) return true;
      return !isBlank(customAnswers[step.question.key]);
    }
    if (step.kind === 'email') {
      const phoneOk =
        !step.phoneField ||
        step.phoneField.requirement !== INTAKE_REQUIREMENTS.REQUIRED ||
        !isBlank(answers.phone);
      return looksLikeEmail(answers.email) && phoneOk;
    }
    if (step.kind === 'media') {
      return step.fields.every(
        (field) =>
          field.requirement !== INTAKE_REQUIREMENTS.REQUIRED || mediaPresent.includes(field.key),
      );
    }
    if (step.kind === 'consent') {
      return (
        consentConfirmed && accuracyConfirmed && adultConfirmed && Boolean(fingerprint) && !saving
      );
    }
    return false;
  }, [
    step,
    answers,
    customAnswers,
    mediaPresent,
    consentConfirmed,
    accuracyConfirmed,
    adultConfirmed,
    fingerprint,
    saving,
  ]);

  const send = useCallback(async () => {
    // The three confirmations are sent as the applicant actually left them —
    // the dock will not enable without all three, and a hardcoded `true` here
    // would make the consent record a claim about the UI rather than about them.
    const result = await submitApplication(code, {
      confirmed: consentConfirmed,
      accuracyConfirmed,
      adultAuthorityConfirmed: adultConfirmed,
      packageFingerprint: fingerprint,
    });
    if (result?.submitted) setPhase(PHASES.SENT);
  }, [code, fingerprint, consentConfirmed, accuracyConfirmed, adultConfirmed]);

  const advance = useCallback(async () => {
    if (!step || saving) return;
    setSaving(true);
    setStepError(null);
    setFieldErrors({});
    try {
      if (step.kind === 'field') {
        applySaveResult(
          await saveDraft(code, { answers: { [step.field.key]: valueForField(step.field) } }),
        );
      } else if (step.kind === 'custom') {
        applySaveResult(
          await saveDraft(code, {
            customAnswers: { [step.question.key]: customAnswers[step.question.key] ?? '' },
          }),
        );
      } else if (step.kind === 'email') {
        await attachEmail(code, {
          email: String(answers.email || '').trim(),
          phone: isBlank(answers.phone) ? undefined : String(answers.phone).trim(),
        });
        hydrate(await getDraft(code));
      } else if (step.kind === 'media') {
        hydrate(await getDraft(code));
      } else if (step.kind === 'consent') {
        await send();
        return;
      }
      setResumed(false);
      setIndex((current) => Math.min(current + 1, steps.length - 1));
    } catch (error) {
      handleFailure(error);
    } finally {
      setSaving(false);
    }
  }, [
    step,
    saving,
    code,
    answers,
    customAnswers,
    steps.length,
    applySaveResult,
    valueForField,
    hydrate,
    handleFailure,
    send,
  ]);

  const goBack = useCallback(() => {
    setStepError(null);
    setFieldErrors({});
    setResumed(false);
    setIndex((current) => Math.max(current - 1, 0));
  }, []);

  const skip = useCallback(() => {
    setStepError(null);
    setIndex((current) => Math.min(current + 1, steps.length - 1));
  }, [steps.length]);

  const handlePick = useCallback(
    async (fieldKey, file) => {
      setMediaBusy((previous) => ({ ...previous, [fieldKey]: true }));
      setMediaErrors((previous) => ({ ...previous, [fieldKey]: null }));
      try {
        const result = await uploadMedia(code, fieldKey, file);
        applySaveResult(result);
        const url = URL.createObjectURL(file);
        objectUrls.current.push(url);
        setPreviews((previous) => ({ ...previous, [fieldKey]: url }));
      } catch (error) {
        if (error?.code === 'EMAIL_REQUIRED' || error?.code === 'ALREADY_APPLIED') {
          handleFailure(error);
        } else {
          setMediaErrors((previous) => ({
            ...previous,
            [fieldKey]: error?.message || 'That photo did not save. Try another.',
          }));
        }
      } finally {
        setMediaBusy((previous) => ({ ...previous, [fieldKey]: false }));
      }
    },
    [code, applySaveResult, handleFailure],
  );

  /* ----------------------------------------------------------------- render */

  if (phase === PHASES.LOADING) {
    return <StageShell label="Loading this open call" busy />;
  }

  // Invalid, closed, `account_required`, or a signed-in Pholio talent: the
  // arrival page owns all four and its treatment is unchanged.
  if (phase === PHASES.FALLBACK) {
    return <OpenCallArrivalPage />;
  }

  const organizerName = call?.agency?.name || 'The organizer';
  const isEvent = isEventCastingCallKind(call?.callKind);
  const eventName = String(call?.event?.name || '').trim();

  if (phase === PHASES.ALREADY) {
    return (
      <StageShell label="Application already sent">
        <Question
          text={
            eventName
              ? `Your application for *${eventName}* is already in.`
              : `Your application to *${organizerName}* is already in.`
          }
        />
        <p className="oc__note">
          {organizerName} has it. Check your email for your receipt — it carries the
          link to everything you sent, and to the profile you built getting here.
        </p>
        <a className="oc__link" href={MARKETING_SITE_URL}>
          About Pholio
        </a>
      </StageShell>
    );
  }

  if (phase === PHASES.SENT) {
    return (
      <StageShell label="Application sent">
        <Question text={`Your application is with *${organizerName}*.`} />
        <p className="oc__note">
          You just built the start of a Pholio profile getting here.
        </p>
        <ul className="oc__payoff-list">
          <li>Your digitals, ready to send to the next call.</li>
          <li>Your stats, in the shape agencies and organizers actually read.</li>
          <li>A comp card, generated from both.</li>
        </ul>
        <p className="oc__note">
          We emailed you a receipt — keep it with one tap.
        </p>
        <a className="oc__link" href={MARKETING_SITE_URL}>
          About Pholio
        </a>
      </StageShell>
    );
  }

  const eventDates = formatEventDates(call?.event);
  const eventWhere = [eventDates, call?.event?.location].filter(Boolean).join(' · ');
  const compensation = compensationLine(organizerName, call?.compensation);
  const closingLine = call?.brief?.ongoing
    ? 'This call runs continuously.'
    : call?.brief?.deadline
      ? `Applications close ${formatDate(call.brief.deadline)}.`
      : null;
  const shortlistLine = listSentence(
    (call?.spec?.shortlistFields || []).map((field) => String(field.label || '').toLowerCase()),
  );

  const onFirstScreen = index === 0;

  const isOptionalStep =
    (step?.kind === 'field' && step.field.requirement !== INTAKE_REQUIREMENTS.REQUIRED) ||
    (step?.kind === 'custom' && step.question.requirement !== INTAKE_REQUIREMENTS.REQUIRED);

  const dockLabel =
    step?.kind === 'consent'
      ? saving
        ? 'Sending…'
        : 'Send application'
      : saving
        ? 'Saving…'
        : 'Continue';

  return (
    <StageShell
      label={
        isEvent && eventName
          ? `${organizerName} casting for ${eventName}`
          : `${organizerName} open call`
      }
    >
      {onFirstScreen ? (
        <CallHeader
          agency={call.agency}
          organizerName={organizerName}
          isEvent={isEvent}
          eventName={eventName}
          eventWhere={eventWhere}
          compensation={compensation}
          closingLine={closingLine}
          shortlistLine={shortlistLine}
          reduceMotion={reduceMotion}
        />
      ) : null}

      {/* A quiet beat, not a banner. It clears the moment they move. */}
      {resumed ? <p className="oc__resume">Picking up where you left off.</p> : null}

      <AnimatePresence mode="wait">
        <motion.div key={step?.id || 'empty'} style={{ width: '100%' }} {...stepMotion(reduceMotion)}>
          <StepBody
            step={step}
            answers={answers}
            customAnswers={customAnswers}
            setAnswer={setAnswer}
            setCustomAnswer={(key, value) => {
              setCustomAnswers((previous) => ({ ...previous, [key]: value }));
              setStepError(null);
            }}
            fieldErrors={fieldErrors}
            organizerName={organizerName}
            eventName={eventName}
            event={call?.event}
            compensationPayload={call?.compensation}
            mediaPresent={mediaPresent}
            mediaBusy={mediaBusy}
            mediaErrors={mediaErrors}
            previews={previews}
            onPick={handlePick}
            blockers={blockers}
            labelsByKey={labelsByKey}
            consentConfirmed={consentConfirmed}
            accuracyConfirmed={accuracyConfirmed}
            adultConfirmed={adultConfirmed}
            setConsentConfirmed={setConsentConfirmed}
            setAccuracyConfirmed={setAccuracyConfirmed}
            setAdultConfirmed={setAdultConfirmed}
            onEnter={advance}
          />
          {stepError ? <p className="oc__error">{stepError}</p> : null}
        </motion.div>
      </AnimatePresence>

      <ActionDock
        label={dockLabel}
        enabled={satisfied && !saving}
        onAdvance={advance}
        progress={steps.length > 1 ? `${index + 1} of ${steps.length}` : null}
        back={onFirstScreen ? null : { onClick: goBack }}
        skip={isOptionalStep ? { onClick: skip, label: 'Skip this one' } : null}
      />
    </StageShell>
  );
}

/* ------------------------------------------------------------ screen one's call */

function CallHeader({
  agency,
  organizerName,
  isEvent,
  eventName,
  eventWhere,
  compensation,
  closingLine,
  shortlistLine,
  reduceMotion,
}) {
  const facts = [
    isEvent && eventWhere ? ['Dates', eventWhere] : null,
    compensation ? ['Compensation', compensation] : null,
    closingLine ? ['Deadline', closingLine] : null,
    shortlistLine ? ['If they shortlist you', `They'll ask for ${shortlistLine} then — not now.`] : null,
  ].filter(Boolean);

  return (
    <motion.div
      style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0.2 : 0.6 }}
    >
      <div className="oc__mark">
        {/* Their real mark, or nothing — a generated monogram is a fake logo at
            exactly the moment trust is being established. */}
        {agency?.logo ? <img src={agency.logo} alt="" className="oc__logo" /> : null}
        <span className="oc__organizer">{organizerName}</span>
        {agency?.location ? <span className="oc__location">{agency.location}</span> : null}
      </div>

      <h1 className="oc__headline">
        {isEvent
          ? eventName
            ? `${organizerName} is casting for ${eventName}.`
            : `${organizerName} is casting.`
          : `${organizerName} invited you to submit.`}
      </h1>

      {facts.length ? (
        <dl className="oc__facts" aria-label={`What ${organizerName} published`}>
          {facts.map(([label, body]) => (
            <div className="oc__fact" key={label}>
              <dt className="oc__fact-label">{label}</dt>
              <dd className="oc__fact-body">{body}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {isEvent ? (
        // Ruling R8. Not a badge, not a footnote — the one hard eligibility rule
        // on the page, said in plain words before anyone starts.
        <p className="oc__agegate">You must be 18 or older to apply.</p>
      ) : null}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- the screens */

function StepBody(props) {
  const { step } = props;
  if (!step) return null;
  if (step.kind === 'field') return <FieldScreen {...props} />;
  if (step.kind === 'custom') return <CustomScreen {...props} />;
  if (step.kind === 'email') return <EmailScreen {...props} />;
  if (step.kind === 'media') return <MediaScreen {...props} />;
  return <ConsentScreen {...props} />;
}

const QUESTIONS = {
  legal_name: 'What name should we put on *this*?',
  city: 'Where are you *based*?',
  height: 'How *tall* are you?',
  gender: 'How do you *identify*?',
  date_of_birth: 'When were you *born*?',
  instagram: 'Where can they *find* you?',
  portfolio_url: 'Anywhere else we should *look*?',
  core_measurements: 'Your current *measurements*?',
  adult_attestation: 'One thing before we *go on*.',
  walk_video_url: 'A link to your *walk*?',
  availability_window: 'When are you *free*?',
};

const HINTS = {
  height: 'In centimetres.',
  instagram: 'Handle or full link — either works.',
  core_measurements: 'Bust, waist, hips. However you usually write them.',
};

function FieldScreen({ step, answers, setAnswer, fieldErrors, onEnter }) {
  const { field } = step;
  const value = answers[field.key];
  const error = fieldErrors[field.key];
  const question = QUESTIONS[field.key] || `Your *${String(field.label).toLowerCase()}*?`;

  if (field.kind === 'enum') {
    return (
      <>
        <Question text={question} />
        <GenderTiles
          value={value || null}
          onChange={(next) => setAnswer(field.key, next)}
          label={field.label}
        />
        {error ? <p className="oc__error">{error}</p> : null}
      </>
    );
  }

  if (field.kind === 'attestation') {
    return (
      <>
        <Question text={question} />
        <AttestationStatement
          statement="I am 18 years of age or older."
          aside="This call does not accept applicants under 18."
          affirmed={value === true}
          onToggle={(next) => setAnswer(field.key, next)}
        />
        {error ? <p className="oc__error">{error}</p> : null}
      </>
    );
  }

  if (field.kind === 'date_range') {
    const range = value || {};
    return (
      <>
        <Question text={question} />
        <div className="oc__pair">
          <div>
            <p className="oc__field-label">From</p>
            <SpotlightField
              type="date"
              value={range.from || ''}
              onChange={(next) => setAnswer(field.key, { ...range, from: next })}
              aria-label={`${field.label} — from`}
            />
          </div>
          <div>
            <p className="oc__field-label">To</p>
            <SpotlightField
              type="date"
              value={range.to || ''}
              onChange={(next) => setAnswer(field.key, { ...range, to: next })}
              aria-label={`${field.label} — to`}
            />
          </div>
        </div>
        {error ? <p className="oc__error">{error}</p> : null}
      </>
    );
  }

  const inputType =
    field.kind === 'date'
      ? 'date'
      : field.kind === 'url'
        ? 'url'
        : field.kind === 'number'
          ? 'text'
          : 'text';

  return (
    <>
      <Question text={question} />
      <SpotlightField
        type={inputType}
        value={value || ''}
        onChange={(next) => setAnswer(field.key, next)}
        onEnter={onEnter}
        placeholder={field.kind === 'number' ? '178' : field.label}
        aria-label={field.label}
        aria-invalid={error ? 'true' : undefined}
        {...(field.kind === 'number' ? { inputMode: 'numeric' } : {})}
      />
      {HINTS[field.key] ? <p className="oc__hint">{HINTS[field.key]}</p> : null}
      {error ? <p className="oc__error">{error}</p> : null}
    </>
  );
}

function CustomScreen({ step, customAnswers, setCustomAnswer, onEnter }) {
  const { question } = step;
  return (
    <>
      <Question text={question.label} />
      <SpotlightField
        value={customAnswers[question.key] || ''}
        onChange={(next) => setCustomAnswer(question.key, next)}
        onEnter={onEnter}
        aria-label={question.label}
      />
    </>
  );
}

/*
 * The email screen. Framed as where the receipt goes, because that is what it
 * is for — and because any framing that gestures at accounts invites the one
 * question this surface must never answer (§5.3).
 */
function EmailScreen({ step, answers, setAnswer, fieldErrors, onEnter }) {
  const phoneField = step.phoneField;
  const phoneRequired = phoneField?.requirement === INTAKE_REQUIREMENTS.REQUIRED;
  return (
    <>
      <Question text="Where should we send your *confirmation*?" />
      <SpotlightField
        type="email"
        value={answers.email || ''}
        onChange={(next) => setAnswer('email', next)}
        onEnter={onEnter}
        placeholder="you@example.com"
        aria-label="Email address"
        aria-invalid={fieldErrors.email ? 'true' : undefined}
        inputMode="email"
        autoCapitalize="none"
      />
      {fieldErrors.email ? <p className="oc__error">{fieldErrors.email}</p> : null}

      {phoneField ? (
        <div style={{ width: '100%', marginTop: '18px' }}>
          <p className="oc__field-label">
            Phone {phoneRequired ? '' : '(optional)'}
          </p>
          <SpotlightField
            type="tel"
            inline
            value={answers.phone || ''}
            onChange={(next) => setAnswer('phone', next)}
            onEnter={onEnter}
            placeholder="Only used if they need to reach you"
            aria-label="Phone number"
            inputMode="tel"
          />
        </div>
      ) : null}

      <p className="oc__hint">
        Your receipt goes here, and so does anything the organizer sends you about
        this application.
      </p>
    </>
  );
}

function MediaScreen({ step, mediaPresent, mediaBusy, mediaErrors, previews, onPick }) {
  return (
    <>
      <Question text="Last part — let's *see* you." />
      <MediaFrames
        fields={step.fields}
        present={mediaPresent}
        previews={previews}
        busy={mediaBusy}
        errors={mediaErrors}
        onPick={onPick}
      />
      <p className="oc__hint">
        Straight from your camera roll is fine. These go to the casting team, not
        to a public page.
      </p>
    </>
  );
}

function ConsentScreen({
  organizerName,
  eventName,
  event,
  compensationPayload,
  blockers,
  labelsByKey,
  consentConfirmed,
  accuracyConfirmed,
  adultConfirmed,
  setConsentConfirmed,
  setAccuracyConfirmed,
  setAdultConfirmed,
}) {
  const copy = buildConsentCopy({
    organizerName,
    event: { name: eventName, endsOn: event?.endsOn },
    compensation: compensationPayload,
  });

  return (
    <>
      <Question text="Read this once, then *send*." />

      <div className="oc-consent">
        <p className="oc-consent__terms">{copy.termsLabel}</p>
        <p className="oc-consent__body">{copy.handling}</p>
        <p className="oc-consent__body">{copy.dataCategories}</p>
        <p className="oc-consent__body">{copy.thirdPartyAccess}</p>
        <p className="oc-consent__body oc-consent__body--strong">{copy.compensation}</p>
        <p className="oc-consent__body">{copy.retentionAndWithdrawal}</p>
        <p className="oc-consent__body">{copy.noGuaranteeStatement}</p>

        <div className="oc-consent__confirms">
          <AttestationStatement
            statement={copy.consentStatement}
            affirmed={consentConfirmed}
            onToggle={setConsentConfirmed}
          />
          <AttestationStatement
            statement={copy.accuracyStatement}
            affirmed={accuracyConfirmed}
            onToggle={setAccuracyConfirmed}
          />
          <AttestationStatement
            statement={copy.adultStatement}
            affirmed={adultConfirmed}
            onToggle={setAdultConfirmed}
          />
        </div>
      </div>

      {blockers?.length ? (
        <ul className="oc-blockers">
          {blockers.map((blocker) => (
            <li key={blocker}>{blockerMessage(blocker, labelsByKey)}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
