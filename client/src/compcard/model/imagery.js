/**
 * Reading a photograph's ground: the colour and evenness of its backdrop,
 * so a composition can extend it into the page or replace it cleanly.
 */
import { contrast, lch, rgbToLab, toLch } from './palette';

/** Backdrop colour (median of non-subject cells) and how even it is (0..1). */
export function backdrop(item) {
  const p = item?.perception;
  if (!p?.tone) return null;
  const { tone, mask } = p;
  const cells = [];
  for (let y = 0; y < tone.rows; y++) {
    for (let x = 0; x < tone.cols; x++) {
      if (mask) {
        const my = Math.min(mask.rows - 1, Math.floor(((y + 0.5) / tone.rows) * mask.rows));
        const mx = Math.min(mask.cols - 1, Math.floor(((x + 0.5) / tone.cols) * mask.cols));
        if (mask.person[my][mx] > 0.08) continue;
      }
      cells.push({ c: tone.color[y][x], d: tone.detail[y][x], lab: rgbToLab(tone.color[y][x]) });
    }
  }
  if (cells.length < 6) return null;
  const med = (k) => {
    const v = cells.map((q) => q.lab[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  const L = med(0);
  const a = med(1);
  const b = med(2);
  const spread = Math.sqrt(cells.reduce((s, q) => s + (q.lab[0] - L) ** 2 + (q.lab[1] - a) ** 2 + (q.lab[2] - b) ** 2, 0) / cells.length);
  const detail = cells.reduce((s, q) => s + q.d, 0) / cells.length;
  const C = Math.hypot(a, b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const rgb = lch(L, C, h);
  // Even: little colour spread and little texture — a seamless or a wall.
  const evenness = Math.max(0, Math.min(1, 1 - (spread - 4) / 22)) * Math.max(0, Math.min(1, 1 - (detail - 0.02) / 0.1));
  return { rgb, L, C, h, evenness };
}

/** A paper colour for subjects shown without their backdrop. */
export function groundFor(items, prefer = 'light') {
  const bd = items.map(backdrop).filter(Boolean);
  // If the hero's own backdrop is an even, printable colour, keep it.
  const hero = bd[0];
  if (hero && hero.evenness > 0.55 && hero.L > 30 && hero.L < 96) return { rgb: hero.rgb, from: 'backdrop', L: hero.L };
  const avgH = bd.length ? bd.reduce((s, q) => s + q.h, 0) / bd.length : 60;
  const avgC = bd.length ? bd.reduce((s, q) => s + q.C, 0) / bd.length : 6;
  if (prefer === 'deep') return { rgb: lch(22, Math.min(10, avgC * 0.4), avgH), from: 'derived', L: 22 };
  return { rgb: lch(90, Math.min(9, avgC * 0.35 + 2), avgH), from: 'derived', L: 90 };
}

/** Ink that reads on a ground. */
export function inkFor(rgb, tone = 0) {
  const { h, C } = toLch(rgb);
  const dark = lch(14, Math.min(C * 0.5 + 4, 18), h);
  const light = lch(97, Math.min(C * 0.2, 5), h);
  void tone;
  return contrast(rgb, dark) >= contrast(rgb, light) ? dark : light;
}

/** Slightly deeper version of a colour (floor of a seamless). */
export function deepen(rgb, amount = 6) {
  const { L, C, h } = toLch(rgb);
  return lch(Math.max(0, L - amount), C * 1.05, h);
}
