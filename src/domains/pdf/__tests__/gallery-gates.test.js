/**
 * Gallery quality gates — editions implementation plan, phase 1 item 1.2.
 *
 * Hosted on the gallery rig (scripts/comp-card-gallery.js): four synthetic
 * fixture profiles × seeds through the REAL composition engine and the REAL
 * template. Two tiers:
 *
 *  1. PLAN-LEVEL SUBSET (always on, browserless, fast): fixture images are
 *     generated with sharp, measured by the real forensics pipeline, and
 *     composed — asserting determinism, guardrail health, palette contrast
 *     (cheap pre-filter for the rasterized gate) and plan-level seed
 *     diversity (cheap pre-filter for the perceptual gate).
 *
 *  2. BROWSER GATES (GALLERY_GATES_BROWSER=1, same convention as
 *     shaping-parity's SHAPING_PARITY_BROWSER): the full rig — Puppeteer
 *     renders every card, then
 *       a. RASTERIZED CONTRAST GATE — for every front text element, the
 *          pixels actually behind the glyphs (text-suppressed re-render)
 *          must clear the binding per-class WCAG floor. Ratios against the
 *          engine's own targets are recorded in metrics.json.
 *       b. PERCEPTUAL DISTANCE GATE — consecutive-seed fronts of the same
 *          fixture must exceed the minimum pixelmatch distance at thumbnail
 *          size; the full pairwise matrix lands in metrics.json.
 *
 * All thresholds live in GATES inside scripts/comp-card-gallery.js — they
 * are phase-1 BASELINES of the current engine (pre-editions) and become the
 * anti-collapse gate in phase 2 (raise minConsecutiveDistance, flip
 * enforceEngineTarget). Do not tune them here.
 *
 *   GALLERY_GATES_BROWSER=1 npx jest src/domains/pdf/__tests__/gallery-gates.test.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const rig = require("../../../../scripts/comp-card-gallery");

const {
  GATES,
  FIXTURES,
  buildFixtures,
  composeCell,
  renderCardHtml,
  fontsCssForCard,
  cellSummary,
  analyticMatte,
  stableStringify,
  bindingContrastFloor,
  wcagRatio,
  relLuminance,
} = rig;

const PLAN_SEEDS = ["seed-1", "seed-2", "seed-3", "seed-4", "seed-5", "seed-6"];

// ---------------------------------------------------------------------------
// Tier 1 — plan-level subset (always on)
// ---------------------------------------------------------------------------
describe("gallery rig: fixtures + plan-level gates (browserless)", () => {
  jest.setTimeout(120000);

  let tmpDir;
  let fixtures;
  /** fixtureKey -> seed -> composed result */
  const composedByFixture = new Map();

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-gates-"));
    fixtures = await buildFixtures(tmpDir, { quiet: true });
    for (const fixture of fixtures) {
      const bySeed = new Map();
      for (const seed of PLAN_SEEDS) {
        bySeed.set(seed, await composeCell(fixture, seed));
      }
      composedByFixture.set(fixture.key, bySeed);
    }
  });

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("the catalog carries the four plan fixtures", () => {
    expect(FIXTURES.map((f) => f.key)).toEqual([
      "editorial-woman",
      "commercial-man",
      "teen",
      "new-face",
    ]);
    // editorial woman: strong 8-image pool + matte on the hero
    const ew = FIXTURES.find((f) => f.key === "editorial-woman");
    expect(ew.images).toHaveLength(8);
    expect(ew.matteHeroId).toBe("ew-1");
    // commercial man: typical 6-image pool, no matte
    const cm = FIXTURES.find((f) => f.key === "commercial-man");
    expect(cm.images).toHaveLength(6);
    expect(cm.matteHeroId).toBeNull();
    // new face: 8 mixed untyped phone photos
    const nf = FIXTURES.find((f) => f.key === "new-face");
    expect(nf.images).toHaveLength(8);
    expect(nf.images.every((img) => !img.shot_type && !img.style_type)).toBe(true);
  });

  test("real forensics measured every generated fixture image (honest, varied inputs)", () => {
    for (const fixture of fixtures) {
      for (const row of fixture.rows) {
        const f = fixture.forensicsById.get(row.id);
        expect(f).toBeTruthy();
        expect(f.luma.grid).toHaveLength(9);
        expect(f.palette.length).toBeGreaterThan(0);
      }
      // Per-image variation is the point of the fixtures: forensics must
      // differ across the pool (distinct mean luma), or the engine would be
      // composing against clones.
      const means = fixture.rows.map((r) => fixture.forensicsById.get(r.id).luma.mean);
      expect(new Set(means.map((m) => m.toFixed(2))).size).toBeGreaterThan(
        Math.min(3, means.length - 1),
      );
    }
  });

  test("the analytic hero matte is a real silhouette (subject mass in frame center, empty corners)", () => {
    const ew = FIXTURES.find((f) => f.key === "editorial-woman");
    const spec = ew.images.find((img) => img.id === "ew-1");
    const matte = analyticMatte(spec);
    expect(matte.source).toBe("alpha");
    expect(matte.maskGrid).toHaveLength(18);
    expect(matte.maskGrid[0]).toHaveLength(12);
    const flat = matte.maskGrid.flat();
    const coverage = flat.reduce((a, b) => a + b, 0) / flat.length;
    expect(coverage).toBeGreaterThan(0.05);
    expect(coverage).toBeLessThan(0.85);
    // top corners are backdrop
    expect(matte.maskGrid[0][0]).toBe(0);
    expect(matte.maskGrid[0][11]).toBe(0);
  });

  test("composition is deterministic per (fixture, seed) — stable plan JSON", async () => {
    for (const fixture of fixtures) {
      const again = await composeCell(fixture, "seed-1");
      const first = composedByFixture.get(fixture.key).get("seed-1");
      expect(stableStringify(again.plan)).toBe(stableStringify(first.plan));
    }
  });

  test("no fixture ever BLOCKS composition (weak pool warns, never fails)", () => {
    for (const fixture of fixtures) {
      for (const seed of PLAN_SEEDS) {
        const { guardrailReport } = composedByFixture.get(fixture.key).get(seed);
        expect(["pass", "warn"]).toContain(guardrailReport.status);
      }
    }
  });

  test("front program synthesizes for every cell (rasterized gate has rects to sample)", () => {
    for (const fixture of fixtures) {
      for (const seed of PLAN_SEEDS) {
        const { plan } = composedByFixture.get(fixture.key).get(seed);
        expect(plan.frontProgram).toBeTruthy();
        expect(Array.isArray(plan.frontProgram.elements)).toBe(true);
        expect(plan.frontProgram.elements.some((e) => e.type === "name")).toBe(true);
      }
    }
  });

  test("plan-level palette contrast pre-filter: text vs background >= 4.5 (cheap gate)", () => {
    const hexLum = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return relLuminance((n >> 16) & 255, (n >> 8) & 255, n & 255);
    };
    for (const fixture of fixtures) {
      for (const seed of PLAN_SEEDS) {
        const { plan } = composedByFixture.get(fixture.key).get(seed);
        const ratio = wcagRatio(hexLum(plan.palette.text), hexLum(plan.palette.background));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("plan-level seed-diversity pre-filter: distinct (structure|treatment|voice) tuples per fixture", () => {
    for (const fixture of fixtures) {
      const tuples = new Set(
        PLAN_SEEDS.map((seed) => {
          const s = cellSummary(composedByFixture.get(fixture.key).get(seed).plan);
          return `${s.structure}|${s.treatment}|${s.voice}`;
        }),
      );
      expect(tuples.size).toBeGreaterThanOrEqual(GATES.perceptual.minPlanTuples);
    }
  });

  test("cards render through the real template with vendored fonts (no CDN reference)", () => {
    const fixture = fixtures[0];
    const composed = composedByFixture.get(fixture.key).get("seed-1");
    const fontsCss = fontsCssForCard(tmpDir, [
      composed.plan.typography.display,
      composed.plan.typography.body,
    ]);
    const html = renderCardHtml(fixture, composed, fontsCss);
    expect(html).toContain("comp-card-page");
    expect(html).toContain('id="front"');
    expect(html).toContain('id="back"');
    // Vendored fonts path taken — the Google Fonts fallback never renders.
    expect(html).toContain("../fonts/");
    expect(html).not.toContain("fonts.googleapis.com");
    // Fixture images resolve relative for file:// and Puppeteer alike.
    expect(html).toContain("../fixtures/");
    // The copied TTFs exist next to the cards.
    const referenced = [...html.matchAll(/url\('\.\.\/fonts\/([^']+)'\)/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(0);
    for (const file of referenced) {
      expect(fs.existsSync(path.join(tmpDir, "fonts", file))).toBe(true);
    }
  });

  test("gate thresholds are config-driven and sane", () => {
    expect(GATES.contrast.classes.length).toBeGreaterThan(0);
    expect(GATES.contrast.enforceEngineTarget).toBe(false); // flips in phase 2
    for (const cls of GATES.contrast.classes) {
      expect(bindingContrastFloor(cls.id, cls.minRatio)).toBeGreaterThan(1);
      expect(bindingContrastFloor(cls.id, cls.minRatio)).toBeLessThanOrEqual(cls.minRatio);
    }
    expect(GATES.perceptual.minConsecutiveDistance).toBeGreaterThan(0);
    expect(GATES.perceptual.minConsecutiveDistance).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — rasterized gates (browser; opt-in like shaping-parity)
// ---------------------------------------------------------------------------
const describeBrowser =
  process.env.GALLERY_GATES_BROWSER === "1" ? describe : describe.skip;

describeBrowser(
  "SKIPPED unless GALLERY_GATES_BROWSER=1: rasterized contrast + perceptual distance gates",
  () => {
    jest.setTimeout(600000);

    let result;

    beforeAll(async () => {
      // Full rig into the repo gallery/ (gitignored): the test regenerates
      // the review artifact and gates it — same artifacts CI diffs.
      result = await rig.runGallery({ seeds: 6, withBrowser: true, quiet: true });
    });

    test("rig produced the full artifact set", () => {
      const { outDir } = result;
      for (const file of ["index.html", "contact-sheet.png", "plans.json", "metrics.json"]) {
        expect(fs.existsSync(path.join(outDir, file))).toBe(true);
      }
      for (const row of result.grid) {
        for (const cell of row.cells) {
          expect(fs.existsSync(path.join(outDir, "cards", `${cell.name}.html`))).toBe(true);
          expect(fs.existsSync(path.join(outDir, "shots", `${cell.name}-front.png`))).toBe(true);
          expect(fs.existsSync(path.join(outDir, "shots", `${cell.name}-back.png`))).toBe(true);
        }
      }
    });

    test("RASTERIZED CONTRAST GATE: sampled pixels behind every front text element clear the binding floor", () => {
      const failures = [];
      let sampled = 0;
      for (const [card, samples] of Object.entries(result.metrics.contrast)) {
        // every card front must expose at least the name to the sampler
        expect(samples.length).toBeGreaterThan(0);
        for (const s of samples) {
          sampled += 1;
          const floor = bindingContrastFloor(s.class, s.targetRatio);
          if (s.minRatio < floor) {
            failures.push(
              `${card}: "${s.text}" (${s.sizePt}pt ${s.class}) measured ${s.minRatio}:1 < binding ${floor.toFixed(2)}:1`,
            );
          }
        }
      }
      expect(sampled).toBeGreaterThanOrEqual(result.grid.length * 6); // every cell sampled
      expect(failures).toEqual([]);
    });

    test("PERCEPTUAL DISTANCE GATE: consecutive-seed fronts exceed the anti-collapse floor", () => {
      // The floor is mode-aware: it BINDS under editions (the anti-collapse
      // gate, 0.12) and is record-only for the legacy baseline (0), which
      // knowingly near-collapses. Use the floor the rig actually applied.
      const floor = result.metrics.activePerceptualFloor;
      const failures = [];
      for (const [fixtureKey, data] of Object.entries(result.metrics.perceptual)) {
        expect(data.matrix).toHaveLength(6);
        for (const c of data.consecutive) {
          if (c.pixelmatch < floor) {
            failures.push(`${fixtureKey} ${c.pair}: ${c.pixelmatch} < ${floor}`);
          }
        }
        // the matrix is symmetric with a zero diagonal (sanity)
        for (let i = 0; i < data.matrix.length; i++) {
          expect(data.matrix[i][i].pixelmatch).toBe(0);
          for (let j = i + 1; j < data.matrix.length; j++) {
            expect(data.matrix[i][j].pixelmatch).toBeCloseTo(data.matrix[j][i].pixelmatch, 6);
          }
        }
      }
      expect(failures).toEqual([]);
    });

    test("metrics.json records the distance matrices + contrast samples for drift review", () => {
      const persisted = JSON.parse(
        fs.readFileSync(path.join(result.outDir, "metrics.json"), "utf8"),
      );
      expect(persisted.engineVersion).toBe(result.metrics.engineVersion);
      expect(Object.keys(persisted.perceptual).sort()).toEqual(
        result.grid.map((r) => r.key).sort(),
      );
      expect(persisted.gates.perceptual.minConsecutiveDistance).toBe(
        GATES.perceptual.minConsecutiveDistance,
      );
    });
  },
);
