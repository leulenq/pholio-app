/** Typesetting helpers shared by directions. All units mm; sizes pt. */

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function issueDate(ctx) {
  const d = ctx.settings.date ? new Date(ctx.settings.date) : new Date();
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** A text element whose cap-top sits at y. Returns element + its geometry. */
export function text(ctx, lines, font, x, y, opts = {}) {
  let arr = Array.isArray(lines) ? lines : [lines];
  // A monospace face's straight ' and " ARE its primes (Martian Mono has no
  // ′ ″ glyphs) — the technical-drawing convention.
  if (font.family === 'mono') arr = arr.map((l) => String(l).replace(/\u2032/g, "'").replace(/\u2033/g, '"'));
  const shown = font.caps === 'upper' ? arr.map((l) => l.toUpperCase()) : arr;
  const mf = font.caps === 'upper' ? { ...font, caps: null } : font;
  const widths = shown.map((l) => ctx.measure(l, mf).width);
  const cap = ctx.measure(shown[0] || 'H', mf).cap;
  const leading = opts.leading || (font.size * 25.4) / 72 * 1.25;
  const width = Math.max(0, ...widths);
  const height = cap + (arr.length - 1) * leading;
  let left = x;
  if (opts.align === 'right') left = x - width;
  if (opts.align === 'center') left = x - width / 2;
  const el = {
    type: 'text',
    lines: shown,
    font: { ...font, caps: font.caps === 'upper' ? null : font.caps },
    color: opts.color || '#111',
    x: left,
    y,
    // Give the box a little slack so sub-pixel rounding never wraps a line.
    w: width + 2,
    align: opts.align === 'center' ? 'center' : opts.align === 'right' ? 'right' : 'left',
    leading: arr.length > 1 ? leading : undefined,
    z: opts.z,
  };
  // The browser renders tracking after the last glyph too; shift centred and
  // right-aligned lines so the INK is where it was measured.
  const trail = ((font.tracking || 0) * font.size * 25.4) / 72;
  if (opts.align === 'center') {
    el.x = left - 1 + trail / 2;
  } else if (opts.align === 'right') {
    el.x = left - 2 + trail;
  }
  if (opts.fill) el.fill = opts.fill;
  if (opts.spin) el.spin = opts.spin;
  return { el, width, height, cap, bottom: y + height, right: left + width, left };
}

/**
 * A line of runs in different fonts/colours, set one after another:
 * runs = [{ t, font, color, gap }] (gap = mm after the run). All runs share
 * the cap line at y. align: 'left' | 'center' | 'right' about x.
 */
export function runs(ctx, list, x, y, opts = {}) {
  const items = list.filter((r) => r.t != null && r.t !== '');
  const meas = items.map((r) => {
    const f = r.font.caps === 'upper' ? { ...r.font, caps: null } : r.font;
    const t = r.font.caps === 'upper' ? String(r.t).toUpperCase() : String(r.t);
    const m = ctx.measure(t, f);
    const trail = ((r.font.tracking || 0) * r.font.size * 25.4) / 72;
    return { ...m, trail };
  });
  const total = items.reduce((s, r, i) => s + meas[i].width + (i < items.length - 1 ? (r.gap ?? 0) + meas[i].trail : 0), 0);
  let cx = opts.align === 'center' ? x - total / 2 : opts.align === 'right' ? x - total : x;
  const capMax = Math.max(0, ...meas.map((m) => m.cap));
  const els = [];
  items.forEach((r, i) => {
    // Align on the baseline: smaller caps sit lower.
    const t = text(ctx, r.t, r.font, cx, y + (capMax - meas[i].cap), { color: r.color, z: opts.z, fill: r.fill });
    els.push(t.el);
    cx += meas[i].width + meas[i].trail + (r.gap ?? 0);
  });
  return { els, width: total, cap: capMax, bottom: y + capMax };
}

/** Relative luminance of an sRGB colour (0..1). */
export function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Sample the photograph under a page rectangle (via the crop) and report
 * its mean colour, worst-case colours, and busyness. Used to decide whether
 * type can sit on the photo and in which ink.
 */
export function sampleUnder(item, crop, frame, rect) {
  const tone = item?.perception?.tone;
  if (!tone || !crop) return null;
  const toImg = (px, py) => ({
    x: crop.x + ((px - frame.x) / frame.w) * crop.w,
    y: crop.y + ((py - frame.y) / frame.h) * crop.h,
  });
  const a = toImg(rect.x, rect.y);
  const b = toImg(rect.x + rect.w, rect.y + rect.h);
  const c0 = Math.max(0, Math.floor(a.x * tone.cols));
  const c1 = Math.min(tone.cols - 1, Math.ceil(b.x * tone.cols) - 1);
  const r0 = Math.max(0, Math.floor(a.y * tone.rows));
  const r1 = Math.min(tone.rows - 1, Math.ceil(b.y * tone.rows) - 1);
  const cells = [];
  for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) cells.push({ c: tone.color[y][x], d: tone.detail[y][x] });
  if (!cells.length) return null;
  const mean = [0, 1, 2].map((k) => cells.reduce((s, q) => s + q.c[k], 0) / cells.length);
  const detail = cells.reduce((s, q) => s + q.d, 0) / cells.length;
  return { mean, detail, cells: cells.map((q) => q.c) };
}

