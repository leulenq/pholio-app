/**
 * The comp card, inside the talent dashboard.
 *
 * Pholio composes the card in every direction from the talent's book; the
 * talent chooses a direction, adjusts any photograph (click it on the card,
 * drag to reposition, zoom), and sets the details. The card saves itself;
 * the downloads print exactly what is on screen.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Download, Printer, RotateCcw } from 'lucide-react';
import PholioButton, { PholioToggleButton, PholioToggleGroup } from '../../shared/components/ui/PholioButton';
import { useAuth } from '../../domains/auth/hooks/useAuth';
import { checkGatingStatus } from '../../shared/utils/profileGating';
import CompCardGate from '../../domains/talent/components/CompCardGate';
import CardPage from '../render/CardPage';
import { useStudio } from './useStudio';
import { scoreFit } from '../model/crop';
import { describeSubject } from '../model/subject';
import { roleOf } from '../model/partitions';
import { FORMATS } from '../compose';
import './studio.css';

const MM_PX = 96 / 25.4;
const SPRING = { type: 'spring', stiffness: 55, damping: 16 };
const ARRIVE = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } };

/** Width of an element, tracked (callback ref: the node mounts after loading). */
function useWidth() {
  const [node, setNode] = useState(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!node) return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, w];
}

function Scaled({ format, scale, children, className }) {
  return (
    <div className={className} style={{ width: format.w * MM_PX * scale, height: format.h * MM_PX * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>{children}</div>
    </div>
  );
}

function Choice({ label, value, options, onChange }) {
  return (
    <div className="ccs-field">
      <span className="ccs-field__label">{label}</span>
      <PholioToggleGroup role="radiogroup" aria-label={label} className="ccs-choice">
        {options.map((o) => (
          <PholioToggleButton key={o.value} role="radio" aria-checked={value === o.value} active={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </PholioToggleButton>
        ))}
      </PholioToggleGroup>
    </div>
  );
}

/** The talent's photographs ranked for one frame; those that would crop them can't be chosen. */
function rankLibrary(data, perceptions, el) {
  if (!el) return [];
  const aspect = el.w / el.h;
  return data.images
    .map((img) => {
      const s = describeSubject(perceptions[img.id] || null, { width: img.width, height: img.height });
      const role = el.role && el.role !== 'auto' ? el.role : roleOf({ subject: s });
      let fit = scoreFit(s, aspect, role, el.h / 25.4);
      if (fit.score === -Infinity) fit = scoreFit(s, aspect, 'beauty', el.h / 25.4);
      const people = s.known && s.people > 1;
      return { img, ok: fit.score !== -Infinity && !people, score: fit.score - (people ? 2 : 0), people };
    })
    .sort((a, b) => Number(b.ok) - Number(a.ok) || b.score - a.score);
}

function saveLabel(st) {
  if (!st.storage) return 'Saving unavailable';
  if (st.saveState === 'saving') return 'Saving';
  if (st.saveState === 'saved') return 'Saved';
  if (st.saveState === 'error') return 'Not saved';
  return null;
}

function Masthead({ meta, actions }) {
  const reduce = useReducedMotion();
  return (
    <motion.header className="ccs-masthead" {...(reduce ? {} : ARRIVE)}>
      <div className="ccs-masthead__copy">
        <h1 className="ccs-h1">
          The <em>Card.</em>
        </h1>
        <p className="ccs-sub">Composed from your book in six directions. Choose one, then adjust any photograph on it.</p>
        {meta && <span className="ccs-meta">{meta}</span>}
      </div>
      {actions && <div className="ccs-masthead__actions">{actions}</div>}
    </motion.header>
  );
}

export default function CompCardStudio() {
  const { profile, images } = useAuth();
  const gating = useMemo(() => checkGatingStatus(profile, images), [profile, images]);
  if (gating.isBlocked) {
    return (
      <div className="ccs">
        <div className="ccs-wrap">
          <Masthead />
          <div className="ccs-gate">
            <CompCardGate missingTasks={gating.missingTasks} missingFields={gating.missingFields} completedCount={gating.completedCount} totalRequired={gating.totalRequired} />
          </div>
        </div>
      </div>
    );
  }
  return <Studio />;
}

function Studio() {
  const st = useStudio();
  const reduce = useReducedMotion();
  const [stageRef, stageW] = useWidth();
  const [selected, setSelected] = useState(null);
  const drag = useRef(null);

  const result = st.result;
  const format = result?.scene.format || FORMATS[st.settings.format] || FORMATS.us;
  const gap = 24;
  const narrow = stageW > 0 && stageW < 560;
  const scale = useMemo(() => {
    if (!stageW) return 0.6;
    const perCard = narrow ? stageW : (stageW - gap) / 2;
    return Math.min(1, perCard / (format.w * MM_PX));
  }, [stageW, format, narrow]);

  const selectedEl =
    selected && result
      ? result.scene.pages.flatMap((p) => p.elements).find((el) => el.type === 'photo' && el.slot === selected && !el.decorative) || null
      : null;
  const library = useMemo(() => (selectedEl && st.data ? rankLibrary(st.data, st.perceptions, selectedEl) : []), [selectedEl, st.data, st.perceptions]);

  // Click a photograph to select it; drag to move it inside its frame.
  const onSelectSlot = useCallback(
    (slot, e) => {
      const el = result?.scene.pages.flatMap((p) => p.elements).find((x) => x.type === 'photo' && x.slot === slot);
      if (!el || el.decorative) return;
      setSelected(slot);
      if (!el.crop || el.contained) return;
      e.preventDefault();
      drag.current = { slot, x: e.clientX, y: e.clientY, crop: el.crop, el, zoom: st.settings.slots[slot]?.adjust?.zoom || 1 };
      const move = (ev) => {
        const d = drag.current;
        if (!d) return;
        const dxMm = (ev.clientX - d.x) / (scale * MM_PX);
        const dyMm = (ev.clientY - d.y) / (scale * MM_PX);
        const cx = d.crop.x + d.crop.w / 2 - (dxMm / d.el.w) * d.crop.w;
        const cy = d.crop.y + d.crop.h / 2 - (dyMm / d.el.h) * d.crop.h;
        st.setSlot(d.slot, { imageId: d.el.imageId, adjust: { x: cx, y: cy, zoom: d.zoom } });
      };
      const up = () => {
        drag.current = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [result, scale, st],
  );

  const download = async (variant) => {
    await st.flush();
    window.location.href = `/api/talent/compcard/pdf?variant=${variant}`;
  };

  const direction = st.previews.find((p) => p.id === st.settings.direction);
  const meta = result ? [direction?.name, format.label, saveLabel(st)].filter(Boolean).join(' · ') : null;
  const actions = (
    <>
      <PholioButton variant="secondary" disabled={!result || !st.storage} onClick={() => download('print')}>
        <Printer size={15} aria-hidden="true" /> Print file
      </PholioButton>
      <PholioButton variant="primary" disabled={!result || !st.storage} onClick={() => download('digital')}>
        <Download size={15} aria-hidden="true" /> Download PDF
      </PholioButton>
    </>
  );

  if (st.phase === 'error') {
    return (
      <div className="ccs">
        <div className="ccs-wrap">
          <Masthead />
          <p className="ccs-error" role="alert">
            Your card could not be opened. Reload the page to try again.
          </p>
        </div>
      </div>
    );
  }

  const needs = result ? result.notes.filter((n) => n.level === 'needs') : [];
  const fyi = result ? result.notes.filter((n) => n.level !== 'needs') : [];
  const slotAdjust = selected ? st.settings.slots[selected]?.adjust : null;
  const progress = st.reading.total ? st.reading.done / st.reading.total : 0;

  return (
    <div className="ccs">
      <div className="ccs-wrap">
        <Masthead meta={meta} actions={actions} />

        {/* Directions */}
        <section className="ccs-section" aria-label="Direction">
          <div className="ccs-section__head">
            <h2 className="ccs-h2">Direction</h2>
          </div>
          <div className="ccs-directions">
            {result
              ? st.previews.map((p, i) => {
                  const on = p.id === st.settings.direction;
                  const f = p.result.scene.format;
                  return (
                    <motion.button
                      key={p.id}
                      type="button"
                      className={`ccs-dir${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => {
                        setSelected(null);
                        st.update((s) => ({ direction: p.id, slots: s.slots.front?.imageId ? { front: { imageId: s.slots.front.imageId } } : {} }));
                      }}
                      initial={reduce ? false : { opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={reduce ? undefined : { y: -4 }}
                      transition={{ ...SPRING, delay: reduce ? 0 : i * 0.04 }}
                    >
                      <span className="ccs-dir__pair">
                        {p.result.scene.pages.map((pg) => (
                          <Scaled key={pg.name} format={f} scale={0.16} className="ccs-dir__page">
                            <CardPage page={pg} format={f} />
                          </Scaled>
                        ))}
                      </span>
                      <span className="ccs-dir__name">{p.name}</span>
                    </motion.button>
                  );
                })
              : Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="ccs-dir ccs-dir--waiting" aria-hidden="true">
                    <span className="ccs-dir__pair">
                      <span className="ccs-dir__blank" />
                      <span className="ccs-dir__blank" />
                    </span>
                  </div>
                ))}
          </div>
        </section>

        <div className="ccs-body">
          {/* The card */}
          <section className="ccs-stage-col" aria-label="Your card">
            {!result && (
              <div className="ccs-progress" aria-hidden="true">
                <motion.span className="ccs-progress__fill" animate={{ scaleX: st.phase === 'reading' ? Math.max(0.04, progress) : 0.04 }} transition={SPRING} />
              </div>
            )}
            <div
              className={`ccs-stage${narrow ? ' is-narrow' : ''}`}
              ref={stageRef}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) setSelected(null);
              }}
            >
              {result ? (
                <AnimatePresence mode="wait">
                  <motion.div key={`${result.scene.direction}-${format.id}`} className="ccs-spread" style={{ gap }} exit={reduce ? undefined : { opacity: 0, y: -6, transition: { duration: 0.18 } }}>
                    {result.scene.pages.map((pg, i) => (
                      <motion.figure
                        key={pg.name}
                        className="ccs-sheet"
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, rotate: i ? 1.2 : -1.2 }}
                        animate={{ opacity: 1, y: 0, rotate: 0 }}
                        transition={reduce ? { duration: 0.2 } : { ...SPRING, delay: i * 0.08 }}
                      >
                        <Scaled format={format} scale={scale} className="ccs-paper">
                          <CardPage page={pg} format={format} interactive onSelectSlot={onSelectSlot} selectedSlot={selected} />
                        </Scaled>
                        <figcaption className="ccs-meta">{pg.name === 'front' ? 'Front' : 'Back'}</figcaption>
                      </motion.figure>
                    ))}
                  </motion.div>
                </AnimatePresence>
              ) : (
                <div className="ccs-spread" style={{ gap }} aria-hidden="true">
                  {[0, 1].map((i) => (
                    <div key={i} className="ccs-sheet">
                      <div className="ccs-paper ccs-paper--blank" style={{ width: format.w * MM_PX * scale, height: format.h * MM_PX * scale }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* The controls */}
          <aside className="ccs-panel">
            <section className="ccs-block">
              <h3 className="ccs-h3">Photograph</h3>
              <AnimatePresence initial={false} mode="wait">
                {selectedEl ? (
                  <motion.div key="photo" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0 }} transition={SPRING}>
                    <p className="ccs-hint">Drag on the card to reposition.</p>
                    <label className="ccs-field">
                      <span className="ccs-field__label">Zoom</span>
                      <input
                        className="ccs-range"
                        type="range"
                        min={1}
                        max={2.5}
                        step={0.01}
                        value={slotAdjust?.zoom || 1}
                        onChange={(e) => st.setSlot(selected, { imageId: selectedEl.imageId, adjust: { ...(slotAdjust || {}), zoom: Number(e.target.value) } })}
                      />
                    </label>
                    <div className="ccs-library" role="list" aria-label="Photographs for this frame">
                      {library.map(({ img, ok, people }) => {
                        const on = img.id === selectedEl.imageId;
                        const why = !ok ? (people ? 'Other people in frame' : 'Crops you in this frame') : null;
                        return (
                          <motion.button
                            key={img.id}
                            type="button"
                            role="listitem"
                            className={`ccs-thumb${on ? ' is-on' : ''}`}
                            disabled={!ok}
                            aria-label={why || (on ? 'Current photograph' : 'Use this photograph')}
                            title={why || undefined}
                            whileHover={reduce || !ok ? undefined : { y: -2 }}
                            transition={SPRING}
                            onClick={() => st.setSlot(selected, { imageId: img.id, adjust: undefined })}
                          >
                            <img src={img.src} alt="" />
                          </motion.button>
                        );
                      })}
                    </div>
                    {library.some((l) => !l.ok) && <p className="ccs-hint ccs-hint--after">Greyed photographs would crop you in this frame.</p>}
                    <PholioButton variant="tertiary" onClick={() => st.setSlot(selected, null)}>
                      <RotateCcw size={14} aria-hidden="true" /> Use Pholio&rsquo;s choice
                    </PholioButton>
                  </motion.div>
                ) : (
                  <motion.p key="hint" className="ccs-hint" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    Select a photograph on the card to change it.
                  </motion.p>
                )}
              </AnimatePresence>
            </section>

            {result && (
              <section className="ccs-block">
                <h3 className="ccs-h3">Details</h3>
                <Choice label="Name on the card" value={st.settings.nameStyle} onChange={(v) => st.update({ nameStyle: v })} options={[{ value: 'full', label: 'Full name' }, { value: 'first', label: 'First name' }]} />
                <Choice label="Measurements" value={result.units} onChange={(v) => st.update({ units: v })} options={[{ value: 'metric', label: 'cm' }, { value: 'imperial', label: 'ft & in' }]} />
                <Choice label="Stats" value={result.track === 'kids' ? 'women' : result.track} onChange={(v) => st.update({ track: v })} options={[{ value: 'women', label: 'Womenswear' }, { value: 'men', label: 'Menswear' }]} />
                <Choice label="Size" value={st.settings.format} onChange={(v) => st.update({ format: v })} options={Object.values(FORMATS).map((f) => ({ value: f.id, label: f.label }))} />
                {result.contact.mode === 'direct' && (
                  <div className="ccs-field">
                    <span className="ccs-field__label">Contact on the card</span>
                    <PholioToggleGroup aria-label="Contact on the card" className="ccs-choice">
                      <PholioToggleButton active={st.settings.showEmail !== false} onClick={() => st.update({ showEmail: st.settings.showEmail === false })}>
                        Email
                      </PholioToggleButton>
                      <PholioToggleButton active={Boolean(st.settings.showPhone)} onClick={() => st.update({ showPhone: !st.settings.showPhone })}>
                        Phone
                      </PholioToggleButton>
                    </PholioToggleGroup>
                  </div>
                )}
              </section>
            )}

            {(needs.length > 0 || fyi.length > 0) && (
              <section className="ccs-block">
                <h3 className="ccs-h3">Before you send it</h3>
                <ul className="ccs-notes">
                  {needs.map((n, i) => (
                    <li key={`n${i}`} className="ccs-note is-needs">{n.text}</li>
                  ))}
                  {fyi.map((n, i) => (
                    <li key={`f${i}`} className="ccs-note">{n.text}</li>
                  ))}
                </ul>
                {needs.length > 0 && (
                  <PholioButton variant="secondary" to="/dashboard/talent/media">
                    Open the book
                  </PholioButton>
                )}
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
