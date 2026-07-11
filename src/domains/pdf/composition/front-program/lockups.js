/**
 * Name LOCKUP GRAMMAR (editions plan 2.4).
 *
 * First-class name constructions drawn from an edition's lockup pool —
 * replacing the sampler's ad-hoc name paths when an edition is active:
 *
 * - inline        one confident line
 * - stacked       two lines, negative leading 0.92–0.98
 * - contrast      first name in heavy display / surname in grotesque caps
 * - spine         vertical along a tall rail
 * - initial-line  hairline rule + tracked-out first-name line above the
 *                 surname (the monograph register)
 *
 * Every construction is size-solved from measured advances against the
 * caller's width/height budget, clamped into the edition's scale bounds
 * (already register-narrowed by the caller), floored at the Booker 14pt
 * for the primary line, and checked against the reversed-type print rules
 * when the type sits on a dark surface. A lockup that cannot honor its
 * floors REFUSES (returns null) — callers try the next pool member.
 *
 * A built lockup is geometry + a `place(x, y, opts)` emitter so callers
 * position the block after solving their own field structure.
 */

const { reversedMinPt } = require("./print-rules");

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const r3 = (n) => Math.round(n * 1000) / 1000;
const lerp = (a, b, t) => a + (b - a) * t;

function rect(x, y, w, h) {
  return { x: r3(x), y: r3(y), w: r3(w), h: r3(h) };
}

function words(nameText) {
  return String(nameText || "").trim().split(/\s+/).filter(Boolean);
}

function lineChars(text) {
  return Math.max(1, String(text).replace(/\s+/g, " ").trim().length);
}

/**
 * Solve a point size so `text` spans `maxWIn` at (advance + tracking),
 * clamped into [loPt, hiPt]. Returns { pt, wIn } or null when even loPt
 * overflows the budget.
 */
function solveLinePt(text, { advanceEm, trackingEm, maxWIn, loPt, hiPt }) {
  const chars = lineChars(text);
  const emW = chars * (advanceEm + trackingEm);
  if (!(emW > 0) || !(maxWIn > 0)) return null;
  let pt = clamp((maxWIn * 72) / emW, loPt, hiPt);
  let wIn = emW * (pt / 72);
  if (wIn > maxWIn + 1e-6) {
    // the floor overflows the budget — no honest fit
    if (loPt * emW > maxWIn * 72 + 1e-6) return null;
    pt = (maxWIn * 72) / emW;
    wIn = maxWIn;
    if (pt < loPt - 1e-6) return null;
  }
  return { pt: r3(pt), wIn: r3(wIn) };
}

/** Raise `pt` to the reversed minimum when on a dark surface; null = refuse. */
function applyReversedFloor(pt, { dark, family, weight, emWPerPt, maxWIn }) {
  if (!dark) return pt;
  const minPt = reversedMinPt({ family, weight });
  if (pt + 1e-6 >= minPt) return pt;
  // raise to the floor when the budget still holds the line, else refuse
  if (emWPerPt * minPt <= maxWIn * 72 + 1e-6) return minPt;
  return null;
}

// ── constructions ────────────────────────────────────────────────────────────

function buildInline(rng, spec) {
  const { nameText, metrics, maxWIn, loPt, hiPt, trackingEm, dark, displayFamily, weight } = spec;
  const adv = metrics?.advanceEm || 0.6;
  const solved = solveLinePt(nameText, { advanceEm: adv, trackingEm, maxWIn, loPt, hiPt });
  if (!solved) return null;
  const emWPerPt = lineChars(nameText) * (adv + trackingEm);
  const pt = applyReversedFloor(solved.pt, { dark, family: displayFamily, weight, emWPerPt: emWPerPt / 1, maxWIn });
  if (pt == null) return null;
  const wIn = (emWPerPt * pt) / 72;
  const h = (pt / 72) * 1.25;
  return {
    lockup: "inline",
    sizePt: r3(pt),
    w: r3(wIn),
    h: r3(h),
    place(x, y, opts = {}) {
      return [
        {
          type: "name",
          text: nameText,
          rect: rect(x, y, wIn, h),
          orientation: "horizontal",
          stacked: false,
          sizePt: r3(pt),
          trackingEm: r3(trackingEm),
          lockup: "inline",
          onPhoto: !!opts.onPhoto,
          color: opts.color,
          weight: opts.weightOverride || weight || undefined,
          align: opts.align || "left",
          transform: "uppercase",
          scrim: opts.scrim || null,
          z: opts.z ?? 3,
        },
      ];
    },
  };
}

