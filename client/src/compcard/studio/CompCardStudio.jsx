/**
 * Comp card studio. Pholio composes the card; the talent directs it.
 *
 * - Every direction is shown composed on the talent's own photos.
 * - Click a photo on the card to choose it. Drag to reposition, zoom with
 *   the slider; the crop solver keeps the face and body protected.
 * - The library is ranked for the chosen frame; photos that can't fill it
 *   without cutting the subject say so instead of being offered.
 * - The card autosaves; downloads print exactly what is on screen.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Download, Printer, RotateCcw } from 'lucide-react';
import CardPage from '../render/CardPage';
import { useStudio } from './useStudio';
import { scoreFit } from '../model/crop';
import { describeSubject } from '../model/subject';
import { roleOf } from '../model/partitions';
import { FORMATS } from '../compose';
import './studio.css';

const MM_PX = 96 / 25.4;
const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

/** Callback ref + size: the stage mounts after loading, so a plain ref effect would miss it. */
function useBox() {
  const [node, setNode] = useState(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!node) return undefined;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, box];
}

function Scaled({ format, scale, children, className }) {
  return (
    <div className={className} style={{ width: format.w * MM_PX * scale, height: format.h * MM_PX * scale, position: 'relative', flex: 'none' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', position: 'absolute', left: 0, top: 0 }}>{children}</div>
    </div>
  );
}

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="ccs-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="ccs-field">
      <span className="ccs-field__label">{label}</span>
      {children}
    </div>
  );
}

/** Library ranked for one frame: what fits, and why the rest doesn't. */
function rankLibrary(data, perceptions, el) {
  if (!el) return [];
  const aspect = el.w / el.h;
  return data.images
    .map((img) => {
      const s = describeSubject(perceptions[img.id] || null, { width: img.width, height: img.height });
      const role = el.role && el.role !== 'auto' ? el.role : roleOf({ subject: s });
      let fit = scoreFit(s, aspect, role, el.h / 25.4);
      if (fit.score === -Infinity) fit = scoreFit(s, aspect, 'portrait', el.h / 25.4);
      const people = s.known && s.people > 1;
      return { img, s, ok: fit.score !== -Infinity, score: fit.score - (people ? 2 : 0), people };
    })
    .sort((a, b) => Number(b.ok) - Number(a.ok) || b.score - a.score);
}

