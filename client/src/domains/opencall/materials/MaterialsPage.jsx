import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getMaterialsRequest, sendMaterials } from './api';
import './MaterialsPage.css';

/**
 * Shortlist-stage fulfilment — the page an emailed materials link opens
 * (`docs/open-call-applicant-flow-design-2026-08.md` §2 Law 2, §5.4, ruling Q8).
 *
 * SHAPE follows `domains/messaging/pages/ReplyPage.jsx` and
 * `domains/events/pages/PickListPage.jsx`: a public, no-chrome page reached only
 * by a token, with four states — loading, unavailable, the ask, and done —
 * useQuery + useMutation, sonner for failures, its own stylesheet.
 *
 * VISUAL REGISTER: the AGENCY system, not the applicant one. This is deliberate
 * and it is the opposite choice from the arrival and apply pages. Those wear the
 * dark stage because they are courting a stranger who has not decided to spend
 * four minutes yet. By the time this link arrives the decision has already been
 * made in the applicant's favour: a casting team has shortlisted them and is
 * asking, professionally, for three specific things by a date. That is a
 * working correspondence, not a pitch — so it gets the cream editorial ledger,
 * Playfair on the event name and nowhere else, Inter for every control, and
 * gold on exactly one thing: the send.
 *
 * NO ACCOUNT IS REQUIRED TO SEND (ruling Q8). The claim offer appears only in
 * the done state, after the materials are with the organizer, and it is quiet.
 * Anything else would make an account the price of answering a question they
 * were asked.
 */

const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

function formatDueDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatEventDates(event) {
  const format = (iso) => {
    if (!iso) return null;
    const date = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };
  const from = format(event?.startsOn);
  const to = format(event?.endsOn);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from || to || null;
}

/** "three things" reads like a person wrote it; "3 item(s)" does not. */
const COUNT_WORDS = ['nothing', 'one thing', 'two things', 'three things', 'four things'];
function countPhrase(n) {
  return COUNT_WORDS[n] || `${n} things`;
}

function initialValues(fieldDefs, values) {
  const seed = {};
  for (const field of fieldDefs) {
    const existing = values?.[field.key];
    if (field.kind === 'date_range') {
      seed[field.key] = {
        from: existing?.from || '',
        to: existing?.to || '',
      };
    } else {
      seed[field.key] = existing == null ? '' : String(existing);
    }
  }
  return seed;
}

function isAnswered(field, value) {
  if (field.kind === 'date_range') return Boolean(value?.from && value?.to);
  return Boolean(String(value ?? '').trim());
}

export default function MaterialsPage() {
  const { token } = useParams();
  const reduceMotion = useReducedMotion();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['opencall-materials', token],
    queryFn: () => getMaterialsRequest(token),
    enabled: !!token,
    retry: false,
  });

  const fieldDefs = useMemo(() => data?.fieldDefs || [], [data?.fieldDefs]);
  const [values, setValues] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [sent, setSent] = useState(null);

  // Seeded once the ask has loaded, so a second visit shows what was typed
  // before rather than a blank form.
  const form = values ?? initialValues(fieldDefs, data?.values);

  const setField = (key, value) => {
    setValues({ ...form, [key]: value });
    setFieldErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const send = useMutation({
    mutationFn: (body) => sendMaterials(token, body),
    onSuccess: (result) => {
      setFieldErrors({});
      setSent(result);
      toast.success('Sent');
    },
    onError: (err) => {
      const errors = err?.data?.errors;
      if (Array.isArray(errors) && errors.length) {
        setFieldErrors(
          Object.fromEntries(errors.map((entry) => [entry.key, entry.code])),
        );
        toast.error('Check the highlighted answers');
        return;
      }
      toast.error(err?.message || 'Could not send your materials');
    },
  });

  const wantsMeasurements = fieldDefs.some((field) => field.key === 'core_measurements');
  const complete =
    fieldDefs.length > 0 &&
    fieldDefs.every((field) => isAnswered(field, form[field.key])) &&
    (!wantsMeasurements || confirmed);

  const handleSend = () => {
    const answers = {};
    for (const field of fieldDefs) {
      const value = form[field.key];
      answers[field.key] =
        field.kind === 'date_range' ? { from: value.from, to: value.to } : String(value).trim();
    }
    if (wantsMeasurements) answers.measurementsConfirmed = confirmed;
    send.mutate({ answers });
  };

  if (isLoading) {
    return (
      <div className="mt-page">
        <div className="mt-page__center">
          <Loader2 className="mt-page__spinner" aria-hidden="true" />
          <p>Loading what they asked for…</p>
        </div>
      </div>
    );
  }

  // One identical state for every unusable link. The server refuses to say
  // whether it expired, was already used or never existed, and this page must
  // not invent the distinction — with the single exception the server does
  // make: a link spent by a send that succeeded.
  if (isError || !data || (data.valid === false && !data.alreadySent)) {
    return (
      <div className="mt-page">
        <div className="mt-page__center mt-page__center--quiet">
          <AlertCircle size={32} aria-hidden="true" />
          <h1>This link is no longer available</h1>
          <p>{error?.message || 'Ask the casting team to send you a new link.'}</p>
        </div>
      </div>
    );
  }

  const organizerName = data.organizer?.name || sent?.organizer?.name || 'the casting team';

  if (data.alreadySent || (data.valid && data.fulfilled && !sent)) {
    return (
      <div className="mt-page">
        <div className="mt-page__center mt-page__center--quiet">
          <Check size={32} aria-hidden="true" />
          <h1>Already sent</h1>
          <p>{organizerName} has your materials. There is nothing left to do here.</p>
        </div>
      </div>
    );
  }

  const dueDate = formatDueDate(data.dueAt);
  const eventDates = formatEventDates(data.event);

  return (
    <div className="mt-page">
      <motion.header
        className="mt-masthead"
        initial={reduceMotion ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : SPRING}
      >
        <div className="mt-masthead__inner">
          <h1 className="mt-masthead__event">{data.event?.name || organizerName}</h1>
          <p className="mt-masthead__meta">
            {[data.organizer?.name, eventDates, data.event?.location || data.organizer?.location]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="mt-masthead__ask">
            {organizerName} shortlisted you and needs {countPhrase(fieldDefs.length)}
            {dueDate ? ` by ${dueDate}` : ''}.
          </p>
          <p className="mt-masthead__note">
            You do not need a Pholio account to send these.
          </p>
        </div>
      </motion.header>

      <motion.main
        className="mt-main"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.05 }}
      >
        {sent ? (
          <SentPanel organizerName={organizerName} claimUrl={sent.claimUrl} />
        ) : (
          <form
            className="mt-form"
            /* Our copy, not the browser's. `type="url"` would otherwise let
               native constraint validation silently swallow the submit and
               show its own bubble; the server is the authority on what a walk
               video link may be, and its answer is rendered against the
               field. */
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (complete && !send.isPending) handleSend();
            }}
          >
            {fieldDefs.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                value={form[field.key]}
                errorCode={fieldErrors[field.key]}
                disabled={send.isPending}
                onChange={(value) => setField(field.key, value)}
              />
            ))}

            {wantsMeasurements && (
              <label className="mt-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={send.isPending}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  These are my current measurements, taken recently, and they are accurate
                  for these dates.
                </span>
              </label>
            )}
            {fieldErrors.core_measurements === 'confirmation_required' && (
              <p className="mt-field__error">
                Confirm the measurements are current before sending.
              </p>
            )}

            {/* The designer-visibility sentence, restated verbatim from the
                consent the applicant gave at submit. These fields are exactly
                the ones third-party designers see, so it belongs beside the
                send button and nowhere less prominent. */}
            {data.disclosure?.thirdPartyAccess && (
              <p className="mt-disclosure">{data.disclosure.thirdPartyAccess}</p>
            )}

            <div className="mt-actions">
              <button
                type="submit"
                className="mt-send"
                disabled={!complete || send.isPending}
              >
                {send.isPending ? 'Sending…' : `Send to ${organizerName}`}
              </button>
            </div>
          </form>
        )}
      </motion.main>
    </div>
  );
}