function buildStacked(rng, spec) {
  const { nameText, metrics, maxWIn, loPt, hiPt, trackingEm, dark, displayFamily, weight } = spec;
  const parts = words(nameText);
  if (parts.length < 2) return null;
  const longest = parts.reduce((a, b) => (b.length > a.length ? b : a), "");
  const adv = metrics?.advanceLongestEm || metrics?.advanceEm || 0.6;
  const solved = solveLinePt(longest, { advanceEm: adv, trackingEm, maxWIn, loPt, hiPt });
  if (!solved) return null;
  const emWPerPt = lineChars(longest) * (adv + trackingEm);
  const pt = applyReversedFloor(solved.pt, { dark, family: displayFamily, weight, emWPerPt, maxWIn });
  if (pt == null) return null;
  // negative leading: stacked caps set tight, 0.92–0.98 of the em
  const leading = r3(lerp(0.92, 0.98, rng()));
  const wIn = (emWPerPt * pt) / 72;
  const h = (pt / 72) * (1 + leading);
  return {
    lockup: "stacked",
    sizePt: r3(pt),
    leading,
    w: r3(wIn),
    h: r3(h),
    place(x, y, opts = {}) {
      return [
        {
          type: "name",
          text: nameText,
          rect: rect(x, y, wIn, h),
          orientation: "horizontal",
          stacked: true,
          leading,
          sizePt: r3(pt),
          trackingEm: r3(trackingEm),
          lockup: "stacked",
          onPhoto: !!opts.onPhoto,
          color: opts.color,
          weight: opts.weightOverride || weight || undefined,
          align: opts.align || "left",
          transform: "uppercase",
          scrim: opts.scrim || null,
          z: opts.z ?? 3,
        },
      ];
    },
  };
}

function buildContrast(rng, spec) {
  const { nameText, metrics, maxWIn, loPt, hiPt, dark, displayFamily, bodyFamily } = spec;
  const parts = words(nameText);
  if (parts.length < 2) return null;
  const firstText = parts[0];
  const lastText = parts.slice(1).join(" ");
  const fAdv = metrics?.first?.advanceEm || metrics?.advanceEm || 0.6;
  const fWeight = metrics?.first?.weight || 700;
  const fTrack = 0.02;
  const body = metrics?.lastBody || metrics?.last || { advanceEm: metrics?.advanceEm || 0.6, weight: 600 };
  const lTrack = 0.24;

  const fSolved = solveLinePt(firstText, { advanceEm: fAdv, trackingEm: fTrack, maxWIn, loPt, hiPt });
  if (!fSolved) return null;
  const fEmWPerPt = lineChars(firstText) * (fAdv + fTrack);
  const fPt = applyReversedFloor(fSolved.pt, { dark, family: displayFamily, weight: fWeight, emWPerPt: fEmWPerPt, maxWIn });
  if (fPt == null) return null;

  const lLo = dark ? Math.max(10, reversedMinPt({ family: bodyFamily || "Inter", weight: body.weight })) : 10;
  const lSolved = solveLinePt(lastText, {
    advanceEm: body.advanceEm,
    trackingEm: lTrack,
    maxWIn,
    loPt: lLo,
    hiPt: Math.max(lLo, Math.min(fPt * 0.34, 18)),
  });
  if (!lSolved) return null;

  const fW = (fEmWPerPt * fPt) / 72;
  const fH = (fPt / 72) * 1.06;
  const lH = (lSolved.pt / 72) * 1.1;
  const gap = 0.07;
  const w = Math.max(fW, lSolved.wIn);
  const h = fH + gap + lH;
  return {
    lockup: "contrast",
    sizePt: r3(fPt),
    w: r3(w),
    h: r3(h),
    place(x, y, opts = {}) {
      const align = opts.align || "left";
      const ax = (lineW) =>
        align === "center" ? x + (w - lineW) / 2 : align === "right" ? x + w - lineW : x;
      return [
        {
          type: "name",
          role: "lockup-first",
          text: firstText,
          rect: rect(ax(fW), y, fW, fH),
          orientation: "horizontal",
          stacked: false,
          sizePt: r3(fPt),
          trackingEm: fTrack,
          lockup: "contrast",
          onPhoto: !!opts.onPhoto,
          color: opts.color,
          weight: fWeight,
          align,
          transform: "uppercase",
          scrim: opts.scrim || null,
          z: opts.z ?? 3,
        },
        {
          type: "name",
          role: "lockup-last",
          text: lastText,
          rect: rect(ax(lSolved.wIn), y + fH + gap, lSolved.wIn, lH),
          orientation: "horizontal",
          stacked: false,
          sizePt: lSolved.pt,
          trackingEm: lTrack,
          lockup: "contrast",
          font: "body",
          onPhoto: !!opts.onPhoto,
          color: opts.colorSecondary || opts.color,
          weight: body.weight,
          align,
          transform: "uppercase",
          scrim: opts.scrim || null,
          z: opts.z ?? 3,
        },
      ];
    },
  };
}

