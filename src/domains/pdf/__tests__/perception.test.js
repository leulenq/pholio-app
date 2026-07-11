/**
 * Tests for the P1 perception modules (text-metrics / matte / faces).
 *
 * Design constraint: this suite MUST pass with NO network access and whether
 * or not the heavy optional deps (harfbuzzjs / @imgly/background-removal-node
 * / @vladmandic/human) are installed. Strategy per module:
 *   - the fail-soft path (garbage/missing input → null/[]/estimate, never a
 *     throw) is exercised UNCONDITIONALLY;
 *   - the real "working" path is exercised only when its prerequisite is
 *     resolvable, otherwise test.skip;
 *   - text-metrics estimateLine() is pure math and is tested unconditionally.
 * Fixtures are synthesized with sharp at runtime.
 */

const fs = require("fs");

const textMetrics = require("../composition/perception/text-metrics");
const matte = require("../composition/perception/matte");
const faces = require("../composition/perception/faces");

let sharp = null;
try {
  // eslint-disable-next-line global-require
  sharp = require("sharp");
} catch {
  sharp = null;
}

function depInstalled(name) {
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
}

const harfbuzzInstalled = depInstalled("harfbuzzjs");
const imglyInstalled = depInstalled("@imgly/background-removal-node");
const humanInstalled = depInstalled("@vladmandic/human");

// A real font file to measure. The vendored comp-card fonts are checked in,
// so they are the primary candidates; system locations remain as fallbacks
// so the real-measurement test still runs on machines without the repo fonts.
const FONT_CANDIDATES = [
  require("path").join(__dirname, "..", "..", "..", "..", "public", "fonts", "compcard", "inter-400.ttf"),
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
  "/System/Library/Fonts/Geneva.ttf",
  "/Library/Fonts/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
];
const fontPath = FONT_CANDIDATES.find((p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
});

const GARBAGE = Buffer.from("not an image or a font at all", "utf8");

async function solidImage(w = 128, h = 192, bg = { r: 200, g: 180, b: 160 }) {
  return sharp({ create: { width: w, height: h, channels: 3, background: bg } })
    .png()
    .toBuffer();
}

// ── text-metrics ──────────────────────────────────────────────────────────

describe("text-metrics.estimateLine (unconditional)", () => {
  test("returns finite positive dimensions for a normal line", () => {
    const r = textMetrics.estimateLine({ text: "AVA MERCER", sizePt: 24 });
    expect(r.estimated).toBe(true);
    expect(r.widthIn).toBeGreaterThan(0);
    expect(r.heightIn).toBeGreaterThan(0);
    expect(Number.isFinite(r.widthIn)).toBe(true);
  });

  test("width scales linearly with size and text length", () => {
    const a = textMetrics.estimateLine({ text: "ABCD", sizePt: 20 });
    const big = textMetrics.estimateLine({ text: "ABCD", sizePt: 40 });
    const long = textMetrics.estimateLine({ text: "ABCDABCD", sizePt: 20 });
    expect(big.widthIn).toBeCloseTo(a.widthIn * 2, 5);
    expect(long.widthIn).toBeCloseTo(a.widthIn * 2, 5);
  });

  test("tracking widens the line", () => {
    const tight = textMetrics.estimateLine({ text: "NAME", sizePt: 24, trackingEm: 0 });
    const loose = textMetrics.estimateLine({ text: "NAME", sizePt: 24, trackingEm: 0.2 });
    expect(loose.widthIn).toBeGreaterThan(tight.widthIn);
  });

  test("degrades on bad/empty input without throwing", () => {
    expect(textMetrics.estimateLine({ text: "", sizePt: 24 }).widthIn).toBe(0);
    expect(() => textMetrics.estimateLine({})).not.toThrow();
    expect(textMetrics.estimateLine({}).widthIn).toBe(0);
    expect(textMetrics.estimateLine({ text: 42, sizePt: -1 }).widthIn).toBe(0);
  });
});

describe("text-metrics.measureLine fail-soft (unconditional)", () => {
  test("null when no font source is given", () => {
    expect(textMetrics.measureLine({ text: "NAME", sizePt: 24 })).toBeNull();
  });

  test("null for a garbage font buffer, never throws", () => {
    expect(() => textMetrics.measureLine({ fontBuffer: GARBAGE, text: "X", sizePt: 24 })).not.toThrow();
    expect(textMetrics.measureLine({ fontBuffer: GARBAGE, text: "X", sizePt: 24 })).toBeNull();
  });

  test("null for invalid size / non-string text", () => {
    expect(textMetrics.measureLine({ fontPath, text: "X", sizePt: 0 })).toBeNull();
    expect(textMetrics.measureLine({ fontPath, text: 7, sizePt: 24 })).toBeNull();
  });

  test("loadFont returns null for a missing path", () => {
    expect(textMetrics.loadFont("/no/such/font.ttf")).toBeNull();
    expect(textMetrics.loadFont(null)).toBeNull();
  });
});

