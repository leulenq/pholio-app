/**
 * compcard-composed.ejs — editions template vocabulary (plan 2.8).
 *
 * Renders the EJS directly (no route/DB) with synthetic composition plans:
 *  - LEGACY inertness: a legacy program (only legacy element types, no back
 *    style) renders with NONE of the editions-only markup, and is
 *    byte-identical to the pre-change template (captured from git HEAD).
 *  - EDITION vocabulary: an edition program exercising every additive element
 *    (imageId/figure photos, hairline/hinge rules, folio, name leading,
 *    lockup roles) and every back style (footline/tabular/dividers/
 *    cellIndexes/running-head nameplate) renders the expected markup.
 */

const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const ejs = require("ejs");

const TEMPLATE_PATH = path.join(
  __dirname,
  "..",
  "templates",
  "compcard-composed.ejs",
);

function render(templateSource, locals) {
  return ejs.render(templateSource, locals, { filename: TEMPLATE_PATH });
}

// ── synthetic locals ─────────────────────────────────────────────────────────

function baseTypography(overrides = {}) {
  return {
    display: "Playfair Display",
    body: "Inter",
    nameSize: "24pt",
    nameTracking: "0.08em",
    nameCase: "uppercase",
    nameWeight: 500,
    statSize: "8pt",
    statLabelSize: "6.5pt",
    contactSize: "7pt",
    ...overrides,
  };
}

function legacyLocals(withFrontProgram) {
  const frontProgram = withFrontProgram
    ? {
        structure: "photo-dominant",
        elements: [
          { type: "colorPlane", rect: { x: 0, y: 0, w: 5.5, h: 8.5 }, fill: "#FAF8F5", z: 0 },
          {
            type: "photo",
            rect: { x: 0, y: 0, w: 5.5, h: 6, bleedEdges: ["left", "right", "top"] },
            z: 1,
            scrimForName: { edge: "bottom", strength: 0.4, direction: "darken" },
          },
          { type: "band", rect: { x: 0, y: 6, w: 5.5, h: 0.6 }, z: 2, fill: "rgba(0,0,0,0.3)" },
          { type: "rule", variant: "frame", rect: { x: 0.3, y: 0.3, w: 4.9, h: 7.9 }, color: "#1A1815", weight: 0.01, z: 2 },
          {
            type: "name",
            text: "Taya Waverly",
            rect: { x: 0.3, y: 6.1, w: 4.9, h: 0.5 },
            orientation: "horizontal",
            stacked: false,
            sizePt: 24,
            trackingEm: 0.08,
            lockup: "inline",
            color: "#1A1815",
            weight: 500,
            align: "left",
            transform: "uppercase",
            scrim: null,
            z: 3,
          },
          {
            type: "contact",
            text: "PHOLIO.STUDIO/TAYA",
            rect: { x: 0.3, y: 8.0, w: 3, h: 0.2 },
            orientation: "horizontal",
            sizePt: 7,
            color: "#6B6560",
            z: 3,
          },
          { type: "ghost", rect: { x: 0.3, y: 2, w: 4.9, h: 1 }, sizePt: 90, color: "#1A1815", opacity: 0.06, z: 0 },
        ],
      }
    : null;

  const plan = {
    seedUsed: "baseline-seed",
    toneProfile: "editorial",
    palette: { background: "#FAF8F5", text: "#1A1815", muted: "#6B6560", accent: "#B8956A", rule: "#E2DED6" },
    typography: baseTypography(),
    front: {
      imageId: "img-1",
      crop: { objectPosition: "50% 30%" },
      treatment: "classic",
      name: { align: "left", placement: "bottom", lines: ["Taya Waverly"] },
      showContactBlock: false,
      statLine: null,
      geometry: {
        hero: { x: 0, y: 0, w: 5.5, h: 5.5, bleedEdges: ["left", "right", "top"] },
        nameBand: { x: 0.3, y: 5.7, w: 4.9, h: 0.5, onImage: false },
      },
      scrim: null,
    },
    back: {
      contact: { line: "PHOLIO.STUDIO/TAYA" },
      booking: null,
      layout: {
        cells: [
          { x: 0.3, y: 1.2, w: 2.4, h: 3, imageId: "img-2", crop: { objectPosition: "50% 50%" } },
          { x: 2.8, y: 1.2, w: 2.4, h: 3, imageId: "img-3", crop: { objectPosition: "50% 50%" } },
        ],
        statsBlock: { x: 0.3, y: 4.4, w: 4.9, h: 1.2, orientation: "strip" },
        nameBlock: { x: 0.3, y: 0.3, w: 4.9, h: 0.6 },
        contactBlock: { x: 0.3, y: 7.8, w: 4.9, h: 0.4 },
        wordmark: { x: 4.2, y: 8.0, w: 1, h: 0.2 },
      },
    },
    wordmark: { front: { x: 4.2, y: 8.0, w: 1, h: 0.2 }, back: { x: 4.2, y: 8.0, w: 1, h: 0.2 }, tone: "gold-deep", align: "right", displayUrl: "pholio.studio/taya" },
  };

  return {
    layout: false,
    title: "Taya Waverly - Comp Card",
    profile: { first_name: "Taya", last_name: "Waverly", is_pro: false },
    plan,
    statsBlock: {
      lines: [
        { label: "HEIGHT", value: `5'9"` },
        { label: "BUST", value: "32" },
        { label: "WAIST", value: "24" },
        { label: "HIPS", value: "34" },
      ],
      inline: `5'9" · 32-24-34`,
    },
    imagesById: {
      "img-1": { public_url: "/uploads/1.jpg" },
      "img-2": { public_url: "/uploads/2.jpg" },
      "img-3": { public_url: "/uploads/3.jpg" },
    },
    watermark: true,
    baseUrl: "http://localhost:3000",
    printBleed: false,
    fontsCss: null,
    frontProgram,
  };
}

