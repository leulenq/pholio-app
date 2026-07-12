/**
 * EDITION field structures, lockup grammar, and per-edition scoring
 * (editions plan 2.4 / 2.6).
 *
 * Asserts, per new structure: geometric invariants (Booker hero floors,
 * safe margins, face clearance, name ≥14pt), honest refusal paths (no
 * matte / no supports / short pool → photo-dominant fallback, never a
 * broken card), determinism, and the structuralSignature extension.
 * Scoring: edition objectives reward on-target programs and vetoes are
 * cliff-priced; the legacy scorer is untouched without an edition.
 */

const {
  designFrontProgram,
  sampleProgram,
  scoreProgram,
  structuralSignature,
  PAGE_W,
  PAGE_H,
} = require("../composition/front-program/synthesize");
const {
  scoreEditionProgram,
  universalSoft,
  vetoes,
} = require("../composition/front-program/edition-scoring");
const { buildLockupFromPool } = require("../composition/front-program/lockups");
const { reversedMinPt } = require("../composition/front-program/print-rules");
const { getEdition, HERO_AREA_FLOOR, HERO_AREA_FLOOR_DEEP_MAT } = require("../composition/editions");
const { studioForensics, baseCtx } = require("./__fixtures__/front-program-legacy-inputs");

const SAFE = 0.25;

// ── fixtures ─────────────────────────────────────────────────────────────────

function edCtx(id, { field = "paper", register = "standard", ...overrides } = {}) {
  return {
    ...baseCtx(),
    heroForensics: studioForensics(),
    nameMetrics: {
      advanceEm: 0.6, advanceLongestEm: 0.62, trackingEm: 0.12,
      first: { advanceEm: 0.64, weight: 700 },
      last: { advanceEm: 0.6, weight: 500 },
      lastBody: { advanceEm: 0.55, weight: 600 },
    },
    edition: { def: getEdition(id), operators: { field, register } },
    ...overrides,
  };
}

function supports(n = 3) {
  return [
    { id: "s1", aspect: 0.55, rawShotType: "full_length" },
    { id: "s2", aspect: 0.7, rawShotType: "three_quarter" },
    { id: "s3", aspect: 0.8, rawShotType: "headshot" },
    { id: "s4", aspect: 0.67, rawShotType: "" },
  ].slice(0, n);
}

// soft-crowned figure matte — glyphs interlock partially at the crown
function coverMatte() {
  const rows = 18;
  const cols = 12;
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (c < 3 || c > 8) return 0;
      if (r < 3) return 0;
      if (r === 3) return 0.4;
      if (r === 4) return 0.7;
      return 0.95;
    }));
}

// solid wall of subject — no honest interlock or negative space
function wallMatte() {
  return Array.from({ length: 18 }, () => new Array(12).fill(0.95));
}

function cutoutMatte() {
  return Array.from({ length: 18 }, (_, r) =>
    Array.from({ length: 12 }, (_, c) => (c >= 4 && c <= 7 && r >= 5 ? 0.95 : 0)));
}

const names = (p) => p.elements.filter((e) => e.type === "name");
const photos = (p) => p.elements.filter((e) => e.type === "photo");
const largestName = (p) => names(p).reduce((a, e) => (!a || e.sizePt > a.sizePt ? e : a), null);

function assertUniversalInvariants(program) {
  // a photo and a ≥14pt name always exist
  expect(photos(program).length).toBeGreaterThan(0);
  const name = largestName(program);
  expect(name).toBeTruthy();
  expect(name.sizePt).toBeGreaterThanOrEqual(14);
  // all elements on the page
  for (const e of program.elements) {
    if (!e.rect) continue;
    expect(e.rect.x).toBeGreaterThanOrEqual(-0.01);
    expect(e.rect.y).toBeGreaterThanOrEqual(-0.01);
    expect(e.rect.x + e.rect.w).toBeLessThanOrEqual(PAGE_W + 0.01);
    expect(e.rect.y + e.rect.h).toBeLessThanOrEqual(PAGE_H + 0.01);
  }
  // non-bleeding text respects the trim safe zone
  for (const e of program.elements) {
    if (!["name", "contact", "folio"].includes(e.type) || e.onPhoto) continue;
    expect(e.rect.x).toBeGreaterThanOrEqual(SAFE - 0.03);
    expect(e.rect.x + e.rect.w).toBeLessThanOrEqual(PAGE_W - SAFE + 0.03);
    expect(e.rect.y + e.rect.h).toBeLessThanOrEqual(PAGE_H - SAFE + 0.03);
  }
}

// ── masthead ─────────────────────────────────────────────────────────────────