/** The done state, and only then the claim offer (Q8). */
function SentPanel({ organizerName, claimUrl }) {
  return (
    <section className="mt-sent" aria-live="polite">
      <h2 className="mt-sent__title">Sent to {organizerName}.</h2>
      <p className="mt-sent__body">
        They have your materials. If anything changes, reply to their email and tell
        them — this link is spent.
      </p>

      {claimUrl && (
        <div className="mt-claim">
          <p className="mt-claim__body">
            You have built most of a Pholio profile through this application — your
            digitals, your stats, your measurements. Keep it, and the next casting takes
            one tap instead of twenty minutes.
          </p>
          <a className="mt-claim__link" href={claimUrl}>
            Keep my profile
          </a>
        </div>
      )}
    </section>
  );
}

const ERROR_COPY = {
  invalid_url: 'That does not look like a link. Paste the full URL.',
  invalid_date_range: 'The end date has to fall on or after the start date.',
  invalid_date: 'Use a real date.',
  required: 'They asked for this one.',
  not_requested: 'They did not ask for this.',
};

function FieldRow({ field, value, errorCode, disabled, onChange }) {
  const errorMessage = errorCode ? ERROR_COPY[errorCode] : null;
  const inputId = `mt-field-${field.key}`;

  if (field.kind === 'date_range') {
    return (
      <div className="mt-field">
        <span className="mt-field__label" id={`${inputId}-label`}>
          {field.label}
        </span>
        <p className="mt-field__hint">The first and last day you can work these dates.</p>
        <div className="mt-field__range" role="group" aria-labelledby={`${inputId}-label`}>
          <label className="mt-field__sub">
            <span>From</span>
            <input
              type="date"
              value={value?.from || ''}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, from: event.target.value })}
            />
          </label>
          <label className="mt-field__sub">
            <span>To</span>
            <input
              type="date"
              value={value?.to || ''}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, to: event.target.value })}
            />
          </label>
        </div>
        {errorMessage && <p className="mt-field__error">{errorMessage}</p>}
      </div>
    );
  }

  const isUrl = field.kind === 'url';
  return (
    <div className="mt-field">
      <label className="mt-field__label" htmlFor={inputId}>
        {field.label}
      </label>
      <p className="mt-field__hint">
        {isUrl
          ? 'An unlisted YouTube or Vimeo link, or a Drive link anyone with the link can open.'
          : 'Bust, waist and hips, as you measure them today.'}
      </p>
      <input
        id={inputId}
        type={isUrl ? 'url' : 'text'}
        value={value || ''}
        disabled={disabled}
        placeholder={isUrl ? 'https://' : 'Bust 82, Waist 61, Hips 89'}
        onChange={(event) => onChange(event.target.value)}
      />
      {errorMessage && <p className="mt-field__error">{errorMessage}</p>}
    </div>
  );
}