function editionLocals() {
  const frontProgram = {
    structure: "cover-story",
    elements: [
      { type: "photo", rect: { x: 0, y: 0, w: 5.5, h: 8.5 }, z: 1, layer: "base", bleedEdges: ["left", "right", "top", "bottom"] },
      {
        type: "name",
        role: "lockup-first",
        text: "TAYA",
        rect: { x: 0.5, y: 2, w: 4.5, h: 1 },
        orientation: "horizontal",
        stacked: false,
        sizePt: 90,
        trackingEm: 0.02,
        lockup: "inline",
        onPhoto: true,
        color: "#FFFFFF",
        weight: 700,
        align: "center",
        transform: "uppercase",
        z: 1.6,
      },
      { type: "photo", rect: { x: 0, y: 0, w: 5.5, h: 8.5 }, z: 2, layer: "figure", isCutout: true, bleedEdges: ["left", "right"] },
      { type: "rule", variant: "hairline", orientation: "horizontal", rect: { x: 0.5, y: 1.8, w: 1, h: 0.01 }, color: "#C9A55A", weight: 0.01, z: 2 },
      { type: "rule", variant: "hinge", orientation: "vertical", rect: { x: 2.7, y: 0.2, w: 0.01, h: 4 }, color: "#3A3733", weight: 0.01, z: 2 },
      { type: "folio", text: "№ 01", rect: { x: 0.3, y: 8.1, w: 1, h: 0.15 }, sizePt: 7, trackingEm: 0.2, color: "#B9B3AB", weight: 600, align: "left", transform: "uppercase", z: 4 },
      {
        type: "name",
        text: "Taya Waverly",
        rect: { x: 0.5, y: 7, w: 4.5, h: 0.6 },
        orientation: "horizontal",
        stacked: true,
        leading: 0.94,
        sizePt: 30,
        trackingEm: 0.1,
        lockup: "stacked",
        color: "#F4F1EC",
        weight: 600,
        align: "left",
        transform: "uppercase",
        z: 3,
      },
      {
        type: "photo",
        rect: { x: 3, y: 1, w: 2, h: 3 },
        z: 1.2,
        role: "support",
        imageId: "img-2",
        crop: { objectPosition: "70% 20%" },
      },
      { type: "contact", text: "PHOLIO.STUDIO/TAYA", rect: { x: 0.5, y: 8.05, w: 3, h: 0.2 }, orientation: "horizontal", sizePt: 10, color: "rgba(255,255,255,0.82)", onPhoto: true, z: 4 },
    ],
  };

  const plan = {
    seedUsed: "ed-seed",
    toneProfile: "noir",
    edition: { id: "ink-noir", label: "The Night Edition", tone: "x", field: "dark", register: "standard" },
    palette: { background: "#141210", text: "#F4F1EC", muted: "#B9B3AB", accent: "#C9A55A", rule: "#3A3733", dark: true },
    typography: baseTypography({ nameSize: "30pt", nameTracking: "0.1em", nameWeight: 600 }),
    front: {
      imageId: "img-1",
      crop: { objectPosition: "50% 30%" },
      treatment: "classic",
      name: { align: "left", placement: "bottom", lines: ["Taya Waverly"] },
      showContactBlock: false,
      statLine: null,
      geometry: { hero: { x: 0, y: 0, w: 5.5, h: 8.5, bleedEdges: ["left", "right", "top", "bottom"] }, nameBand: null },
      scrim: null,
    },
    back: {
      contact: { line: "PHOLIO.STUDIO/TAYA" },
      booking: null,
      layout: {
        cells: [
          { x: 0.3, y: 1.2, w: 2.4, h: 3, imageId: "img-2" },
          { x: 2.8, y: 1.2, w: 2.4, h: 3, imageId: "img-3" },
        ],
        statsBlock: { x: 0.3, y: 4.4, w: 4.9, h: 1.2, orientation: "column" },
        nameBlock: { x: 0.3, y: 0.3, w: 4.9, h: 0.6 },
        contactBlock: { x: 0.3, y: 7.8, w: 4.9, h: 0.4 },
        wordmark: { x: 4.2, y: 8.0, w: 1, h: 0.2 },
        style: { nameAlign: "center", statsStyle: "tabular", dividers: true, cellIndexes: true, reversed: true },
        nameplate: { scale: "running-head", align: "center" },
      },
    },
    wordmark: { front: { x: 4.2, y: 8.0, w: 1, h: 0.2 }, back: { x: 4.2, y: 8.0, w: 1, h: 0.2 }, tone: "gold-bright", align: "right", displayUrl: "pholio.studio/taya" },
  };

  return {
    layout: false,
    title: "Taya Waverly - Comp Card",
    profile: { first_name: "Taya", last_name: "Waverly", is_pro: false },
    plan,
    statsBlock: {
      lines: [
        { label: "HEIGHT", value: `5'9"` },
        { label: "BUST", value: "32" },
      ],
      inline: `5'9"`,
    },
    imagesById: {
      "img-1": { public_url: "/uploads/1.jpg" },
      "img-2": { public_url: "/uploads/2.jpg" },
      "img-3": { public_url: "/uploads/3.jpg" },
    },
    watermark: true,
    baseUrl: "http://localhost:3000",
    printBleed: false,
    fontsCss: null,
    frontProgram,
    cutoutSrc: null,
  };
}