const maybeMeasure = harfbuzzInstalled && fontPath ? describe : describe.skip;
maybeMeasure("text-metrics.measureLine real path (harfbuzz + real font)", () => {
  test("measures positive width that scales with size", () => {
    const a = textMetrics.measureLine({ fontPath, text: "AVA MERCER", sizePt: 24 });
    expect(a).not.toBeNull();
    expect(a.widthIn).toBeGreaterThan(0);
    expect(a.heightIn).toBeGreaterThan(0);
    const big = textMetrics.measureLine({ fontPath, text: "AVA MERCER", sizePt: 48 });
    expect(big.widthIn).toBeCloseTo(a.widthIn * 2, 4);
  });

  test("tracking adds exactly trackingEm*sizePt per glyph", () => {
    const text = "AVA";
    const sizePt = 24;
    const trackingEm = 0.1;
    const base = textMetrics.measureLine({ fontPath, text, sizePt, trackingEm: 0 });
    const tracked = textMetrics.measureLine({ fontPath, text, sizePt, trackingEm });
    const expectedDeltaIn = (trackingEm * sizePt * text.length) / 72;
    expect(tracked.widthIn - base.widthIn).toBeCloseTo(expectedDeltaIn, 5);
  });

  test("advanceEmFor returns a sane per-glyph em advance", () => {
    const font = textMetrics.loadFont(fontPath);
    const adv = textMetrics.advanceEmFor(font, "ABCDE");
    expect(adv).toBeGreaterThan(0.2);
    expect(adv).toBeLessThan(1.2);
    expect(textMetrics.advanceEmFor(null, "X")).toBeNull();
    expect(textMetrics.advanceEmFor(font, "")).toBe(0);
  });
});

// ── matte ───────────────────────────────────────────────────────────────

describe("matte.computeMatte fail-soft (unconditional)", () => {
  test("null for garbage / empty / null input, never throws", async () => {
    await expect(matte.computeMatte(GARBAGE)).resolves.toBeNull();
    await expect(matte.computeMatte(Buffer.alloc(0))).resolves.toBeNull();
    await expect(matte.computeMatte(null)).resolves.toBeNull();
  });

  test("null for invalid grid dimensions", async () => {
    const img = sharp ? await solidImage() : GARBAGE;
    await expect(matte.computeMatte(img, { gridW: 0, gridH: 18 })).resolves.toBeNull();
  });
});

const maybeMatte = imglyInstalled && sharp ? describe : describe.skip;
maybeMatte("matte.computeMatte real path (@imgly installed)", () => {
  test("returns null or a valid mask grid, never throws", async () => {
    const img = await solidImage();
    let res;
    await expect(
      (async () => {
        res = await matte.computeMatte(img, { gridW: 6, gridH: 9 });
      })(),
    ).resolves.toBeUndefined();
    // Inference may be unavailable offline (no model) → null is acceptable.
    if (res !== null) {
      expect(res.maskGrid).toHaveLength(9);
      expect(res.maskGrid[0]).toHaveLength(6);
      for (const row of res.maskGrid) {
        for (const v of row) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
      expect(res.width).toBeGreaterThan(0);
      expect(res.height).toBeGreaterThan(0);
    }
  }, 60000);
});

// ── faces ───────────────────────────────────────────────────────────────

describe("faces fail-soft (unconditional)", () => {
  test("detectFaces → [] for garbage / empty / null, never throws", async () => {
    await expect(faces.detectFaces(GARBAGE)).resolves.toEqual([]);
    await expect(faces.detectFaces(Buffer.alloc(0))).resolves.toEqual([]);
    await expect(faces.detectFaces(null)).resolves.toEqual([]);
  });

  test("primaryFace picks the largest box, null for empty", () => {
    expect(faces.primaryFace([])).toBeNull();
    expect(faces.primaryFace(null)).toBeNull();
    const small = { x: 0, y: 0, w: 0.1, h: 0.1 };
    const big = { x: 0.5, y: 0.5, w: 0.3, h: 0.4 };
    expect(faces.primaryFace([small, big])).toBe(big);
  });
});

const maybeFaces = humanInstalled && sharp ? describe : describe.skip;
maybeFaces("faces.detectFaces real path (@vladmandic/human installed)", () => {
  test("returns an array of 0..1 boxes, never throws", async () => {
    const img = await solidImage();
    let res;
    await expect(
      (async () => {
        res = await faces.detectFaces(img);
      })(),
    ).resolves.toBeUndefined();
    expect(Array.isArray(res)).toBe(true);
    for (const b of res) {
      for (const k of ["x", "y", "w", "h"]) {
        expect(b[k]).toBeGreaterThanOrEqual(0);
        expect(b[k]).toBeLessThanOrEqual(1);
      }
    }
  }, 60000);
});