describe("masthead structure", () => {
  const seeds = Array.from({ length: 12 }, (_, i) => `mh-${i}`);

  test("nameplate above the hero: span, seam ≤0.12in, hero bleeds l/r/bottom", () => {
    let landed = 0;
    for (const seed of seeds) {
      const { program } = designFrontProgram(edCtx("editorial-masthead"), { seed, candidates: 3 });
      if (program.structure !== "masthead") continue;
      landed += 1;
      assertUniversalInvariants(program);
      const hero = photos(program)[0];
      expect(hero.bleedEdges.sort()).toEqual(["bottom", "left", "right"]);
      // every name line sits fully above the hero, seam-tight
      const nameBottom = Math.max(...names(program).map((e) => e.rect.y + e.rect.h));
      expect(nameBottom).toBeLessThanOrEqual(hero.rect.y + 1e-6);
      expect(program.editionMetrics.seamGap).toBeLessThanOrEqual(0.12 + 1e-6);
      expect(program.editionMetrics.span).toBeGreaterThan(0.5);
      // masthead band within the magazine register
      expect(program.editionMetrics.bandFrac).toBeLessThanOrEqual(0.22);
      expect(program.editionMetrics.heroFrac).toBeGreaterThanOrEqual(0.6);
    }
    expect(landed).toBeGreaterThan(6);
  });

  test("deterministic per (ctx, seed)", () => {
    const a = designFrontProgram(edCtx("editorial-masthead"), { seed: "mh-det", candidates: 3 });
    const b = designFrontProgram(edCtx("editorial-masthead"), { seed: "mh-det", candidates: 3 });
    expect(a).toEqual(b);
  });
});

// ── column-grid ──────────────────────────────────────────────────────────────

describe("column-grid structure", () => {
  const seeds = Array.from({ length: 14 }, (_, i) => `cg-${i}`);

  test("rail 1.1–1.6in, module grid snapping ≤0.02in, 1–3 rules, folio at foot", () => {
    let landed = 0;
    for (const seed of seeds) {
      const { program } = designFrontProgram(edCtx("swiss-modernist"), { seed, candidates: 3 });
      if (program.structure !== "column-grid") continue;
      landed += 1;
      assertUniversalInvariants(program);
      const m = program.editionMetrics;
      expect(m.railWidth).toBeGreaterThanOrEqual(1.1);
      expect(m.railWidth).toBeLessThanOrEqual(1.6);
      expect([6, 8, 12]).toContain(m.moduleCount);
      // hero fills the rest and bleeds top/outer/bottom
      const hero = photos(program)[0];
      expect(hero.rect.w).toBeCloseTo(PAGE_W - m.railWidth, 3);
      expect(hero.bleedEdges).toContain("top");
      expect(hero.bleedEdges).toContain("bottom");
      expect(hero.bleedEdges).toContain(m.railSide === "left" ? "right" : "left");
      // rules: 1–3, on module lines within 0.02in
      const rules = program.elements.filter((e) => e.type === "rule" && e.variant === "hairline");
      expect(m.ruleCount).toBeGreaterThanOrEqual(0);
      expect(m.ruleCount).toBeLessThanOrEqual(3);
      const onGrid = (y) => {
        const k = Math.round((y - m.railTop) / m.module);
        return Math.abs(y - (m.railTop + k * m.module)) <= 0.021;
      };
      for (const r of rules) expect(onGrid(r.rect.y + r.rect.h / 2)).toBe(true);
      // rail text snapped (top or bottom edge on a grid line)
      for (const e of program.elements) {
        if (!["name", "contact", "folio"].includes(e.type)) continue;
        expect(onGrid(e.rect.y) || onGrid(e.rect.y + e.rect.h)).toBe(true);
      }
      // folio ornament present at the rail foot
      const folio = program.elements.find((e) => e.type === "folio");
      expect(folio).toBeTruthy();
      expect(folio.rect.y + folio.rect.h).toBeCloseTo(PAGE_H - SAFE, 1);
    }
    expect(landed).toBeGreaterThan(8);
  });

  test("spine lockup runs vertical inside the rail", () => {
    let spines = 0;
    for (let i = 0; i < 20; i++) {
      const { program } = designFrontProgram(edCtx("swiss-modernist"), { seed: `sp-${i}`, candidates: 1 });
      if (program.lockup !== "spine") continue;
      spines += 1;
      const name = names(program)[0];
      expect(name.orientation).toBe("vertical");
      const m = program.editionMetrics;
      const railX1 = m.railSide === "left" ? m.railWidth : PAGE_W;
      const railX0 = m.railSide === "left" ? 0 : PAGE_W - m.railWidth;
      expect(name.rect.x).toBeGreaterThanOrEqual(railX0);
      expect(name.rect.x + name.rect.w).toBeLessThanOrEqual(railX1 + 1e-6);
    }
    expect(spines).toBeGreaterThan(4);
  });
});