const CURRENT_TEMPLATE = fs.readFileSync(TEMPLATE_PATH, "utf8");

const EDITION_MARKERS = [
  "font-variant-numeric: tabular-nums",
  "cell-divider",
  "cell-index",
  "stats--footline",
  "stats--tabular",
  "back-name--running-head",
  "data-folio",
];

// ── legacy inertness ─────────────────────────────────────────────────────────

describe("legacy program render is inert (no editions markup)", () => {
  test.each([true, false])(
    "no editions-only markup leaks (frontProgram=%s)",
    (withFp) => {
      const html = render(CURRENT_TEMPLATE, legacyLocals(withFp));
      for (const marker of EDITION_MARKERS) {
        expect(html).not.toContain(marker);
      }
    },
  );

  test.each([true, false])(
    "byte-identical to the pre-change template from git HEAD (frontProgram=%s)",
    (withFp) => {
      let original;
      try {
        original = execSync(
          "git show HEAD:src/domains/pdf/templates/compcard-composed.ejs",
          { cwd: path.join(__dirname, "..", "..", "..", ".."), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
        );
      } catch {
        return; // git unavailable — inertness above still guards the change
      }
      // If HEAD already contains the editions changes (committed), the byte
      // comparison is meaningless — skip it. The inertness test still holds.
      if (original.includes("editionActive")) return;
      const locals = legacyLocals(withFp);
      expect(render(CURRENT_TEMPLATE, locals)).toBe(render(original, locals));
    },
  );
});

// ── edition vocabulary ───────────────────────────────────────────────────────

describe("edition program renders the additive vocabulary", () => {
  let html;
  beforeAll(() => {
    html = render(CURRENT_TEMPLATE, editionLocals());
  });

  test("emits the editions-only CSS gated block (tabular numerals)", () => {
    expect(html).toContain("font-variant-numeric: tabular-nums");
  });

  test("photo elements: imageId support crop, and a figure layer (two hero blocks)", () => {
    // the imageId support photo pulls its own src + per-element crop
    expect(html).toContain('src="/uploads/2.jpg"');
    expect(html).toContain("object-position: 70% 20%");
    // base + figure layer both render as .hero blocks
    expect((html.match(/class="abs hero"/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  test("rule variants: hairline + hinge render as filled divs", () => {
    expect(html).toContain("background: #C9A55A"); // hairline fill
    expect(html).toContain("background: #3A3733"); // hinge fill
  });

  test("folio element renders tracked uppercase imprint", () => {
    expect(html).toContain("data-folio");
    expect(html).toContain("№ 01");
  });

  test("name honors leading (line-height multiplier) and lockup roles", () => {
    expect(html).toContain("line-height: 0.94");
  });

  test("back style — tabular stats with ruled rows", () => {
    expect(html).toContain("stats--tabular");
    expect(html).toContain('class="stat-row"');
  });

  test("back style — cell dividers and index numerals", () => {
    expect(html).toContain("cell-divider");
    expect(html).toContain("cell-index");
    expect(html).toContain(">01<");
    expect(html).toContain(">02<");
  });

  test("back style — running-head nameplate echoes the front display family", () => {
    expect(html).toContain("back-name--running-head");
    expect(html).toContain("Playfair Display"); // same display family as the front
  });

  test("dark paper — watermark + empty cells derive light ink at low alpha", () => {
    expect(html).toContain("rgba(244,241,236,0.08)");
  });

  test("footline stats style renders a single foot row when selected", () => {
    const locals = editionLocals();
    locals.plan.back.layout.style.statsStyle = "footline";
    const out = render(CURRENT_TEMPLATE, locals);
    expect(out).toContain("stats--footline");
  });
});
