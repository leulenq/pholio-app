/* eslint-disable */
// Development harness (compcard.html?lab=…); not shipped in the print entry.
import { useEffect, useState } from 'react';
import { analyzeImage } from '../perception/analyze';
import { composeCard } from '../compose';
import { fontsReady } from '../render/fonts';
import CardPage from '../render/CardPage';
import { FIXTURES } from './fixtures';
import { DIRECTIONS } from '../directions';

const cache = {};
async function perceive(images) {
  const out = {};
  for (const im of images) {
    if (!cache[im.src]) cache[im.src] = await analyzeImage(im.src);
    out[im.id] = cache[im.src];
  }
  return out;
}

export default function CardLab() {
  const q = new URLSearchParams(location.search);
  const fixtures = (q.get('fx') || 'mia,natan,leul,agency').split(',');
  const directions = (q.get('dir') || DIRECTIONS.map((d) => d.id).join(',')).split(',');
  const format = q.get('format') || 'us';
  const scale = Number(q.get('scale') || 0.55);
  const [cards, setCards] = useState([]);
  useEffect(() => {
    (async () => {
      await fontsReady(fixtures.map((fx) => JSON.stringify(FIXTURES[fx])).join(' '));
      const out = [];
      for (const fx of fixtures) {
        const data = FIXTURES[fx];
        const images = await Promise.all(data.images.map(async (im) => {
          const p = await perceive([im]);
          return { ...im, width: p[im.id].width, height: p[im.id].height };
        }));
        const perceptions = await perceive(images);
        for (const dir of directions) {
          const res = composeCard({ ...data, images }, perceptions, { direction: dir, format, date: '2026-10-05' });
          out.push({ fx, dir, res });
        }
      }
      setCards(out);
      requestAnimationFrame(() => setTimeout(() => { window.__ready = true; }, 600));
    })().catch((e) => { window.__labError = e.stack || e.message; console.error(e); });
  }, []);
  return (
    <div style={{ background: '#8a8784', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {cards.map(({ fx, dir, res }) => (
        <div key={fx + dir}>
          <div style={{ font: '12px monospace', color: '#fff', marginBottom: 6 }}>{fx} / {dir} / {res.scene.pages[0].mode || ''} — {res.notes.map((n) => n.text).join(' | ')}</div>
          <div style={{ display: 'flex', gap: 14, zoom: scale }}>
            {res.scene.pages.map((p) => <CardPage key={p.name} page={p} format={res.scene.format} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
