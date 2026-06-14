/**
 * Production audit regression battery (2026-06-12 audit).
 *
 * Every case here is a REAL-WORLD scenario the engine must survive with a
 * professional result — not a happy path. Invariants enforced:
 *   - never throws
 *   - the name NEVER overflows its band (size floor respected, or the name
 *     stacks; absolute floor 12pt)
 *   - any talent with ≥1 image gets ≥1 back photo cell (no empty back page)
 *   - no 'unsafe' crop ships
 *   - no stats ⇒ no dead carved stats area
 *   - kids cards use guardian-contact framing
 */

const { buildStatsBlock } = require("../composition/stats-formatter");
const { analyzeImagePool } = require("../composition/photo-intelligence");
const { designComposition } = require("../composition/composition-director");
const { validateLayout } = require("../composition/layout-solver");

const IMG = (id, shot, style, w, h, extra = {}) => ({
  id, path: `/uploads/${id}.jpg`, label: id, shot_type: shot, style_type: style,
  width: w, height: h, sort: extra.sort || 1, usage_rights: "granted", ...extra,
});
const FULLSET = [
  IMG("i1", "headshot", null, 1200, 1800, { is_primary: true, sort: 1 }),
  IMG("i2", null, "editorial", 900, 1125, { sort: 2 }),
  IMG("i3", "full_length", null, 900, 1247, { sort: 3 }),
  IMG("i4", null, "lifestyle", 900, 1350, { sort: 4 }),
];

function compose({ profile, casting = {}, archetype = null, images = FULLSET, representation = null, seed = "audit" }) {
  const statsBlock = buildStatsBlock(profile, {
    signals: {
      marketSignals: casting.marketSignals || [],
      lookType: casting.lookType || null,
      archetypeLabel: archetype?.label || null,
    },
  });
  const poolAnalysis = analyzeImagePool({ images, profile, castingAnalysis: casting });
  const plan = designComposition({
    profile, archetype, castingAnalysis: casting, statsBlock, poolAnalysis, seed, representation,
  });
  return { statsBlock, poolAnalysis, plan };
}

function assertCoreInvariants(plan, imageCount) {
  // name never overflows: solved size respects the absolute floor and the
  // estimated set width fits inside the band.
  const pt = parseFloat(plan.typography.nameSize);
  expect(pt).toBeGreaterThanOrEqual(12);
  const band = plan.front.geometry.nameBand;
  const tracking = parseFloat(plan.typography.nameTracking);
  const lines = plan.front.name.lines || [
    plan.language.name.text,
  ];
  const glyph = plan.language.name.glyphEm || 0.6;
  for (const line of lines) {
    const estWidthIn = (line.length * (glyph + tracking) * pt) / 72;
    expect(estWidthIn).toBeLessThanOrEqual(band.w + 0.01);
  }
  // back page never empty when imagery exists
  if (imageCount >= 1) {
    expect(plan.back.layout.cells.length).toBeGreaterThanOrEqual(1);
  }
  // no unsafe crops ship
  for (const cell of plan.back.layout.cells) {
    expect(cell.crop.safety.level).not.toBe("unsafe");
  }
  if (plan.front.crop) expect(plan.front.crop.safety.level).not.toBe("unsafe");
  expect(validateLayout(plan.back.layout).ok).toBe(true);
}

