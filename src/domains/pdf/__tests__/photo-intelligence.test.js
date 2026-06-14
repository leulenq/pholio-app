const {
  analyzeImagePool,
  RIGHTS_DENIED_VALUES,
} = require("../composition/photo-intelligence");

function img(overrides = {}) {
  return {
    id: overrides.id || "img-1",
    path: `/uploads/${overrides.id || "img-1"}.jpg`,
    sort: 1,
    ...overrides,
  };
}

describe("analyzeImagePool", () => {
  describe("eligibility filtering", () => {
    test("drops archived and retired images, keeps active/null status", () => {
      const result = analyzeImagePool({
        images: [
          img({ id: "a", status: "active" }),
          img({ id: "b", status: "archived" }),
          img({ id: "c", status: "retired" }),
          img({ id: "d", status: null }),
          img({ id: "e", status: "" }),
        ],
      });
      const ids = result.pool.map((p) => p.id).sort();
      expect(ids).toEqual(["a", "d", "e"]);
      expect(result.warnings.join(" ")).toMatch(/excluded \(archived\/retired\)/);
    });

    test("drops rights-denied images via columns and metadata (guardrails token set)", () => {
      const result = analyzeImagePool({
        images: [
          img({ id: "ok", usage_rights: "licensed" }),
          img({ id: "col-denied", usage_rights: "denied" }),
          img({ id: "meta-blocked", metadata: { rights_status: "blocked" } }),
          img({
            id: "meta-string",
            metadata: JSON.stringify({ license_status: "restricted" }),
          }),
        ],
      });
      const ids = result.pool.map((p) => p.id).sort();
      expect(ids).toEqual(["ok"]);
      expect(result.warnings.join(" ")).toMatch(/rights denied/);
    });

    test("token set matches guardrails semantics", () => {
      expect([...RIGHTS_DENIED_VALUES].sort()).toEqual([
        "blocked",
        "denied",
        "forbidden",
        "restricted",
        "unlicensed",
      ]);
    });

    test("ignores images without an id", () => {
      const result = analyzeImagePool({
        images: [null, {}, img({ id: "real" })],
      });
      expect(result.pool.map((p) => p.id)).toEqual(["real"]);
    });
  });

  describe("defensive metadata parsing", () => {
    test("handles metadata as object, JSON string, and malformed string", () => {
      const result = analyzeImagePool({
        images: [
          img({ id: "obj", metadata: { width: 2000, height: 3000 } }),
          img({
            id: "str",
            metadata: JSON.stringify({ width: 2000, height: 3000 }),
          }),
          img({ id: "bad", metadata: "{not json" }),
        ],
      });
      const byId = Object.fromEntries(result.pool.map((p) => [p.id, p]));
      expect(byId.obj.width).toBe(2000);
      expect(byId.obj.shortEdge).toBe(2000);
      expect(byId.str.height).toBe(3000);
      expect(byId.bad.width).toBeNull();
      expect(byId.bad.aspect).toBeNull();
    });

    test("column width/height wins over metadata fallback", () => {
      const result = analyzeImagePool({
        images: [
          img({
            id: "a",
            width: 1500,
            height: 2200,
            metadata: { width: 100, height: 100 },
          }),
        ],
      });
      expect(result.pool[0].width).toBe(1500);
      expect(result.pool[0].height).toBe(2200);
    });

    test("handles castingAnalysis as JSON string", () => {
      const result = analyzeImagePool({
        images: [img({ id: "a" })],
        castingAnalysis: JSON.stringify({ photoQuality: "low light, poor" }),
      });
      expect(result.warnings.join(" ")).toMatch(/photo quality/i);
    });
  });

  describe("pool shape and scoring", () => {
    test("src prefers public_url over path", () => {
      const result = analyzeImagePool({
        images: [
          img({ id: "a", public_url: "https://cdn/a.jpg", path: "/local/a.jpg" }),
          img({ id: "b", public_url: null, path: "/local/b.jpg" }),
        ],
      });
      const byId = Object.fromEntries(result.pool.map((p) => [p.id, p]));
      expect(byId.a.src).toBe("https://cdn/a.jpg");
      expect(byId.b.src).toBe("/local/b.jpg");
    });

    test("role comes from selector derivation (shot_type/style_type/legacy)", () => {
      const result = analyzeImagePool({
        images: [
          img({ id: "h", shot_type: "headshot" }),
          img({ id: "f", shot_type: "full_length" }),
          img({ id: "e", style_type: "editorial" }),
          img({ id: "l", style_type: "lifestyle" }),
          img({ id: "legacy", metadata: { role: "headshot" } }),
          img({ id: "u" }),
        ],
      });
      const byId = Object.fromEntries(result.pool.map((p) => [p.id, p]));
      expect(byId.h.role).toBe("headshot");
      expect(byId.f.role).toBe("full_body");
      expect(byId.e.role).toBe("editorial");
      expect(byId.l.role).toBe("lifestyle");
      expect(byId.legacy.role).toBe("headshot");
      expect(byId.u.role).toBeNull();
    });

    test("pool is sorted by heroScore desc and heroRanking matches", () => {
      const result = analyzeImagePool({
        images: [
          img({ id: "untyped", sort: 9 }),
          img({
            id: "primary-headshot",
            shot_type: "headshot",
            is_primary: true,
            width: 2000,
            height: 3000,
            sort: 1,
          }),
          img({ id: "plain-headshot", shot_type: "headshot", sort: 5 }),
        ],
      });
      const scores = result.pool.map((p) => p.heroScore);
      const sorted = [...scores].sort((a, b) => b - a);
      expect(scores).toEqual(sorted);
      expect(result.pool[0].id).toBe("primary-headshot");
      expect(result.heroRanking).toEqual(result.pool.map((p) => p.id));
    });

    test("headshot outranks identical untyped image (role bonus)", () => {
      const base = { width: 2000, height: 3000, sort: 1 };
      const result = analyzeImagePool({
        images: [
          img({ id: "untyped", ...base }),
          img({ id: "head", shot_type: "headshot", ...base, sort: 2 }),
        ],
      });
      expect(result.heroRanking[0]).toBe("head");
    });

    test("is_primary breaks ties between identical headshots", () => {
      const base = { shot_type: "headshot", width: 2000, height: 3000 };
      const result = analyzeImagePool({
        images: [
          img({ id: "plain", ...base, sort: 1 }),
          img({ id: "primary", ...base, sort: 1, is_primary: true }),
        ],
      });
      expect(result.heroRanking[0]).toBe("primary");
    });

    test("higher resolution increases both scores", () => {
      const result = analyzeImagePool({
        images: [
          img({ id: "small", shot_type: "headshot", width: 600, height: 900, sort: 1 }),
          img({ id: "big", shot_type: "headshot", width: 2000, height: 3000, sort: 1 }),
        ],
      });
      const byId = Object.fromEntries(result.pool.map((p) => [p.id, p]));
      expect(byId.big.heroScore).toBeGreaterThan(byId.small.heroScore);
      expect(byId.big.qualityScore).toBeGreaterThan(byId.small.qualityScore);
    });

    test("scores are clamped to 0-100 and reasons explain contributions", () => {
      const result = analyzeImagePool({
        images: [
          img({
            id: "max",
            shot_type: "headshot",
            is_primary: true,
            width: 1942, // aspect ~0.647
            height: 3000,
            sort: 0,
          }),
        ],
      });
      const top = result.pool[0];
      expect(top.heroScore).toBeLessThanOrEqual(100);
      expect(top.qualityScore).toBeLessThanOrEqual(100);
      expect(top.reasons.length).toBeGreaterThan(0);
      expect(top.reasons.join(" ")).toMatch(/role headshot \+30/);
      expect(top.reasons.join(" ")).toMatch(/is_primary/);
    });

    test("deterministic: same input twice gives deep-equal output", () => {
      const images = [
        img({ id: "a", shot_type: "headshot", width: 2000, height: 3000, sort: 1 }),
        img({ id: "b", shot_type: "full_length", width: 1200, height: 1800, sort: 2 }),
        img({ id: "c", style_type: "editorial", sort: 3 }),
        img({ id: "d", sort: 4 }),
      ];
      expect(analyzeImagePool({ images })).toEqual(analyzeImagePool({ images }));
    });
  });

  describe("coverage and warnings", () => {
    test("coverage counts roles and untyped", () => {
      const result = analyzeImagePool({
        images: [
          img({ id: "h1", shot_type: "headshot" }),
          img({ id: "h2", shot_type: "headshot" }),
          img({ id: "f1", shot_type: "full_body" }),
          img({ id: "e1", style_type: "editorial" }),
          img({ id: "l1", style_type: "lifestyle" }),
          img({ id: "u1" }),
          img({ id: "u2" }),
        ],
      });
      expect(result.coverage).toEqual({
        headshot: 2,
        full_body: 1,
        editorial: 1,
        lifestyle: 1,
        untyped: 2,
      });
    });

    test("warns when no full-body image is available", () => {
      const result = analyzeImagePool({
        images: [img({ id: "h", shot_type: "headshot" })],
      });
      expect(result.warnings).toContain("no full-body image available");
    });

    test("warns when no headshot is available", () => {
      const result = analyzeImagePool({
        images: [img({ id: "f", shot_type: "full_length" })],
      });
      expect(result.warnings).toContain("no headshot available");
    });

    test("empty input yields empty pool with warning", () => {
      const result = analyzeImagePool({ images: [] });
      expect(result.pool).toEqual([]);
      expect(result.heroRanking).toEqual([]);
      expect(result.coverage.untyped).toBe(0);
      expect(result.warnings.join(" ")).toMatch(/no eligible images/i);
    });

    test("handles missing arguments entirely", () => {
      const result = analyzeImagePool();
      expect(result.pool).toEqual([]);
    });

    test("warns about images without a renderable src", () => {
      const result = analyzeImagePool({
        images: [{ id: "nopath", sort: 1 }],
      });
      expect(result.warnings.join(" ")).toMatch(/missing a renderable source/);
    });
  });
});
