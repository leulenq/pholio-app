#!/usr/bin/env node
/**
 * Comp-card GALLERY RIG — editions implementation plan, phase 1 (items 1.1 + 1.2).
 *
 *   node scripts/comp-card-gallery.js [--seeds 6] [--out gallery/]
 *
 * The review backbone for the editions work: four synthetic fixture profiles
 * × N seeds, run through the REAL composition engine (composeCompCard,
 * aiAdvice disabled) and the REAL EJS template (compcard-composed.ejs) with
 * vendored fonts — no network, no DB, deterministic bytes.
 *
 * Fixture profiles (per plan §1.1):
 *   editorial-woman — strong 8-image pool, alpha matte on the hero
 *   commercial-man  — typical 6-image pool, no matte
 *   teen            — kids pool (stats category resolves to 'kids')
 *   new-face        — 8 mixed phone photos, the weak-pool case
 *
 * Fixture images are generated programmatically with sharp: an SVG scene
 * (vertical gradient backdrop + a face-like head/hair/body subject at a
 * known focal position, seeded per-image color/luma/warmth variation,
 * optional clutter for the phone-photo pool) rasterized to JPEG. The REAL
 * forensics pipeline (composition/image-forensics.js) then measures those
 * bytes, so the engine sees honest luma grids / quiet bands / palettes —
 * never hand-written numbers. The editorial hero's alpha matte is computed
 * ANALYTICALLY from the same shape parameters the SVG was drawn from
 * (exact ground-truth silhouette — strictly more honest than model
 * inference on a synthetic image).
 *
 * Outputs (all under --out, default gallery/):
 *   index.html          fixtures × seeds review grid (front+back thumbnails,
 *                       labeled seed / structure / voice / palette)
 *   cards/*.html        one standalone HTML per cell (relative asset paths —
 *                       both plain file:// open and Puppeteer work)
 *   shots/*.png         per-cell front/back screenshots (Puppeteer)
 *   contact-sheet.png   one composite PNG of every front+back
 *   plans.json          stable-sorted plan JSON per cell (drift diffing)
 *   metrics.json        perceptual distance matrices + rasterized contrast
 *                       samples (the phase-1 quality-gate baselines)
 *   fixtures/*.jpg      the generated fixture photographs
 *   fonts/*.ttf         vendored TTFs copied for standalone rendering
 *
 * Quality gates hosted here (consumed by gallery-gates.test.js):
 *   - RASTERIZED CONTRAST: for every front text element, sample the actual
 *     pixels behind the glyphs (text-suppressed second render) and compute
 *     the worst-pixel WCAG ratio against the text color.
 *   - PERCEPTUAL DISTANCE: pairwise pixelmatch + mean-absolute-difference
 *     between same-fixture different-seed fronts at thumbnail size.
 *   Thresholds live in GATES below (config-driven — phase 2 will tighten
 *   them into the anti-collapse gate).
 *
 * This script only ADDS files; it never touches engine/composition sources.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const ROOT = path.join(__dirname, "..");
const { composeCompCard, ENGINE_VERSION } = require(
  path.join(ROOT, "src", "domains", "pdf", "composition"),
);
const { forensicsForImages } = require(
  path.join(ROOT, "src", "domains", "pdf", "composition", "image-forensics"),
);
const { fontFaceCss, FONT_DIR } = require(
  path.join(ROOT, "src", "domains", "pdf", "composition", "perception", "font-files"),
);

const TEMPLATE_PATH = path.join(
  ROOT, "src", "domains", "pdf", "templates", "compcard-composed.ejs",
);

// 5.5in × 8.5in at CSS 96dpi.
const PAGE_W_PX = 528;
const PAGE_H_PX = 816;

// ---------------------------------------------------------------------------
// Gate configuration (single source of truth — the Jest suite imports this).
// Phase-1 numbers are BASELINES calibrated against the current engine
// (pre-editions); phase 2 turns the perceptual gate into the anti-collapse
// gate by raising minConsecutiveDistance against these recorded matrices.
// ---------------------------------------------------------------------------
const GATES = {
  contrast: {
    // Per-size-class WCAG ratio targets, derived from the engine's own
    // verification targets: contrast.js TARGET_CONTRAST = 4.5 for body/micro
    // on-photo type; front-program statement fills are verified per-cell at
    // minRatio 2.0–2.1 for display-scale type (synthesize.js pickFill).
    // Every rendered sample is recorded against its target in metrics.json.
    classes: [
      { id: "micro", maxPt: 14, minRatio: 4.5 },
      { id: "body", maxPt: 24, minRatio: 3.0 },
      { id: "display", maxPt: Infinity, minRatio: 2.0 },
    ],
    // Multiplicative slack for rasterization effects the engine's model does
    // not see (JPEG ringing on fixture gradients, sub-cell luma extremes vs
    // the 9×6 grid mean, gradient-scrim falloff inside a glyph box).
    tolerance: 0.82,
    sampleStepPx: 2,
    // PHASE-1 BINDING GATE: hard per-class floors calibrated against the
    // CURRENT engine (pre-editions). Observed baseline (6 seeds × 4
    // fixtures): micro min 2.82 (a REAL defect — a 7pt translucent-white
    // contact line over an unscrimmed photo region on photo-dominant
    // fronts; plan item 2.5 "micro never over photo" fixes it), micro p10
    // 4.77, display min 4.77. Floors sit under the known defect so the
    // rig is green on the current engine while metrics.json records every
    // below-target sample for review.
    baselineFloors: { micro: 2.5, body: 2.5, display: 1.9 },
    // Phase 2 flips this to true: the binding assert becomes
    // minRatio ≥ class target × tolerance for every sample.
    enforceEngineTarget: false,
  },
  perceptual: {
    thumbW: 64,
    thumbH: 99, // card aspect 5.5:8.5 at thumbnail size
    pixelmatchThreshold: 0.12,
    // PHASE-1 BINDING GATE: minimum pixelmatch distance (changed-pixel
    // fraction, 0..1) between CONSECUTIVE seeds of the same fixture.
    // Observed baseline on the current engine (6 seeds × 4 fixtures):
    // most consecutive pairs measure 0.17–0.65, but the engine already
    // near-collapses on typical pools (commercial-man seed-5→6 renders the
    // same structure+voice+hero+treatment → 0.0368; seed-4→5 → 0.035).
    // Identical renders measure exactly 0.0. The floor is set at 0.02:
    // it catches full collapse today; phase 2 raises it into the real
    // anti-collapse gate once operators guarantee take-to-take change.
    minConsecutiveDistance: 0.02,
    // Plan-level pre-filter: distinct (structure|treatment|voice) tuples
    // required across 6 seeds per fixture (cheap, browserless).
    minPlanTuples: 2,
  },
};

// ---------------------------------------------------------------------------
// Deterministic PRNG (seeded per fixture-image id) — CI-stable bytes.
// ---------------------------------------------------------------------------
function xfnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rngFor = (key) => mulberry32(xfnv1a(String(key)));

// ---------------------------------------------------------------------------
// Fixture image synthesis (sharp; SVG scene → JPEG)
// ---------------------------------------------------------------------------
const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Backdrop pair from target luma (0..1) + warmth (−1..1). */
function backdropColors(luma, warmth) {
  const base = clamp01(luma) * 255;
  const rgb = (l) =>
    `rgb(${clampByte(l + warmth * 30)},${clampByte(l + warmth * 8)},${clampByte(l - warmth * 30)})`;
  return { top: rgb(base), bottom: rgb(base * 0.8) };
}