describe("audit battery — real-world scenarios", () => {
  test("men's card: chest/inseam/suit stats, layout sound", () => {
    const { statsBlock, plan } = compose({
      profile: { slug: "dario", first_name: "Dario", last_name: "Fontana", gender: "Male", city: "Milan", phone: "+39 02", height_cm: 188, bust_cm: 102, waist_cm: 81, inseam_cm: 86, shoe_size: "11", hair_color: "brown", eye_color: "brown" },
      archetype: { label: "Editorial" },
      representation: "Forte Models",
    });
    const labels = statsBlock.lines.map((l) => l.label);
    expect(labels).toEqual(expect.arrayContaining(["CHEST", "WAIST", "INSEAM", "SUIT"]));
    expect(labels).not.toContain("BUST");
    expect(statsBlock.lines.find((l) => l.label === "SUIT").value).toBe("40L");
    assertCoreInvariants(plan, 4);
  });

  test("kids card: age shown, no B/W/H, guardian contact framing", () => {
    const { statsBlock, plan } = compose({
      profile: { slug: "remy", first_name: "Remy", last_name: "Cole", gender: "Female", age: 9, city: "Chicago", phone: "+1 312", height_cm: 134, dress_size: "8", shoe_size: "3", hair_color: "brown", eye_color: "hazel" },
    });
    const labels = statsBlock.lines.map((l) => l.label);
    expect(labels).toContain("AGE");
    expect(labels).not.toContain("BUST");
    expect(plan.back.booking.label).toBe("Guardian Contact");
    assertCoreInvariants(plan, 4);
  });

  test("very long hyphenated name never clips (stacks or shrinks within floor)", () => {
    for (let i = 0; i < 8; i++) {
      const { plan } = compose({
        profile: { slug: "akw", first_name: "Alexandra", last_name: "Konstantinopoulos-Whitmore", gender: "Female", city: "London", height_cm: 177, bust_cm: 84, waist_cm: 61, hips_cm: 89, hair_color: "black", eye_color: "blue" },
        archetype: { label: "Runway" },
        seed: `long-${i}`,
      });
      assertCoreInvariants(plan, 4);
    }
  });

  test("single image: hero reused — the back page is never empty", () => {
    const { plan } = compose({
      profile: { slug: "mara", first_name: "Mara", last_name: "Quinn", gender: "Female", city: "Dublin", height_cm: 173, bust_cm: 86, waist_cm: 63, hips_cm: 91, hair_color: "red", eye_color: "green" },
      images: FULLSET.slice(0, 1),
    });
    expect(plan.back.layout.cells.length).toBeGreaterThanOrEqual(1);
    expect(plan.warnings.join(" ")).toMatch(/hero image reused|3 preferred/);
    assertCoreInvariants(plan, 1);
  });

  test("two images: both pages photographed, warnings surfaced", () => {
    const { plan } = compose({
      profile: { slug: "ines", first_name: "Ines", last_name: "Vidal", gender: "Female", city: "Madrid", height_cm: 175, bust_cm: 85, waist_cm: 62, hips_cm: 90, hair_color: "brown", eye_color: "brown" },
      images: FULLSET.slice(0, 2),
    });
    expect(plan.back.layout.cells.length).toBeGreaterThanOrEqual(2);
    expect(plan.warnings.join(" ")).toMatch(/full-body|full-length/);
    assertCoreInvariants(plan, 2);
  });

  test("no stats + no contact: no dead carved stats area, no throw", () => {
    const { statsBlock, plan } = compose({
      profile: { slug: "sol", first_name: "Sol", last_name: "Marek", gender: "Non-binary" },
    });
    expect(statsBlock.lines).toHaveLength(0);
    expect(plan.back.layout.statsBlock.w).toBe(0); // nothing carved
    expect(plan.back.booking.primary).toBeNull();
    assertCoreInvariants(plan, 4);
  });

  test("untyped images without dimensions still compose", () => {
    const images = [
      { id: "u1", path: "/u/1.jpg", sort: 1, usage_rights: "granted" },
      { id: "u2", path: "/u/2.jpg", sort: 2, usage_rights: "granted" },
      { id: "u3", path: "/u/3.jpg", sort: 3, usage_rights: "granted" },
    ];
    const { plan } = compose({
      profile: { slug: "lia", first_name: "Lia", last_name: "Park", gender: "Female", city: "Seoul", height_cm: 170, bust_cm: 83, waist_cm: 60, hips_cm: 88, hair_color: "black", eye_color: "brown" },
      images,
    });
    assertCoreInvariants(plan, 3);
  });

  test("front stat line uses the compact form, never the full inline strip", () => {
    const { plan, statsBlock } = compose({
      profile: { slug: "vespera", first_name: "Vespera", last_name: "Lin", gender: "Female", city: "Paris", height_cm: 179, bust_cm: 82, waist_cm: 60, hips_cm: 88, dress_size: "2", shoe_size: "9", hair_color: "black", eye_color: "brown" },
      archetype: { label: "Runway" },
      casting: { lookType: "high fashion runway" },
      seed: "fsl",
    });
    if (plan.front.statLineText) {
      // compact = first 4 stat lines only (height + B/W/H), no dress/shoes
      expect(plan.front.statLineText).not.toMatch(/DRESS|SHOES/);
      expect(statsBlock.lines.length).toBeGreaterThan(4);
    }
  });
});