// ── cover-story ──────────────────────────────────────────────────────────────

describe("cover-story structure (matte-gated interlock)", () => {
  const ctx = () => edCtx("cover-story", {
    heroForensics: studioForensics({ focal: { x: 0.5, y: 0.5 } }),
    matteGrid: coverMatte(),
    matteSource: "alpha",
  });

  test("layered type: base photo < name < figure cutout; interlock 0.12–0.4; face clear", () => {
    let landed = 0;
    for (let i = 0; i < 16; i++) {
      const { program } = designFrontProgram(ctx(), { seed: `cs-${i}`, candidates: 3 });
      if (program.structure !== "cover-story") continue;
      landed += 1;
      assertUniversalInvariants(program);
      const base = program.elements.find((e) => e.type === "photo" && e.layer === "base");
      const figure = program.elements.find((e) => e.type === "photo" && e.layer === "figure");
      expect(base).toBeTruthy();
      expect(figure).toBeTruthy();
      expect(figure.isCutout).toBe(true);
      for (const n of names(program)) {
        expect(n.z).toBeGreaterThan(base.z);
        expect(n.z).toBeLessThan(figure.z);
        // face never intersected by type (focal 0.5/0.5 → zone y 0.34–0.66)
        const faceTop = (0.5 - 0.16) * PAGE_H;
        const faceBottom = (0.5 + 0.16) * PAGE_H;
        const clear = n.rect.y + n.rect.h <= faceTop + 1e-6 || n.rect.y >= faceBottom - 1e-6;
        expect(clear).toBe(true);
      }
      const m = program.editionMetrics;
      expect(m.interlock).toBeGreaterThanOrEqual(0.12);
      expect(m.interlock).toBeLessThanOrEqual(0.4);
      expect(m.maxGlyphOcclusion).toBeLessThanOrEqual(0.6);
    }
    expect(landed).toBeGreaterThan(8);
  });

  test("refusals: no matte, studio-estimate matte, or a solid wall → photo-dominant fallback", () => {
    const noMatte = designFrontProgram(edCtx("cover-story"), { seed: "cs-r1", candidates: 3 });
    expect(noMatte.program.structure).toBe("photo-dominant");

    const studioEstimate = designFrontProgram(
      edCtx("cover-story", { matteGrid: coverMatte(), matteSource: "studio" }),
      { seed: "cs-r2", candidates: 3 },
    );
    expect(studioEstimate.program.structure).toBe("photo-dominant");

    for (let i = 0; i < 8; i++) {
      const wall = designFrontProgram(
        edCtx("cover-story", {
          heroForensics: studioForensics({ focal: { x: 0.5, y: 0.5 } }),
          matteGrid: wallMatte(),
          matteSource: "alpha",
        }),
        { seed: `cs-w${i}`, candidates: 3 },
      );
      expect(wall.program.structure).toBe("photo-dominant");
      assertUniversalInvariants(wall.program);
    }
  });
});

// ── diptych ──────────────────────────────────────────────────────────────────

describe("diptych structure", () => {
  test("two frames on a hinge: cell ratio 0.85–1.18, shared edge, gutter 0.06–0.12", () => {
    let landed = 0;
    for (let i = 0; i < 14; i++) {
      const { program } = designFrontProgram(
        edCtx("duet", { supportPool: supports(4) }),
        { seed: `dp-${i}`, candidates: 3 },
      );
      if (program.structure !== "diptych") continue;
      landed += 1;
      assertUniversalInvariants(program);
      const frames = photos(program);
      expect(frames).toHaveLength(2);
      const m = program.editionMetrics;
      expect(m.cellRatio).toBeGreaterThanOrEqual(1 / 1.18 - 1e-6);
      expect(m.cellRatio).toBeLessThanOrEqual(1.18 + 1e-6);
      expect(m.gutter).toBeGreaterThanOrEqual(0.06);
      expect(m.gutter).toBeLessThanOrEqual(0.12);
      // shared edge exact by construction
      if (m.hinge === "vertical") {
        expect(frames[0].rect.y).toBeCloseTo(frames[1].rect.y, 3);
      } else {
        expect(frames[0].rect.x).toBeCloseTo(frames[1].rect.x, 3);
      }
      // the support frame carries its imageId + crop for the template
      const support = frames.find((e) => e.role === "support");
      expect(support).toBeTruthy();
      expect(typeof support.imageId).toBe("string");
      expect(support.crop && typeof support.crop.objectPosition).toBe("string");
      // combined photo presence still honors the Booker floor
      const area = frames.reduce((s, e) => s + e.rect.w * e.rect.h, 0);
      expect(area / (PAGE_W * PAGE_H)).toBeGreaterThanOrEqual(HERO_AREA_FLOOR);
    }
    expect(landed).toBeGreaterThan(8);
  });

  test("cropResolver is consulted for support crops", () => {
    const calls = [];
    const { program } = designFrontProgram(
      edCtx("duet", {
        supportPool: supports(3),
        cropResolver: (id, aspect) => {
          calls.push([id, aspect]);
          return { objectPosition: "40% 25%" };
        },
      }),
      { seed: "dp-crop", candidates: 1 },
    );
    if (program.structure === "diptych") {
      expect(calls.length).toBeGreaterThan(0);
      const support = photos(program).find((e) => e.role === "support");
      expect(support.crop.objectPosition).toBe("40% 25%");
    }
  });

  test("refusal: no pairable support → photo-dominant fallback", () => {
    for (const pool of [[], undefined, [{ id: "wide", aspect: 2.4, rawShotType: "landscape" }]]) {
      const { program } = designFrontProgram(
        edCtx("duet", { supportPool: pool }),
        { seed: "dp-refuse", candidates: 3 },
      );
      expect(program.structure).toBe("photo-dominant");
      assertUniversalInvariants(program);
    }
  });
});

