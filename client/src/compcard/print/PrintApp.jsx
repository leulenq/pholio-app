/**
 * Print master. Headless Chromium calls window.__renderCard(scene, opts);
 * the page lays the card out at physical size and flags __cardReady once
 * every face and photograph has loaded.
 *
 * digital: one PDF page per side at trim size.
 * print:   trim + bleed, centred on a slug with crop marks and a job line.
 */
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import CardPage from '../render/CardPage';
import { fontsReady } from '../render/fonts';

const SLUG = 10; // mm of paper outside the bleed for marks
const MARK = 5; // crop mark length (mm)

function CropMarks({ format }) {
  const { w, h, bleed } = format;
  const o = SLUG + bleed; // trim edge offset from page edge
  const W = w + 2 * o;
  const H = h + 2 * o;
  const gap = bleed + 0.6; // marks stop short of the bleed
  const lines = [];
  for (const x of [o, o + w]) {
    lines.push([x, o - gap - MARK, x, o - gap]);
    lines.push([x, o + h + gap, x, o + h + gap + MARK]);
  }
  for (const y of [o, o + h]) {
    lines.push([o - gap - MARK, y, o - gap, y]);
    lines.push([o + w + gap, y, o + w + gap + MARK, y]);
  }
  return (
    <svg width={`${W}mm`} height={`${H}mm`} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      {lines.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth={0.1} />
      ))}
    </svg>
  );
}

function waitForImages() {
  const imgs = [...document.images];
  return Promise.all(
    imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; }))),
  ).then(() => Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => null) : null))));
}

export default function PrintApp() {
  const [job, setJob] = useState(null);

  useEffect(() => {
    window.__renderCard = (scene, opts = {}) => {
      const variant = opts.variant === 'print' ? 'print' : 'digital';
      const f = scene.format;
      const size = variant === 'print' ? { w: f.w + 2 * (f.bleed + SLUG), h: f.h + 2 * (f.bleed + SLUG) } : { w: f.w, h: f.h };
      document.title = opts.title || 'Comp card';
      flushSync(() => setJob({ scene, variant, size, title: opts.title }));
      const allText = scene.pages.flatMap((p) => p.elements.filter((e) => e.type === 'text').flatMap((e) => e.lines)).join(' ');
      fontsReady(allText)
        .then(waitForImages)
        .then(() => document.fonts.ready)
        .then(() => {
          window.__cardReady = true;
        })
        .catch((e) => {
          window.__cardError = String(e?.message || e);
        });
      return size;
    };
    window.__printerReady = true;
  }, []);

  if (!job) return null;
  const { scene, variant, size } = job;
  const f = scene.format;
  return (
    <>
      <style>{`
        @page { size: ${size.w}mm ${size.h}mm; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        .cc-sheet { position: relative; width: ${size.w}mm; height: ${size.h}mm; overflow: hidden; break-after: page; page-break-after: always; }
        .cc-sheet:last-child { break-after: auto; page-break-after: auto; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>
      {scene.pages.map((page) => (
        <div className="cc-sheet" key={page.name}>
          {variant === 'print' ? (
            <>
              <CropMarks format={f} />
              <div style={{ position: 'absolute', left: `${SLUG}mm`, top: `${SLUG}mm` }}>
                <CardPage page={page} format={f} showBleed />
              </div>
              <div style={{ position: 'absolute', left: `${SLUG + f.bleed}mm`, bottom: `${3}mm`, font: '5.5pt/1 "Instrument Sans Variable", Arial, sans-serif', color: '#000', letterSpacing: '0.04em' }}>
                {`${job.title || 'Comp card'}  ·  ${page.name === 'front' ? 'Front' : 'Back'}  ·  Trim ${f.w} × ${f.h} mm  ·  Bleed ${f.bleed} mm`}
              </div>
            </>
          ) : (
            <CardPage page={page} format={f} />
          )}
        </div>
      ))}
    </>
  );
}
