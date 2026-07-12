/**
 * Shared fixture inputs for the editions legacy-exactness regression.
 *
 * The baseline JSON (editions-legacy-baseline.json) was generated from the
 * PRE-editions engine (composed-v5.0, before the editions threading landed)
 * by scripts run against that revision. The regression test replays these
 * exact inputs with editions disabled/absent and asserts the plan is
 * deep-equal to the frozen baseline — the proof that the editions path is
 * strictly opt-in and legacy output is byte-identical.
 *
 * DO NOT EDIT these inputs without regenerating the baseline from a
 * known-legacy revision.
 */

"use strict";

function directorForensics() {
  const grid = Array.from({ length: 9 }, () => Array.from({ length: 6 }, () => 0.15));
  const detail = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) => (r >= 3 && r <= 6 && c >= 2 && c <= 3 ? 0.8 : 0.04)),
  );
  return {
    width: 2000,
    height: 3000,
    aspect: 0.667,
    luma: { rows: 9, cols: 6, grid, mean: 0.18, isDark: true },
    detail: { grid: detail },
    quiet: {
      top: { score: 0.95, bandRows: 3 },
      bottom: { score: 0.2, bandRows: 2 },
      left: { score: 0.3, bandCols: 2 },
      right: { score: 0.3, bandCols: 2 },
    },
    palette: [
      { hex: "#7A4A2E", population: 0.4, sat: 0.45, luma: 0.34 },
      { hex: "#D9D2C8", population: 0.3, sat: 0.07, luma: 0.82 },
    ],
    warmth: 0.3,
    saturation: 0.3,
    contrast: 0.6,
    focal: { x: 0.5, y: 0.5 },
    version: 2,
  };
}

function directorPool() {
  const img = (id, overrides) => ({
    id,
    src: `/uploads/${id}.jpg`,
    role: null,
    rawShotType: "",
    shot_type: null,
    aspect: 0.667,
    width: 2000,
    height: 3000,
    shortEdge: 2000,
    isPrimary: false,
    qualityScore: 80,
    heroScore: 50,
    reasons: [],
    metadata: {},
    ...overrides,
  });
  return [
    img("hs", { role: "headshot", rawShotType: "headshot", shot_type: "headshot", heroScore: 90, isPrimary: true, aspect: 0.8, sort: 1 }),
    img("fb", { role: "full_body", rawShotType: "full_length", shot_type: "full_length", heroScore: 60, aspect: 0.55, sort: 2 }),
    img("tq", { role: "full_body", rawShotType: "three_quarter", shot_type: "three_quarter", heroScore: 70, aspect: 0.7, sort: 3 }),
    img("ed", { role: "editorial", heroScore: 55, aspect: 0.75, sort: 4 }),
    img("ls", { role: "lifestyle", heroScore: 45, aspect: 1.3, sort: 5 }),
  ];
}

function directorInput(seed) {
  const pool = directorPool();
  return {
    profile: {
      slug: "ana-petrova",
      first_name: "Ana",
      last_name: "Petrova",
      city: "Paris",
      instagram_handle: "anapetrova",
    },
    archetype: {
      label: "Editorial",
      scores: { runway: 70, editorial: 80, commercial: 25, lifestyle: 20 },
    },
    castingAnalysis: {
      lookType: "high fashion editorial",
      marketSignals: ["editorial", "runway"],
    },
    statsBlock: { category: "women", isFitness: false },
    poolAnalysis: {
      pool,
      coverage: {},
      heroRanking: pool.map((p) => p.id),
      warnings: [],
    },
    forensicsById: { hs: directorForensics() },
    seed,
  };
}

const DIRECTOR_SEEDS = ["legacy-1", "legacy-2", "legacy-3"];

function composeProfile() {
  return {
    id: "profile-legacy-1",
    slug: "ava-stone",
    first_name: "Ava",
    last_name: "Stone",
    gender: "Female",
    age: 24,
    height_cm: 175,
    bust_cm: 86,
    waist_cm: 61,
    hips_cm: 89,
    dress_size: "4",
    shoe_size: "9",
    hair_color: "dark brown",
    eye_color: "green",
    city: "New York",
    instagram_handle: "avastone",
    is_pro: false,
    image_analysis: JSON.stringify({
      lookType: "editorial",
      marketSignals: ["editorial", "runway"],
    }),
  };
}

function composeImages() {
  const img = (id, shotType, width, height, extra = {}) => ({
    id,
    profile_id: "profile-legacy-1",
    path: `/uploads/${id}.jpg`,
    label: id,
    sort: extra.sort ?? 1,
    shot_type: shotType,
    width,
    height,
    usage_rights: "granted",
    ...extra,
  });
  return [
    img("img-1", "headshot", 1600, 2000, { is_primary: true, sort: 1 }),
    img("img-2", "full_length", 1400, 2800, { sort: 2 }),
    img("img-3", "three_quarter", 1500, 2100, { sort: 3 }),
    img("img-4", null, 1800, 1400, { style_type: "editorial", sort: 4 }),
    img("img-5", null, 1600, 2000, { style_type: "lifestyle", sort: 5 }),
  ];
}

const COMPOSE_SEEDS = ["legacy-compose-a", "legacy-compose-b"];

const COMPOSE_ARCHETYPE = { label: "Editorial", verdict: "Strong editorial presence." };

module.exports = {
  directorInput,
  DIRECTOR_SEEDS,
  composeProfile,
  composeImages,
  COMPOSE_SEEDS,
  COMPOSE_ARCHETYPE,
};