export default function CompCardStudio() {
  const st = useStudio();
  const reduce = useReducedMotion();
  const [stageRef, stage] = useBox();
  const [selected, setSelected] = useState(null);
  const drag = useRef(null);

  const result = st.result;
  const format = result?.scene.format || FORMATS[st.settings.format] || FORMATS.us;

  // Fit the spread (front + back + gap) into the stage.
  const gap = 28;
  const scale = useMemo(() => {
    if (!stage.w || !stage.h) return 0.8;
    const s1 = (stage.w - gap - 48) / (2 * format.w * MM_PX);
    const s2 = (stage.h - 64) / (format.h * MM_PX);
    return Math.max(0.3, Math.min(1.25, s1, s2));
  }, [stage, format]);

  // The selected slot may vanish when the layout changes; treat it as unselected.
  const selectedEl =
    selected && result
      ? result.scene.pages.flatMap((p) => p.elements.map((el) => ({ ...el, page: p.name }))).find((el) => el.type === 'photo' && el.slot === selected) || null
      : null;

  const library = useMemo(() => (selectedEl && st.data ? rankLibrary(st.data, st.perceptions, selectedEl) : []), [selectedEl, st.data, st.perceptions]);

  // Drag to reposition inside the frame (in image-normalised units).
  const onSelectSlot = useCallback((slot, e) => {
    setSelected(slot);
    const el = result?.scene.pages.flatMap((p) => p.elements).find((x) => x.type === 'photo' && x.slot === slot);
    if (!el?.crop || el.contained) return;
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
  }, [result, scale, st]);

  const download = async (variant) => {
    await st.flush();
    window.location.href = `/api/talent/compcard/pdf?variant=${variant}`;
  };

  if (st.phase === 'error') {
    return (
      <div className="ccs ccs--center">
        <p className="ccs-status">{st.error}</p>
        <Link className="ccs-link" to="/dashboard/talent/media">Back to media</Link>
      </div>
    );
  }

  if (!result) {
    const pct = st.reading.total ? st.reading.done / st.reading.total : 0;
    return (
      <div className="ccs ccs--center">
        <div className="ccs-reading" aria-live="polite">
          <p className="ccs-reading__title">{st.phase === 'reading' ? 'Reading your photos' : 'Opening your card'}</p>
          {st.phase === 'reading' && (
            <>
              <div className="ccs-reading__bar"><motion.div className="ccs-reading__fill" animate={{ scaleX: pct }} transition={SPRING} /></div>
              <p className="ccs-reading__count">{st.reading.done} of {st.reading.total}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const slotAdjust = selected ? st.settings.slots[selected]?.adjust : null;
  const needs = result.notes.filter((n) => n.level === 'needs');
  const fyi = result.notes.filter((n) => n.level !== 'needs');

  return (
    <div className="ccs">
      <header className="ccs-bar">
        <Link className="ccs-back" to="/dashboard/talent/media"><ArrowLeft size={16} aria-hidden /> Media</Link>
        <h1 className="ccs-title">Comp card</h1>
        <div className="ccs-bar__right">
          <span className="ccs-save" aria-live="polite" title={st.storage ? undefined : 'Comp card storage isn’t set up on this server yet.'}>
            {!st.storage ? 'Saving unavailable' : st.saveState === 'saving' ? 'Saving' : st.saveState === 'saved' ? 'Saved' : st.saveState === 'error' ? 'Not saved' : ''}
          </span>
          <button type="button" className="ccs-btn" disabled={!st.storage} onClick={() => download('print')}><Printer size={15} aria-hidden /> Print file</button>
          <button type="button" className="ccs-btn ccs-btn--primary" disabled={!st.storage} onClick={() => download('digital')}><Download size={15} aria-hidden /> Download PDF</button>
        </div>
      </header>

      <div className="ccs-body">
        <main className="ccs-main">
          <nav className="ccs-directions" aria-label="Direction">
            {st.previews.map((p) => {
              const on = p.id === st.settings.direction;
              const f = p.result.scene.format;
              return (
                <motion.button
                  key={p.id}
                  type="button"
                  className={`ccs-dir ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    setSelected(null);
                    st.update((s) => ({ direction: p.id, slots: s.slots.front?.imageId ? { front: { imageId: s.slots.front.imageId } } : {} }));
                  }}
                  whileHover={reduce ? undefined : { y: -3 }}
                  transition={SPRING}
                >
                  <span className="ccs-dir__thumbs">
                    {p.result.scene.pages.map((pg) => (
                      <Scaled key={pg.name} format={f} scale={0.17}><CardPage page={pg} format={f} /></Scaled>
                    ))}
                  </span>
                  <span className="ccs-dir__name">{p.name}</span>
                </motion.button>
              );
            })}
          </nav>

          <div className="ccs-stage" ref={stageRef} onPointerDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={`${result.scene.direction}-${format.id}`}
                className="ccs-spread"
                style={{ gap }}
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={SPRING}
              >
                {result.scene.pages.map((pg) => (
                  <div key={pg.name} className="ccs-sheet">
                    <Scaled format={format} scale={scale} className="ccs-paper">
                      <CardPage page={pg} format={format} interactive onSelectSlot={onSelectSlot} selectedSlot={selected} />
                    </Scaled>
                    <span className="ccs-sheet__label">{pg.name === 'front' ? 'Front' : 'Back'}</span>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        <aside className="ccs-rail">
          <AnimatePresence initial={false}>
            {selectedEl && (
              <motion.section key="photo" className="ccs-section" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={SPRING}>
                <div className="ccs-section__head">
                  <h2>Photo</h2>
                  <button type="button" className="ccs-icon" onClick={() => st.setSlot(selected, null)} aria-label="Let Pholio choose this photo" title="Let Pholio choose"><RotateCcw size={14} /></button>
                </div>
                <p className="ccs-hint">Drag the photo on the card to reposition it.</p>
                <Field label="Zoom">
                  <input
                    className="ccs-range"
                    type="range"
                    min={1}
                    max={2.5}
                    step={0.01}
                    value={slotAdjust?.zoom || 1}
                    onChange={(e) => st.setSlot(selected, { imageId: selectedEl.imageId, adjust: { ...(slotAdjust || {}), zoom: Number(e.target.value) } })}
                    aria-label="Zoom"
                  />
                </Field>
                <div className="ccs-library" role="list">
                  {library.map(({ img, ok, people }) => {
                    const on = img.id === selectedEl.imageId;
                    const reason = !ok ? 'Would crop you in this frame' : people ? 'Other people in frame' : null;
                    return (
                      <button
                        key={img.id}
                        type="button"
                        role="listitem"
                        className={`ccs-thumb ${on ? 'is-on' : ''} ${!ok ? 'is-off' : ''}`}
                        disabled={!ok}
                        title={reason || undefined}
                        onClick={() => st.setSlot(selected, { imageId: img.id, adjust: undefined })}
                      >
                        <img src={img.src} alt="" />
                        {reason && <span className="ccs-thumb__why">{reason}</span>}
                      </button>
                    );
                  })}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <section className="ccs-section">
            <div className="ccs-section__head"><h2>Card</h2></div>
            <Field label="Name">
              <Segmented label="Name" value={st.settings.nameStyle} onChange={(v) => st.update({ nameStyle: v })} options={[{ value: 'full', label: 'Full name' }, { value: 'first', label: 'First name' }]} />
            </Field>
            <Field label="Measurements">
              <Segmented label="Measurements" value={result.units} onChange={(v) => st.update({ units: v })} options={[{ value: 'imperial', label: 'Feet & inches' }, { value: 'metric', label: 'Centimetres' }]} />
            </Field>
            <Field label="Stats">
              <Segmented label="Stats" value={result.track} onChange={(v) => st.update({ track: v })} options={[{ value: 'women', label: 'Womenswear' }, { value: 'men', label: 'Menswear' }]} />
            </Field>
            <Field label="Size">
              <Segmented label="Size" value={st.settings.format} onChange={(v) => st.update({ format: v })} options={Object.values(FORMATS).map((f) => ({ value: f.id, label: f.label }))} />
            </Field>
            {result.contact.mode === 'direct' && (
              <Field label="Contact on the card">
                <label className="ccs-check"><input type="checkbox" checked={st.settings.showEmail !== false} onChange={(e) => st.update({ showEmail: e.target.checked })} /> Email</label>
                <label className="ccs-check"><input type="checkbox" checked={Boolean(st.settings.showPhone)} onChange={(e) => st.update({ showPhone: e.target.checked })} /> Phone</label>
              </Field>
            )}
          </section>

          {(needs.length > 0 || fyi.length > 0) && (
            <section className="ccs-section">
              <div className="ccs-section__head"><h2>Before you send it</h2></div>
              <ul className="ccs-notes">
                {needs.map((n, i) => <li key={`n${i}`} className="ccs-note is-needs">{n.text}</li>)}
                {fyi.map((n, i) => <li key={`f${i}`} className="ccs-note">{n.text}</li>)}
              </ul>
              {needs.length > 0 && <Link className="ccs-link" to="/dashboard/talent/media">Add photos</Link>}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
