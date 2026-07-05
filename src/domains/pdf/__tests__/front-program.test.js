/**
 * Front-page design-program synthesis tests.
 *
 * The load-bearing claim: hundreds of STRUCTURALLY DISTINCT premium fronts
 * from a grammar of primitives — not families with parameter tweaks. These
 * tests assert distinctness at scale, determinism, validity invariants, and
 * pixel-exact type safety (no name on a face, ever).
 */

const {
  designFrontProgram,
  sampleProgram,
  structuralSignature,
  scoreOverPhoto,
  PAGE_W,
  PAGE_H,
} = require("../composition/front-program/synthesize");

// Realistic studio forensics: uniform dark backdrop, centered subject column
// around a measured focal point. (Same shape the director fixtures use.)
function studioForensics({ focal = { x: 0.5, y: 0.55 } } = {}) {
  const grid = Array.from({ length: 9 }, () => Array.from({ length: 6 }, () => 0.16));
  const detail = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) => (r >= 3 && r <= 8 && c >= 2 && c <= 3 ? 0.85 : 0.04)),
  );
  return {
    width: 2000, height: 3000, aspect: 0.667,
    luma: { rows: 9, cols: 6, grid, mean: 0.2, isDark: true },
    detail: { grid: detail },
    quiet: {
      top: { score: 0.95, bandRows: 3 },
      bottom: { score: 0.55, bandRows: 2 },
      left: { score: 0.4, bandCols: 2 },
      right: { score: 0.4, bandCols: 2 },
    },
    palette: [{ hex: "#6E4A30", population: 0.4, sat: 0.4, luma: 0.3 }],
    warmth: 0.2, saturation: 0.3, contrast: 0.6,
    focal, version: 2,
  };
}

function ctx(overrides = {}) {
  return {
    heroAspect: 0.667,
    heroForensics: studioForensics(),
    palette: { background: "#FAF8F5", text: "#1A1815", muted: "#6B6560", accent: "#B8956A" },
    typography: { display: "Playfair Display" },
    nameText: "Ana Petrova",
    nameMetrics: { advanceEm: 0.6, trackingEm: 0.12 },
    contactLine: "Paris · @anapetrova",
    language: { toneVector: { formality: 0.6, energy: 0.5, warmth: 0.45, density: 0.45 }, pacing: 1 },
    brief: null,
    ...overrides,
  };
}

describe("structural variety at scale", () => {
  test("200 seeds yield many distinct structural signatures (not 6 families)", () => {
    const sigs = new Set();
    for (let i = 0; i < 200; i++) {
      const { signature } = designFrontProgram(ctx(), { seed: `v-${i}`, candidates: 1 });
      sigs.add(signature);
    }
    // Far beyond a handful of motif families. Continuous geometry means the
    // signature (which abstracts coordinates) still varies widely.
    expect(sigs.size).toBeGreaterThan(20);
  });

  test("element-set composition varies across seeds (ghost/contact/orientation mix)", () => {
    const recipes = new Set();
    for (let i = 0; i < 120; i++) {
      const { program } = designFrontProgram(ctx({ brief: { risk: 0.7 } }), { seed: `r-${i}`, candidates: 1 });
      recipes.add(program.elements.map((e) => e.type).sort().join("+"));
    }
    expect(recipes.size).toBeGreaterThan(6);
  });

  test("two talents on the same seed get different programs", () => {
    const a = designFrontProgram(ctx({ nameText: "Ada Lin" }), { seed: "same" });
    const b = designFrontProgram(ctx({ nameText: "Bo Vance" }), { seed: "same" });
    expect(JSON.stringify(a.program)).not.toBe(JSON.stringify(b.program));
  });
});

describe("determinism", () => {
  test("same ctx + seed ⇒ deep-equal program", () => {
    const a = designFrontProgram(ctx(), { seed: "d1" });
    const b = designFrontProgram(ctx(), { seed: "d1" });
    expect(a).toEqual(b);
  });
});

describe("validity invariants (every shipped program)", () => {
  test("across 150 seeds: a photo + a name always exist, in bounds, hero-led", () => {
    for (let i = 0; i < 150; i++) {
      const { program } = designFrontProgram(ctx(), { seed: `inv-${i}`, candidates: 3 });
      const photo = program.elements.find((e) => e.type === "photo");
      const name = program.elements.find((e) => e.type === "name");
      expect(photo).toBeTruthy();
      expect(name).toBeTruthy();
      // hero-led: photo covers a dominant share of the page
      const cov = (photo.rect.w * photo.rect.h) / (PAGE_W * PAGE_H);
      expect(cov).toBeGreaterThan(0.35);
      // all elements within the page
      for (const e of program.elements) {
        if (!e.rect) continue;
        expect(e.rect.x).toBeGreaterThanOrEqual(-0.45);
        expect(e.rect.y).toBeGreaterThanOrEqual(-0.45);
        expect(e.rect.x + e.rect.w).toBeLessThanOrEqual(PAGE_W + 0.45);
        expect(e.rect.y + e.rect.h).toBeLessThanOrEqual(PAGE_H + 0.45);
      }
    }
  });
});