function buildSpine(rng, spec) {
  const { nameText, metrics, maxWIn, maxHIn, loPt, hiPt, trackingEm, dark, displayFamily, weight } = spec;
  if (!(maxHIn > 0)) return null;
  const adv = metrics?.advanceEm || 0.6;
  const chars = lineChars(nameText);
  const emH = chars * (adv + trackingEm);
  const heightFit = (maxHIn * 72) / emH;
  const widthFit = (maxWIn * 72) / 1.3; // the line's cross-axis body
  let pt = clamp(Math.min(heightFit, widthFit), loPt, hiPt);
  if (emH * (pt / 72) > maxHIn + 1e-6) {
    pt = (maxHIn * 72) / emH;
    if (pt < Math.max(loPt, 14) - 1e-6) return null;
  }
  if (dark) {
    const minPt = reversedMinPt({ family: displayFamily, weight });
    if (pt < minPt) {
      if (emH * (minPt / 72) > maxHIn + 1e-6 || (minPt / 72) * 1.3 > maxWIn + 1e-6) return null;
      pt = minPt;
    }
  }
  const w = (pt / 72) * 1.25;
  const h = emH * (pt / 72);
  return {
    lockup: "spine",
    sizePt: r3(pt),
    w: r3(w),
    h: r3(h),
    place(x, y, opts = {}) {
      return [
        {
          type: "name",
          text: nameText,
          rect: rect(x, y, w, h),
          orientation: "vertical",
          stacked: false,
          sizePt: r3(pt),
          trackingEm: r3(trackingEm),
          lockup: "spine",
          onPhoto: !!opts.onPhoto,
          color: opts.color,
          weight: opts.weightOverride || weight || undefined,
          transform: "uppercase",
          scrim: opts.scrim || null,
          z: opts.z ?? 3,
        },
      ];
    },
  };
}

