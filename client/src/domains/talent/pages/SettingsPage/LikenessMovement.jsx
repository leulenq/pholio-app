import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { talentApi } from '../../api/talent';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { Movement, SkeletonRows } from './primitives';

/* ------------------------------------------------------------------ *
 * Likeness and rights — the talent side of the consent ledger.
 *
 * The server (`src/domains/talent/services/likeness-consent.js`) refuses to
 * store a grant that cannot say what was agreed, and it has no endpoint that
 * sets both permissions at once. This screen is built the same way on purpose:
 *
 *  - Marketing use and AI replica get their own card, their own disclosure,
 *    their own action, and their own request. There is no control here that
 *    touches both, and no copy that lets one stand in for the other.
 *  - The disclosure text is rendered exactly as the server sends it. Nothing on
 *    this page paraphrases or shortens it, and if the server does not send the
 *    wording for a permission, that permission cannot be granted here at all —
 *    a grant given against text we could not show is not informed consent.
 *  - Absence of a grant reads "Not granted". Never "unknown", never blank.
 *  - Withdrawal is one action away in every state, needs no terms restated, and
 *    stays available even when granting is not.
 * ------------------------------------------------------------------ */

const MARKETING = 'marketing_use';
const AI_REPLICA = 'ai_replica';

const PURPOSE_LABEL = {
  [MARKETING]: 'Marketing use',
  [AI_REPLICA]: 'AI likeness',
};

const QUERY_KEY = ['talent-likeness-consent'];

const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

/* --- dates --------------------------------------------------------- */

/**
 * Postgres hands back `starts_on` as a full ISO timestamp while SQLite hands
 * back a bare `YYYY-MM-DD`; both are the same calendar day. Read the day part
 * and pin it to midday UTC so no timezone can shift it across a boundary.
 */
function formatDay(value) {
  if (!value) return null;
  const day = String(value).slice(0, 10);
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMoment(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDay(value);
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function dayValue(value) {
  return value ? String(value).slice(0, 10) : '';
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* --- data ---------------------------------------------------------- */

function useLikenessConsent() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => talentApi.getLikenessConsent(),
    select: (data) => data?.data ?? data,
  });
}

/* --- small parts --------------------------------------------------- */

/**
 * The recorded state, in the mono ledger mark this surface already uses for
 * fixed values. Deliberately not a coloured pill: "granted" and "not granted"
 * are both ordinary, correct answers, and colouring one of them would push a
 * decision the talent alone gets to make.
 */
function StateMark({ granted }) {
  return (
    <span className="set-fixed">{granted ? 'Granted' : 'Not granted'}</span>
  );
}

function TermList({ entry }) {
  const starts = formatDay(entry?.starts_on);
  const ends = formatDay(entry?.ends_on);
  return (
    <dl className="set-consent__terms">
      <div><dt>What it covers</dt><dd>{entry?.scope || '—'}</dd></div>
      <div><dt>What it is for</dt><dd>{entry?.use_purpose || '—'}</dd></div>
      <div><dt>What you are paid</dt><dd>{entry?.compensation || '—'}</dd></div>
      <div>
        <dt>How long it lasts</dt>
        <dd>{starts && ends ? `${starts} — ${ends}` : '—'}</dd>
      </div>
    </dl>
  );
}

/**
 * Withdrawal: always offered, never asks for terms, and confirms once so it is
 * not done by a stray click. The confirmation is the only friction allowed.
 */
function WithdrawControl({ label, pending, onWithdraw }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        className="set-inline-link set-inline-link--danger"
        onClick={() => setConfirming(true)}
        disabled={pending}
      >
        Withdraw permission
      </button>
    );
  }

  return (
    <div className="set-consent__confirm" role="group" aria-label={`Confirm withdrawing ${label}`}>
      <p>Withdraw this permission? It stops immediately and is recorded below.</p>
      <div className="set-consent__actions">
        <PholioButton
          type="button"
          variant="primary"
          onClick={() => { setConfirming(false); onWithdraw(); }}
          disabled={pending}
        >
          {pending ? 'Withdrawing…' : 'Withdraw'}
        </PholioButton>
        <button
          type="button"
          className="set-inline-link"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}

/**
 * The shell both permissions share: heading, recorded state, the server's
 * disclosure verbatim, the version that text is filed under, then whatever
 * actions that one permission offers. It never renders a fallback disclosure —
 * see `missingDisclosure`.
 */
