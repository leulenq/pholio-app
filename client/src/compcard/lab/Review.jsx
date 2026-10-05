// Development harness (compcard.html?lab=review); not shipped in the print entry.
//
// Creative review contact sheet: every talent × every direction, front and
// back together, composed live from the current generator code.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { analyzeImage, PERCEPTION_VERSION } from '../perception/analyze';
import { composeCard, FORMATS } from '../compose';
import { fontsReady } from '../render/fonts';
import { measure } from '../render/measure';
import CardPage from '../render/CardPage';
import { checkCard, regionOnPage } from '../model/invariants';
import { requiredRegion } from '../model/crop';
import { DIRECTIONS } from '../directions';
import { CORPUS } from './corpus';
import { cutoutFor } from './matteCache';
import './review.css';

const MM_PX = 96 / 25.4;
const SIZES = { S: 0.3, M: 0.42, L: 0.6 };
const DATE = '2026-10-05';

function readCache(src) {
  try {
    const v = localStorage.getItem(`ccp:${PERCEPTION_VERSION}:${src}`);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function writeCache(src, p) {
  try {
    localStorage.setItem(`ccp:${PERCEPTION_VERSION}:${src}`, JSON.stringify(p));
  } catch {
    // Quota: fine, it just re-reads next time.
  }
}

/** Read every corpus photo once (cached across reloads). */
function usePerceptions() {
  const [map, setMap] = useState({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  useEffect(() => {
    let alive = true;
    (async () => {
      const srcs = [...new Set(CORPUS.flatMap((t) => t.data.images.map((i) => i.src)))];
      setProgress({ done: 0, total: srcs.length });
      const out = {};
      let done = 0;
      for (const src of srcs) {
        let p = readCache(src);
        if (!p) {
          try {
            p = await analyzeImage(src);
            writeCache(src, p);
          } catch {
            p = null;
          }
        }
        out[src] = p;
        done += 1;
        if (!alive) return;
        if (done % 4 === 0 || done === srcs.length) {
          setMap({ ...out });
          setProgress({ done, total: srcs.length });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { map, progress };
}

function Scaled({ format, scale, children }) {
  return (
    <div className="rv-page" style={{ width: format.w * MM_PX * scale, height: format.h * MM_PX * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>{children}</div>
    </div>
  );
}

/** Crop-inspection guides drawn in the card's own mm space. */
function Guides({ page, format, subjects }) {
  const W = format.w;
  const H = format.h;
  const shapes = [];
  for (const el of page.elements) {
    if (el.type !== 'photo' || !el.crop) continue;
    const s = el.imageId ? subjects.get(el.imageId) : null;
    if (el.contained) {
      shapes.push(<rect key={`c${el.slot}`} x={el.x} y={el.y} width={el.w} height={el.h} fill="none" stroke="#ff9f1c" strokeWidth="0.5" strokeDasharray="2 1" />);
      continue;
    }
    if (!s?.known) {
      shapes.push(<text key={`u${el.slot}`} x={el.x + 1.5} y={el.y + 4} fontSize="3" fill="#ff9f1c">unread photo</text>);
      continue;
    }
    const clip = `clip-${page.name}-${el.slot}`;
    const req = regionOnPage(requiredRegion(s, el.role), el.crop, el);
    const head = s.head && regionOnPage(s.head, el.crop, el);
    const face = s.face && regionOnPage({ x0: s.face.box.x, x1: s.face.box.x + s.face.box.w, y0: s.face.box.y, y1: s.face.box.y + s.face.box.h }, el.crop, el);
    shapes.push(
      <g key={el.slot} clipPath={`url(#${clip})`}>
        <clipPath id={clip}><rect x={el.x} y={el.y} width={el.w} height={el.h} /></clipPath>
        <rect x={req.x0} y={req.y0} width={req.x1 - req.x0} height={req.y1 - req.y0} fill="rgba(46,204,113,0.08)" stroke="#2ecc71" strokeWidth="0.35" />
        {head && <rect x={head.x0} y={head.y0} width={head.x1 - head.x0} height={head.y1 - head.y0} fill="none" stroke="#e74c3c" strokeWidth="0.35" />}
        {face && <rect x={face.x0} y={face.y0} width={face.x1 - face.x0} height={face.y1 - face.y0} fill="none" stroke="#f1c40f" strokeWidth="0.3" strokeDasharray="1 0.6" />}
        <text x={el.x + 1.2} y={el.y + el.h - 1.4} fontSize="2.6" fill="#fff" stroke="#000" strokeWidth="0.25" paintOrder="stroke">
          {el.role} · {s.framing}{el.ppi ? ` · ${Math.round(el.ppi)}ppi` : ''}
        </text>
      </g>,
    );
  }
  return (
    <svg className="rv-guides" viewBox={`0 0 ${W} ${H}`} width={`${W}mm`} height={`${H}mm`}>
      <rect x={4} y={4} width={W - 8} height={H - 8} fill="none" stroke="#00d1ff" strokeWidth="0.25" strokeDasharray="1.5 1" />
      {shapes}
    </svg>
  );
}

function Spread({ res, scale, guides, onOpen }) {
  const f = res.scene.format;
  return (
    <button type="button" className="rv-spread" onClick={onOpen}>
      {res.scene.pages.map((pg) => (
        <Scaled key={pg.name} format={f} scale={scale}>
          <CardPage page={pg} format={f} />
          {guides && <Guides page={pg} format={f} subjects={res.subjects} />}
        </Scaled>
      ))}
    </button>
  );
}

function Notes({ res }) {
  const hard = res.issues.filter((i) => !i.soft);
  return (
    <div className="rv-notes">
      {hard.map((i, k) => <div key={`i${k}`} className="rv-note rv-note--bad">{i.rule}: {i.detail}</div>)}
      {res.notes.map((n, k) => <div key={`n${k}`} className={`rv-note ${n.level === 'needs' ? 'rv-note--needs' : ''}`}>{n.text}</div>)}
      {!hard.length && !res.notes.length && <div className="rv-note">No notes.</div>}
    </div>
  );
}

function Library({ talent, used }) {
  return (
    <div className="rv-lib">
      {talent.data.images.map((im) => (
        <div key={im.id} className={`rv-lib__item ${used.has(im.id) ? 'is-used' : ''}`} title={used.has(im.id) ? 'Used on a card' : 'Not used'}>
          <img src={im.src} alt="" loading="lazy" />
        </div>
      ))}
    </div>
  );
}

function facts(talent, res) {
  const p = talent.data.profile;
  const bits = [res?.track && `${res.track}swear`.replace('kidsswear', 'kids'), res?.units, talent.data.agency ? `Rep: ${talent.data.agency.name}` : 'Freelance', p.city?.split(',')[0]];
  return bits.filter(Boolean).join(' · ');
}

export default function Review() {
  const q = new URLSearchParams(location.search);
  const [format, setFormat] = useState(q.get('format') || 'us');
  const [size, setSize] = useState(q.get('size') || 'M');
  const [layout, setLayout] = useState(q.get('by') || 'talent');
  const [guides, setGuides] = useState(false);
  const [notes, setNotes] = useState(false);
  const [desk, setDesk] = useState('dark');
  const [dirs, setDirs] = useState(() => new Set(DIRECTIONS.map((d) => d.id)));
  const [talents, setTalents] = useState(() => new Set(CORPUS.map((t) => t.key)));
  const [focus, setFocus] = useState(null); // { t, d }
  const [fontsOk, setFontsOk] = useState(false);
  const { map, progress } = usePerceptions();
  const [cuts, setCuts] = useState({});
  const [cutProgress, setCutProgress] = useState({ done: 0, total: 0 });
  useEffect(() => {
    let alive = true;
    (async () => {
      const srcs = [...new Set(CORPUS.flatMap((t) => t.data.images.map((i) => i.src)))];
      setCutProgress({ done: 0, total: srcs.length });
      const out = {};
      let done = 0;
      for (const src of srcs) {
        try {
          out[src] = await cutoutFor(src);
        } catch {
          out[src] = null;
        }
        done += 1;
        if (!alive) return;
        if (done % 3 === 0 || done === srcs.length) {
          setCuts({ ...out });
          setCutProgress({ done, total: srcs.length });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    fontsReady(JSON.stringify(CORPUS.map((t) => [t.data.profile, t.data.agency]))).then(() => setFontsOk(true));
  }, []);

  // Compose every talent × direction for the chosen format.
  const grid = useMemo(() => {
    if (!fontsOk) return {};
    const out = {};
    for (const t of CORPUS) {
      const imgs = t.data.images;
      if (!imgs.every((im) => im.src in map)) continue;
      if (!imgs.every((im) => im.src in cuts)) continue;
      const cutouts = {};
      for (const im of imgs) cutouts[im.id] = cuts[im.src];
      const perceptions = {};
      const images = imgs.map((im) => {
        const p = map[im.src];
        perceptions[im.id] = p;
        return { ...im, width: p?.width || 1600, height: p?.height || 2000 };
      });
      out[t.key] = {};
      for (const d of DIRECTIONS) {
        const res = composeCard({ ...t.data, images }, perceptions, { direction: d.id, format, date: DATE }, { cutouts });
        const subjects = new Map(res.pool.map((p) => [p.id, p.subject]));
        out[t.key][d.id] = { ...res, subjects, issues: checkCard(res, { measure, subjects }) };
      }
    }
    return out;
  }, [map, cuts, fontsOk, format]);

  const shownT = CORPUS.filter((t) => talents.has(t.key));
  const shownD = DIRECTIONS.filter((d) => dirs.has(d.id));
  const scale = SIZES[size];

  const step = useCallback((dt, dd) => {
    setFocus((f) => {
      if (!f) return f;
      const ti = shownT.findIndex((t) => t.key === f.t);
      const di = shownD.findIndex((d) => d.id === f.d);
      const nt = shownT[(ti + dt + shownT.length) % shownT.length];
      const nd = shownD[(di + dd + shownD.length) % shownD.length];
      return { t: nt.key, d: nd.id };
    });
  }, [shownT, shownD]);

  useEffect(() => {
    const onKey = (e) => {
      if (!focus) return;
      if (e.key === 'Escape') setFocus(null);
      if (e.key === 'ArrowRight') step(0, 1);
      if (e.key === 'ArrowLeft') step(0, -1);
      if (e.key === 'ArrowDown') step(1, 0);
      if (e.key === 'ArrowUp') step(-1, 0);
      if (e.key === 'g') setGuides((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, step]);

  useEffect(() => {
    if (Object.keys(grid).length === CORPUS.length) {
      window.__fails = Object.entries(grid).flatMap(([k, row]) => Object.entries(row).filter(([, r]) => r.issues.some((i) => !i.soft)).map(([d, r]) => `${k}/${d}: ${r.issues.map((i) => `${i.rule} ${i.detail}`).join(' | ')}`));
      window.__ready = true;
    }
  }, [grid]);

  const toggle = (set, setter, key) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const used = (key) => {
    const s = new Set();
    for (const d of DIRECTIONS) for (const pg of grid[key]?.[d.id]?.scene.pages || []) for (const el of pg.elements) if (el.imageId) s.add(el.imageId);
    return s;
  };

  const total = Object.values(grid).reduce((n, row) => n + Object.keys(row).length, 0);
  const failing = Object.values(grid).flatMap((row) => Object.values(row)).filter((r) => r.issues.some((i) => !i.soft)).length;

  const cell = (t, d) => {
    const res = grid[t.key]?.[d.id];
    return (
      <div className="rv-cell" key={`${t.key}-${d.id}`}>
        <div className="rv-cell__label">
          <span>{layout === 'talent' ? d.name : `${t.data.profile.first_name} ${t.data.profile.last_name}`}</span>
          {res && <span className="rv-cell__meta">{res.scene.pages[0].mode || ''}{res.issues.some((i) => !i.soft) ? ' · fails checks' : ''}</span>}
        </div>
        {res ? <Spread res={res} scale={scale} guides={guides} onOpen={() => setFocus({ t: t.key, d: d.id })} /> : <div className="rv-wait" style={{ height: FORMATS[format].h * MM_PX * scale }}>Reading photos…</div>}
        {notes && res && <Notes res={res} />}
      </div>
    );
  };

  const focusRes = focus && grid[focus.t]?.[focus.d];
  const focusT = focus && CORPUS.find((t) => t.key === focus.t);
  const focusScale = focusRes ? Math.min((window.innerHeight - 170) / (focusRes.scene.format.h * MM_PX), (window.innerWidth - 420) / (2 * focusRes.scene.format.w * MM_PX + 24)) : 1;

  return (
    <div className={`rv rv--${desk}`}>
      <header className="rv-bar">
        <div className="rv-bar__title">
          <h1>Comp card review</h1>
          <span className="rv-count">
            {shownT.length} talents × {shownD.length} directions{progress.done < progress.total ? ` · reading photos ${progress.done}/${progress.total}` : ''}{cutProgress.done < cutProgress.total ? ` · cutting out ${cutProgress.done}/${cutProgress.total}` : ''}{total ? ` · ${failing} of ${total} fail checks` : ''}
          </span>
        </div>
        <div className="rv-controls">
          <Seg label="By" value={layout} onChange={setLayout} options={[['talent', 'Talent'], ['direction', 'Direction']]} />
          <Seg label="Size" value={size} onChange={setSize} options={[['S', 'S'], ['M', 'M'], ['L', 'L']]} />
          <Seg label="Format" value={format} onChange={setFormat} options={[['us', '5.5×8.5'], ['a5', 'A5']]} />
          <Seg label="Desk" value={desk} onChange={setDesk} options={[['dark', 'Dark'], ['light', 'Light']]} />
          <label className="rv-check"><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Guides</label>
          <label className="rv-check"><input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> Notes</label>
        </div>
        <div className="rv-filters">
          {DIRECTIONS.map((d) => (
            <button key={d.id} type="button" className={`rv-chip ${dirs.has(d.id) ? 'is-on' : ''}`} onClick={() => toggle(dirs, setDirs, d.id)}>{d.name}</button>
          ))}
          <span className="rv-sep" />
          {CORPUS.map((t) => (
            <button key={t.key} type="button" className={`rv-chip ${talents.has(t.key) ? 'is-on' : ''}`} onClick={() => toggle(talents, setTalents, t.key)} title={t.brief}>
              {t.label || t.data.profile.first_name}
            </button>
          ))}
        </div>
      </header>

      <main className="rv-main">
        {layout === 'talent'
          ? shownT.map((t) => (
              <section key={t.key} className="rv-row">
                <div className="rv-row__head">
                  <div>
                    <h2>{t.data.profile.first_name} {t.data.profile.last_name}</h2>
                    <p className="rv-brief">{t.brief}</p>
                    <p className="rv-facts">{facts(t, grid[t.key]?.[shownD[0]?.id])}</p>
                  </div>
                  <Library talent={t} used={used(t.key)} />
                </div>
                <div className="rv-cells">{shownD.map((d) => cell(t, d))}</div>
              </section>
            ))
          : shownD.map((d) => (
              <section key={d.id} className="rv-row">
                <div className="rv-row__head">
                  <div>
                    <h2>{d.name}</h2>
                    <p className="rv-brief">{d.summary}</p>
                  </div>
                </div>
                <div className="rv-cells">{shownT.map((t) => cell(t, d))}</div>
              </section>
            ))}
      </main>

      {focusRes && (
        <div className="rv-focus" onClick={(e) => e.target === e.currentTarget && setFocus(null)}>
          <div className="rv-focus__stage">
            <div className="rv-focus__spread">
              {focusRes.scene.pages.map((pg) => (
                <Scaled key={pg.name} format={focusRes.scene.format} scale={focusScale}>
                  <CardPage page={pg} format={focusRes.scene.format} />
                  {guides && <Guides page={pg} format={focusRes.scene.format} subjects={focusRes.subjects} />}
                </Scaled>
              ))}
            </div>
            <p className="rv-focus__hint">← → direction · ↑ ↓ talent · G guides · Esc close</p>
          </div>
          <aside className="rv-focus__side">
            <h2>{focusT.data.profile.first_name} {focusT.data.profile.last_name}</h2>
            <p className="rv-brief">{DIRECTIONS.find((d) => d.id === focus.d).name} · {focusT.brief}</p>
            <p className="rv-facts">{facts(focusT, focusRes)}</p>
            <h3>Library</h3>
            <Library talent={focusT} used={new Set(focusRes.scene.pages.flatMap((pg) => pg.elements.map((e) => e.imageId).filter(Boolean)))} />
            <h3>Notes</h3>
            <Notes res={focusRes} />
          </aside>
        </div>
      )}
    </div>
  );
}

function Seg({ label, value, onChange, options }) {
  return (
    <div className="rv-seg" role="radiogroup" aria-label={label}>
      <span className="rv-seg__label">{label}</span>
      {options.map(([v, l]) => (
        <button key={v} type="button" className={v === value ? 'is-on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}