function buildInitialLine(rng, spec) {
  const { nameText, metrics, maxWIn, loPt, hiPt, trackingEm, dark, displayFamily, weight, ruleColor } = spec;
  const parts = words(nameText);
  if (parts.length < 2) return null;
  const firstText = parts[0];
  const lastText = parts.slice(1).join(" ");
  const adv = metrics?.advanceEm || 0.6;

  // the surname is the carrier line — solved first, Booker floor applies
  const sSolved = solveLinePt(lastText, { advanceEm: adv, trackingEm, maxWIn, loPt, hiPt });
  if (!sSolved) return null;
  const sEmWPerPt = lineChars(lastText) * (adv + trackingEm);
  const sPt = applyReversedFloor(sSolved.pt, { dark, family: displayFamily, weight, emWPerPt: sEmWPerPt, maxWIn });
  if (sPt == null) return null;
  const sW = (sEmWPerPt * sPt) / 72;
  const sH = (sPt / 72) * 1.2;

  // tracked-out first-name micro line above (caption register)
  const fTrack = 0.32;
  const fFloor = dark ? Math.max(9, reversedMinPt({ family: displayFamily, weight })) : 8;
  const fSolved = solveLinePt(firstText, {
    advanceEm: adv,
    trackingEm: fTrack,
    maxWIn,
    loPt: fFloor,
    hiPt: Math.max(fFloor, Math.min(sPt * 0.5, 12)),
  });
  if (!fSolved) return null;
  const fH = (fSolved.pt / 72) * 1.2;

  const ruleW = clamp(sW * 0.5, 0.45, 1.4);
  const ruleH = 0.01;
  const gapA = 0.09; // rule → first line
  const gapB = 0.06; // first line → surname
  const w = Math.max(sW, fSolved.wIn, ruleW);
  const h = ruleH + gapA + fH + gapB + sH;
  return {
    lockup: "initial-line",
    sizePt: r3(sPt),
    w: r3(w),
    h: r3(h),
    place(x, y, opts = {}) {
      const align = opts.align || "center";
      const ax = (lineW) =>
        align === "center" ? x + (w - lineW) / 2 : align === "right" ? x + w - lineW : x;
      return [
        {
          type: "rule",
          variant: "hairline",
          orientation: "horizontal",
          rect: rect(ax(ruleW), y, ruleW, ruleH),
          color: opts.ruleColor || ruleColor || opts.color,
          weight: 0.01,
          z: opts.z ?? 3,
        },
        {
          type: "name",
          role: "lockup-first",
          text: firstText,
          rect: rect(ax(fSolved.wIn), y + ruleH + gapA, fSolved.wIn, fH),
          orientation: "horizontal",
          stacked: false,
          sizePt: fSolved.pt,
          trackingEm: fTrack,
          lockup: "initial-line",
          onPhoto: !!opts.onPhoto,
          color: opts.colorSecondary || opts.color,
          weight: opts.weightOverride || weight || undefined,
          align,
          transform: "uppercase",
          scrim: opts.scrim || null,
          z: opts.z ?? 3,
        },
        {
          type: "name",
          text: lastText,
          rect: rect(ax(sW), y + ruleH + gapA + fH + gapB, sW, sH),
          orientation: "horizontal",
          stacked: false,
          sizePt: r3(sPt),
          trackingEm: r3(trackingEm),
          lockup: "initial-line",
          onPhoto: !!opts.onPhoto,
          color: opts.color,
          weight: opts.weightOverride || weight || undefined,
          align,
          transform: "uppercase",
          scrim: opts.scrim || null,
          z: opts.z ?? 3,
        },
      ];
    },
  };
}

const BUILDERS = {
  inline: buildInline,
  stacked: buildStacked,
  contrast: buildContrast,
  spine: buildSpine,
  "initial-line": buildInitialLine,
};

const LOCKUP_IDS = Object.freeze(Object.keys(BUILDERS));

/**
 * Draw a lockup from the pool (seeded, stack-biased) and build it; on
 * refusal walk the remaining pool members in seeded order. Returns
 * null only when NO pool member can be built inside the budget.
 *
 * spec: { nameText, metrics, maxWIn, maxHIn?, loPt, hiPt, trackingEm,
 *   dark, displayFamily, bodyFamily?, weight, stackBias, allowVertical }
 */
function buildLockupFromPool(rng, pool, spec) {
  const multi = words(spec.nameText).length > 1;
  const feasible = (Array.isArray(pool) && pool.length ? pool : ["inline"]).filter((id) => {
    if (!BUILDERS[id]) return false;
    if (!multi && (id === "stacked" || id === "contrast" || id === "initial-line")) return false;
    if (id === "spine" && !spec.allowVertical) return false;
    return true;
  });
  if (!feasible.length) feasible.push("inline");

  const stackBias = Number.isFinite(spec.stackBias) ? spec.stackBias : 0.3;
  const weightOf = (id) =>
    id === "stacked" ? 0.55 + 0.9 * stackBias : id === "spine" ? 1.1 : 1;
  const weights = feasible.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  let pickIdx = 0;
  for (let i = 0; i < feasible.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      pickIdx = i;
      break;
    }
  }
  const order = [feasible[pickIdx], ...feasible.filter((_, i) => i !== pickIdx)];
  for (const id of order) {
    const built = BUILDERS[id](rng, spec);
    if (built) return built;
  }
  return null;
}

module.exports = {
  LOCKUP_IDS,
  buildLockupFromPool,
  buildInline,
  buildStacked,
  buildContrast,
  buildSpine,
  buildInitialLine,
  solveLinePt,
};