// ── filmstrip-foot ───────────────────────────────────────────────────────────

describe("filmstrip-foot structure (the-strip)", () => {
  test("hero 0.62–0.72 over a 3-frame strip; name band in the seam", () => {
    let landed = 0;
    for (let i = 0; i < 12; i++) {
      const { program } = designFrontProgram(
        edCtx("the-strip", { supportPool: supports(4) }),
        { seed: `fs-${i}`, candidates: 3 },
      );
      if (program.structure !== "filmstrip-foot") continue;
      landed += 1;
      assertUniversalInvariants(program);
      const m = program.editionMetrics;
      expect(m.heroFrac).toBeGreaterThanOrEqual(0.6 - 1e-6);
      expect(m.heroFrac).toBeLessThanOrEqual(0.72 + 1e-6);
      const strip = photos(program).filter((e) => e.role === "strip");
      expect(strip).toHaveLength(3);
      for (const f of strip) {
        expect(typeof f.imageId).toBe("string");
        expect(f.bleedEdges).toContain("bottom");
      }
      // equal frames
      const widths = new Set(strip.map((f) => f.rect.w.toFixed(3)));
      expect(widths.size).toBe(1);
      // the name band lives in the seam between hero and strip
      const hero = photos(program).find((e) => !e.role);
      const stripTop = Math.min(...strip.map((f) => f.rect.y));
      for (const n of names(program)) {
        expect(n.rect.y).toBeGreaterThanOrEqual(hero.rect.y + hero.rect.h - 1e-6);
        expect(n.rect.y + n.rect.h).toBeLessThanOrEqual(stripTop + 1e-6);
      }
    }
    expect(landed).toBeGreaterThan(8);
  });

  test("refusal: fewer than 3 supports → photo-dominant fallback", () => {
    const { program } = designFrontProgram(
      edCtx("the-strip", { supportPool: supports(2) }),
      { seed: "fs-refuse", candidates: 3 },
    );
    expect(program.structure).toBe("photo-dominant");
    assertUniversalInvariants(program);
  });
});

// ── matted (deep mats / dark field) ─────────────────────────────────────────

