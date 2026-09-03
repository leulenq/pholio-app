"use strict";

const sharp = require("sharp");
const {
  PT,
  cropWindow,
  renderWordmark,
  renderIcon,
  renderThumbnail,
  renderArtwork,
  renderPassAssets,
} = require("../../src/domains/wallet/services/pass-artwork");

async function portraitPhoto({ width = 900, height = 1200, headY = 0.2 } = {}) {
  // A neutral backdrop with a distinct "head" disc so crops can be checked.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="#B9B2A6"/>
    <circle cx="${width / 2}" cy="${height * headY}" r="${width * 0.11}" fill="#3A2A1F"/>
    <rect x="${width * 0.2}" y="${height * (headY + 0.12)}" width="${width * 0.6}" height="${height * 0.7}" fill="#5A4A3A"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function pixel(buffer, x, y) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [...data.slice(i, i + 4)];
}

describe("Pholio ID artwork", () => {
  test("wordmark and primary logo fit Apple's logo boxes at 2x and 3x", async () => {
    for (const scale of [2, 3]) {
      const logo = await sharp(await renderWordmark({ letterHeightPt: PT.logoLetters, canvasHeightPt: PT.logoHeight, color: "#C9A55A", scale })).metadata();
      expect(logo.height).toBe(50 * scale);
      expect(logo.width / scale).toBeGreaterThanOrEqual(50);
      expect(logo.width / scale).toBeLessThanOrEqual(160);
      expect(logo.hasAlpha).toBe(true);

      const primary = await sharp(await renderWordmark({ letterHeightPt: PT.primaryLogoLetters, canvasHeightPt: PT.primaryLogoHeight, color: "#8A6A40", scale })).metadata();
      expect(primary.height).toBe(30 * scale);
      expect(primary.width / scale).toBeGreaterThanOrEqual(30);
      expect(primary.width / scale).toBeLessThanOrEqual(126);
    }
  });

  test("icon is the 38pt brand square with the gold monogram centred on ink", async () => {
    const icon = await renderIcon({ scale: 2 });
    const meta = await sharp(icon).metadata();
    expect([meta.width, meta.height]).toEqual([76, 76]);
    expect(await pixel(icon, 2, 2)).toEqual([26, 24, 21, 255]);
    const { data } = await sharp(icon).raw().toBuffer({ resolveWithObject: true });
    let gold = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 150 && data[i + 1] > 120 && data[i + 2] < 120) gold += 1;
    expect(gold).toBeGreaterThan(200);
  });

  test("crop windows keep the focal point at the requested height and stay inside the image", () => {
    const window = cropWindow({ width: 900, height: 2000, aspect: 358 / 448, focal: { x: 0.5, y: 0.5 }, focalY: 0.4 });
    expect(window.width).toBe(900);
    expect(window.height).toBe(Math.round(900 / (358 / 448)));
    expect(window.top + window.height).toBeLessThanOrEqual(2000);
    expect(Math.round((0.5 * 2000 - window.top) / window.height * 100) / 100).toBe(0.4);

    // Not enough room below the focal point: the window clamps to the image.
    const tight = cropWindow({ width: 900, height: 1200, aspect: 358 / 448, focal: { x: 0.5, y: 0.5 }, focalY: 0.4 });
    expect(tight.top + tight.height).toBe(1200);

    const clamped = cropWindow({ width: 900, height: 1200, aspect: 1, focal: { x: 0.95, y: 0.02 }, focalY: 0.44 });
    expect(clamped).toEqual({ left: 0, top: 0, width: 900, height: 900 });
    expect(cropWindow({ width: 900, height: 1200, aspect: 1, focal: { x: NaN, y: undefined }, focalY: 0.44 }).left).toBe(0);
  });

  test("thumbnail is the portrait disc: transparent outside the circle, gold ring, face centred", async () => {
    const photo = await portraitPhoto();
    const face = { x: 0.39, y: 0.09, w: 0.22, h: 0.22 };
    const thumb = await renderThumbnail(photo, { focal: { x: 0.5, y: 0.2 }, face, scale: 3, theme: "ink" });
    const meta = await sharp(thumb).metadata();
    expect([meta.width, meta.height, meta.hasAlpha]).toEqual([270, 270, true]);
    expect((await pixel(thumb, 0, 0))[3]).toBe(0); // outside the circle
    expect((await pixel(thumb, 135, 2))[3]).toBe(255); // the ring at the top edge
    const ring = await pixel(thumb, 135, 2);
    expect(ring[0]).toBeGreaterThan(150); // gold
    const centre = await pixel(thumb, 135, Math.round(270 * 0.44));
    expect(centre[0]).toBeLessThan(90); // the head disc

    const loose = await renderThumbnail(photo, { focal: { x: 0.5, y: 0.2 }, face: null, scale: 2, theme: "paper" });
    expect((await sharp(loose).metadata()).width).toBe(180);
  });

  test("artwork is the tri-band medallion composition at 358×448pt", async () => {
    const photo = await portraitPhoto({ headY: 0.3 });
    const ink = await renderArtwork(photo, { focal: { x: 0.5, y: 0.3 }, theme: "ink", scale: 2 });
    const meta = await sharp(ink).metadata();
    expect([meta.width, meta.height]).toEqual([716, 896]);
    expect(await pixel(ink, 20, 20)).toEqual([26, 24, 21, 255]); // upper field: ink
    expect(await pixel(ink, 20, Math.round(896 * 0.4))).toEqual([250, 248, 245, 255]); // band: paper
    expect(await pixel(ink, 20, Math.round(896 * 0.7))).toEqual([26, 24, 21, 255]); // lower field: ink
    expect(await pixel(ink, 358, 893)).toEqual([26, 24, 21, 255]); // under Wallet's strip: ink
    // The disc straddles the upper boundary: photo pixels above and below 28%.
    const above = await pixel(ink, 358, Math.round(896 * 0.2));
    const below = await pixel(ink, 358, Math.round(896 * 0.36));
    expect(above).not.toEqual([26, 24, 21, 255]);
    expect(below).not.toEqual([250, 248, 245, 255]);

    const paper = await renderArtwork(photo, { focal: { x: 0.5, y: 0.3 }, theme: "paper", scale: 2 });
    expect(await pixel(paper, 20, 20)).toEqual([250, 248, 245, 255]);
    expect(await pixel(paper, 20, Math.round(896 * 0.4))).toEqual([26, 24, 21, 255]);
    expect(ink.length).toBeLessThan(400 * 1024);
  });

  test("renders the full asset set at 2x and 3x", async () => {
    const photo = await portraitPhoto();
    const files = await renderPassAssets({ photo, focal: { x: 0.5, y: 0.2 }, theme: "paper" });
    expect(Object.keys(files).sort()).toEqual([
      "artwork@2x.png", "artwork@3x.png", "icon@2x.png", "icon@3x.png", "logo@2x.png", "logo@3x.png",
      "primaryLogo@2x.png", "primaryLogo@3x.png", "thumbnail@2x.png", "thumbnail@3x.png",
    ]);
    expect(Object.keys(files).some((name) => name.includes("@1x") || !name.includes("@"))).toBe(false);
    const artwork3x = await sharp(files["artwork@3x.png"]).metadata();
    expect([artwork3x.width, artwork3x.height]).toEqual([1074, 1344]);
  });
});