/**
 * Subject geometry in FRACTIONS (x of width, y + radii of height) — the same
 * numbers drive both the SVG draw and the analytic ground-truth matte.
 */
function subjectShapes(spec) {
  const fx = spec.fx ?? 0.5;
  const fy = spec.fy ?? 0.36;
  const headR = spec.headR ?? 0.07;
  return {
    head: { cx: fx, cy: fy, r: headR },
    hair: { cx: fx, cy: fy - headR * 0.3, rx: headR * 1.3, ry: headR * 1.2 },
    body: { cx: fx, cy: fy + headR * 3.2, rx: headR * 2.2, ry: headR * 3.6 },
  };
}

/** Point-in-subject test in fraction space (x: 0..1 of w, y: 0..1 of h). */
function insideSubject(shapes, x, y, aspect) {
  // radii are height-fractions; horizontal distances scale by aspect (w/h)
  const inEllipse = (px, py, cx, cy, rx, ry) => {
    const dx = ((px - cx) * aspect) / rx;
    const dy = (py - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };
  const { head, hair, body } = shapes;
  return (
    inEllipse(x, y, head.cx, head.cy, head.r, head.r) ||
    inEllipse(x, y, hair.cx, hair.cy, hair.rx, hair.ry) ||
    inEllipse(x, y, body.cx, body.cy, body.rx, body.ry)
  );
}

/**
 * Ground-truth alpha matte for a generated fixture image: cell coverage of
 * the drawn subject shapes, sampled 8×8 per cell. Same grid convention as
 * perception/matte.js (row 0 = top, gridH rows × gridW cols, 0..1).
 */
function analyticMatte(spec, gridW = 12, gridH = 18) {
  const shapes = subjectShapes(spec);
  const aspect = spec.w / spec.h;
  const maskGrid = [];
  const S = 8;
  for (let r = 0; r < gridH; r++) {
    const row = [];
    for (let c = 0; c < gridW; c++) {
      let hit = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (c + (sx + 0.5) / S) / gridW;
          const y = (r + (sy + 0.5) / S) / gridH;
          if (insideSubject(shapes, x, y, aspect)) hit += 1;
        }
      }
      row.push(Math.round((hit / (S * S)) * 10000) / 10000);
    }
    maskGrid.push(row);
  }
  return {
    maskGrid,
    width: spec.w,
    height: spec.h,
    version: 1,
    source: "alpha", // exact silhouette from the draw parameters
  };
}

/** Wardrobe fills (seeded pick) — varies the dominant non-skin palette. */
const WARDROBES = [
  "#23201C", // charcoal
  "#5A2230", // burgundy
  "#1F2A44", // navy
  "#E8E2D6", // cream
  "#3E4A3A", // forest
  "#7A6A55", // taupe
];

