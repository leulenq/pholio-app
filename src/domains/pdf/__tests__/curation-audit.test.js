/**
 * Tests for the agency-grade audit layer: back-story curation, booking/
 * representation block, and dynamic gold wordmark placement.
 */

const { curateBackStory } = require("../composition/photo-intelligence");
const {
  designComposition,
  buildBookingBlock,
  placeFrontWordmark,
} = require("../composition/composition-director");
const { cornerStats } = require("../composition/contrast");

function poolImage(id, overrides = {}) {
  return {
    id,
    src: `/uploads/${id}.jpg`,
    label: null,
    role: null,
    rawShotType: "",
    shot_type: null,
    style_type: null,
    aspect: 0.7,
    qualityScore: 70,
    heroScore: 50,
    metadata: {},
    ...overrides,
  };
}

describe("curateBackStory", () => {
  const POOL = [
    poolImage("hs1", { role: "headshot", rawShotType: "headshot", heroScore: 90, qualityScore: 85 }),
    poolImage("hs2", { role: "headshot", rawShotType: "headshot", heroScore: 80, qualityScore: 84 }),
    poolImage("hs3", { role: "headshot", rawShotType: "headshot", heroScore: 75, qualityScore: 83 }),
    poolImage("fl", { role: "full_body", rawShotType: "full_length", qualityScore: 70 }),
    poolImage("ed", { role: "editorial", style_type: "editorial", label: "Editorial", qualityScore: 72 }),
    poolImage("ls", { role: "lifestyle", style_type: "lifestyle", label: "Commercial smile", qualityScore: 60 }),
  ];

  test("hero never repeats; full-length anchors the story", () => {
    const { story } = curateBackStory({ pool: POOL, heroId: "hs1", max: 4 });
    expect(story.map((s) => s.id)).not.toContain("hs1");
    expect(story[0].id).toBe("fl"); // mandatory full-length picked first
  });

  test("variety: hero's register at most once, two per role max", () => {
    const { story } = curateBackStory({ pool: POOL, heroId: "hs1", max: 5 });
    const headshots = story.filter((s) => s.role === "headshot");
    expect(headshots.length).toBeLessThanOrEqual(2);
    // headshot trio in the pool must NOT dominate the story
    expect(new Set(story.map((s) => s.role)).size).toBeGreaterThanOrEqual(3);
  });

  test("market signals pull matching images up", () => {
    const withSignal = curateBackStory({
      pool: POOL,
      heroId: "hs1",
      marketSignals: ["commercial lifestyle"],
      max: 3,
    });
    const without = curateBackStory({ pool: POOL, heroId: "hs1", max: 3 });
    const rankWith = withSignal.story.findIndex((s) => s.id === "ls");
    const rankWithout = without.story.findIndex((s) => s.id === "ls");
    expect(rankWith).toBeGreaterThanOrEqual(0);
    if (rankWithout >= 0) expect(rankWith).toBeLessThanOrEqual(rankWithout);
  });

  test("warns when no full-length exists", () => {
    const { warnings } = curateBackStory({
      pool: POOL.filter((p) => p.id !== "fl"),
      heroId: "hs1",
    });
    expect(warnings.join(" ")).toMatch(/full-length/);
  });
});

describe("buildBookingBlock", () => {
  const profile = { city: "Paris", instagram_handle: "ana", phone: "+33 1" };

  test("represented talent leads with the agency under the same hierarchy", () => {
    const booking = buildBookingBlock(profile, "Icon Management");
    expect(booking.mode).toBe("represented");
    expect(booking.label).toBe("Representation");
    expect(booking.primary).toBe("Icon Management");
    expect(booking.line).toContain("Paris");
  });

  test("direct talent leads with the strongest channel — structural parity", () => {
    const booking = buildBookingBlock(profile, null);
    expect(booking.mode).toBe("direct");
    expect(booking.label).toBe("Direct Bookings");
    expect(booking.primary).toBe("+33 1"); // phone outranks handle and city
    expect(booking.line).toBe("@ana  ·  Paris");
    // identical shape to the represented treatment
    expect(Object.keys(booking).sort()).toEqual(
      Object.keys(buildBookingBlock(profile, "X")).sort(),
    );
  });

  test("handle leads when no phone exists; nothing → no label to frame", () => {
    const handleOnly = buildBookingBlock({ instagram_handle: "ana" }, null);
    expect(handleOnly.primary).toBe("@ana");
    const empty = buildBookingBlock({}, null);
    expect(empty.label).toBeNull();
    expect(empty.primary).toBeNull();
    expect(empty.line).toBe("");
  });
});

