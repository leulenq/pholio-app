/**
 * Rendered-geometry integrity sweep (audit §7 exit test, CI-sized).
 *
 * Sweeps the front-program sampler across seeds × name shapes and asserts
 * the invariants the audit found violated in production:
 *   1. the name, MEASURED with the real vendored font metrics, fits the
 *      rect the search verified (no drowned/overflowing names — P0-1);
 *   2. a ghost echo is always a complete word on the paper plane: inside
 *      the page, never intersecting the photo (no amputated glyphs — P1-5);
 *   3. a knockout band exists only under an on-photo name;
 *   4. the name never renders timid: on-paper horizontal names span a
 *      meaningful fraction of the page (name presence — P1-5).
 */

const { designFrontProgram, PAGE_W, PAGE_H } = require("../composition/front-program/synthesize");
const { nameAdvanceEm } = require("../composition/perception/font-files");

const NAMES = [
  "Ana Li",
  "Maya Chen",
  "Jordan Smith",
  "Alexandra Konstantinopoulos",
  "Anastasia Vollemont-Craine",
  "Jean-Baptiste de la Rochefoucauld",
  "Zoë Østergaard",
  "Wu Yifan",
];

const VOICE = { family: "Playfair Display", weight: 500, nameCase: "upper" };

function forensicsFixture() {
  const rows = 9;
  const cols = 6;
  const luma = [];
  const detail = [];
  for (let r = 0; r < rows; r++) {
    const busy = r >= 4;
    luma.push(new Array(cols).fill(busy ? 0.15 : 0.82));
    detail.push(new Array(cols).fill(busy ? 0.7 : 0.03));
  }
  return {
    aspect: 2 / 3,
    luma: { rows, cols, grid: luma, mean: 0.5, isDark: false },
    detail: { grid: detail },
    quiet: {
      top: { score: 0.9, bandRows: 3 },
      bottom: { score: 0.2, bandRows: 2 },
      left: { score: 0.5, bandCols: 2 },
      right: { score: 0.5, bandCols: 2 },
    },
    focal: { x: 0.5, y: 0.22 },
    palette: [{ hex: "#8A6A52", population: 0.4, sat: 0.3, luma: 0.45 }],
    // second muted tone lets derivePlaneTone build color blocks in the sweep
    warmth: 0.2,
    saturation: 0.25,
    contrast: 0.5,
  };
}

const overlaps = (a, b) =>
  a.x + a.w > b.x + 1e-4 && b.x + b.w > a.x + 1e-4 &&
  a.y + a.h > b.y + 1e-4 && b.y + b.h > a.y + 1e-4;