function fixtureSvg(spec) {
  const { w, h } = spec;
  const rng = rngFor(`img:${spec.id}`);
  const { top, bottom } = backdropColors(spec.luma, spec.warmth);
  const shapes = subjectShapes(spec);
  const px = (frac) => frac * h; // radii are height-fractions
  const X = (frac) => frac * w;
  const Y = (frac) => frac * h;

  const skin = `rgb(${clampByte(206 + spec.warmth * 22)},${clampByte(160 + spec.warmth * 10)},${clampByte(130 - spec.warmth * 12)})`;
  const hair = "#2A2119";
  const wardrobe = spec.wardrobe || WARDROBES[Math.floor(rng() * WARDROBES.length)];

  // Clutter for phone photos: seeded rectangles that raise the detail grid
  // and break the quiet bands (an honest "busy location backdrop").
  let clutter = "";
  const n = Math.round((spec.clutter || 0) * 14);
  for (let i = 0; i < n; i++) {
    const cw = (0.06 + rng() * 0.22) * w;
    const ch = (0.05 + rng() * 0.3) * h;
    const cx = rng() * w - cw / 2;
    const cy = rng() * h - ch / 2;
    const g = clampByte(40 + rng() * 190);
    const tint = clampByte(g + (rng() - 0.5) * 70);
    clutter += `<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="rgb(${g},${g},${tint})" opacity="0.55"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  ${clutter}
  <ellipse cx="${X(shapes.body.cx)}" cy="${Y(shapes.body.cy)}" rx="${px(shapes.body.rx)}" ry="${px(shapes.body.ry)}" fill="${wardrobe}"/>
  <ellipse cx="${X(shapes.hair.cx)}" cy="${Y(shapes.hair.cy)}" rx="${px(shapes.hair.rx)}" ry="${px(shapes.hair.ry)}" fill="${hair}"/>
  <circle cx="${X(shapes.head.cx)}" cy="${Y(shapes.head.cy)}" r="${px(shapes.head.r)}" fill="${skin}"/>
  <ellipse cx="${X(shapes.head.cx)}" cy="${Y(shapes.head.cy - shapes.head.r * 0.45)}" rx="${px(shapes.head.r * 1.05)}" ry="${px(shapes.head.r * 0.55)}" fill="${hair}"/>
</svg>`;
}

// ---------------------------------------------------------------------------
// Fixture catalog
// ---------------------------------------------------------------------------
function img(id, spec) {
  return { id, ...spec };
}

const FIXTURES = [
  {
    key: "editorial-woman",
    label: "Editorial woman — strong pool + matte",
    matteHeroId: "ew-1",
    archetype: { label: "Editorial", verdict: "Strong editorial presence with runway range." },
    profile: {
      id: "fixture-editorial-woman",
      slug: "vera-lin",
      first_name: "Vera",
      last_name: "Lin",
      gender: "Female",
      age: 24,
      height_cm: 178,
      bust_cm: 84,
      waist_cm: 60,
      hips_cm: 89,
      dress_size: "2",
      shoe_size: "9",
      hair_color: "black",
      eye_color: "brown",
      city: "New York",
      instagram_handle: "veralin",
      is_pro: true,
      image_analysis: JSON.stringify({
        lookType: "editorial",
        marketSignals: ["editorial", "runway", "high fashion"],
      }),
    },
    images: [
      img("ew-1", { shot_type: "headshot", w: 1600, h: 2400, luma: 0.74, warmth: 0.1, fy: 0.4, headR: 0.12, is_primary: true, sort: 1, label: "Beauty headshot" }),
      img("ew-2", { shot_type: "full_length", w: 1400, h: 2800, luma: 0.82, warmth: -0.12, fy: 0.16, headR: 0.05, sort: 2, label: "Runway full length" }),
      img("ew-3", { shot_type: "three_quarter", w: 1500, h: 2100, luma: 0.55, warmth: 0.22, fy: 0.28, headR: 0.085, sort: 3, label: "Three quarter" }),
      img("ew-4", { style_type: "editorial", w: 1800, h: 1400, luma: 0.3, warmth: -0.05, fx: 0.36, fy: 0.42, headR: 0.11, sort: 4, label: "Editorial story" }),
      img("ew-5", { style_type: "lifestyle", w: 1600, h: 2000, luma: 0.68, warmth: 0.32, fy: 0.34, headR: 0.09, sort: 5, label: "Lifestyle" }),
      img("ew-6", { shot_type: "headshot", w: 1600, h: 2000, luma: 0.24, warmth: 0.05, fy: 0.42, headR: 0.12, wardrobe: "#171512", sort: 6, label: "Moody headshot" }),
      img("ew-7", { shot_type: "full_length", w: 1300, h: 2600, luma: 0.6, warmth: 0, fy: 0.17, headR: 0.05, sort: 7, label: "Full length studio" }),
      img("ew-8", { style_type: "editorial", w: 1200, h: 1800, luma: 0.88, warmth: 0.18, fx: 0.6, fy: 0.32, headR: 0.09, sort: 8, label: "High key editorial" }),
    ],
  },
  {
    key: "commercial-man",
    label: "Commercial man — typical pool, no matte",
    matteHeroId: null,
    archetype: { label: "Commercial", verdict: "Warm, versatile commercial presence." },
    profile: {
      id: "fixture-commercial-man",
      slug: "marcus-hale",
      first_name: "Marcus",
      last_name: "Hale",
      gender: "Male",
      age: 32,
      height_cm: 188,
      chest_cm: 102,
      waist_cm: 81,
      inseam_cm: 84,
      shoe_size: "11",
      hair_color: "brown",
      eye_color: "blue",
      city: "Chicago",
      phone: "+1 (312) 555-0114",
      is_pro: true,
      image_analysis: JSON.stringify({
        lookType: "commercial",
        marketSignals: ["commercial", "lifestyle"],
      }),
    },
    images: [
      img("cm-1", { shot_type: "headshot", w: 1400, h: 1900, luma: 0.7, warmth: 0.3, fy: 0.42, headR: 0.13, is_primary: true, sort: 1, label: "Commercial headshot" }),
      img("cm-2", { shot_type: "full_length", w: 1300, h: 2500, luma: 0.76, warmth: 0.24, fy: 0.17, headR: 0.05, sort: 2, label: "Full length" }),
      img("cm-3", { shot_type: "three_quarter", w: 1400, h: 2000, luma: 0.62, warmth: 0.36, fy: 0.3, headR: 0.09, sort: 3, label: "Three quarter smile" }),
      img("cm-4", { style_type: "lifestyle", w: 1600, h: 1200, luma: 0.8, warmth: 0.4, fx: 0.42, fy: 0.4, headR: 0.11, sort: 4, label: "Lifestyle coffee" }),
      img("cm-5", { style_type: "lifestyle", w: 1400, h: 1750, luma: 0.5, warmth: 0.15, fy: 0.35, headR: 0.1, sort: 5, label: "Casual lifestyle" }),
      img("cm-6", { style_type: "editorial", w: 1200, h: 1600, luma: 0.4, warmth: -0.08, fy: 0.36, headR: 0.1, wardrobe: "#1F2A44", sort: 6, label: "Suit editorial" }),
    ],
  },
  {
    key: "teen",
    label: "Teen — kids pool",
    matteHeroId: null,
    archetype: { label: "Fresh Face", verdict: "Bright, youthful commercial look." },
    profile: {
      id: "fixture-teen",
      slug: "riley-quinn",
      first_name: "Riley",
      last_name: "Quinn",
      gender: "Female",
      age: 15,
      height_cm: 163,
      shoe_size: "7",
      hair_color: "auburn",
      eye_color: "green",
      city: "Austin",
      is_pro: true,
      image_analysis: JSON.stringify({
        lookType: "commercial",
        marketSignals: ["kids", "commercial"],
      }),
    },
    images: [
      img("tn-1", { shot_type: "headshot", w: 1500, h: 2100, luma: 0.85, warmth: 0.26, fy: 0.42, headR: 0.13, is_primary: true, sort: 1, label: "Smiling headshot" }),
      img("tn-2", { shot_type: "full_length", w: 1300, h: 2400, luma: 0.8, warmth: 0.2, fy: 0.18, headR: 0.055, sort: 2, label: "Full length" }),
      img("tn-3", { shot_type: "three_quarter", w: 1400, h: 1900, luma: 0.72, warmth: 0.34, fy: 0.32, headR: 0.1, sort: 3, label: "Three quarter" }),
      img("tn-4", { style_type: "lifestyle", w: 1500, h: 1150, luma: 0.88, warmth: 0.3, fx: 0.58, fy: 0.4, headR: 0.12, sort: 4, label: "Outdoor lifestyle" }),
      img("tn-5", { style_type: "lifestyle", w: 1300, h: 1700, luma: 0.66, warmth: 0.12, fy: 0.36, headR: 0.11, sort: 5, label: "Studio casual" }),
    ],
  },
  {
    key: "new-face",
    label: "New face — 8 mixed phone photos (weak pool)",
    matteHeroId: null,
    archetype: null,
    profile: {
      id: "fixture-new-face",
      slug: "jordan-reyes",
      first_name: "Jordan",
      last_name: "Reyes",
      gender: "Female",
      age: 21,
      height_cm: 172,
      hair_color: "dark brown",
      eye_color: "brown",
      city: "Phoenix",
      is_pro: true,
      image_analysis: null,
    },
    images: [
      // Untyped, lower-res, busier — an honest self-submitted phone pool.
      img("nf-1", { w: 1080, h: 1440, luma: 0.55, warmth: 0.2, clutter: 0.5, fx: 0.44, fy: 0.34, headR: 0.1, sort: 1, label: "Phone portrait" }),
      img("nf-2", { w: 1080, h: 1080, luma: 0.7, warmth: 0.34, clutter: 0.7, fx: 0.55, fy: 0.4, headR: 0.13, sort: 2, label: "Square selfie" }),
      img("nf-3", { w: 900, h: 1600, luma: 0.35, warmth: -0.15, clutter: 0.6, fy: 0.3, headR: 0.09, sort: 3, label: "Night shot" }),
      img("nf-4", { w: 1600, h: 900, luma: 0.78, warmth: 0.28, clutter: 0.8, fx: 0.3, fy: 0.45, headR: 0.13, sort: 4, label: "Landscape outdoor" }),
      img("nf-5", { w: 1080, h: 1350, luma: 0.62, warmth: 0.1, clutter: 0.4, fy: 0.36, headR: 0.11, sort: 5, label: "Mirror photo" }),
      img("nf-6", { w: 960, h: 1280, luma: 0.46, warmth: 0.05, clutter: 0.65, fx: 0.6, fy: 0.33, headR: 0.1, sort: 6, label: "Indoor low light" }),
      img("nf-7", { w: 1080, h: 1920, luma: 0.66, warmth: 0.22, clutter: 0.55, fy: 0.22, headR: 0.06, sort: 7, label: "Story format" }),
      img("nf-8", { w: 1200, h: 1500, luma: 0.82, warmth: 0.16, clutter: 0.3, fy: 0.38, headR: 0.12, sort: 8, label: "Daylight portrait" }),
    ],
  },
];

const FIXTURE_KEYS = FIXTURES.map((f) => f.key);

// ---------------------------------------------------------------------------
// Stable JSON (sorted keys, recursively) — plans.json must diff cleanly.
// ---------------------------------------------------------------------------
function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableSort(value[key]);
    return out;
  }
  return value;
}