describe("dynamic wordmark placement", () => {
  function forensicsQuietCorner(corner) {
    const grid = Array.from({ length: 9 }, () => Array.from({ length: 6 }, () => 0.5));
    const detail = Array.from({ length: 9 }, () => Array.from({ length: 6 }, () => 0.6));
    const rows = corner.startsWith("top") ? [0, 1] : [7, 8];
    const cols = corner.endsWith("left") ? [0, 1] : [4, 5];
    for (const r of rows) for (const c of cols) {
      grid[r][c] = 0.08; // dark and calm
      detail[r][c] = 0.02;
    }
    return {
      luma: { rows: 9, cols: 6, grid, mean: 0.5, isDark: false },
      detail: { grid: detail },
      quiet: { top: { score: 0.5, bandRows: 2 }, bottom: { score: 0.5, bandRows: 2 }, left: { score: 0.5, bandCols: 2 }, right: { score: 0.5, bandCols: 2 } },
    };
  }

  const fullBleedGeometry = {
    hero: { x: 0, y: 0, w: 5.5, h: 8.5, bleedEdges: ["top", "right", "bottom", "left"] },
    nameBand: { x: 0.25, y: 0.37, w: 5, h: 0.7, onImage: true, inkOn: "light" },
    contactBand: null,
    statLine: null,
  };

  test("cornerStats reads the right cells", () => {
    const stats = cornerStats(forensicsQuietCorner("bottom-left"), "bottom-left");
    expect(stats.mean).toBeCloseTo(0.08, 2);
    expect(stats.quiet).toBeGreaterThan(0.9);
    expect(cornerStats(null, "bottom-left")).toBeNull();
  });

  test("the quiet corner wins on a full bleed", () => {
    const placed = placeFrontWordmark({
      geometry: fullBleedGeometry,
      heroForensics: forensicsQuietCorner("bottom-left"),
      treatment: "full-bleed",
      briefCorner: null,
      statLine: null,
    });
    expect(placed.corner).toBe("bottom-left");
    expect(placed.rect.x).toBeCloseTo(0.25, 3);
  });

  test("a corner colliding with the name band is never chosen", () => {
    const geometry = {
      ...fullBleedGeometry,
      nameBand: { x: 0.25, y: 8.5 - 0.25 - 0.7, w: 5, h: 0.7, onImage: true, inkOn: "light" },
    };
    const placed = placeFrontWordmark({
      geometry,
      heroForensics: forensicsQuietCorner("bottom-right"),
      treatment: "full-bleed",
      briefCorner: "bottom-right",
      statLine: null,
    });
    expect(placed.corner.startsWith("bottom")).toBe(false);
    expect(placed.because).toMatch(/vetoed/);
  });

  test("brief corner adopted when it scores competitively", () => {
    // Name band at the bottom leaves the top corners free; the brief asks
    // for the measurably quiet top-right corner.
    const geometry = {
      ...fullBleedGeometry,
      nameBand: { x: 0.25, y: 7.3, w: 5, h: 0.7, onImage: true, inkOn: "light" },
    };
    const placed = placeFrontWordmark({
      geometry,
      heroForensics: forensicsQuietCorner("top-right"),
      treatment: "full-bleed",
      briefCorner: "top-right",
      statLine: null,
    });
    expect(placed.corner).toBe("top-right");
    expect(placed.because).toMatch(/adopted/);
  });
});

