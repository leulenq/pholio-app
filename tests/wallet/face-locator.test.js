"use strict";

const sharp = require("sharp");
const { headFromMatte, faceCentre, locateSubject, PEOPLE_PRIOR } = require("../../src/domains/wallet/services/face-locator");

/** A 12×18 matte grid of a standing figure: head 2 cols wide at rows 2–3, shoulders below. */
function figureGrid({ headCols = [5, 6], headTop = 2, bodyTop = 4, bodyCols = [3, 8], rows = 18, cols = 12 } = {}) {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r >= headTop && r < bodyTop && c >= headCols[0] && c <= headCols[1]) return 0.9;
      if (r >= bodyTop && r < rows - 1 && c >= bodyCols[0] && c <= bodyCols[1]) return 0.8;
      return 0;
    }));
}

describe("Pholio ID face locator", () => {
  test("estimates the head from the top of a subject silhouette", () => {
    const head = headFromMatte(figureGrid(), { width: 800, height: 1200 });
    expect(head).not.toBeNull();
    expect(head.y).toBeCloseTo(2 / 18, 5);
    expect(head.x + head.w / 2).toBeCloseTo(6 / 12, 5);
    // Two columns of 12 on an 800×1200 image → head width 1/6 of width; height via aspect × 1.35.
    expect(head.w).toBeCloseTo(2 / 12, 5);
    expect(head.h).toBeCloseTo((2 / 12) * (800 / 1200) * 1.35, 5);
    const centre = faceCentre(head);
    expect(centre.y).toBeGreaterThan(head.y);
    expect(centre.y).toBeLessThan(head.y + head.h);
  });

  test("returns null for an empty or malformed matte", () => {
    expect(headFromMatte(null)).toBeNull();
    expect(headFromMatte([])).toBeNull();
    expect(headFromMatte(Array.from({ length: 18 }, () => Array(12).fill(0)))).toBeNull();
  });

  test("uses a cached matte on the image row before anything else", async () => {
    const photo = await sharp({ create: { width: 400, height: 600, channels: 3, background: "#cccccc" } }).jpeg().toBuffer();
    const subject = await locateSubject(photo, { metadata: JSON.stringify({ matte: { maskGrid: figureGrid(), width: 400, height: 600 } }) });
    expect(subject.source).toBe("matte-cached");
    expect(subject.face).not.toBeNull();
    expect(subject.focal.x).toBeCloseTo(0.5, 5);
  });

  test("finds the face in a real photograph with the wasm cascade detector", async () => {
    // eslint-disable-next-line global-require
    const path = require("path");
    // eslint-disable-next-line global-require
    const fs = require("fs");
    const photo = fs.readFileSync(path.resolve(__dirname, "../../client/public/assets/model_studio_warm.jpg"));
    const subject = await locateSubject(photo, {});
    expect(subject.source).toBe("detector");
    expect(subject.face.x).toBeGreaterThan(0.3);
    expect(subject.face.x).toBeLessThan(0.45);
    expect(subject.face.y).toBeLessThan(0.2);
    expect(subject.focal.y).toBeGreaterThan(0.15);
    expect(subject.focal.y).toBeLessThan(0.3);
  }, 30000);

  test("prefers the highest of comparably sized face candidates", () => {
    // eslint-disable-next-line global-require
    const { primaryFace } = require("../../src/domains/pdf/composition/perception/faces");
    const face = { x: 0.42, y: 0.32, w: 0.16, h: 0.12 };
    const knee = { x: 0.43, y: 0.54, w: 0.19, h: 0.14 };
    const speck = { x: 0.1, y: 0.05, w: 0.03, h: 0.02 };
    expect(primaryFace([knee, face, speck])).toBe(face);
    expect(primaryFace([])).toBeNull();
  });

  test("caps saliency with the people prior on portrait frames, and leaves landscapes alone", async () => {
    const bright = (w, h, cy) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#101010"/><circle cx="${w * 0.7}" cy="${cy}" r="${Math.min(w, h) * 0.08}" fill="#f4f4f4"/></svg>`)).jpeg().toBuffer();
    const portrait = await locateSubject(await bright(600, 900, 800), {});
    expect(portrait.source).toBe("attention+prior");
    expect(portrait.focal.y).toBe(PEOPLE_PRIOR.y);
    expect(portrait.focal.x).toBeGreaterThan(0.5);
    expect(portrait.focal.x).toBeLessThanOrEqual(0.7);

    const landscape = await locateSubject(await bright(900, 600, 500), {});
    expect(landscape.source).toBe("attention");
    expect(landscape.focal.y).toBeGreaterThan(0.6);
  });
});