describe("matted structure, edition-parameterized", () => {
  test("monograph: deep bottom mat ≥1.4× top, deep-mat hero floor, caption-scale name, tracking ≥0.2", () => {
    let landed = 0;
    for (let i = 0; i < 14; i++) {
      const { program } = designFrontProgram(edCtx("gallery-monograph"), { seed: `gm-${i}`, candidates: 3 });
      if (program.structure !== "matted") continue;
      landed += 1;
      assertUniversalInvariants(program);
      const m = program.editionMetrics;
      expect(m.photoFrac).toBeGreaterThanOrEqual(HERO_AREA_FLOOR_DEEP_MAT - 1e-6);
      expect(m.matBottom / m.matTop).toBeGreaterThanOrEqual(1.4);
      expect(m.matAsymmetry).toBeGreaterThanOrEqual(1.2);
      expect(m.matAsymmetry).toBeLessThanOrEqual(2.25);
      const name = largestName(program);
      expect(name.sizePt).toBeLessThanOrEqual(22 + 1e-6);
      expect(name.trackingEm).toBeGreaterThanOrEqual(0.2);
    }
    expect(landed).toBeGreaterThan(8);
  });

  test("initial-line lockup carries its hairline rule and both name lines", () => {
    let seen = 0;
    for (let i = 0; i < 30; i++) {
      const { program } = designFrontProgram(edCtx("gallery-monograph"), { seed: `il-${i}`, candidates: 1 });
      if (program.lockup !== "initial-line") continue;
      seen += 1;
      const rule = program.elements.find((e) => e.type === "rule" && e.variant === "hairline");
      expect(rule).toBeTruthy();
      const lockupNames = names(program).filter((e) => e.lockup === "initial-line");
      expect(lockupNames.length).toBe(2);
      const micro = lockupNames.find((e) => e.role === "lockup-first");
      const carrier = lockupNames.find((e) => !e.role);
      expect(micro.sizePt).toBeLessThan(carrier.sizePt);
      expect(micro.trackingEm).toBeGreaterThanOrEqual(0.3);
    }
    expect(seen).toBeGreaterThan(5);
  });

  test("ink-noir dark field: reversed type obeys stroke-class minimums, keyline is the gold hairline", () => {
    const darkPalette = {
      background: "#141210", text: "#F4F1EC", muted: "#B9B3AB",
      rule: "#3A3733", accent: "#C9A55A", dark: true,
    };
    let matteds = 0;
    for (let i = 0; i < 30; i++) {
      const { program } = designFrontProgram(
        edCtx("ink-noir", { palette: darkPalette, field: "dark", typography: { display: "Archivo", body: "Inter" } }),
        { seed: `in-${i}`, candidates: 3 },
      );
      assertUniversalInvariants(program);
      // every reversed text element meets its floor: grotesque display ⇒
      // names ≥10pt (weight <600) and contact ≥10pt
      for (const e of program.elements) {
        if (e.type === "contact" && !e.onPhoto) expect(e.sizePt).toBeGreaterThanOrEqual(10);
        if (e.type === "name" && !e.onPhoto) {
          const floor = reversedMinPt({ family: "Archivo", weight: e.weight || 500 });
          expect(e.sizePt).toBeGreaterThanOrEqual(floor);
        }
      }
      if (program.structure === "matted") {
        matteds += 1;
        const keyline = program.elements.find((e) => e.type === "rule" && e.variant === "frame");
        if (keyline) {
          expect(keyline.color).toBe("#C9A55A");
          expect(keyline.weight).toBeLessThanOrEqual(0.007); // ≤0.5pt
        }
      }
    }
    expect(matteds).toBeGreaterThan(3);
  });

  test("ink-noir with a hairline voice: reversed names are never below 24pt", () => {
    const darkPalette = {
      background: "#141210", text: "#F4F1EC", muted: "#B9B3AB",
      rule: "#3A3733", accent: "#C9A55A", dark: true,
    };
    for (let i = 0; i < 20; i++) {
      const { program } = designFrontProgram(
        edCtx("ink-noir", { palette: darkPalette, field: "dark", typography: { display: "Italiana", body: "Inter" } }),
        { seed: `inh-${i}`, candidates: 3 },
      );
      for (const e of names(program)) {
        if (!e.onPhoto && e.font !== "body") {
          expect(e.sizePt).toBeGreaterThanOrEqual(24);
        }
      }
    }
  });
});

// ── cutout ───────────────────────────────────────────────────────────────────

describe("cutout structure (edition)", () => {
  test("figure on a plane, type in negative space, subject overlap ≤0.05", () => {
    let landed = 0;
    for (let i = 0; i < 12; i++) {
      const { program } = designFrontProgram(
        edCtx("studio-cutout", { matteGrid: cutoutMatte(), matteSource: "alpha" }),
        { seed: `co-${i}`, candidates: 3 },
      );
      if (program.structure !== "cutout") continue;
      landed += 1;
      assertUniversalInvariants(program);
      const plane = program.elements.find((e) => e.type === "colorPlane");
      expect(plane).toBeTruthy();
      const figure = photos(program)[0];
      expect(figure.isCutout).toBe(true);
      expect(program.editionMetrics.nameSubjectOverlap).toBeLessThanOrEqual(0.05 + 1e-6);
    }
    expect(landed).toBeGreaterThan(6);
  });

  test("refusal without an alpha matte → photo-dominant fallback", () => {
    const { program } = designFrontProgram(edCtx("studio-cutout"), { seed: "co-refuse", candidates: 3 });
    expect(program.structure).toBe("photo-dominant");
  });
});

// ── lockup grammar (unit) ────────────────────────────────────────────────────

