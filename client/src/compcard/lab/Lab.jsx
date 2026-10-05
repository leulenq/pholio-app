/* eslint-disable */
// Development harness (compcard.html?lab=…); not shipped in the print entry.
import { useEffect, useState } from 'react';
import { analyzeImage } from '../perception/analyze';
import { describeSubject } from '../model/subject';

const IMAGES = Array.from({ length: 12 }, (_, i) => `/compcard-lab/${i + 1}.img`);

function Overlay({ src, p, s }) {
  const W = 300;
  const H = (W * p.height) / p.width;
  const R = ({ x0, y0, x1, y1, c, label }) => (
    <div style={{ position: 'absolute', left: x0 * W, top: y0 * H, width: (x1 - x0) * W, height: (y1 - y0) * H, border: `2px solid ${c}`, boxSizing: 'border-box' }}>
      <span style={{ background: c, color: '#fff', font: '10px monospace' }}>{label}</span>
    </div>
  );
  return (
    <div style={{ display: 'inline-block', margin: 6, verticalAlign: 'top', font: '11px monospace', width: W }}>
      <div style={{ position: 'relative', width: W, height: H }}>
        <img src={src} style={{ width: W, height: H, display: 'block' }} />
        {p.mask && p.mask.person.map((row, y) => row.map((v, x) => v > 0.3 ? <div key={`${x}-${y}`} style={{ position: 'absolute', left: (x / p.mask.cols) * W, top: (y / p.mask.rows) * H, width: W / p.mask.cols, height: H / p.mask.rows, background: p.mask.hair[y][x] > 0.4 ? 'rgba(255,0,200,.25)' : 'rgba(0,200,255,.18)' }} /> : null))}
        {s.body && <R {...s.body} c="#0a0" label={s.framing} />}
        {s.head && <R {...s.head} c="#e00" label="head" />}
        {s.face && <R x0={s.face.box.x} y0={s.face.box.y} x1={s.face.box.x + s.face.box.w} y1={s.face.box.y + s.face.box.h} c="#f80" label="" />}
        {p.poses[0] && p.poses[0].map((l, i) => l.v > 0.55 ? <div key={i} style={{ position: 'absolute', left: l.x * W - 2, top: l.y * H - 2, width: 4, height: 4, background: '#ff0' }} /> : null)}
      </div>
      <div>{src.split('/').pop()} {p.width}x{p.height} faces:{p.faces.length} poses:{p.poses.length} people:{s.people} calm:{s.calm?.toFixed(2)} yaw:{s.face?.yaw?.toFixed(2)} smile:{String(s.face?.smile)} feet:{String(s.feetInFrame)}</div>
    </div>
  );
}

export default function Lab() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    (async () => {
      const out = [];
      for (const src of IMAGES) {
        const t = performance.now();
        const p = await analyzeImage(src);
        out.push({ src, p, s: describeSubject(p), ms: performance.now() - t });
        setRows([...out]);
      }
      window.__labDone = out.map((r) => ({ src: r.src, ms: Math.round(r.ms), s: r.s }));
    })().catch((e) => { window.__labError = e.message; console.error(e); });
  }, []);
  return <div style={{ background: '#fff' }}>{rows.map((r) => <Overlay key={r.src} {...r} />)}</div>;
}