function ConsentCard({ title, sub, disclosure, disclosureVersion, granted, children, note }) {
  return (
    <section className="set-card set-consent">
      <div className="set-card__head">
        <div>
          <h3 className="set-card__title">{title}</h3>
          <p className="set-card__sub">{sub}</p>
        </div>
        <StateMark granted={granted} />
      </div>
      <div className="set-consent__body">
        {disclosure ? (
          <p className="set-consent__disclosure">{disclosure}</p>
        ) : (
          <p className="set-consent__disclosure set-consent__disclosure--missing">
            Pholio can’t show the exact wording for this permission right now, so it can’t be
            granted here. Withdrawing is still available.
          </p>
        )}
        {disclosure && disclosureVersion && (
          <p className="set-consent__version">Disclosure {disclosureVersion}</p>
        )}
        {note && <p className="set-consent__note">{note}</p>}
        {children}
      </div>
    </section>
  );
}

/* --- AI replica terms --------------------------------------------- */

const EMPTY_TERMS = { scope: '', usePurpose: '', compensation: '', startsOn: '', endsOn: '' };

const TERM_LABELS = {
  scope: 'what it covers',
  usePurpose: 'what it is for',
  compensation: 'what you are paid',
  startsOn: 'a start date',
  endsOn: 'an end date',
};

function missingTerms(terms) {
  return Object.keys(TERM_LABELS).filter((key) => !String(terms[key] || '').trim());
}

/**
 * An AI-likeness grant is the heavier of the two, so it is not offered as a
 * control sitting next to the marketing one. It is a step the talent opens
 * deliberately, fills in, and submits — and it stays on this page rather than
 * in a dialog, so the disclosure it is being given against and the ledger it
 * will be written into are both still visible while it is being written.
 */