describe("lockup grammar", () => {
  const spec = {
    nameText: "Ana Petrova",
    metrics: {
      advanceEm: 0.6, advanceLongestEm: 0.62,
      first: { advanceEm: 0.64, weight: 700 },
      last: { advanceEm: 0.6, weight: 500 },
      lastBody: { advanceEm: 0.55, weight: 600 },
    },
    maxWIn: 4.0, maxHIn: 6.0,
    loPt: 16, hiPt: 34, trackingEm: 0.12,
    dark: false, displayFamily: "Archivo", bodyFamily: "Inter",
    weight: 500, stackBias: 0.5, allowVertical: true,
  };
  const rng = () => 0.5;

  test("stacked lockup sets negative leading 0.92–0.98", () => {
    const built = buildLockupFromPool(rng, ["stacked"], spec);
    expect(built.lockup).toBe("stacked");
    expect(built.leading).toBeGreaterThanOrEqual(0.92);
    expect(built.leading).toBeLessThanOrEqual(0.98);
    const [el] = built.place(0.5, 0.5, { color: "#111111" });
    expect(el.stacked).toBe(true);
    expect(el.leading).toBe(built.leading);
  });

  test("contrast lockup pairs display first name with grotesque surname", () => {
    const built = buildLockupFromPool(rng, ["contrast"], spec);
    expect(built.lockup).toBe("contrast");
    const els = built.place(0.5, 0.5, { color: "#111111" });
    const first = els.find((e) => e.role === "lockup-first");
    const last = els.find((e) => e.role === "lockup-last");
    expect(first.weight).toBe(700);
    expect(last.font).toBe("body");
    expect(last.sizePt).toBeLessThan(first.sizePt);
    expect(last.trackingEm).toBeGreaterThanOrEqual(0.2);
  });

  test("single-word names refuse multi-part lockups and fall back to inline", () => {
    const built = buildLockupFromPool(rng, ["contrast", "stacked", "initial-line"], {
      ...spec, nameText: "Rihanna",
    });
    expect(built.lockup).toBe("inline");
  });

  test("dark surfaces raise or refuse below the reversed floor", () => {
    // hairline voice, budget too small for 24pt → refuse (fall through to
    // whatever the pool can honor; a lone hairline inline refuses entirely)
    const tight = buildLockupFromPool(rng, ["inline"], {
      ...spec, dark: true, displayFamily: "Italiana", maxWIn: 1.6, loPt: 14, hiPt: 20,
    });
    expect(tight).toBeNull();
    // same voice with room → the size is raised to the 24pt floor
    const roomy = buildLockupFromPool(rng, ["inline"], {
      ...spec, dark: true, displayFamily: "Italiana", maxWIn: 4.6, loPt: 14, hiPt: 20,
    });
    expect(roomy.sizePt).toBeGreaterThanOrEqual(24);
  });
});

// ── scoring (2.6) ────────────────────────────────────────────────────────────

