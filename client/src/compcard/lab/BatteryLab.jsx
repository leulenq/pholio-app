/* eslint-disable */
// Development harness (compcard.html?lab=…); not shipped in the print entry.
import { useEffect, useState } from 'react';
import { analyzeImage } from '../perception/analyze';
import { composeCard, FORMATS } from '../compose';
import { fontsReady } from '../render/fonts';
import { measure } from '../render/measure';
import CardPage from '../render/CardPage';
import { checkCard } from '../model/invariants';
import { DIRECTIONS } from '../directions';
import { BATTERY } from './battery';
import { FIXTURES } from './fixtures';
import { cutoutFor } from './matteCache';

const cache = {};
const perceive = async (src) => (cache[src] ||= analyzeImage(src));

export default function BatteryLab() {
  const q = new URLSearchParams(location.search);
  const ALL = { ...FIXTURES, ...BATTERY };
  const only = q.get('fx') ? q.get('fx').split(',') : Object.keys(BATTERY);
  const dirs = q.get('dir') ? q.get('dir').split(',') : DIRECTIONS.map((d) => d.id);
  const formats = q.get('format') ? q.get('format').split(',') : Object.keys(FORMATS);
  const show = q.get('show') !== '0';
  const scale = Number(q.get('scale') || 0.36);
  const [rows, setRows] = useState([]);
  useEffect(() => {
    (async () => {
      await fontsReady(JSON.stringify(ALL));
      const out = [];
      for (const fx of only) {
        const data = ALL[fx];
        const perceptions = {};
        const cutouts = {};
        const images = [];
        for (const im of data.images) {
          const p = await perceive(im.src);
          perceptions[im.id] = p;
          cutouts[im.id] = await cutoutFor(im.src).catch(() => null);
          images.push({ ...im, width: p.width, height: p.height });
        }
        const full = { ...data, images };
        for (const format of formats) {
          for (const dir of dirs) {
            const res = composeCard(full, perceptions, { direction: dir, format, date: '2026-10-05' }, { cutouts });
            const subjects = new Map(res.pool.map((p) => [p.id, p.subject]));
            const issues = checkCard(res, { measure, subjects });
            out.push({ fx, dir, format, res, issues });
          }
        }
      }
      setRows(out);
      window.__labDone = out.map((r) => ({ fx: r.fx, dir: r.dir, format: r.format, mode: r.res.scene.pages[0].mode, issues: r.issues, notes: r.res.notes.map((n) => n.text) }));
    })().catch((e) => { window.__labError = e.stack || e.message; });
  }, []);
  if (!show) return <pre>{rows.length} cards</pre>;
  return (
    <div style={{ background: '#8a8784', padding: 12, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
      {rows.map(({ fx, dir, format, res, issues }) => (
        <div key={fx + dir + format}>
          <div style={{ font: '11px monospace', color: issues.some((i) => !i.soft) ? '#ffd0d0' : '#fff', maxWidth: 2 * 528 * scale + 10 }}>
            {fx}/{dir}/{format} {issues.map((i) => `${i.rule}:${i.detail}`).join(' | ')}
          </div>
          <div style={{ display: 'flex', gap: 6, zoom: scale }}>
            {res.scene.pages.map((p) => <CardPage key={p.name} page={p} format={res.scene.format} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