/** Pick ink for type over a sampled region; null if neither ink is safe. */
export function inkOver(sample, inks = { dark: [17, 17, 17], light: [255, 255, 255] }, min = 4.5, maxDetail = 0.12) {
  if (!sample) return null;
  const worst = (ink) => Math.min(...sample.cells.map((c) => contrast(ink, c)));
  const d = worst(inks.dark);
  const l = worst(inks.light);
  if (sample.detail > maxDetail) return null;
  if (d >= min && d >= l) return 'dark';
  if (l >= min) return 'light';
  return null;
}

/** Hex from rgb. */
export const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** Split stats into measurements (numbers) and features (hair, eyes). */
export function splitStats(stats) {
  const measures = stats.items.filter((i) => !['hair', 'eyes'].includes(i.key));
  const features = stats.items.filter((i) => ['hair', 'eyes'].includes(i.key));
  return { measures, features };
}

/** "178 cm" / "70 in" style secondary-unit string. */
export function altUnit(item, units) {
  if (!item.alt) return '';
  if (item.key === 'height') return units === 'metric' ? item.alt : `${item.alt} cm`;
  if (item.unit === 'in') return `${item.alt} cm`;
  if (item.unit === 'cm') return `${item.alt} in`;
  return item.alt;
}

/** Primary value with its unit where the convention prints one. */
export function primary(item) {
  if (item.unit === 'cm') return `${item.value}`;
  return item.value;
}

/**
 * Justified rows: break a sequence of photos (by aspect) into 1–3 rows of
 * equal height per row, fitted into an area. Returns placed rects
 * [{ i, x, y, w, h }] for the arrangement that fills the area best.
 * align: 'left' | 'center' | 'stagger' (alternate rows left/right).
 */
export function justifyRows(aspects, area, g, { align = 'left', maxRows = 3 } = {}) {
  const n = aspects.length;
  if (!n) return [];
  const plans = [];
  const split = (start, rowsLeft, acc) => {
    if (rowsLeft === 1) {
      plans.push([...acc, [start, n]]);
      return;
    }
    for (let end = start + 1; end <= n - rowsLeft + 1; end++) split(end, rowsLeft - 1, [...acc, [start, end]]);
  };
  for (let r = 1; r <= Math.min(maxRows, n); r++) split(0, r, []);
  let best = null;
  for (const plan of plans) {
    const rows = plan.map(([a, b]) => {
      const sum = aspects.slice(a, b).reduce((s, v) => s + v, 0);
      return { a, b, h: (area.w - g * (b - a - 1)) / sum };
    });
    const total = rows.reduce((s, r) => s + r.h, 0) + g * (rows.length - 1);
    const k = Math.min(1, area.h / total);
    const filled = (total * k * area.w * k) / (area.w * area.h);
    const hs = rows.map((r) => r.h);
    const even = Math.min(...hs) / Math.max(...hs);
    const score = filled * 2 + even * 0.5;
    if (!best || score > best.score) best = { rows, k, total, score };
  }
  const out = [];
  let y = area.y;
  best.rows.forEach((row, ri) => {
    const h = row.h * best.k;
    const rowW = (area.w - g * (row.b - row.a - 1)) * best.k + g * (row.b - row.a - 1);
    let x = area.x;
    if (align === 'center') x = area.x + (area.w - rowW) / 2;
    if (align === 'stagger' && ri % 2 === 1) x = area.x + area.w - rowW;
    for (let i = row.a; i < row.b; i++) {
      const w = aspects[i] * h;
      out.push({ i, x, y, w, h });
      x += w + g;
    }
    y += h + g;
  });
  return out;
}