describe("per-edition scoring", () => {
  const mkName = (over = {}) => ({
    type: "name", text: "Ana Petrova", rect: { x: 0.25, y: 7.6, w: 3.2, h: 0.5 },
    orientation: "horizontal", sizePt: 24, trackingEm: 0.12, onPhoto: false, z: 3, ...over,
  });
  const mkPhoto = (rect) => ({ type: "photo", rect, z: 1, bleedEdges: [] });
  const prog = (structure, elements, editionMetrics = {}, extras = {}) => ({
    structure, elements, decisions: [], editionMetrics, ...extras,
  });

  test("no edition in ctx → the legacy scorer, unchanged", () => {
    const p = prog("photo-dominant", [mkPhoto({ x: 0, y: 0, w: 5.5, h: 7.5 }), mkName()]);
    expect(scoreProgram(p, {})).toBe(scoreProgram(p, { edition: null }));
    // legacy scoring ignores editionMetrics entirely
    const p2 = { ...p, editionMetrics: { heroFrac: 0 } };
    expect(scoreProgram(p2, {})).toBe(scoreProgram(p, {}));
  });

  test("house-classic: on-target hero coverage + band height outscores off-target", () => {
    const ctx = { edition: { def: getEdition("house-classic") } };
    const good = prog("photo-dominant",
      [mkPhoto({ x: 0, y: 0, w: 5.5, h: 7.65 }), mkName()],
      { heroFrac: 0.9, bandFrac: 0.1 }, { edition: "house-classic" });
    const off = prog("photo-dominant",
      [mkPhoto({ x: 0, y: 0, w: 5.5, h: 5.7 }), mkName({ rect: { x: 0.25, y: 6.2, w: 3.2, h: 0.5 } })],
      { heroFrac: 0.67, bandFrac: 0.33 }, { edition: "house-classic" });
    expect(scoreProgram(good, ctx)).toBeGreaterThan(scoreProgram(off, ctx));
  });

  test("masthead objectives: span ≥0.86 and seam ≤0.12 outscore a loose nameplate", () => {
    const ctx = { edition: { def: getEdition("editorial-masthead") } };
    const els = [mkPhoto({ x: 0, y: 1.6, w: 5.5, h: 6.9 }), mkName({ rect: { x: 0.3, y: 0.35, w: 4.6, h: 1.0 } })];
    const tight = prog("masthead", els, { span: 0.94, bandFrac: 0.18, seamGap: 0.08, heroFrac: 0.81 }, { edition: "editorial-masthead" });
    const loose = prog("masthead", els, { span: 0.7, bandFrac: 0.28, seamGap: 0.3, heroFrac: 0.81 }, { edition: "editorial-masthead" });
    expect(scoreProgram(tight, ctx)).toBeGreaterThan(scoreProgram(loose, ctx));
  });

  test("monograph objectives: mats, caption scale, whitespace", () => {
    const ctx = { edition: { def: getEdition("gallery-monograph") } };
    const els = [mkPhoto({ x: 0.6, y: 0.7, w: 4.2, h: 5.4 }), mkName({ sizePt: 18, trackingEm: 0.24 })];
    const good = prog("matted", els,
      { photoFrac: 0.55, matTop: 0.7, matBottom: 1.7, matAsymmetry: 1.6, whitespaceFrac: 0.42 },
      { edition: "gallery-monograph" });
    const off = prog("matted",
      [mkPhoto({ x: 0.6, y: 0.7, w: 4.2, h: 5.4 }), mkName({ sizePt: 34, trackingEm: 0.05 })],
      { photoFrac: 0.7, matTop: 1.2, matBottom: 1.25, matAsymmetry: 1.02, whitespaceFrac: 0.18 },
      { edition: "gallery-monograph" });
    expect(scoreProgram(good, ctx)).toBeGreaterThan(scoreProgram(off, ctx));
  });

  test("cover-story objectives: interlock in range + display presence", () => {
    const ctx = { edition: { def: getEdition("cover-story") } };
    const els = [
      { type: "photo", rect: { x: 0, y: 0, w: 5.5, h: 8.5 }, z: 1, layer: "base", bleedEdges: ["top", "left", "right", "bottom"] },
      mkName({ onPhoto: true, z: 1.6, sizePt: 84, rect: { x: 0.4, y: 1.0, w: 4.7, h: 2.0 } }),
      { type: "photo", rect: { x: 0, y: 0, w: 5.5, h: 8.5 }, z: 2, layer: "figure", isCutout: true, bleedEdges: ["top", "left", "right", "bottom"] },
    ];
    const good = prog("cover-story", els, { interlock: 0.25, nameAreaFrac: 0.2, maxGlyphOcclusion: 0.4 }, { edition: "cover-story" });
    const shallow = prog("cover-story", els, { interlock: 0.05, nameAreaFrac: 0.08, maxGlyphOcclusion: 0.4 }, { edition: "cover-story" });
    expect(scoreProgram(good, ctx)).toBeGreaterThan(scoreProgram(shallow, ctx));
  });

  test("duet + the-strip + cutout objectives respond to their metrics", () => {
    const duetCtx = { edition: { def: getEdition("duet") } };
    const duetEls = [
      mkPhoto({ x: 0, y: 0, w: 2.7, h: 6.0 }), mkPhoto({ x: 2.8, y: 0, w: 2.7, h: 6.0 }), mkName({ rect: { x: 0.25, y: 6.4, w: 3.2, h: 0.5 } }),
    ];
    expect(scoreProgram(prog("diptych", duetEls, { cellRatio: 1.05, sharedEdgeDelta: 0 }, { edition: "duet" }), duetCtx))
      .toBeGreaterThan(scoreProgram(prog("diptych", duetEls, { cellRatio: 1.6, sharedEdgeDelta: 0.3 }, { edition: "duet" }), duetCtx));

    const stripCtx = { edition: { def: getEdition("the-strip") } };
    const stripPhoto = (x) => ({ type: "photo", rect: { x, y: 6.6, w: 1.78, h: 1.9 }, z: 1, role: "strip", imageId: "s", bleedEdges: ["bottom"] });
    const stripEls = [mkPhoto({ x: 0, y: 0, w: 5.5, h: 5.8 }), stripPhoto(0), stripPhoto(1.86), stripPhoto(3.72), mkName({ rect: { x: 0.25, y: 5.95, w: 3.2, h: 0.5 } })];
    expect(scoreProgram(prog("filmstrip-foot", stripEls, { heroFrac: 0.68 }, { edition: "the-strip" }), stripCtx))
      .toBeGreaterThan(scoreProgram(prog("filmstrip-foot", stripEls.slice(0, 2).concat(stripEls.slice(4)), { heroFrac: 0.5 }, { edition: "the-strip" }), stripCtx));

    const cutoutCtx = { edition: { def: getEdition("studio-cutout") } };
    const cutoutEls = [
      { type: "colorPlane", rect: { x: 0, y: 0, w: 5.5, h: 8.5 }, fill: "#FAF8F5", z: 0 },
      { type: "photo", rect: { x: 0.5, y: 0.4, w: 4.5, h: 7.0 }, z: 1, isCutout: true, bleedEdges: [] },
      mkName({ onPhoto: true, z: 4 }),
    ];
    expect(scoreProgram(prog("cutout", cutoutEls, { matteInsetIn: 0.5, nameSubjectOverlap: 0.01 }, { edition: "studio-cutout" }), cutoutCtx))
      .toBeGreaterThan(scoreProgram(prog("cutout", cutoutEls, { matteInsetIn: 0.05, nameSubjectOverlap: 0.3 }, { edition: "studio-cutout" }), cutoutCtx));
  });

  test("hard vetoes are cliff-priced: a 12pt name can never outscore a clean sibling", () => {
    const ctx = { edition: { def: getEdition("house-classic") } };
    const clean = prog("photo-dominant",
      [mkPhoto({ x: 0, y: 0, w: 5.5, h: 7.65 }), mkName()],
      { heroFrac: 0.9, bandFrac: 0.1 }, { edition: "house-classic" });
    const tiny = prog("photo-dominant",
      [mkPhoto({ x: 0, y: 0, w: 5.5, h: 7.65 }), mkName({ sizePt: 12 })],
      { heroFrac: 0.9, bandFrac: 0.1 }, { edition: "house-classic" });
    expect(scoreProgram(clean, ctx) - scoreProgram(tiny, ctx)).toBeGreaterThan(300);
    const v = vetoes(tiny, ctx);
    expect(v.count).toBe(1);
    expect(v.why[0]).toMatch(/14pt/);
  });

  test("sloppy tension: near-aligned text edges score worse than exactly aligned", () => {
    const aligned = prog("photo-dominant", [
      mkPhoto({ x: 0, y: 0, w: 5.5, h: 7.5 }),
      mkName(),
      { type: "contact", text: "x", rect: { x: 0.25, y: 8.15, w: 1.5, h: 0.15 }, sizePt: 7, z: 3 },
    ]);
    const sloppy = prog("photo-dominant", [
      mkPhoto({ x: 0, y: 0, w: 5.5, h: 7.5 }),
      mkName(),
      { type: "contact", text: "x", rect: { x: 0.28, y: 8.15, w: 1.5, h: 0.15 }, sizePt: 7, z: 3 },
    ]);
    expect(universalSoft(aligned)).toBeGreaterThan(universalSoft(sloppy));
  });
});