describe("pixel-exact type safety — production blocker", () => {
  test("no on-photo name ever intersects the face zone (200 seeds)", () => {
    // Face high in frame so any careless top placement would hit it.
    const f = studioForensics({ focal: { x: 0.5, y: 0.22 } });
    for (let i = 0; i < 200; i++) {
      const { program } = designFrontProgram(ctx({ heroForensics: f }), { seed: `face-${i}`, candidates: 2 });
      const photo = program.elements.find((e) => e.type === "photo");
      for (const name of program.elements.filter((e) => e.type === "name")) {
        if (!name.onPhoto) continue; // on paper is always safe
        const place = scoreOverPhoto(name.rect, photo.rect, f);
        // the face is inviolable for EVERY motif, including the deliberate
        // split-zone overlay
        expect(place.faceOverlap).toBe(false);
        // the subject-occupancy cap governs the generic register only: the
        // split-zone first name is a deliberate, contrast-verified overlay
        // on the subject's lower frame (reference: editorial split-name
        // cards) and is exempt by design.
        if (name.role !== "split-first") {
          expect(place.subjectOccupancy).toBeLessThanOrEqual(0.34 + 1e-6);
        }
      }
    }
  });

  test("no forensics ⇒ name never placed on the photo", () => {
    for (let i = 0; i < 40; i++) {
      const { program } = designFrontProgram(ctx({ heroForensics: null }), { seed: `nf-${i}`, candidates: 2 });
      // without forensics the split motif is refused too — every name
      // stays on paper
      for (const name of program.elements.filter((e) => e.type === "name")) {
        expect(name.onPhoto).toBe(false);
      }
    }
  });
});

// Synthetic subject-coverage matte (row 0 = top): subject is a centered
// column; the top band and the lower-left quadrant are true negative space.
function matteGrid() {
  const rows = 18;
  const cols = 12;
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const centerCol = c >= 4 && c <= 7;
      const body = r >= 4;
      return centerCol && body ? 0.9 : 0.0;
    }),
  );
}

describe("P3 matte-dependent layers (gated on a real matte)", () => {
  test("cutout structure only appears WITH a matte, never without", () => {
    let cutoutNoMatte = 0;
    for (let i = 0; i < 120; i++) {
      const { program } = designFrontProgram(ctx({ brief: { risk: 0.9 } }), { seed: `nm-${i}`, candidates: 1 });
      if (program.structure === "cutout") cutoutNoMatte += 1;
    }
    expect(cutoutNoMatte).toBe(0);

    let cutoutWithMatte = 0;
    for (let i = 0; i < 120; i++) {
      const { program } = designFrontProgram(ctx({ matteGrid: matteGrid(), brief: { risk: 0.9 } }), { seed: `wm-${i}`, candidates: 1 });
      if (program.structure === "cutout") cutoutWithMatte += 1;
    }
    expect(cutoutWithMatte).toBeGreaterThan(0);
  });

  test("matte negative-space name placement stays out of subject columns", () => {
    const mg = matteGrid();
    for (let i = 0; i < 60; i++) {
      const { program } = designFrontProgram(ctx({ matteGrid: mg, heroForensics: studioForensics() }), { seed: `mns-${i}`, candidates: 1 });
      const name = program.elements.find((e) => e.type === "name" && !e.role);
      const photo = program.elements.find((e) => e.type === "photo");
      if (!name || !name.onPhoto) continue;
      // the name center must not fall in the dense subject column band
      const cx = (name.rect.x + name.rect.w / 2 - photo.rect.x) / photo.rect.w;
      const cy = (name.rect.y + name.rect.h / 2 - photo.rect.y) / photo.rect.h;
      if (cy > 0.22) { // below the clear top band → must avoid center cols
        expect(cx < 0.33 || cx > 0.67).toBe(true);
      }
    }
  });

  test("knockout band, when present, sits behind the name and spans the hero", () => {
    let saw = false;
    for (let i = 0; i < 80; i++) {
      const { program } = designFrontProgram(
        ctx({ matteGrid: matteGrid(), language: { toneVector: { formality: 0.4, energy: 0.95, warmth: 0.5, density: 0.6 } } }),
        { seed: `ko-${i}`, candidates: 1 },
      );
      // the split-zone lockup also uses a band (the accent panel) — this
      // test targets the KNOCKOUT register, so skip split takes.
      if (program.elements.some((e) => e.role === "split-first")) continue;
      const band = program.elements.find((e) => e.type === "band");
      const name = program.elements.find((e) => e.type === "name");
      if (!band) continue;
      saw = true;
      expect(band.z).toBeLessThan(name.z); // band behind the name
      expect(name.color).toBe("#FFFFFF"); // reversed type
    }
    expect(saw).toBe(true);
  });
});

describe("intent conditions distributions, not structure", () => {
  test("higher energy raises layering appetite (more ghost layers on average)", () => {
    const count = (energy, risk) => {
      let g = 0;
      for (let i = 0; i < 80; i++) {
        const { program } = designFrontProgram(
          ctx({ language: { toneVector: { formality: 0.4, energy, warmth: 0.5, density: 0.5 } }, brief: { risk } }),
          { seed: `e-${energy}-${i}`, candidates: 1 },
        );
        // layering appetite now expresses through two premium motifs: the
        // ghost echo and the split-zone lockup
        if (program.elements.some((e) => e.type === "ghost" || e.role === "split-first")) g += 1;
      }
      return g;
    };
    expect(count(0.9, 0.85)).toBeGreaterThan(count(0.1, 0.05));
  });
});