describe("plan-level audit integration", () => {
  function makeInput() {
    const pool = [
      poolImage("hs", { role: "headshot", rawShotType: "headshot", heroScore: 90, qualityScore: 85, aspect: 0.8 }),
      poolImage("fb", { role: "full_body", rawShotType: "full_length", heroScore: 60, qualityScore: 80, aspect: 0.55 }),
      poolImage("ed", { role: "editorial", heroScore: 55, qualityScore: 75 }),
      poolImage("ls", { role: "lifestyle", heroScore: 45, qualityScore: 70, aspect: 1.3 }),
    ];
    return {
      profile: { slug: "ana", first_name: "Ana", last_name: "Petrova", city: "Paris", instagram_handle: "ana" },
      archetype: { label: "Editorial" },
      castingAnalysis: { lookType: "editorial", marketSignals: ["editorial"] },
      statsBlock: { category: "women", isFitness: false },
      poolAnalysis: { pool, heroRanking: pool.map((p) => p.id), warnings: [] },
      seed: "audit-1",
    };
  }

  test("plan carries booking, gold wordmark metadata, and curation decisions", () => {
    const plan = designComposition({ ...makeInput(), representation: "Icon Management" });
    expect(plan.back.booking.mode).toBe("represented");
    expect(plan.back.booking.primary).toBe("Icon Management");
    expect(plan.wordmark.corner).toBeTruthy();
    expect(["left", "right"]).toContain(plan.wordmark.align);
    expect(["gold-bright", "gold-deep"]).toContain(plan.wordmark.tone);
    expect(plan.decisions.some((d) => d.aspect === "back-story")).toBe(true);
    expect(plan.decisions.some((d) => d.aspect === "wordmark-placement")).toBe(true);
    // link rect follows the placed corner
    expect(plan.wordmark.front).toEqual(plan.front.geometry.wordmark);
  });

  test("crop healing: an image that cannot survive its cell is swapped, not butchered", () => {
    // A wide lifestyle image (aspect 1.6) forced into a very tall cell loses
    // >55% of its width → unsafe. A benched portrait (0.6) fits cleanly.
    const pool = [
      poolImage("hs", { role: "headshot", rawShotType: "headshot", heroScore: 90, qualityScore: 85, aspect: 0.8 }),
      poolImage("fb", { role: "full_body", rawShotType: "full_length", heroScore: 60, qualityScore: 80, aspect: 0.55 }),
      poolImage("wide1", { role: "lifestyle", heroScore: 55, qualityScore: 78, aspect: 1.6 }),
      poolImage("wide2", { role: "editorial", heroScore: 50, qualityScore: 76, aspect: 1.7 }),
      poolImage("benchA", { role: "editorial", heroScore: 45, qualityScore: 74, aspect: 0.6 }),
      poolImage("benchB", { role: "lifestyle", heroScore: 40, qualityScore: 72, aspect: 0.65 }),
    ];
    let healed = 0;
    for (let i = 0; i < 12; i++) {
      const plan = designComposition({
        ...makeInput(),
        seed: `heal-${i}`,
        poolAnalysis: { pool, heroRanking: pool.map((p) => p.id), warnings: [] },
        pool,
      });
      if (plan.decisions.some((d) => d.aspect === "crop-healing")) healed += 1;
      // Hard guarantee regardless of healing: no unsafe crop ever ships.
      for (const cell of plan.back.layout.cells) {
        expect(cell.crop.safety.level).not.toBe("unsafe");
      }
    }
    expect(healed).toBeGreaterThan(0); // the swap path is actually exercised
  });

  test("brief wordmarkCorner flows through with veto power retained", () => {
    const plan = designComposition({
      ...makeInput(),
      brief: {
        typographyVoice: "editorial-serif",
        tone: { formality: 0.7, warmth: 0.4, energy: 0.3, density: 0.45 },
        frontTreatment: "floated",
        statsSide: "right",
        frontStatLine: false,
        bleedAppetite: "restrained",
        heroImageId: "hs",
        wordmarkCorner: "bottom-left",
        rationale: "test",
      },
    });
    const decision = plan.decisions.find((d) => d.aspect === "wordmark-placement");
    expect(decision).toBeTruthy();
    expect(decision.because).toMatch(/adopted|vetoed/);
  });
});
