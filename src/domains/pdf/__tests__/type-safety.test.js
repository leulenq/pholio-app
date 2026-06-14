/**
 * Typography-placement safety — production blocker tests.
 */

const {
  evaluateNameBand,
  subjectGrid,
  faceZone,
  cornerProtected,
  SUBJECT_OCCUPANCY_MAX,
} = require("../composition/type-safety");
const { designComposition } = require("../composition/composition-director");

function studio({ focal = { x: 0.5, y: 0.5 }, topLuma = 0.15, subjectRows = [3, 6] } = {}) {
  const grid = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 6 }, () => (r < 3 ? topLuma : 0.15)),
  );
  const detail = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) =>
      r >= subjectRows[0] && r <= subjectRows[1] && c >= 2 && c <= 3 ? 0.8 : 0.04,
    ),
  );
  return {
    width: 2000, height: 3000, aspect: 0.667,
    luma: { rows: 9, cols: 6, grid, mean: 0.18, isDark: true },
    detail: { grid: detail },
    quiet: {
      top: { score: 0.9, bandRows: 2 },
      bottom: { score: 0.9, bandRows: 2 },
      left: { score: 0.4, bandCols: 2 },
      right: { score: 0.4, bandCols: 2 },
    },
    palette: [{ hex: "#333", population: 0.5, sat: 0.1, luma: 0.2 }],
    warmth: 0, saturation: 0.2, contrast: 0.5,
    focal, version: 2,
  };
}

describe("evaluateNameBand — the three gates", () => {
  test("clear dark band passes with light ink", () => {
    const v = evaluateNameBand({ forensics: studio(), edge: "top" });
    expect(v.ok).toBe(true);
    expect(v.contrast.ink).toBe("light");
    expect(v.faceOverlap).toBe(false);
  });

  test("face zone in the band is an absolute veto", () => {
    // focal high in the frame → face zone reaches the top band
    const v = evaluateNameBand({ forensics: studio({ focal: { x: 0.5, y: 0.18 } }), edge: "top" });
    expect(v.ok).toBe(false);
    expect(v.because).toMatch(/face/);
  });

  test("band mostly on the body is a veto", () => {
    // subject detail extends into the top rows across most columns
    const f = studio();
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) f.detail.grid[r][c] = 0.9;
    const v = evaluateNameBand({ forensics: f, edge: "top" });
    expect(v.ok).toBe(false);
    expect(v.because).toMatch(/body|subject/);
    expect(v.subjectOccupancy).toBeGreaterThan(SUBJECT_OCCUPANCY_MAX);
  });

  test("unmeasured or focal-less imagery refuses on-image type outright", () => {
    expect(evaluateNameBand({ forensics: null, edge: "top" }).ok).toBe(false);
    const noFocal = studio();
    delete noFocal.focal;
    const v = evaluateNameBand({ forensics: noFocal, edge: "top" });
    expect(v.ok).toBe(false);
    expect(v.because).toMatch(/focal|unverifiable/);
  });

  test("unrescuable contrast fails even when clear of the subject", () => {
    // mid-luma busy top band, no subject there
    const f = studio({ topLuma: 0.45 });
    for (let c = 0; c < 6; c++) {
      f.luma.grid[0][c] = c % 2 ? 0.2 : 0.75;
      f.luma.grid[1][c] = c % 2 ? 0.25 : 0.7;
      f.detail.grid[0][c] = 0.4; // busy but below subject threshold
      f.detail.grid[1][c] = 0.4;
    }
    f.quiet.top.score = 0.6;
    const v = evaluateNameBand({ forensics: f, edge: "top" });
    expect(v.ok).toBe(false);
  });
});

describe("helpers", () => {
  test("subjectGrid marks the talent, not the backdrop", () => {
    const mask = subjectGrid(studio());
    expect(mask[4][2]).toBe(true);  // subject column
    expect(mask[0][0]).toBe(false); // backdrop corner
  });

  test("faceZone derives from focal; cornerProtected vetoes a face corner", () => {
    expect(faceZone(studio()).y0).toBeCloseTo(0.34, 2);
    expect(cornerProtected(studio({ focal: { x: 0.85, y: 0.85 } }), "bottom-right")).toBe(true);
    expect(cornerProtected(studio(), "top-left")).toBe(false);
  });
});

describe("director enforcement", () => {
  function input(forensics, seed = "ts-1") {
    const pool = [
      { id: "hs", role: "headshot", rawShotType: "headshot", aspect: 0.8, heroScore: 90, qualityScore: 85 },
      { id: "fb", role: "full_body", rawShotType: "full_length", aspect: 0.55, heroScore: 60, qualityScore: 80 },
      { id: "ed", role: "editorial", rawShotType: "", aspect: 0.7, heroScore: 55, qualityScore: 75 },
      { id: "ls", role: "lifestyle", rawShotType: "", aspect: 1.3, heroScore: 45, qualityScore: 70 },
    ];
    return {
      profile: { slug: "ts", first_name: "Tess", last_name: "Saint", city: "Oslo" },
      archetype: { label: "Editorial" },
      castingAnalysis: { lookType: "editorial" },
      statsBlock: { category: "women", isFitness: false },
      poolAnalysis: { pool, heroRanking: pool.map((p) => p.id), warnings: [] },
      forensicsById: new Map([["hs", forensics]]),
      seed,
    };
  }

  test("a face-filling hero NEVER carries an on-image name (demotion across seeds)", () => {
    // Face high AND low: both bands intersect face/subject → every on-image
    // candidate fails → name must end on paper, full bleeds demoted.
    const f = studio({ focal: { x: 0.5, y: 0.2 }, subjectRows: [0, 8] });
    for (let r = 0; r < 9; r++) for (let c = 1; c < 5; c++) f.detail.grid[r][c] = 0.9;
    for (let i = 0; i < 10; i++) {
      const plan = designComposition(input(f, `ts-${i}`));
      expect(plan.front.geometry.nameBand.onImage).toBe(false);
      expect(plan.front.typeSafety.onImage).toBe(false);
    }
  });

  test("verified on-image placement records its verification", () => {
    let found = false;
    for (let i = 0; i < 20; i++) {
      const plan = designComposition(input(studio(), `ok-${i}`));
      if (plan.front.geometry.nameBand.onImage) {
        expect(plan.front.typeSafety.onImage).toBe(true);
        expect(plan.front.typeSafety.verified).toBe(true);
        expect(plan.front.typeSafety.because).toMatch(/verified/);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  test("no forensics ⇒ all names on paper (strict unverifiable rule)", () => {
    for (let i = 0; i < 8; i++) {
      const plan = designComposition({ ...input(studio(), `np-${i}`), forensicsById: null });
      expect(plan.front.geometry.nameBand.onImage).toBe(false);
    }
  });
});