const stableStringify = (value, indent = 2) =>
  JSON.stringify(stableSort(value), null, indent);

// ---------------------------------------------------------------------------
// Fixture build: images on disk + REAL forensics + matte
// ---------------------------------------------------------------------------
async function buildFixtures(outDir, { quiet = false } = {}) {
  const sharp = require("sharp");
  const fixturesDir = path.join(outDir, "fixtures");
  fs.mkdirSync(fixturesDir, { recursive: true });

  const built = [];
  for (const fixture of FIXTURES) {
    const rows = [];
    for (const spec of fixture.images) {
      const file = path.join(fixturesDir, `${spec.id}.jpg`);
      if (!fs.existsSync(file)) {
        const buffer = await sharp(Buffer.from(fixtureSvg(spec)))
          .jpeg({ quality: 88 })
          .toBuffer();
        fs.writeFileSync(file, buffer);
      }
      rows.push({
        id: spec.id,
        profile_id: fixture.profile.id,
        // Relative (no leading slash): the template's imgSrc prefixes it with
        // baseUrl — we pass baseUrl '..' so cards/*.html resolve
        // ../fixtures/*.jpg under both file:// and Puppeteer.
        path: `fixtures/${spec.id}.jpg`,
        label: spec.label || spec.id,
        sort: spec.sort ?? 1,
        shot_type: spec.shot_type || null,
        style_type: spec.style_type || null,
        width: spec.w,
        height: spec.h,
        is_primary: Boolean(spec.is_primary),
        usage_rights: "granted",
        created_at: new Date().toISOString(), // fresh — no staleness warning
      });
    }

    // REAL forensics over the generated bytes.
    const forensicsById = await forensicsForImages(rows, {
      fetchBuffer: async (row) =>
        fs.promises.readFile(path.join(outDir, row.path)),
      timeoutMs: 8000,
      concurrency: 4,
    });
    const nullForensics = rows.filter((r) => !forensicsById.get(r.id));
    if (nullForensics.length) {
      throw new Error(
        `[gallery] forensics failed for ${fixture.key}: ${nullForensics.map((r) => r.id).join(", ")}`,
      );
    }

    // Alpha matte on the editorial hero: exact silhouette from draw params.
    const matteById = {};
    if (fixture.matteHeroId) {
      const spec = fixture.images.find((s) => s.id === fixture.matteHeroId);
      matteById[fixture.matteHeroId] = analyticMatte(spec);
    }

    built.push({ ...fixture, rows, forensicsById, matteById });
    if (!quiet) {
      console.log(`[gallery] fixture ${fixture.key}: ${rows.length} images generated + measured`);
    }
  }
  return built;
}