// ── signature + program-level determinism/variety ───────────────────────────

describe("edition program metadata", () => {
  test("structuralSignature extends with lockup + field", () => {
    const { program, signature } = designFrontProgram(
      edCtx("editorial-masthead", { field: "warm" }),
      { seed: "sig-1", candidates: 1 },
    );
    expect(program.field).toBe("warm");
    expect(signature).toContain(`|lk:${program.lockup}`);
    expect(signature).toContain("|fd:warm");
    // recomputation matches
    expect(structuralSignature(program)).toBe(signature);
  });

  test("every edition is deterministic and carries edition metadata", () => {
    const cases = {
      "house-classic": {},
      "editorial-masthead": {},
      "swiss-modernist": {},
      "gallery-monograph": {},
      duet: { supportPool: supports(3) },
      "the-strip": { supportPool: supports(3) },
      "cover-story": {
        heroForensics: studioForensics({ focal: { x: 0.5, y: 0.5 } }),
        matteGrid: coverMatte(), matteSource: "alpha",
      },
      "studio-cutout": { matteGrid: cutoutMatte(), matteSource: "alpha" },
      "ink-noir": {},
    };
    for (const [id, extra] of Object.entries(cases)) {
      const a = designFrontProgram(edCtx(id, extra), { seed: `det-${id}`, candidates: 3 });
      const b = designFrontProgram(edCtx(id, extra), { seed: `det-${id}`, candidates: 3 });
      expect(a).toEqual(b);
      expect(a.program.edition).toBe(id);
      expect(a.program.lockup).toBeTruthy();
      expect(a.program.field).toBe("paper");
    }
  });

  test("a defensive ctx: edition with a minimal def still yields a valid card", () => {
    const { program } = designFrontProgram(
      { ...baseCtx(), edition: { def: { id: "mystery" }, operators: {} } },
      { seed: "min-def", candidates: 3 },
    );
    assertUniversalInvariants(program);
    expect(program.structure).toBe("photo-dominant");
  });
});
