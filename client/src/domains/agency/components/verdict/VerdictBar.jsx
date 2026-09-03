import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useDeclineReasons } from '../../hooks/useDeclineReasons';
import { hideBrokenImage } from '../../lib/standing';
import './VerdictBar.css';

/**
 * The verdict bar — one working surface's persistent ink bar, shared by the
 * signing board and the submissions desk.
 *
 * The Review Room established the idiom this mirrors: an ink bar on the bottom
 * edge, the working set named in it, soft moves on the left, consequential
 * verbs on the right, and arming inline rather than in a modal — a decision
 * that notifies a person should be one deliberate keystroke away from itself,
 * never one careless one.
 *
 * It owns arming and its keys. It owns nothing else: WHICH verbs a surface
 * offers comes in as `verbs`, which of them a standing allows comes in as
 * `legal`, and the decision itself goes out through `onAction`. The two decks
 * differ (the inbox files to a board and shortlists in bulk; the wall marks
 * talent represented) without either one growing a second idiom.
 *
 * @param {Array<object>} selected  The faces under the verdict, in surface order.
 * @param {Array<{
 *   action: string, label: string, key?: string,
 *   kind: 'plain'|'arm'|'primary',
 *   armLabel?: string, single?: boolean, bulk?: boolean, max?: number,
 * }>} verbs
 *   The surface's verb set, in the order it wants them read. `kind` places
 *   and behaves: `plain` is a soft move on the left that fires at once,
 *   `primary` is a consequential verb on the right that fires at once, `arm`
 *   is a consequential verb on the right that opens its strip first. Three
 *   strips exist, chosen by `action`: `offer` (the variant strip), `pass`
 *   (reason + house note) and `file_to_board` (the board strip). `single` and
 *   `bulk` (default true / false) say whether the verb is offered to one face
 *   or to many; `max` caps a verb that only means something up to a size.
 * @param {Set<string>} legal  Actions the standing AND the seat both allow.
 * @param {Array<{id: string, name: string}>} boards  For the board strip.
 */

const THUMB_LIMIT = 6;

/* The letters the bar never binds: the page owns opening, lining up and the
   plain Escape, and N belongs to the armed offer's variant. */
const PAGE_KEYS = new Set(['L', 'ENTER', 'ESC', 'N']);

const nameOf = (c) => {
  if (!c) return '';
  const joined = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return c.name || c.talentName || joined || 'Unnamed applicant';
};

const thumbOf = (c) => c?.headshot || c?.photo || c?.image || null;

const idOf = (c) => c?.applicationId ?? c?.id;

