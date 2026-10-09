import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { acceptAgencyLegalPolicies, updateAgencyBranding } from '../api/agency';
import { emailLooksValid, joinList, nameScale, resolveAssetUrl } from './model';

const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

const stagger = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};
const rise = {
  hidden: { opacity: 0, y: 24 },
  shown: { opacity: 1, y: 0, transition: SPRING },
};

function Question({ children, note }) {
  return (
    <header className="arv-head">
      <h1 className="arv-q">{children}</h1>
      {note ? <p className="arv-note">{note}</p> : null}
    </header>
  );
}

/* ── Name ─────────────────────────────────────────────────────────────── */

export function NameScene({ answers, update }) {
  const nameRef = useRef(null);
  useEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <>
      <Question note="Talent see this name and city in the agency directory and on every application they send you.">
        Is this how talent should know you?
      </Question>
      <div className="arv-namefield" style={{ '--arv-field-scale': Math.min(1, nameScale(answers.name) * 1.25) }}>
        <label className="arv-sr" htmlFor="arv-name">Agency name</label>
        <input
          id="arv-name"
          ref={nameRef}
          className="arv-input-name"
          value={answers.name}
          maxLength={180}
          autoComplete="organization"
          spellCheck={false}
          onChange={(event) => update({ name: event.target.value })}
        />
        <label className="arv-sr" htmlFor="arv-city">City and country</label>
        <input
          id="arv-city"
          className="arv-input-city"
          value={answers.location}
          maxLength={160}
          placeholder="City, country"
          onChange={(event) => update({ location: event.target.value })}
        />
      </div>
    </>
  );
}

/* ── Mark ─────────────────────────────────────────────────────────────── */

export function MarkScene({ answers, logoPath, setLogoPath, preview }) {
  const inputRef = useRef(null);
  const [state, setState] = useState({ busy: false, error: null, over: false });
  const logo = resolveAssetUrl(logoPath);
  const initial = (answers.name || '?').replace(/^the\s+/i, '').trim().charAt(0).toUpperCase();

  const upload = async (file) => {
    if (!file) return;
    if (!/image\/(png|svg\+xml)/.test(file.type)) {
      setState({ busy: false, over: false, error: 'Use a PNG or SVG file.' });
      return;
    }
    setState({ busy: true, over: false, error: null });
    const local = URL.createObjectURL(file);
    setLogoPath(local);
    if (preview) {
      setState({ busy: false, over: false, error: null });
      return;
    }
    try {
      const form = new FormData();
      form.append('agency_logo', file);
      const result = await updateAgencyBranding(form);
      const stored = result?.logo_path || result?.data?.logo_path;
      if (stored) setLogoPath(stored);
      setState({ busy: false, over: false, error: null });
    } catch (error) {
      setLogoPath(null);
      setState({ busy: false, over: false, error: `${error?.message || 'The mark was not saved'}. Try another file.` });
    } finally {
      URL.revokeObjectURL(local);
    }
  };

  return (
    <>
      <Question note="PNG or SVG. It appears beside your name wherever talent choose an agency. You can add it later in Settings.">
        Place your mark.
      </Question>
      <button
        type="button"
        className={`arv-markzone${state.over ? ' is-over' : ''}${logo ? ' has-mark' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!state.over) setState((s) => ({ ...s, over: true }));
        }}
        onDragLeave={() => setState((s) => ({ ...s, over: false }))}
        onDrop={(event) => {
          event.preventDefault();
          upload(event.dataTransfer.files?.[0]);
        }}
        aria-busy={state.busy}
      >
        <AnimatePresence mode="wait">
          {logo ? (
            <motion.img
              key="logo"
              src={logo}
              alt=""
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: state.busy ? 0.5 : 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={SPRING}
            />
          ) : (
            <motion.span key="initial" className="arv-markzone-initial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {initial}
            </motion.span>
          )}
        </AnimatePresence>
        <span className="arv-markzone-hint">{logo ? 'Replace' : 'Choose a file or drop it here'}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/svg+xml"
        hidden
        onChange={(event) => upload(event.target.files?.[0])}
      />
      {state.error ? (
        <p className="arv-error arv-error--inline" role="alert">
          {state.error}
        </p>
      ) : null}
    </>
  );
}

/* ── Boards ───────────────────────────────────────────────────────────── */

export function BoardsScene({ intro, answers, update }) {
  const [adding, setAdding] = useState('');
  const offered = [...intro.boards.offered, ...answers.extraBoards.filter((b) => !intro.boards.offered.includes(b))];
  const fromRequest = intro.boards.source === 'request';

  const toggle = (board) =>
    update((current) => ({
      openBoards: current.openBoards.includes(board)
        ? current.openBoards.filter((b) => b !== board)
        : [...current.openBoards, board],
    }));

  const add = () => {
    const board = adding.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!board) return;
    const existing = offered.find((b) => b.toLowerCase() === board.toLowerCase());
    update((current) => ({
      extraBoards: existing ? current.extraBoards : [...current.extraBoards, board],
      openBoards: current.openBoards.includes(existing || board) ? current.openBoards : [...current.openBoards, existing || board],
    }));
    setAdding('');
  };

  const ordered = offered.filter((b) => answers.openBoards.includes(b));
  return (
    <>
      <Question
        note={
          fromRequest
            ? 'Selected from your access request. Talent choose one of these boards when they apply, and each becomes a board in your workspace.'
            : 'Talent choose one of these boards when they apply, and each becomes a board in your workspace.'
        }
      >
        Which boards are open to new faces?
      </Question>
      <motion.ul className="arv-boards" variants={stagger} initial="hidden" animate="shown">
        {offered.map((board) => {
          const on = answers.openBoards.includes(board);
          return (
            <motion.li key={board} variants={rise}>
              <button type="button" className={`arv-board${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggle(board)}>
                <span>{board}</span>
                <motion.i className="arv-board-line" initial={false} animate={{ scaleX: on ? 1 : 0 }} transition={SPRING} />
              </button>
            </motion.li>
          );
        })}
        <motion.li variants={rise} className="arv-board-add">
          <label className="arv-sr" htmlFor="arv-board-add">Another board</label>
          <input
            id="arv-board-add"
            data-enter="local"
            value={adding}
            placeholder="Another board"
            maxLength={60}
            onChange={(event) => setAdding(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
            onBlur={add}
          />
        </motion.li>
      </motion.ul>
      <p className="arv-readback" aria-live="polite">
        {ordered.length ? (
          <>
            Talent can apply to <em>{joinList(ordered)}</em>.
          </>
        ) : (
          'Choose at least one board.'
        )}
      </p>
    </>
  );
}