// ---------------------------------------------------------------------------
// Composition + template render (REAL engine, REAL template)
// ---------------------------------------------------------------------------
async function composeCell(fixture, seed) {
  return composeCompCard({
    profile: fixture.profile,
    images: fixture.rows,
    archetype: fixture.archetype,
    options: {
      seed,
      aiAdvice: false, // deterministic — no Groq
      frontEngine: "program",
      forensicsById: fixture.forensicsById,
      matteById: fixture.matteById,
      unitsPreference: "dual",
      mode: "draft",
    },
  });
}

let templateSource = null;
function renderCardHtml(fixture, composed, fontsCss) {
  if (templateSource == null) {
    templateSource = fs.readFileSync(TEMPLATE_PATH, "utf8");
  }
  const { plan, statsBlock } = composed;
  const imagesById = {};
  for (const row of fixture.rows) imagesById[row.id] = row;
  const fullName = `${fixture.profile.first_name} ${fixture.profile.last_name}`;
  return ejs.render(templateSource, {
    layout: false,
    title: `${fullName} - Comp Card`,
    profile: fixture.profile,
    plan,
    statsBlock,
    imagesById,
    // Review rig renders without the free-tier watermark so gates and
    // review judge the DESIGN (fixtures set is_pro accordingly).
    watermark: false,
    baseUrl: "..", // cards/ → ../fixtures/*.jpg
    printBleed: false,
    fontsCss,
    frontProgram: plan.frontProgram || null,
  });
}

/**
 * Vendored fonts for standalone cards: copy the TTFs referenced by
 * fontFaceCss into out/fonts/ and rewrite the CSS URLs from the app's
 * /fonts/compcard/ path to ../fonts/ (relative to cards/*.html).
 */
function fontsCssForCard(outDir, families) {
  const css = fontFaceCss(families);
  if (!css) {
    throw new Error(
      `[gallery] no vendored fonts for families ${JSON.stringify(families)} — run scripts/fetch-compcard-fonts.js`,
    );
  }
  const fontsDir = path.join(outDir, "fonts");
  fs.mkdirSync(fontsDir, { recursive: true });
  const rewritten = css.replace(/url\('\/fonts\/compcard\/([^']+)'\)/g, (m, file) => {
    const src = path.join(FONT_DIR, file);
    const dst = path.join(fontsDir, file);
    if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
    return `url('../fonts/${file}')`;
  });
  return rewritten;
}

/** Labels used by the index grid + plans.json. */
function cellSummary(plan) {
  const treatment =
    plan.frontProgram?.elements?.find((e) => e.role === "split-first")?.variant ||
    "classic";
  return {
    structure: plan.frontProgramMeta?.structure || "(legacy front)",
    voice: plan.typography?.voiceId || plan.typography?.display || "?",
    treatment,
    toneProfile: plan.toneProfile || null,
    palette: {
      background: plan.palette?.background,
      text: plan.palette?.text,
      accent: plan.palette?.accent,
    },
    heroId: plan.front?.imageId || null,
    backArchitecture: plan.back?.architecture || null,
  };
}

// ---------------------------------------------------------------------------
// Browser helpers (Puppeteer + repo Chromium — same pattern as
// __tests__/scrim-render.test.js; no network required)
// ---------------------------------------------------------------------------
function resolveExecutablePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium")
      : null,
    "/opt/pw-browsers/chromium",
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

async function launchBrowser() {
  const puppeteer = require("puppeteer");
  const executablePath = resolveExecutablePath();
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    ...(executablePath ? { executablePath } : {}),
  });
}

// WCAG relative luminance / contrast (gamma-decoded, per spec).
const srgbChan = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const relLuminance = (r, g, b) =>
  0.2126 * srgbChan(r) + 0.7152 * srgbChan(g) + 0.0722 * srgbChan(b);