const isTypingTarget = (target) => {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

/** Which strip an armed verb opens. */
const STRIP_FOR = { offer: 'offer', pass: 'pass', file_to_board: 'board' };

export function VerdictBar({
  selected = [],
  verbs = [],
  legal,
  boards = [],
  busy = false,
  active = true,
  sessionDecided = 0,
  onAction,
  onOpen,
  onLineUp,
  onClear,
  onArmingChange,
}) {
  const [armingRaw, setArming] = useState(null);      // null | 'offer' | 'pass' | 'board'
  const [offerVariant, setOfferVariant] = useState('represent');
  const [passReason, setPassReason] = useState('');
  const [passNote, setPassNote] = useState('');
  const [boardChoice, setBoardChoice] = useState(null);
  const reducedMotion = useReducedMotion();

  // Arming belongs to this bar only while it owns the keys: when the Review
  // Room, the lineup or a modal takes over, an armed pass is not merely
  // unreachable, it is not armed.
  const arming = active ? armingRaw : null;
  const { reasons } = useDeclineReasons({ enabled: arming === 'pass' });

  /* Enter and Escape mean something here that they cannot also mean on the
     surface below: while this bar is armed it owns both keys. Two independent
     window listeners cannot arbitrate that between themselves, so the bar
     simply says whether it is armed and the page stands down. */
  const armed = arming !== null;
  const armingChangeRef = useRef(onArmingChange);
  useEffect(() => { armingChangeRef.current = onArmingChange; });
  useEffect(() => { armingChangeRef.current?.(armed); }, [armed]);
  useEffect(() => () => armingChangeRef.current?.(false), []);

  const count = selected.length;
  const many = count > 1;

  /* Two or more faces narrow the bar to what the set can honestly receive.
     A verb is offered to a set only if its own descriptor says so — no bulk
     offers, requests or meetings anywhere: those are conversations with one
     person. */
  const can = (action) => {
    /* `clear` is the bar's own gesture, not a standing's. */
    const allowed = action === 'clear' ? true : Boolean(legal && legal.has(action));
    if (!allowed) return false;
    /* An action with no descriptor is legal but unrendered — `development` is
       the standing case: it has no button of its own, it is the second kind
       inside the armed offer. Nothing unrendered is ever offered to a set. */
    const verb = verbs.find((v) => v.action === action);
    if (!verb) return !many;
    if (many) return verb.bulk === true && (!verb.max || count <= verb.max);
    return verb.single !== false;
  };

  const subject = many ? `${count} selected` : nameOf(selected[0]);

  // Representation and development are two legalities, not one: a face with an
  // offer out can still be moved to development, and a development talent can
  // still be offered representation. The armed strip only ever shows the kinds
  // this selection can actually receive.
  const canOffer = can('offer');
  const canDevelopment = can('development');
  const canArmOffer = (canOffer || canDevelopment) && !many;

  // Disarm whenever the working set changes: an armed pass belongs to the
  // faces that were on screen when it was armed, and to no others.
  const setKey = selected.map(idOf).join(',');
  const [prevSetKey, setPrevSetKey] = useState(setKey);
  if (prevSetKey !== setKey) {
    setPrevSetKey(setKey);
    setArming(null);
    setPassNote('');
    setBoardChoice(null);
  }

  const verbFor = (action) => verbs.find((v) => v.action === action) || null;

  const fire = (action, opts) => {
    setArming(null);
    onAction?.(action, opts || {});
  };

  const confirmOffer = () => {
    const variant = offerVariant === 'development' ? 'development' : 'represent';
    fire(variant === 'development' ? 'development' : 'offer', { variant });
    setOfferVariant('represent');
  };

  const confirmPass = () => {
    fire('pass', { declineReason: passReason || null, note: passNote.trim() || null });
    setPassNote('');
  };

  const confirmBoard = () => {
    if (!boardChoice) return;
    fire('file_to_board', { boardId: boardChoice.id, boardName: boardChoice.name });
    setBoardChoice(null);
  };

  const armOffer = () => {
    if (!canArmOffer) return;
    setOfferVariant(canOffer ? 'represent' : 'development');
    setArming('offer');
  };

  const armPass = () => {
    if (!can('pass')) return;
    setArming('pass');
  };

  const armBoard = () => {
    if (!can('file_to_board')) return;
    setArming('board');
  };

  const arm = (action) => {
    if (action === 'offer') armOffer();
    else if (action === 'pass') armPass();
    else if (action === 'file_to_board') armBoard();
  };

  const confirm = (strip) => {
    if (strip === 'pass') confirmPass();
    else if (strip === 'board') confirmBoard();
    else confirmOffer();
  };

  /** What a verb does when it is not armed: the three page gestures are the
   *  page's, everything else is a decision. */
  const invoke = (verb) => {
    if (verb.action === 'open') { onOpen?.(); return; }
    if (verb.action === 'lineup') { onLineUp?.(); return; }
    if (verb.action === 'clear') { onClear?.(); return; }
    if (verb.kind === 'arm') { arm(verb.action); return; }
    fire(verb.action);
  };

  // ---- keyboard ---------------------------------------------------------
  // One binding, latest closures through a ref (the Review Room's idiom), so
  // the keys never go stale and never re-subscribe on every keystroke.
  const keysRef = useRef(null);
  const keys = {
    active,
    busy,
    arming,
    can,
    canArmOffer,
    verbs,
    invoke,
    confirm,
    onClear,
    canOffer,
    canDevelopment,
    armedKey: arming
      ? (verbs.find((v) => STRIP_FOR[v.action] === arming)?.key || '').toUpperCase()
      : null,
    toggleVariant: () => {
      if (!canOffer || !canDevelopment) return;
      setOfferVariant((v) => (v === 'development' ? 'represent' : 'development'));
    },
    disarm: () => setArming(null),
  };
  useEffect(() => { keysRef.current = keys; });

  useEffect(() => {
    const onKey = (e) => {
      const k = keysRef.current;
      if (!k || !k.active) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key;

      if (key === 'Escape') {
        e.preventDefault();
        if (k.arming) k.disarm();
        else k.onClear?.();
        return;
      }
      if (key === 'Enter' && k.arming) {
        e.preventDefault();
        k.confirm(k.arming);
        return;
      }
      if (key.length !== 1) return;
      const pressed = key.toUpperCase();

      /* N is the armed offer's variant toggle and nothing else. */
      if (pressed === 'N') {
        if (k.arming === 'offer') { e.preventDefault(); k.toggleVariant(); }
        return;
      }

      /* An armed strip answers to its own letter — press again to confirm —
         and to no other verb: a bar one keystroke from sending an offer must
         not also shortlist somebody. */
      if (k.arming) {
        if (pressed === k.armedKey) { e.preventDefault(); k.confirm(k.arming); }
        return;
      }
      if (k.busy) return;
      if (PAGE_KEYS.has(pressed)) return;

      const verb = k.verbs.find((v) => (v.key || '').toUpperCase() === pressed);
      if (!verb) return;
      /* The offer verb is the one whose reach is wider than its own legality:
         a selection that can only take a development offer still arms here,
         and the strip then offers the one kind it can receive. */
      const reachable = verb.action === 'offer' ? k.canArmOffer : k.can(verb.action);
      if (!reachable) return;
      e.preventDefault();
      k.invoke(verb);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (count === 0) return null;

  const rise = reducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0 } }
    : {
      initial: { y: 56, opacity: 0 },
      animate: { y: 0, opacity: 1 },
      transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
    };

  const thumbs = selected.slice(0, THUMB_LIMIT);
  const overflow = count - thumbs.length;

  const offerVerb = verbFor('offer');
  const offerLabel = canOffer ? (offerVerb?.label || 'Offer representation') : 'Development offer';
  const offerConfirmLabel = offerVariant === 'development' ? 'Confirm development offer' : 'Confirm offer';
  const passVerb = verbFor('pass');
  const boardVerb = verbFor('file_to_board');

  const softs = verbs.filter((v) => v.kind === 'plain');
  const rights = verbs.filter((v) => v.kind !== 'plain');

  const renderSoft = (verb) => {
    if (!can(verb.action)) return null;
    const disabled = verb.action === 'lineup'
      ? count < 2
      : (verb.action !== 'open' && verb.action !== 'clear' && busy);
    return (
      <button key={verb.action} type="button" onClick={() => invoke(verb)} disabled={disabled}>
        {verb.label}
        {verb.key && <span className="sbv-key">{verb.key}</span>}
      </button>
    );
  };

  const renderRight = (verb) => {
    if (verb.action === 'offer') {
      if (!canArmOffer) return null;
      return (
        <button key="offer" type="button" className="sbv-verb" onClick={armOffer} disabled={busy}>
          {offerLabel}
          {verb.key && <span className="sbv-key">{verb.key}</span>}
        </button>
      );
    }
    if (verb.action === 'file_to_board' && boards.length === 0) return null;
    if (!can(verb.action)) return null;
    return (
      <button
        key={verb.action}
        type="button"
        className="sbv-verb"
        onClick={() => invoke(verb)}
        disabled={busy}
      >
        {verb.label}
        {verb.key && <span className="sbv-key">{verb.key}</span>}
      </button>
    );
  };

  return (
    <motion.footer className="sbv-bar" role="region" aria-label="Verdict" {...rise}>
      {arming === 'pass' ? (
        <div className="sbv-arm">
          <div className="sbv-arm-head">
            <span className="sbv-arm-label">{passVerb?.label || 'Pass'} · {subject}</span>
            <div className="sbv-reasons" role="radiogroup" aria-label="Pass reason">
              <button
                type="button"
                role="radio"
                aria-checked={passReason === ''}
                className={`sbv-reason${passReason === '' ? ' is-on' : ''}`}
                onClick={() => setPassReason('')}
              >
                No reason
              </button>
              {reasons.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={passReason === r.id}
                  className={`sbv-reason${passReason === r.id ? ' is-on' : ''}`}
                  onClick={() => setPassReason(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="sbv-arm-tail">
            <span className="sbv-arm-preview">
              {passReason
                ? (reasons.find((r) => r.id === passReason)?.talentMessage || '')
                : 'The talent sees a plain decline, nothing more.'}
            </span>
            <input
              className="sbv-arm-note"
              value={passNote}
              aria-label="House note"
              placeholder="House note, kept internal"
              onChange={(e) => setPassNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); confirmPass(); }
                if (e.key === 'Escape') { e.preventDefault(); setArming(null); }
              }}
            />
            <button type="button" className="sbv-quiet" onClick={() => setArming(null)}>
              Cancel <span className="sbv-key">Esc</span>
            </button>
            <button type="button" className="sbv-verb sbv-verb--gold" onClick={confirmPass} disabled={busy}>
              {passVerb?.armLabel || 'Confirm pass'}
              {passVerb?.key && <span className="sbv-key">{passVerb.key}</span>}
            </button>
          </div>
        </div>
      ) : arming === 'offer' ? (
        <div className="sbv-arm sbv-arm--offer">
          <span className="sbv-arm-label">Offer · {subject}</span>
          <div className="sbv-reasons" role="radiogroup" aria-label="Offer kind">
            {canOffer && (
              <button
                type="button"
                role="radio"
                aria-checked={offerVariant === 'represent'}
                className={`sbv-reason${offerVariant === 'represent' ? ' is-on' : ''}`}
                onClick={() => setOfferVariant('represent')}
              >
                Offer representation
              </button>
            )}
            {canDevelopment && (
              <button
                type="button"
                role="radio"
                aria-checked={offerVariant === 'development'}
                className={`sbv-reason${offerVariant === 'development' ? ' is-on' : ''}`}
                onClick={() => setOfferVariant('development')}
              >
                Development offer{canOffer ? <span className="sbv-key">N</span> : null}
              </button>
            )}
          </div>
          <div className="sbv-arm-tail">
            <button type="button" className="sbv-quiet" onClick={() => setArming(null)}>
              Cancel <span className="sbv-key">Esc</span>
            </button>
            <button type="button" className="sbv-verb sbv-verb--gold" onClick={confirmOffer} disabled={busy}>
              {offerConfirmLabel}
              {offerVerb?.key && <span className="sbv-key">{offerVerb.key}</span>}
            </button>
          </div>
        </div>
      ) : arming === 'board' ? (
        <div className="sbv-arm sbv-arm--board">
          <span className="sbv-arm-label">{boardVerb?.label || 'File to board'} · {subject}</span>
          <div className="sbv-reasons" role="radiogroup" aria-label="Board">
            {boards.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={boardChoice?.id === b.id}
                className={`sbv-reason${boardChoice?.id === b.id ? ' is-on' : ''}`}
                onClick={() => setBoardChoice({ id: b.id, name: b.name })}
              >
                {b.name}
              </button>
            ))}
          </div>
          <div className="sbv-arm-tail">
            <button type="button" className="sbv-quiet" onClick={() => setArming(null)}>
              Cancel <span className="sbv-key">Esc</span>
            </button>
            <button
              type="button"
              className="sbv-verb sbv-verb--gold"
              onClick={confirmBoard}
              disabled={busy || !boardChoice}
            >
              {boardChoice ? `File to ${boardChoice.name}` : 'File to board'}
              {boardVerb?.key && <span className="sbv-key">{boardVerb.key}</span>}
            </button>
          </div>
        </div>
      ) : (
        <div className="sbv-row">
          <div className="sbv-who">
            <div className="sbv-thumbs">
              {thumbs.map((c) => {
                const id = idOf(c);
                const src = thumbOf(c);
                return src
                  ? <img key={id} className="sbv-thumb" src={src} alt="" onError={hideBrokenImage} />
                  : <span key={id} className="sbv-thumb sbv-thumb--blank" aria-hidden="true" />;
              })}
              {overflow > 0 && <span className="sbv-more">+{overflow}</span>}
            </div>
            <span className="sbv-subject">{subject}</span>
          </div>

          <div className="sbv-softs">
            {softs.map(renderSoft)}
          </div>

          <div className="sbv-verbs">
            <span className="sbv-sitting">Sitting · {sessionDecided} decided</span>
            {rights.map(renderRight)}
          </div>
        </div>
      )}
    </motion.footer>
  );
}

export default VerdictBar;