/* ── Minors ───────────────────────────────────────────────────────────── */

export function MinorsScene({ answers, update }) {
  const choice = answers.acceptsMinors;
  return (
    <>
      <Question>Does {answers.name || 'the agency'} represent talent under 18?</Question>
      <LayoutGroup>
        <div className={`arv-binary${choice === true ? ' is-compact' : ''}`} role="radiogroup" aria-label="Represents talent under 18">
          {[
            { value: false, label: 'No' },
            { value: true, label: 'Yes' },
          ].map((option) => {
            const on = choice === option.value;
            return (
              <motion.button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={on}
                className={`arv-binary-option${on ? ' is-on' : ''}${choice !== null && !on ? ' is-off' : ''}`}
                onClick={() => update({ acceptsMinors: option.value, minorCustodyAccepted: option.value ? answers.minorCustodyAccepted : false })}
                whileHover={{ x: 6 }}
                transition={SPRING}
              >
                {option.label}
                {on ? <motion.i layoutId="arv-binary-line" className="arv-binary-line" transition={SPRING} /> : null}
              </motion.button>
            );
          })}
        </div>
      </LayoutGroup>

      <AnimatePresence initial={false}>
        {choice === true ? (
          <motion.div
            key="custody"
            className="arv-custody"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <ul>
              <li>Talent under 18 can apply only with a guardian&rsquo;s authorization.</li>
              <li>Their age shows as an age band, and contact with them goes through Pholio.</li>
              <li>Only team members you give minor access can open their records.</li>
            </ul>
            <label className="arv-check">
              <input
                type="checkbox"
                checked={answers.minorCustodyAccepted}
                onChange={(event) => update({ minorCustodyAccepted: event.target.checked })}
              />
              <span className="arv-check-box" aria-hidden="true" />
              <span>I accept these terms for records of talent under 18 held by {answers.name || 'the agency'}.</span>
            </label>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/* ── Reply window ─────────────────────────────────────────────────────── */

export function WindowScene({ intro, answers, update }) {
  const { options, min = 1, max = 365 } = intro.reviewWindow;
  const days = answers.reviewWindowDays;
  const valid = isReviewWindow(days, min, max);
  const [text, setText] = useState(days == null ? '' : String(days));
  const [pulse, setPulse] = useState(0);

  const type = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 3);
    setText(digits);
    update({ reviewWindowDays: digits === '' ? null : Number(digits) });
  };
  const choose = (option) => {
    setText(String(option));
    setPulse((n) => n + 1);
    update({ reviewWindowDays: option });
  };

  return (
    <>
      <Question>How long should an application wait for an answer?</Question>
      <div className="arv-window">
        <label className="arv-window-figure">
          <span className="arv-sr">Days before an unanswered application closes</span>
          <motion.input
            key={pulse}
            className={`arv-window-number${valid || text === '' ? '' : ' is-invalid'}`}
            value={text}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            aria-invalid={!valid}
            style={{ width: `${Math.max(1, text.length) * 0.92 + 0.1}ch` }}
            initial={pulse ? { y: '28%', opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={SPRING}
            onChange={(event) => type(event.target.value)}
            onFocus={(event) => event.target.select()}
          />
          <span className="arv-window-unit">{days === 1 ? 'day' : 'days'}</span>
        </label>
        <div className="arv-track" role="group" aria-label="Common windows">
          <span className="arv-track-line" aria-hidden="true" />
          <motion.i
            className="arv-track-knob"
            aria-hidden="true"
            initial={false}
            animate={{ left: `${trackPosition(valid ? days : null, options) * 100}%`, opacity: valid ? 1 : 0 }}
            transition={SPRING}
          />
          {options.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === days}
              className={`arv-track-stop${option === days ? ' is-on' : ''}`}
              onClick={() => choose(option)}
            >
              <span className="arv-track-tick" aria-hidden="true" />
              {option} days
            </button>
          ))}
        </div>
      </div>
      {valid ? (
        <p className="arv-readback">
          If no one on your team answers an application within{' '}
          <em>
            {days} {days === 1 ? 'day' : 'days'}
          </em>
          , it closes and the talent is told.
        </p>
      ) : (
        <p className="arv-error arv-error--readback" role="alert">
          Enter a whole number of days from {min} to {max}.
        </p>
      )}
    </>
  );
}

function isReviewWindow(days, min = 1, max = 365) {
  return Number.isInteger(days) && days >= min && days <= max;
}

/**
 * Where a day count sits on the track: on a preset's tick when it is one,
 * between ticks when it falls between presets, easing toward the end of the
 * track beyond the last one.
 */
function trackPosition(days, options) {
  if (days == null) return 0;
  const step = 1 / options.length;
  if (days <= options[0]) return 0;
  for (let i = 1; i < options.length; i += 1) {
    if (days <= options[i]) {
      const t = (days - options[i - 1]) / (options[i] - options[i - 1]);
      return (i - 1 + t) * step;
    }
  }
  const last = options[options.length - 1];
  return (options.length - 1) * step + Math.min(1, (days - last) / 120) * step * 0.85;
}

/* ── Team ─────────────────────────────────────────────────────────────── */

const ROLES = [
  { value: 'AGENT', label: 'Booker' },
  { value: 'SCOUT', label: 'Scout' },
];

export function TeamScene({ intro, answers, update }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('AGENT');
  const [error, setError] = useState(null);
  const own = intro.viewer?.email?.toLowerCase();
  const others = Math.max(0, intro.memberCount - 1);

  const add = () => {
    const value = email.trim().toLowerCase();
    if (!value) return;
    if (!emailLooksValid(value)) {
      setError('Enter a full email address, like name@agency.com.');
      return;
    }
    if (value === own) {
      setError('That is your own login. Add someone else.');
      return;
    }
    if (answers.invites.some((invite) => invite.email === value)) {
      setError(`${value} is already on the list.`);
      return;
    }
    update((current) => ({ invites: [...current.invites, { email: value, role }] }));
    setEmail('');
    setError(null);
  };

  return (
    <>
      <Question
        note={`Each person gets their own login and role. Invitations are sent when you open the agency.${others ? ` ${others} ${others === 1 ? 'person is' : 'people are'} already on your team.` : ''}`}
      >
        Who reviews submissions with you?
      </Question>
      <div className="arv-invite">
        <label className="arv-sr" htmlFor="arv-invite-email">Work email</label>
        <input
          id="arv-invite-email"
          data-enter="local"
          type="email"
          value={email}
          placeholder="name@agency.com"
          autoComplete="off"
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <div className="arv-roles" role="radiogroup" aria-label="Role">
          {ROLES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={role === option.value}
              className={`arv-role${role === option.value ? ' is-on' : ''}`}
              onClick={() => setRole(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button type="button" className="arv-invite-add" onClick={add} disabled={!email.trim()}>
          Add
        </button>
      </div>
      {error ? (
        <p className="arv-error arv-error--inline" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="arv-invitees">
        <AnimatePresence initial={false}>
          {answers.invites.map((invite) => (
            <motion.li
              key={invite.email}
              layout
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={SPRING}
            >
              <span className="arv-invitee-email">{invite.email}</span>
              <span className="arv-invitee-role">{ROLES.find((r) => r.value === invite.role)?.label}</span>
              <button
                type="button"
                className="arv-invitee-remove"
                onClick={() => update((current) => ({ invites: current.invites.filter((i) => i.email !== invite.email) }))}
              >
                Remove
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </>
  );
}

/* ── Policies ─────────────────────────────────────────────────────────── */

export function TermsScene({ legal, legalDone, onLegalAccepted, termsRequest, onTermsReady, preview }) {
  const [values, setValues] = useState({});
  const [state, setState] = useState({ busy: false, error: null });
  const policies = legal?.policies || [];
  const ready = policies.length > 0 && policies.every(({ key }) => values[key]);

  useEffect(() => {
    onTermsReady?.(ready);
  }, [ready, onTermsReady]);

  const submit = async () => {
    if (!ready || state.busy) return;
    if (preview) {
      onLegalAccepted();
      return;
    }
    setState({ busy: true, error: null });
    try {
      await acceptAgencyLegalPolicies({
        manifestVersion: legal.manifestVersion,
        acceptances: policies.map(({ key, version, contentDigest }) => ({
          policyKey: key,
          version,
          contentDigest,
          accepted: values[key] === true,
        })),
      });
      onLegalAccepted();
    } catch (error) {
      setState({ busy: false, error: error?.message || 'Your acceptance was not recorded. Try again.' });
    }
  };
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  useEffect(() => {
    if (termsRequest > 0) submitRef.current();
  }, [termsRequest]);

  if (legalDone) {
    return <Question note="Accepted for your login.">The workspace policies are accepted.</Question>;
  }

  return (
    <>
      <Question note="Acceptance is recorded for your login. Each teammate reviews these policies before opening talent records.">
        Accept the workspace policies.
      </Question>
      <motion.ul className="arv-policies" variants={stagger} initial="hidden" animate="shown">
        {policies.map((policy) => (
          <motion.li key={policy.key} variants={rise}>
            <label className="arv-check arv-check--policy">
              <input
                type="checkbox"
                checked={values[policy.key] === true}
                onChange={() => setValues((current) => ({ ...current, [policy.key]: !current[policy.key] }))}
              />
              <span className="arv-check-box" aria-hidden="true" />
              <span>
                <span className="arv-policy-title">
                  <a href={policy.url} target="_blank" rel="noopener noreferrer">
                    {policy.title}
                  </a>
                  <span className="arv-policy-version">Version {policy.version}</span>
                </span>
                <span className="arv-policy-copy">{policy.copy}</span>
              </span>
            </label>
          </motion.li>
        ))}
      </motion.ul>
      {state.error ? (
        <p className="arv-error arv-error--inline" role="alert">
          {state.error}
        </p>
      ) : null}
      <p className="arv-fine">Questions about agency data handling go to privacy@pholio.studio.</p>
    </>
  );
}

/* ── The threshold ────────────────────────────────────────────────────── */

export function DoorsScene({ intro, answers, logoPath }) {
  const logo = resolveAssetUrl(logoPath);
  const initial = (answers.name || '?').replace(/^the\s+/i, '').trim().charAt(0).toUpperCase();
  const lines = [
    { label: 'Open boards', value: joinList(answers.openBoards) },
    { label: 'Unanswered applications', value: `Close after ${answers.reviewWindowDays} ${answers.reviewWindowDays === 1 ? 'day' : 'days'}, and the talent is told` },
    { label: 'Talent under 18', value: answers.acceptsMinors ? 'Represented, with guardian authorization' : 'Not represented' },
    answers.invites.length
      ? { label: 'Invitations', value: `${answers.invites.length} sent when you open` }
      : null,
  ].filter(Boolean);

  return (
    <div className="arv-threshold">
      <Question note={`When you open, talent on Pholio can choose ${answers.name} when they apply.`}>
        This is how talent will find you.
      </Question>
      <motion.article className="arv-plate" variants={stagger} initial="hidden" animate="shown">
        <motion.div className="arv-plate-id" variants={rise}>
          <span className="arv-plate-mark">{logo ? <img src={logo} alt="" /> : <span>{initial}</span>}</span>
          <span>
            <span className="arv-plate-name">{answers.name}</span>
            {answers.location ? <span className="arv-plate-city">{answers.location}</span> : null}
          </span>
        </motion.div>
        <dl className="arv-plate-facts">
          {lines.map((line) => (
            <motion.div key={line.label} variants={rise}>
              <dt>{line.label}</dt>
              <dd>{line.value}</dd>
            </motion.div>
          ))}
        </dl>
        {intro.agency.website ? (
          <motion.p className="arv-plate-site" variants={rise}>
            {intro.agency.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
          </motion.p>
        ) : null}
      </motion.article>
    </div>
  );
}

/* ── A member who cannot open the agency ──────────────────────────────── */

export function WaitingScene({ intro }) {
  return (
    <Question note="An owner or administrator finishes setting up the agency. The workspace opens for you as soon as they do.">
      {intro.agency.name} is not open on Pholio yet.
    </Question>
  );
}