const wcagRatio = (l1, l2) =>
  (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

function parseCssColor(str) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(String(str));
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const hex = /^#([0-9a-f]{6})$/i.exec(String(str).trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return null;
}

/** Contrast target for a rendered size (pt) from GATES.contrast.classes. */
function contrastTargetForPt(sizePt) {
  for (const cls of GATES.contrast.classes) {
    if (sizePt <= cls.maxPt) return { id: cls.id, minRatio: cls.minRatio };
  }
  const last = GATES.contrast.classes[GATES.contrast.classes.length - 1];
  return { id: last.id, minRatio: last.minRatio };
}

/** The BINDING minimum ratio for a class in the current phase (see GATES). */
function bindingContrastFloor(classId, targetRatio) {
  if (GATES.contrast.enforceEngineTarget) {
    return targetRatio * GATES.contrast.tolerance;
  }
  return GATES.contrast.baselineFloors[classId] ?? targetRatio * GATES.contrast.tolerance;
}

/**
 * Rasterized contrast measurement for one rendered card (front page).
 *
 * 1. Collect every front text span (name blocks + contact lines; ghosts are
 *    decorative and excluded) with its tight client rect, computed color and
 *    size — AFTER the template's fit guard has run.
 * 2. Re-render the page with text visibility:hidden and screenshot: the
 *    BACKDROP (photo + scrims + planes + bands) without glyph ink.
 * 3. Sample the backdrop pixels inside each span rect; the reported ratio is
 *    the WORST pixel vs the text color (the engine's own worst-case model).
 */