function ReplicaTermsForm({ pending, serverError, onCancel, onSubmit, reduced }) {
  const [terms, setTerms] = useState(EMPTY_TERMS);
  const set = (key) => (event) => setTerms((prev) => ({ ...prev, [key]: event.target.value }));

  const missing = missingTerms(terms);
  const endsBeforeStart = Boolean(
    terms.startsOn && terms.endsOn && terms.endsOn < terms.startsOn,
  );
  const blocked = missing.length > 0 || endsBeforeStart;

  const submit = (event) => {
    event.preventDefault();
    // The server is the authority on what a valid grant is; this only stops a
    // submission we can already see is incomplete, so nobody is told "no" by a
    // round trip they didn't need to make.
    if (blocked) return;
    onSubmit(terms);
  };

  return (
    <motion.form
      className="set-consent__form"
      onSubmit={submit}
      initial={reduced ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={reduced ? { duration: 0.15 } : SPRING}
    >
      <p className="set-consent__form-lede">
        All four have to be on the record. A grant that can’t say what was agreed isn’t consent,
        so Pholio won’t store one.
      </p>

      <label className="set-field">
        <span className="set-field__label">What it covers</span>
        <textarea
          rows={3}
          value={terms.scope}
          onChange={set('scope')}
          placeholder="Which images, which likeness, and where it may appear"
        />
      </label>

      <label className="set-field">
        <span className="set-field__label">What it is for</span>
        <textarea
          rows={3}
          value={terms.usePurpose}
          onChange={set('usePurpose')}
          placeholder="The campaign, project, or use this is being granted for"
        />
      </label>

      <label className="set-field">
        <span className="set-field__label">What you are paid</span>
        <input
          type="text"
          value={terms.compensation}
          onChange={set('compensation')}
          placeholder="The fee or other consideration agreed for this use"
        />
      </label>

      <div className="set-fields set-fields--two">
        <label className="set-field">
          <span className="set-field__label">Starts on</span>
          <input type="date" value={terms.startsOn} onChange={set('startsOn')} />
        </label>
        <label className="set-field">
          <span className="set-field__label">Ends on</span>
          <input
            type="date"
            value={terms.endsOn}
            min={terms.startsOn || undefined}
            onChange={set('endsOn')}
          />
        </label>
      </div>

      {endsBeforeStart && (
        <p className="set-consent__hint" role="status">
          The end date is before the start date, so this permission would already be over.
        </p>
      )}
      {!endsBeforeStart && missing.length > 0 && (
        <p className="set-consent__hint" role="status">
          Still needed: {missing.map((key) => TERM_LABELS[key]).join(', ')}.
        </p>
      )}
      {serverError && (
        <p className="set-consent__error" role="alert">{serverError}</p>
      )}

      <div className="set-consent__actions">
        <PholioButton type="submit" variant="primary" disabled={blocked || pending}>
          {pending ? 'Recording…' : 'Grant this permission'}
        </PholioButton>
        <button type="button" className="set-inline-link" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </motion.form>
  );
}

/* --- ledger -------------------------------------------------------- */

/*
 * What this entry was agreed under.
 *
 * When the version matches the current one the words are already on the page
 * above, so repeating them under every line would be noise. When it does not,
 * the wording that was actually read is the whole point of keeping the record —
 * it opens on request rather than being summarised away.
 *
 * `disclosure_text` arrives only when the server could verify it against the
 * hash stored at the moment of consent. Absent, it says so plainly instead of
 * falling back to today's words, which would read as proof that this person
 * agreed to text they never saw.
 */
function ArchivedWording({ entry, currentVersion }) {
  const isCurrent = !currentVersion || entry.disclosure_version === currentVersion;

  if (isCurrent) {
    return <p className="set-ledger__version">Disclosure {entry.disclosure_version}</p>;
  }

  if (!entry.disclosure_text) {
    return (
      <p className="set-ledger__version">
        Disclosure {entry.disclosure_version} — an earlier wording, no longer on record
      </p>
    );
  }

  return (
    <details className="set-ledger__wording">
      <summary>Disclosure {entry.disclosure_version} — read the wording shown at the time</summary>
      <p>{entry.disclosure_text}</p>
    </details>
  );
}

function HistoryEntry({ entry, currentVersion }) {
  const granted = entry.event_type === 'granted';
  return (
    <li className="set-ledger__entry">
      <div className="set-ledger__line">
        <span className="set-ledger__what">
          {PURPOSE_LABEL[entry.purpose] || entry.purpose} {granted ? 'granted' : 'withdrawn'}
        </span>
        <time className="set-ledger__when" dateTime={entry.occurred_at || undefined}>
          {formatMoment(entry.occurred_at) || '—'}
        </time>
      </div>
      {granted && entry.purpose === AI_REPLICA && <TermList entry={entry} />}
      {entry.disclosure_version && (
        <ArchivedWording entry={entry} currentVersion={currentVersion} />
      )}
    </li>
  );
}

/* --- panel --------------------------------------------------------- */

export default function LikenessMovement() {
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();
  const query = useLikenessConsent();
  const [replicaFormOpen, setReplicaFormOpen] = useState(false);
  const [replicaError, setReplicaError] = useState(null);
  const [pendingPurpose, setPendingPurpose] = useState(null);

  const state = query.data?.state;
  const history = useMemo(() => query.data?.history || [], [query.data]);
  const disclosures = state?.disclosures || {};
  const disclosureVersion = state?.disclosureVersion || null;

  const mutation = useMutation({
    // One request, one permission. There is no shape of this call that carries
    // both purposes, which is the point.
    mutationFn: (body) => talentApi.setLikenessConsent(body),
    onSuccess: (_result, body) => {
      setPendingPurpose(null);
      setReplicaError(null);
      if (body.purpose === AI_REPLICA && body.granted) setReplicaFormOpen(false);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(
        body.granted
          ? `${PURPOSE_LABEL[body.purpose]} permission recorded`
          : `${PURPOSE_LABEL[body.purpose]} permission withdrawn`,
      );
    },
    onError: (error, body) => {
      setPendingPurpose(null);
      const message = error?.message || 'Unable to record that right now.';
      // The server's refusals name the missing terms and say why the law asks
      // for them, so they are shown where the fields are rather than summarised.
      if (body?.purpose === AI_REPLICA && body?.granted) setReplicaError(message);
      toast.error(message);
    },
  });

  const submit = useCallback((body) => {
    setPendingPurpose(body.purpose);
    mutation.mutate(body);
  }, [mutation]);

  const latestFor = useCallback(
    (purpose) => history.find((entry) => entry.purpose === purpose) || null,
    [history],
  );

  /**
   * The server resolves a grant that has expired, or has not started yet, to
   * `false` — correctly, because it is not in force. It does not say which, so
   * the reason is read off the talent's own last entry rather than guessed.
   */
  const lapseNote = (purpose) => {
    if (state?.[purpose]) return null;
    const latest = latestFor(purpose);
    if (!latest || latest.event_type !== 'granted') return null;
    const now = today();
    if (latest.ends_on && dayValue(latest.ends_on) < now) {
      return `You granted this on ${formatMoment(latest.occurred_at)}, and it ran out on ${formatDay(latest.ends_on)}. It is no longer in force.`;
    }
    if (latest.starts_on && dayValue(latest.starts_on) > now) {
      return `You granted this on ${formatMoment(latest.occurred_at)}. It does not take effect until ${formatDay(latest.starts_on)}.`;
    }
    return null;
  };

  const marketingGranted = state?.[MARKETING] === true;
  const replicaGranted = state?.[AI_REPLICA] === true;
  const marketingLatest = latestFor(MARKETING);
  const replicaLatest = latestFor(AI_REPLICA);
  // Withdrawal is offered wherever there is a grant to withdraw — including one
  // the server no longer counts as in force, because an expired or not-yet-
  // started grant is still a grant on the record. It is not offered where the
  // last entry is already a withdrawal: that would file a second withdrawal of
  // nothing, and this ledger is append-only, so the noise would be permanent.
  const canWithdrawMarketing = marketingGranted || marketingLatest?.event_type === 'granted';
  const canWithdrawReplica = replicaGranted || replicaLatest?.event_type === 'granted';

  return (
    <Movement
      id="likeness"
      title="Your likeness"
      lede="Two separate permissions, each decided on its own. Neither is covered by accepting Pholio’s Terms, granting one never grants the other, and either can be withdrawn at any time."
    >
      {query.isLoading ? (
        <div className="set-card"><SkeletonRows count={3} /></div>
      ) : query.isError ? (
        <div className="set-card">
          <div className="set-consent__body">
            <p className="set-consent__error" role="alert">
              {query.error?.message || 'Unable to load your consent record right now.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <ConsentCard
            title="Marketing use"
            sub="Pholio using your name and images in its own marketing."
            disclosure={disclosures[MARKETING]}
            disclosureVersion={disclosureVersion}
            granted={marketingGranted}
            note={lapseNote(MARKETING)}
          >
            <div className="set-consent__actions">
              {marketingGranted ? (
                <span className="set-consent__meta">
                  Granted {formatMoment(marketingLatest?.occurred_at) || 'previously'}.
                </span>
              ) : disclosures[MARKETING] ? (
                <PholioButton
                  type="button"
                  variant="primary"
                  onClick={() => submit({ purpose: MARKETING, granted: true })}
                  disabled={mutation.isPending}
                >
                  {pendingPurpose === MARKETING && mutation.isPending
                    ? 'Recording…'
                    : 'Grant marketing use'}
                </PholioButton>
              ) : null}
              {canWithdrawMarketing && (
                <WithdrawControl
                  label="marketing use"
                  pending={pendingPurpose === MARKETING && mutation.isPending}
                  onWithdraw={() => submit({ purpose: MARKETING, granted: false })}
                />
              )}
            </div>
          </ConsentCard>

          <ConsentCard
            title="AI likeness"
            sub="An AI-generated or AI-enhanced likeness of you."
            disclosure={disclosures[AI_REPLICA]}
            disclosureVersion={disclosureVersion}
            granted={replicaGranted}
            note={lapseNote(AI_REPLICA)}
          >
            {replicaGranted && replicaLatest && (
              <>
                <TermList entry={replicaLatest} />
                <p className="set-consent__meta">
                  Granted {formatMoment(replicaLatest.occurred_at) || 'previously'}.
                </p>
              </>
            )}

            <AnimatePresence initial={false} mode="wait">
              {replicaFormOpen && (
                <ReplicaTermsForm
                  key="replica-terms"
                  reduced={reduced}
                  pending={pendingPurpose === AI_REPLICA && mutation.isPending}
                  serverError={replicaError}
                  onCancel={() => { setReplicaFormOpen(false); setReplicaError(null); }}
                  onSubmit={(terms) => submit({ purpose: AI_REPLICA, granted: true, ...terms })}
                />
              )}
            </AnimatePresence>

            {!replicaFormOpen && (
              <div className="set-consent__actions">
                {!replicaGranted && disclosures[AI_REPLICA] && (
                  <PholioButton
                    type="button"
                    variant="primary"
                    onClick={() => { setReplicaError(null); setReplicaFormOpen(true); }}
                    disabled={mutation.isPending}
                  >
                    Set the terms
                  </PholioButton>
                )}
                {canWithdrawReplica && (
                  <WithdrawControl
                    label="AI likeness"
                    pending={pendingPurpose === AI_REPLICA && mutation.isPending}
                    onWithdraw={() => submit({ purpose: AI_REPLICA, granted: false })}
                  />
                )}
              </div>
            )}
          </ConsentCard>

          <section className="set-card set-consent">
            <div className="set-card__head">
              <div>
                <h3 className="set-card__title">Your record</h3>
                <p className="set-card__sub">
                  Every grant and every withdrawal, newest first. Nothing here is edited or
                  removed — a withdrawal is its own entry, filed above the grant it ended.
                </p>
              </div>
            </div>
            {history.length === 0 ? (
              <div className="set-consent__body">
                <p className="set-consent__empty">
                  Nothing recorded yet. Neither permission has been granted.
                </p>
              </div>
            ) : (
              <ol className="set-ledger">
                {history.map((entry) => (
                  <HistoryEntry key={entry.id} entry={entry} currentVersion={disclosureVersion} />
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </Movement>
  );
}
