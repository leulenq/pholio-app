/**
 * Candidate photo arrangements for a rectangular area. Directions choose
 * which families they allow and how they're weighted; compose.arrange()
 * picks the one the actual photographs fill best.
 *
 * Every slot: { id, x, y, w, h, role: 'auto', lead?: true } — `lead` marks
 * the dominant frame (a direction usually wants the full length there).
 */

export function roleOf(item) {
  const s = item?.subject;
  if (!s?.known) return 'whole';
  if (s.feetInFrame) return 'full';
  if (s.framing === 'close-up' || s.framing === 'head-and-shoulders') return 'portrait';
  return 'whole';
}

const slot = (i, x, y, w, h, extra = {}) => ({ id: `back-${i + 1}`, x, y, w, h, role: 'auto', ...extra });

/**
 * @param area {x,y,w,h}
 * @param n    number of photos
 * @param g    gutter (mm)
 * @param opts { ratios: [..], families: Set|null }
 */
export function partitions(area, n, g, opts = {}) {
  const { x, y, w, h } = area;
  const ratios = opts.ratios || [0.5, 0.58, 0.64];
  const allow = (f) => !opts.families || opts.families.includes(f);
  const out = [];
  const add = (family, slots, bias = 0) => allow(family) && out.push({ family, slots, bias });

  const col = (x0, y0, cw, chTotal, k, start) => {
    const ch = (chTotal - g * (k - 1)) / k;
    return Array.from({ length: k }, (_, i) => slot(start + i, x0, y0 + i * (ch + g), cw, ch));
  };
  const row = (x0, y0, rwTotal, rh, k, start) => {
    const rw = (rwTotal - g * (k - 1)) / k;
    return Array.from({ length: k }, (_, i) => slot(start + i, x0 + i * (rw + g), y0, rw, rh));
  };

  if (n === 1) add('single', [slot(0, x, y, w, h, { lead: true })]);

  if (n === 2) {
    for (const r of ratios) {
      const a = (w - g) * r;
      add('columns', [slot(0, x, y, a, h, { lead: true }), slot(1, x + a + g, y, w - g - a, h)], r === 0.5 ? 0 : 0.05);
      const b = (h - g) * r;
      add('rows', [slot(0, x, y, w, b, { lead: true }), slot(1, x, y + b + g, w, h - g - b)]);
    }
  }

  if (n >= 3) {
    for (const k of [n - 1]) {
      for (const r of ratios) {
        const a = (w - g) * r;
        // Lead column + stacked companions.
        add('lead-left', [slot(0, x, y, a, h, { lead: true }), ...col(x + a + g, y, w - g - a, h, k, 1)], 0.1);
        add('lead-right', [...col(x, y, w - g - a, h, k, 1), slot(0, x + w - a, y, a, h, { lead: true })], 0.05);
        const b = (h - g) * r;
        // Lead row + companions side by side.
        add('lead-top', [slot(0, x, y, w, b, { lead: true }), ...row(x, y + b + g, w, h - g - b, k, 1)]);
        add('lead-bottom', [...row(x, y, w, h - g - b, k, 1), slot(0, x, y + h - b, w, b, { lead: true })]);
      }
    }
    if (n === 3) add('triptych', row(x, y, w, h, 3, 0), -0.1);
  }

  if (n === 4) {
    const cw = (w - g) / 2;
    const ch = (h - g) / 2;
    add('grid', [slot(0, x, y, cw, ch, { lead: true }), slot(1, x + cw + g, y, cw, ch), slot(2, x, y + ch + g, cw, ch), slot(3, x + cw + g, y + ch + g, cw, ch)], 0.05);
  }

  if (n === 5) {
    for (const r of [0.5, 0.56]) {
      const a = (w - g) * r;
      const rw = w - g - a;
      const cw = (rw - g) / 2;
      const ch = (h - g) / 2;
      add('lead-grid', [
        slot(0, x, y, a, h, { lead: true }),
        slot(1, x + a + g, y, cw, ch),
        slot(2, x + a + g + cw + g, y, cw, ch),
        slot(3, x + a + g, y + ch + g, cw, ch),
        slot(4, x + a + g + cw + g, y + ch + g, cw, ch),
      ]);
    }
  }
  return out;
}