async function measureFrontContrast(page, sharp) {
  const targets = await page.evaluate(() => {
    const out = [];
    const front = document.getElementById("front");
    if (!front) return out;
    const spans = front.querySelectorAll(
      "[data-fit-text] span, .contact-line span",
    );
    spans.forEach((span) => {
      if (span.closest("[data-ghost]")) return;
      const text = (span.textContent || "").trim();
      if (!text) return;
      const rect = span.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const style = getComputedStyle(span);
      if (Number(style.opacity) < 0.5) return;
      out.push({
        text: text.slice(0, 40),
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height,
        color: style.color,
        fontSizePx: parseFloat(style.fontSize),
      });
    });
    return out;
  });

  // Text-suppressed render → backdrop pixels only.
  await page.addStyleTag({
    content:
      "#front [data-fit-text] span, #front .contact-line span, #front [data-ghost] span { visibility: hidden !important; }",
  });
  const backdropShot = await page.screenshot({
    clip: { x: 0, y: 0, width: PAGE_W_PX, height: PAGE_H_PX },
  });
  const { data, info } = await sharp(backdropShot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const step = GATES.contrast.sampleStepPx;
  const samples = [];
  for (const t of targets) {
    const rgb = parseCssColor(t.color);
    if (!rgb) continue;
    const textLum = relLuminance(rgb[0], rgb[1], rgb[2]);
    const x0 = Math.max(0, Math.floor(t.x));
    const y0 = Math.max(0, Math.floor(t.y));
    const x1 = Math.min(info.width - 1, Math.ceil(t.x + t.w));
    const y1 = Math.min(PAGE_H_PX - 1, Math.min(info.height - 1, Math.ceil(t.y + t.h)));
    let minRatio = Infinity;
    let worst = null;
    for (let y = y0; y <= y1; y += step) {
      for (let x = x0; x <= x1; x += step) {
        const i = (y * info.width + x) * 3;
        const lum = relLuminance(data[i], data[i + 1], data[i + 2]);
        const ratio = wcagRatio(textLum, lum);
        if (ratio < minRatio) {
          minRatio = ratio;
          worst = { x, y, rgb: [data[i], data[i + 1], data[i + 2]] };
        }
      }
    }
    if (!Number.isFinite(minRatio)) continue;
    const sizePt = t.fontSizePx * 0.75; // CSS px → pt
    const target = contrastTargetForPt(sizePt);
    samples.push({
      text: t.text,
      sizePt: Math.round(sizePt * 10) / 10,
      color: t.color,
      class: target.id,
      targetRatio: target.minRatio,
      minRatio: Math.round(minRatio * 100) / 100,
      worstPixel: worst,
      // meetsTarget: against the engine's own target (phase-2 goal,
      // recorded for review); pass: against the phase's BINDING floor.
      meetsTarget: minRatio >= target.minRatio * GATES.contrast.tolerance,
      pass: minRatio >= bindingContrastFloor(target.id, target.minRatio),
    });
  }
  return samples;
}

// ---------------------------------------------------------------------------
// Perceptual distance (pixelmatch + MAD on 64×99 thumbnails)
// ---------------------------------------------------------------------------
async function thumbRaw(sharp, pngPath) {
  const { thumbW, thumbH } = GATES.perceptual;
  const { data } = await sharp(pngPath)
    .resize(thumbW, thumbH, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

function perceptualDistance(rawA, rawB) {
  const pixelmatch = require("pixelmatch");
  const { thumbW, thumbH, pixelmatchThreshold } = GATES.perceptual;
  const diff = pixelmatch(rawA, rawB, null, thumbW, thumbH, {
    threshold: pixelmatchThreshold,
  });
  let mad = 0;
  let n = 0;
  for (let i = 0; i < rawA.length; i += 4) {
    mad += Math.abs(rawA[i] - rawB[i]) + Math.abs(rawA[i + 1] - rawB[i + 1]) + Math.abs(rawA[i + 2] - rawB[i + 2]);
    n += 3;
  }
  return {
    pixelmatch: Math.round((diff / (thumbW * thumbH)) * 10000) / 10000,
    mad: Math.round((mad / n / 255) * 10000) / 10000,
  };
}

// ---------------------------------------------------------------------------
// Index page + contact sheet
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function writeIndexHtml(outDir, grid, seeds) {
  const thumbW = 150;
  const thumbH = Math.round((thumbW * PAGE_H_PX) / PAGE_W_PX);
  const rows = grid
    .map((fixtureRow) => {
      const cellsHtml = fixtureRow.cells
        .map((cell) => {
          const s = cell.summary;
          return `<td>
  <a href="cards/${cell.name}.html">
    <img src="shots/${cell.name}-front.png" width="${thumbW}" height="${thumbH}" alt="front">
    <img src="shots/${cell.name}-back.png" width="${thumbW}" height="${thumbH}" alt="back">
  </a>
  <div class="meta">
    <div>${escapeHtml(cell.seed)}</div>
    <div>${escapeHtml(s.structure)} &middot; ${escapeHtml(s.treatment)}</div>
    <div>${escapeHtml(s.voice)}</div>
    <div>${escapeHtml(s.palette.background || "")} / ${escapeHtml(s.palette.text || "")} / ${escapeHtml(s.palette.accent || "")}</div>
  </div>
</td>`;
        })
        .join("\n");
      return `<tr><th>${escapeHtml(fixtureRow.label)}</th>${cellsHtml}</tr>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Comp Card Gallery — ${escapeHtml(ENGINE_VERSION)}</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; background: #FAF8F5; color: #1A1815; margin: 24px; }
  h1 { font-size: 18px; font-weight: 600; }
  p { color: #6B6560; font-size: 12px; }
  table { border-collapse: collapse; }
  th { text-align: left; font-size: 12px; font-weight: 600; padding: 8px 16px 8px 0; vertical-align: top; max-width: 140px; }
  td { padding: 8px; vertical-align: top; border-top: 1px solid #E5E0D8; }
  td img { display: inline-block; background: #fff; box-shadow: 0 1px 4px rgba(26,24,21,0.14); margin-right: 4px; }
  .meta { font-size: 10px; color: #6B6560; margin-top: 6px; line-height: 1.5; }
  a { text-decoration: none; color: inherit; }
</style>
</head>
<body>
<h1>Comp Card Gallery — ${escapeHtml(ENGINE_VERSION)}</h1>
<p>Fixtures &times; seeds (${escapeHtml(seeds.join(", "))}) through the real composition engine and template. Click a cell for the standalone card HTML. Regenerate with <code>npm run gallery</code>.</p>
<table>
${rows}
</table>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, "index.html"), html);
}

async function writeContactSheet(outDir, grid, sharp) {
  const cellW = 150;
  const cellH = Math.round((cellW * PAGE_H_PX) / PAGE_W_PX);
  const gap = 10;
  const labelH = 22;
  const cols = Math.max(...grid.map((r) => r.cells.length));
  const pairW = cellW * 2 + 4;
  const sheetW = gap + cols * (pairW + gap);
  const sheetH = gap + grid.length * (cellH + labelH + gap);

  const composites = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    const y = gap + r * (cellH + labelH + gap);
    const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${labelH}"><text x="4" y="15" font-family="sans-serif" font-size="12" fill="#1A1815">${escapeHtml(row.label)}</text></svg>`;
    composites.push({ input: Buffer.from(labelSvg), left: 0, top: y });
    for (let c = 0; c < row.cells.length; c++) {
      const cell = row.cells[c];
      const x = gap + c * (pairW + gap);
      const front = await sharp(path.join(outDir, "shots", `${cell.name}-front.png`))
        .resize(cellW, cellH, { fit: "fill" })
        .png()
        .toBuffer();
      const back = await sharp(path.join(outDir, "shots", `${cell.name}-back.png`))
        .resize(cellW, cellH, { fit: "fill" })
        .png()
        .toBuffer();
      composites.push({ input: front, left: x, top: y + labelH });
      composites.push({ input: back, left: x + cellW + 4, top: y + labelH });
    }
  }

  await sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 3,
      background: { r: 250, g: 248, b: 245 },
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(outDir, "contact-sheet.png"));
}

// ---------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------
async function runGallery({
  seeds = 6,
  out = path.join(ROOT, "gallery"),
  withBrowser = true,
  quiet = false,
} = {}) {
  const startedAt = Date.now();
  const sharp = require("sharp");
  const outDir = path.resolve(out);
  for (const dir of ["", "cards", "shots"]) {
    fs.mkdirSync(path.join(outDir, dir), { recursive: true });
  }
  const seedList = Array.from({ length: seeds }, (_, i) => `seed-${i + 1}`);

  // 1. Fixtures: images + real forensics (+ analytic matte).
  const fixtures = await buildFixtures(outDir, { quiet });

  // 2. Compose + render every cell.
  const grid = [];
  const plans = {};
  for (const fixture of fixtures) {
    const cells = [];
    for (const seed of seedList) {
      const composed = await composeCell(fixture, seed);
      const summary = cellSummary(composed.plan);
      const fontsCss = fontsCssForCard(outDir, [
        composed.plan.typography.display,
        composed.plan.typography.body,
      ]);
      const html = renderCardHtml(fixture, composed, fontsCss);
      const name = `${fixture.key}--${seed}`;
      fs.writeFileSync(path.join(outDir, "cards", `${name}.html`), html);
      plans[`${fixture.key}:${seed}`] = {
        seed,
        guardrailStatus: composed.guardrailReport.status,
        summary,
        plan: composed.plan,
      };
      cells.push({ name, seed, composed, summary });
    }
    grid.push({ key: fixture.key, label: fixture.label, cells });
    if (!quiet) console.log(`[gallery] composed ${fixture.key} × ${seedList.length} seeds`);
  }

  fs.writeFileSync(
    path.join(outDir, "plans.json"),
    stableStringify({ engineVersion: ENGINE_VERSION, seeds: seedList, cells: plans }),
  );

  const metrics = {
    engineVersion: ENGINE_VERSION,
    seeds: seedList,
    gates: GATES,
    perceptual: {},
    contrast: {},
  };

  // 3. Browser pass: screenshots, contact sheet, both quality gates.
  if (withBrowser) {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: PAGE_W_PX, height: PAGE_H_PX * 2 });
      for (const row of grid) {
        for (const cell of row.cells) {
          const url = `file://${path.join(outDir, "cards", `${cell.name}.html`)}`;
          await page.goto(url, { waitUntil: "networkidle0" });
          await page
            .waitForSelector('body[data-name-fit-done="1"]', { timeout: 15000 })
            .catch(() => {});
          await page.screenshot({
            path: path.join(outDir, "shots", `${cell.name}-front.png`),
            clip: { x: 0, y: 0, width: PAGE_W_PX, height: PAGE_H_PX },
          });
          await page.screenshot({
            path: path.join(outDir, "shots", `${cell.name}-back.png`),
            clip: { x: 0, y: PAGE_H_PX, width: PAGE_W_PX, height: PAGE_H_PX },
          });
          // Contrast gate sampling mutates the page (hides text) — do last.
          metrics.contrast[cell.name] = await measureFrontContrast(page, sharp);
        }
        if (!quiet) console.log(`[gallery] rendered ${row.key} screenshots + contrast samples`);
      }
      await page.close();
    } finally {
      await browser.close();
    }

    // Perceptual distance matrices (fronts, per fixture, pairwise seeds).
    for (const row of grid) {
      const raws = [];
      for (const cell of row.cells) {
        raws.push(await thumbRaw(sharp, path.join(outDir, "shots", `${cell.name}-front.png`)));
      }
      const matrix = [];
      for (let i = 0; i < raws.length; i++) {
        const line = [];
        for (let j = 0; j < raws.length; j++) {
          line.push(i === j ? { pixelmatch: 0, mad: 0 } : perceptualDistance(raws[i], raws[j]));
        }
        matrix.push(line);
      }
      metrics.perceptual[row.key] = {
        seeds: row.cells.map((c) => c.seed),
        matrix,
        consecutive: row.cells.slice(1).map((c, i) => ({
          pair: `${row.cells[i].seed}→${c.seed}`,
          ...matrix[i][i + 1],
        })),
      };
    }

    writeIndexHtml(outDir, grid, seedList);
    await writeContactSheet(outDir, grid, sharp);
    fs.writeFileSync(path.join(outDir, "metrics.json"), stableStringify(metrics));
  }

  const elapsedMs = Date.now() - startedAt;
  if (!quiet) {
    console.log(`[gallery] done in ${(elapsedMs / 1000).toFixed(1)}s → ${outDir}`);
  }
  return { outDir, grid, plans, metrics, seeds: seedList, elapsedMs };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { seeds: 6, out: path.join(ROOT, "gallery") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--seeds") args.seeds = Math.max(1, parseInt(argv[++i], 10) || 6);
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--no-browser") args.withBrowser = false;
  }
  return args;
}

