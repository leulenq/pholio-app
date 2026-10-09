import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { talentApi } from '../../api/talent';
import { imageNeedsReview } from '../../../../shared/utils/imageClassification';
import {
  FIELDS,
  FIELD_NAMES,
  OPTIONS,
  draftOf,
  labelFor,
  readOf,
  savePayload,
  skipPayload,
} from './frameReadModel';
import './FrameReads.css';

const SPRING = { type: 'spring', stiffness: 260, damping: 30 };

const defaultSave = (id, payload) => talentApi.updateMedia(id, payload);

const CERTAINTY_WORDS = { sure: 'sure', likely: 'likely', unsure: 'unsure' };

/** One field's word in the card's read, with its picker. */
function Word({ field, read, value, open, onToggle, onPick }) {
  const f = read.fields[field];
  const changed = value !== (f.value || '');
  const unsure = !changed && f.certainty === 'unsure';
  const label = value ? labelFor(field, value) : FIELD_NAMES[field];
  const rival = !changed ? f.rival : null;
  const options = rival ? [rival, ...OPTIONS[field].filter((o) => o !== rival)] : OPTIONS[field];

  return (
    <span className="frs-wordwrap">
      <button
        type="button"
        className={`frs-word${unsure ? ' is-unsure' : ''}${changed ? ' is-changed' : ''}${value ? '' : ' is-blank'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${FIELD_NAMES[field]}: ${value ? label : 'not set'}. Change`}
        onClick={onToggle}
      >
        {label}
        {unsure ? <span aria-hidden="true">?</span> : null}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="frs-menu"
            role="listbox"
            aria-label={FIELD_NAMES[field]}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
          >
            <div className="frs-menu__head">
              {FIELD_NAMES[field]}
              {f.value && CERTAINTY_WORDS[f.certainty] ? (
                <span> · Pholio {CERTAINTY_WORDS[f.certainty]}</span>
              ) : null}
            </div>
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={opt === value}
                className={`frs-opt${opt === value ? ' is-on' : ''}`}
                onClick={() => onPick(opt)}
              >
                {labelFor(field, opt)}
                {opt === rival ? <em>close second</em> : null}
                {opt === value ? <Check size={13} aria-hidden="true" /> : null}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

/**
 * Frame reads: a contact sheet of the frames PITS could not place with
 * certainty. Each card is the photo and its read in three words. Unsure words
 * carry a "?"; any word opens its picker. Confirm files the frame.
 */
export default function FrameReads({
  images = [],
  timedOutIds,
  digitalsSetId = null,
  onSaved,
  save = defaultSave,
}) {
  const reduce = useReducedMotion();
  const [drafts, setDrafts] = useState({});
  const [menu, setMenu] = useState(null); // { id, field }
  const [busy, setBusy] = useState(() => new Set());
  const [errors, setErrors] = useState({});
  const [settled, setSettled] = useState(0);

  const queue = useMemo(
    () => images
      .filter(imageNeedsReview)
      .map((img) => ({ img, read: readOf(img, { timedOut: timedOutIds?.has?.(img.id) }) })),
    [images, timedOutIds],
  );
  const ready = queue.filter((q) => !q.read.pending);
  const reading = queue.length - ready.length;

  // Close a picker on outside click or Escape.
  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (e) => { if (!e.target.closest?.('.frs-wordwrap')) setMenu(null); };
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const draftFor = (q) => drafts[q.img.id] || draftOf(q.read);

  const commit = async (q, kind) => {
    const id = q.img.id;
    setBusy((s) => new Set(s).add(id));
    setErrors((e) => ({ ...e, [id]: null }));
    try {
      const payload = kind === 'confirm'
        ? savePayload(q.img, draftFor(q), { digitalsSetId })
        : skipPayload();
      const res = await save(id, payload);
      if (kind === 'confirm') setSettled((n) => n + 1);
      if (res?.image) onSaved?.(id, res.image);
      return true;
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: err?.message || 'Not saved. Try again.' }));
      return false;
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const confirmAll = async () => {
    for (const q of ready) {
      if (!(await commit(q, 'confirm'))) break;
    }
  };

  if (queue.length === 0) {
    return (
      <AnimatePresence>
        {settled > 0 ? (
          <motion.p
            key="done"
            className="frs-done"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 3, times: [0, 0.1, 0.8, 1] }}
            onAnimationComplete={() => setSettled(0)}
          >
            <Check size={14} aria-hidden="true" /> Every frame is placed.
          </motion.p>
        ) : null}
      </AnimatePresence>
    );
  }

  return (
    <section className="frs" aria-labelledby="frs-title">
      <header className="frs-head">
        <h2 id="frs-title" className="frs-title">Frame reads</h2>
        <p className="frs-count">
          {ready.length} to confirm{reading > 0 ? <span> · {reading} being read</span> : null}
        </p>
        {ready.length > 1 ? (
          <button type="button" className="frs-all" disabled={busy.size > 0} onClick={confirmAll}>
            Confirm all {ready.length}
          </button>
        ) : null}
      </header>

      <ul className="frs-sheet">
        <AnimatePresence initial={false} mode="popLayout">
          {queue.map((q, i) => {
            const { img, read } = q;
            const draft = draftFor(q);
            const isBusy = busy.has(img.id);
            return (
              <motion.li
                key={img.id}
                className={`frs-card${read.pending ? ' is-reading' : ''}`}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: { ...SPRING, delay: Math.min(i, 8) * 0.03 } }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
                transition={SPRING}
                style={{ zIndex: menu?.id === img.id ? 2 : undefined }}
              >
                <div
                  className="frs-photo"
                  title={read.observations.length ? `Pholio saw: ${read.observations.join(', ')}` : undefined}
                >
                  {read.src ? <img src={read.src} alt="" loading="lazy" draggable="false" /> : null}
                  {read.pending ? <span className="frs-scan" aria-hidden="true" /> : null}
                </div>

                {read.pending ? (
                  <p className="frs-reading">Being read</p>
                ) : (
                  <>
                    <div className="frs-read">
                      {FIELDS.map((field) => (
                        <Word
                          key={field}
                          field={field}
                          read={read}
                          value={draft[field]}
                          open={menu?.id === img.id && menu.field === field}
                          onToggle={() => setMenu((m) => (m?.id === img.id && m.field === field ? null : { id: img.id, field }))}
                          onPick={(v) => {
                            setDrafts((d) => ({ ...d, [img.id]: { ...draft, [field]: v } }));
                            setMenu(null);
                          }}
                        />
                      ))}
                    </div>
                    <div className="frs-actions">
                      <button
                        type="button"
                        className="frs-confirm"
                        disabled={isBusy}
                        onClick={() => commit(q, 'confirm')}
                      >
                        <Check size={14} aria-hidden="true" /> {isBusy ? 'Saving' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        className="frs-skip"
                        disabled={isBusy}
                        title="Leaves the read unconfirmed. You can still set it in the frame's details."
                        onClick={() => commit(q, 'skip')}
                      >
                        Skip
                      </button>
                    </div>
                    {errors[img.id] ? <p className="frs-error" role="alert">{errors[img.id]}</p> : null}
                  </>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}
