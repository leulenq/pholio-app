/**
 * Exact text measurement in the browser's own layout engine — the same one
 * that renders and prints the card — so fitted type lands to the hundredth
 * of a millimetre. Units: font sizes in pt, results in mm.
 */
import { textStyle } from './textStyle';

export const PT_TO_MM = 25.4 / 72;

let host = null;
const cache = new Map();

function getHost() {
  if (!host) {
    host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;';
    document.body.appendChild(host);
  }
  return host;
}

/**
 * Measure a single line of text.
 * @returns {{ width:number, cap:number }} width and cap height in mm
 */
export function measure(text, font) {
  const key = `${text}|${JSON.stringify(font)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const el = document.createElement('span');
  // Measure at the real size: fonts with an optical-size axis change their
  // proportions with size, so scaling a 100pt measurement would be wrong.
  Object.assign(el.style, textStyle(font), {
    display: 'inline-block',
    whiteSpace: 'pre',
    lineHeight: '1',
    textBoxTrim: 'trim-both',
    textBoxEdge: 'cap alphabetic',
  });
  el.textContent = text;
  getHost().appendChild(el);
  const r = el.getBoundingClientRect();
  el.remove();
  // getBoundingClientRect is in CSS px (96/in).
  const pxToMm = 25.4 / 96;
  // Trailing tracking is not ink — remove it so right edges align optically.
  const trail = (font.tracking || 0) * font.size * (96 / 72);
  const out = { width: (r.width - trail) * pxToMm, cap: r.height * pxToMm };
  cache.set(key, out);
  return out;
}

/** Largest point size at which `text` fits `widthMm` (single line). */
export function fitSize(text, font, widthMm, { min = 5, max = 400 } = {}) {
  // Iterate: optical sizing makes width non-linear in size.
  let size = (widthMm / measure(text, { ...font, size: 100 }).width) * 100;
  for (let i = 0; i < 4; i++) {
    const w = measure(text, { ...font, size: Math.round(size * 100) / 100 }).width;
    if (Math.abs(w - widthMm) < 0.05) break;
    size *= widthMm / w;
  }
  return Math.max(min, Math.min(max, size));
}

/** Greedy line breaking at word boundaries, using real measurements. */
export function wrap(text, font, widthMm) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (!cur || measure(next, font).width <= widthMm) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
