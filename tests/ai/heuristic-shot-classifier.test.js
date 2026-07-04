const { classifyShotHeuristic } = require("../../src/domains/ai/heuristic-shot-classifier");

describe("classifyShotHeuristic", () => {
  test("large centered face → headshot", () => {
    const r = classifyShotHeuristic({
      width: 1200,
      height: 1600,
      faces: [{ x: 0.3, y: 0.1, w: 0.4, h: 0.35 }],
    });
    expect(r.shot_type).toBe("headshot");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });

  test("small face high in frame → full_length", () => {
    const r = classifyShotHeuristic({
      width: 1200,
      height: 2000,
      faces: [{ x: 0.42, y: 0.05, w: 0.12, h: 0.08 }],
    });
    expect(r.shot_type).toBe("full_length");
  });

  test("lateral face → profile", () => {
    const r = classifyShotHeuristic({
      width: 1200,
      height: 1600,
      faces: [{ x: 0.02, y: 0.15, w: 0.18, h: 0.2 }],
    });
    expect(r.shot_type).toBe("profile_left");
  });

  test("no faces → low confidence null", () => {
    const r = classifyShotHeuristic({ width: 1000, height: 1500, faces: [] });
    expect(r.confidence).toBeLessThan(0.5);
    expect(r.shot_type).toBeNull();
  });
});