describe("front-program geometry integrity sweep", () => {
  const seeds = Array.from({ length: 25 }, (_, i) => `sweep-${i}`);
  const cases = [];
  for (const name of NAMES) {
    const metrics = nameAdvanceEm({
      family: VOICE.family,
      weight: VOICE.weight,
      text: name,
      nameCase: VOICE.nameCase,
    });
    const longest = name.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), "");
    const longestMetrics = nameAdvanceEm({
      family: VOICE.family,
      weight: VOICE.weight,
      text: longest,
      nameCase: VOICE.nameCase,
    });
    for (const seed of seeds) cases.push({ name, seed, metrics, longestMetrics, longest });
  }

  test(`zero geometry violations across ${NAMES.length} names × 25 seeds`, () => {
    const violations = [];
    for (const { name, seed, metrics, longestMetrics, longest } of cases) {
      const { program } = designFrontProgram(
        {
          heroAspect: 2 / 3,
          heroCrop: { objectPosition: "50% 20%" },
          heroForensics: forensicsFixture(),
          palette: { background: "#FAF8F5", text: "#1A1815", accent: "#B8956A", muted: "#6B6560" },
          nameText: name,
          nameMetrics: {
            advanceEm: metrics.advanceEm,
            advanceLongestEm: longestMetrics.advanceEm,
            trackingEm: 0.12,
            measured: metrics.measured,
          },
          contactLine: "PARIS · +33 6 12 34 56 78",
          language: { toneVector: { formality: 0.6, energy: 0.5, warmth: 0.5, density: 0.5 } },
        },
        { seed, candidates: 5 },
      );

      const els = program.elements;
      const photo = els.find((e) => e.type === "photo");
      const nameEls = els.filter((e) => e.type === "name");
      const nameEl = nameEls.find((e) => !e.role) || nameEls[0];
      const ghost = els.find((e) => e.type === "ghost");
      const band = els.find((e) => e.type === "band");

      // 1. every name line, measured with the advance the engine used,
      // fits the rect the search verified (split segments carry their own
      // text; the sweep supplies no per-segment metrics so the engine used
      // the full-string advance for them too)
      for (const el of nameEls) {
        if (el.orientation !== "horizontal") continue;
        const elText = el.text || name;
        const lineText = el.stacked
          ? elText.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), "")
          : elText;
        const adv = el.stacked ? longestMetrics.advanceEm : metrics.advanceEm;
        const widthIn = lineText.length * (adv + el.trackingEm) * (el.sizePt / 72);
        if (widthIn > el.rect.w * 1.02 + 0.02) {
          violations.push(`${seed}/${name}: ${el.role || "name"} ${widthIn.toFixed(2)}in > rect ${el.rect.w.toFixed(2)}in`);
        }
      }
      // 4. presence floor for the primary on-paper name
      if (nameEl && !nameEl.role && nameEl.orientation === "horizontal" &&
          !nameEl.onPhoto && nameEl.rect.w / PAGE_W < 0.25 && nameEl.sizePt < 18) {
        violations.push(
          `${seed}/${name}: timid name (${(nameEl.rect.w / PAGE_W).toFixed(2)} of page width at ${nameEl.sizePt}pt)`,
        );
      }

      // 5. split-zone lockup invariants: first name entirely below the face
      // line and inside the photo; surname panel seam-tight under the photo
      const splitFirst = nameEls.find((e) => e.role === "split-first");
      const splitLast = nameEls.find((e) => e.role === "split-last");
      if (splitFirst) {
        const fy0 = (splitFirst.rect.y - photo.rect.y) / photo.rect.h;
        // face fixture focal y=0.22, half-height 0.16 → face bottom ≈ 0.38
        if (fy0 <= 0.38) {
          violations.push(`${seed}/${name}: split first name enters the face zone (fy0 ${fy0.toFixed(2)})`);
        }
        if (!splitLast) {
          violations.push(`${seed}/${name}: split lockup missing its surname`);
        } else if (splitFirst.variant === "inset") {
          if (!band) {
            violations.push(`${seed}/${name}: inset split lockup missing its accent panel`);
          } else {
            const seamGap = Math.abs(band.rect.y - (photo.rect.y + photo.rect.h));
            if (seamGap > 0.005) {
              violations.push(`${seed}/${name}: surname panel floats ${seamGap.toFixed(2)}in off the photo seam`);
            }
          }
        } else if (splitFirst.variant === "straddle") {
          const photoBottom = photo.rect.y + photo.rect.h;
          // the straddle must genuinely cross the seam (tension, not decoration)
          if (!(splitFirst.rect.y < photoBottom - 0.05 && splitFirst.rect.y + splitFirst.rect.h > photoBottom + 0.05)) {
            violations.push(`${seed}/${name}: straddle type does not cross the photo seam`);
          }
          // surname on paper, fully below the photo
          if (splitLast.rect.y < photoBottom) {
            violations.push(`${seed}/${name}: straddle surname overlaps the photo`);
          }
        }
      }

      // 6. color-block plane: reversed type only (a dark palette-pulled
      // field must never carry dark ink)
      const plane = els.find((e) => e.type === "colorPlane" && e.fill && e.fill !== "#FAF8F5");
      if (plane && nameEl && !nameEl.onPhoto && !nameEl.role && nameEl.color !== "#FFFFFF") {
        violations.push(`${seed}/${name}: colored plane carries non-reversed name ink ${nameEl.color}`);
      }

      // 2. ghost: complete word, on the page, off the photo plane
      if (ghost) {
        const g = ghost.rect;
        if (g.x < 0 || g.y < 0 || g.x + g.w > PAGE_W || g.y + g.h > PAGE_H) {
          violations.push(`${seed}/${name}: ghost exceeds the page`);
        }
        if (photo && overlaps(g, photo.rect)) {
          violations.push(`${seed}/${name}: ghost intersects the photo plane`);
        }
        const gWidth = name.length * (metrics.advanceEm + 0.04) * (ghost.sizePt / 72);
        if (gWidth > g.w * 1.03 + 0.02) {
          violations.push(`${seed}/${name}: ghost word clipped (${gWidth.toFixed(2)}in > ${g.w.toFixed(2)}in)`);
        }
      }

      // 3. a band is either the split lockup's accent panel or a knockout
      // under an on-photo name — never a floating decoration
      if (band && !splitFirst && !(nameEl && nameEl.onPhoto)) {
        violations.push(`${seed}/${name}: knockout band without an on-photo name`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("forceStructure pins the field structure", () => {
    for (const structure of ["photo-dominant", "matted", "split"]) {
      for (const seed of ["a", "b", "c"]) {
        const { program } = designFrontProgram(
          {
            heroAspect: 2 / 3,
            heroForensics: forensicsFixture(),
            palette: {},
            nameText: "Maya Chen",
            nameMetrics: { advanceEm: 0.6, trackingEm: 0.1 },
            language: { toneVector: {} },
          },
          { seed, candidates: 3, forceStructure: structure },
        );
        expect(program.structure).toBe(structure);
      }
    }
    // cutout stays matte-gated even when requested
    const { program } = designFrontProgram(
      {
        heroAspect: 2 / 3,
        heroForensics: forensicsFixture(),
        palette: {},
        nameText: "Maya Chen",
        nameMetrics: { advanceEm: 0.6, trackingEm: 0.1 },
        language: { toneVector: {} },
      },
      { seed: "x", candidates: 3, forceStructure: "cutout" },
    );
    expect(program.structure).not.toBe("cutout");
  });
});