if (require.main === module) {
  runGallery(parseArgs(process.argv.slice(2)))
    .then(({ metrics, outDir }) => {
      // Gate summary on stdout — the CLI reports, the Jest suite asserts.
      const failures = [];
      const belowTarget = [];
      for (const [card, samples] of Object.entries(metrics.contrast || {})) {
        for (const s of samples) {
          if (!s.pass) failures.push(`${card}: "${s.text}" ${s.minRatio}:1 below binding floor (${s.class})`);
          else if (!s.meetsTarget) belowTarget.push(`${card}: "${s.text}" ${s.minRatio}:1 < engine target ${s.targetRatio}:1 (${s.class})`);
        }
      }
      for (const [fixtureKey, data] of Object.entries(metrics.perceptual || {})) {
        for (const c of data.consecutive || []) {
          if (c.pixelmatch < GATES.perceptual.minConsecutiveDistance) {
            failures.push(`${fixtureKey} ${c.pair}: distance ${c.pixelmatch} < ${GATES.perceptual.minConsecutiveDistance}`);
          }
        }
      }
      if (belowTarget.length) {
        console.warn(`[gallery] ${belowTarget.length} sample(s) below the phase-2 engine target (recorded, non-binding):`);
        for (const f of belowTarget) console.warn(`  ~ ${f}`);
      }
      if (failures.length) {
        console.error(`[gallery] ${failures.length} BINDING gate failure(s):`);
        for (const f of failures) console.error(`  - ${f}`);
        process.exitCode = 1;
      } else {
        console.log(`[gallery] gates: all observations within binding thresholds`);
      }
      console.log(`[gallery] open ${path.join(outDir, "index.html")}`);
    })
    .catch((error) => {
      console.error("[gallery] FAILED:", error);
      process.exit(1);
    });
}

module.exports = {
  GATES,
  FIXTURES,
  FIXTURE_KEYS,
  PAGE_W_PX,
  PAGE_H_PX,
  runGallery,
  buildFixtures,
  composeCell,
  renderCardHtml,
  fontsCssForCard,
  cellSummary,
  analyticMatte,
  stableStringify,
  launchBrowser,
  measureFrontContrast,
  perceptualDistance,
  thumbRaw,
  contrastTargetForPt,
  bindingContrastFloor,
  wcagRatio,
  relLuminance,
};
