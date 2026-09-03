"use strict";

/**
 * Pholio ID — pass artwork.
 *
 * Every image Wallet shows is rendered here with sharp, from two sources:
 *   - the talent's hero photograph (bytes + a focal point)
 *   - the brand wordmark, lifted from `public/brand/pholio-wordmark-lockup-on-ink.png`
 *     as an alpha mask so the pass carries the real letterforms, recoloured
 *     per theme, with no runtime font dependency
 *
 * Apple's image slots (HIG "Wallet", rev. 2026-06-08), in points:
 *   icon         38 × 38           all styles; system rounds the corners
 *   logo         50–160 × 50       generic (iOS 26 and earlier)
 *   primaryLogo  30–126 × 30       posterGeneric (iOS 27+)
 *   thumbnail    60–90 × 90        generic; square, rounded corners baked in,
 *                                  transparent PNG
 *   artwork      358 × 448         posterGeneric; a material strip covers the
 *                                  bottom edge, header text sits over the top
 * Images ship at @2x and @3x per Apple's current guidance.
 *
 * The artwork carries two veils in the theme's own color: a soft one at the
 * top under the wordmark and header, a deeper one at the bottom under the
 * title and footer strip. They make the pass text legible on any photograph
 * without touching the face, which the crop keeps in the clear band between
 * them. The photograph emerges from ink, or from paper.
 */

const path = require("path");
const fs = require("fs/promises");
const sharp = require("sharp");
const { resolveTheme } = require("./pass-content");

const SCALES = [2, 3];

const PT = Object.freeze({
  icon: 38,
  logoHeight: 50,
  logoLetters: 17,
  primaryLogoHeight: 30,
  primaryLogoLetters: 14,
  thumbnail: 90,
  thumbnailRadius: 10,
  artworkWidth: 358,
  artworkHeight: 448,
});

/** Where the face lands, as a fraction of the crop's height (top = 0). */
const FOCAL_Y = Object.freeze({ artwork: 0.4, thumbnail: 0.44 });

/** Veil bands as fractions of artwork height. */
const VEIL = Object.freeze({ top: 0.24, bottomStart: 0.56 });

const ICON_BACKGROUND = "#1A1815";
const ICON_GOLD = "#C9A55A";

/** Crop of the letters inside the brand lockup (measured; excludes the rule). */
const LOCKUP_LETTERS = Object.freeze({ left: 190, top: 220, width: 1246, height: 210 });

const BRAND_LOCKUP_CANDIDATES = [
  path.join(process.cwd(), "public", "brand", "pholio-wordmark-lockup-on-ink.png"),
  path.resolve(__dirname, "../../../../public/brand/pholio-wordmark-lockup-on-ink.png"),
];

let glyphPromise = null;

async function readBrandLockup() {
  for (const candidate of BRAND_LOCKUP_CANDIDATES) {
    try {
      return await fs.readFile(candidate);
    } catch {
      /* next */
    }
  }
  throw new Error("Brand wordmark lockup not found (public/brand/pholio-wordmark-lockup-on-ink.png)");
}

/**
 * Alpha masks for the wordmark and its first letter, derived once from the
 * lockup's luminance (gold on black → alpha).
 */
async function brandGlyphs() {
  if (!glyphPromise) {
    glyphPromise = (async () => {
      const lockup = await readBrandLockup();
      const letters = await sharp(lockup)
        .extract(LOCKUP_LETTERS)
        .flatten({ background: "#000000" })
        .greyscale()
        .linear(1.35, -20)
        .toColourspace("b-w")
        .png()
        .toBuffer();
      const { data, info } = await sharp(letters).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
      if (info.channels !== 1) throw new Error(`Wordmark mask has ${info.channels} channels, expected 1`);
      const lit = new Array(info.width).fill(false);
      for (let x = 0; x < info.width; x += 1) {
        for (let y = 0; y < info.height; y += 1) {
          if (data[y * info.width + x] > 40) { lit[x] = true; break; }
        }
      }
      const first = lit.indexOf(true);
      let end = first;
      while (end < info.width && lit[end]) end += 1;
      let top = info.height;
      let bottom = 0;
      for (let y = 0; y < info.height; y += 1) {
        for (let x = first; x < end; x += 1) {
          if (data[y * info.width + x] > 40) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
        }
      }
      const monogram = await sharp(letters)
        .extract({ left: first, top, width: end - first, height: bottom - top + 1 })
        .toColourspace("b-w")
        .png()
        .toBuffer();
      return { letters, monogram, width: info.width, height: info.height };
    })().catch((error) => {
      glyphPromise = null;
      throw error;
    });
  }
  return glyphPromise;
}

function transparent(width, height) {
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
}

/** Fill a single-channel alpha mask with a solid color → RGBA PNG. */
async function tint(mask, color) {
  const { data, info } = await sharp(mask).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  return sharp({ create: { width: info.width, height: info.height, channels: 3, background: color } })
    .joinChannel(data, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer();
}

/**
 * The wordmark on a transparent canvas, letters vertically centred.
 * @returns {Promise<Buffer>} PNG
 */
async function renderWordmark({ letterHeightPt, canvasHeightPt, color, scale }) {
  const glyphs = await brandGlyphs();
  const lettersHeight = Math.round(letterHeightPt * scale);
  const mask = await sharp(glyphs.letters).resize({ height: lettersHeight }).toColourspace("b-w").png().toBuffer();
  const colored = await tint(mask, color);
  const { width } = await sharp(colored).metadata();
  const canvasHeight = Math.round(canvasHeightPt * scale);
  return transparent(width, canvasHeight)
    .composite([{ input: colored, left: 0, top: Math.round((canvasHeight - lettersHeight) / 2) }])
    .png()
    .toBuffer();
}

/** The issuer icon: brand P on ink. Theme-independent so notifications and Mail always show one Pholio. */
async function renderIcon({ scale }) {
  const glyphs = await brandGlyphs();
  const side = Math.round(PT.icon * scale);
  const glyphHeight = Math.round(side * 0.5);
  const mask = await sharp(glyphs.monogram).resize({ height: glyphHeight }).toColourspace("b-w").png().toBuffer();
  const colored = await tint(mask, ICON_GOLD);
  const { width } = await sharp(colored).metadata();
  return sharp({ create: { width: side, height: side, channels: 4, background: ICON_BACKGROUND } })
    .composite([{ input: colored, left: Math.round((side - width) / 2), top: Math.round((side - glyphHeight) / 2) }])
    .png()
    .toBuffer();
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * A crop window of a given aspect that keeps the focal point at (0.5, focalY)
 * of the window, clamped to the image.
 */
function cropWindow({ width, height, aspect, focal, focalY }) {
  let winW = width;
  let winH = Math.round(width / aspect);
  if (winH > height) {
    winH = height;
    winW = Math.round(height * aspect);
  }
  const fx = Number.isFinite(Number(focal?.x)) ? clamp(Number(focal.x), 0, 1) : 0.5;
  const fy = Number.isFinite(Number(focal?.y)) ? clamp(Number(focal.y), 0, 1) : 0.38;
  const left = Math.round(clamp(fx * width - winW / 2, 0, width - winW));
  const top = Math.round(clamp(fy * height - focalY * winH, 0, height - winH));
  return { left, top, width: winW, height: winH };
}

async function normalizedPhoto(photo) {
  const buffer = await sharp(photo).rotate().toBuffer();
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new Error("Photo has no dimensions");
  return { buffer, width: meta.width, height: meta.height };
}

/** Face height as a fraction of the thumbnail when a face box is known. */
const THUMBNAIL_FACE_FRACTION = 0.42;

/**
 * Square headshot for the generic face: rounded corners, transparent PNG.
 * With a face box the crop tightens to a headshot (face ≈ 42% of the
 * square); without one it is the largest square around the focal point.
 */
async function renderThumbnail(photo, { focal, face, scale }) {
  const src = await normalizedPhoto(photo);
  const side = Math.round(PT.thumbnail * scale);
  const radius = Math.round(PT.thumbnailRadius * scale);
  const maxSide = Math.min(src.width, src.height);
  let window;
  if (face && face.h > 0) {
    const wanted = Math.round((face.h * src.height) / THUMBNAIL_FACE_FRACTION);
    const cropSide = clamp(wanted, Math.round(maxSide * 0.35), maxSide);
    const cx = (face.x + face.w / 2) * src.width;
    const cy = (face.y + face.h * 0.5) * src.height;
    window = {
      left: Math.round(clamp(cx - cropSide / 2, 0, src.width - cropSide)),
      top: Math.round(clamp(cy - cropSide * FOCAL_Y.thumbnail, 0, src.height - cropSide)),
      width: cropSide,
      height: cropSide,
    };
  } else {
    window = cropWindow({ ...src, aspect: 1, focal, focalY: FOCAL_Y.thumbnail });
  }
  const square = await sharp(src.buffer).extract(window).resize(side, side).toBuffer();
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"><rect width="${side}" height="${side}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
  return sharp(square).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

function veilSvg(width, height, color) {
  const topH = Math.round(height * VEIL.top);
  const bottomY = Math.round(height * VEIL.bottomStart);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.84"/>
      <stop offset="0.5" stop-color="${color}" stop-opacity="0.4"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0"/>
      <stop offset="0.45" stop-color="${color}" stop-opacity="0.62"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0.96"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${topH}" fill="url(#t)"/>
  <rect x="0" y="${bottomY}" width="${width}" height="${height - bottomY}" fill="url(#b)"/>
</svg>`,
  );
}

/** Full-bleed photographic face for iOS 27+: focal crop plus the theme's veils. */
async function renderArtwork(photo, { focal, theme, scale }) {
  const palette = resolveTheme(theme);
  const src = await normalizedPhoto(photo);
  const width = Math.round(PT.artworkWidth * scale);
  const height = Math.round(PT.artworkHeight * scale);
  const window = cropWindow({ ...src, aspect: PT.artworkWidth / PT.artworkHeight, focal, focalY: FOCAL_Y.artwork });
  return sharp(src.buffer)
    .extract(window)
    .resize(width, height)
    .composite([{ input: veilSvg(width, height, palette.hex.background) }])
    // Palette PNG: ~40% of the lossless size at this resolution with no
    // visible banding in the veils (dithered); Apple asks for small images.
    .png({ palette: true, quality: 90, dither: 1, compressionLevel: 9 })
    .toBuffer();
}

function named(base, scale) {
  return `${base}@${scale}x.png`;
}

/**
 * All image files for one pass, keyed by Wallet file name.
 * @param {object} input
 * @param {Buffer} input.photo — hero photograph bytes
 * @param {{ x: number, y: number }} input.focal — 0–1, where the face is
 * @param {{ x: number, y: number, w: number, h: number }|null} [input.face] — face box, when known
 * @param {string} [input.theme]
 * @returns {Promise<Record<string, Buffer>>}
 */
async function renderPassAssets({ photo, focal, face = null, theme }) {
  const palette = resolveTheme(theme);
  const files = {};
  await Promise.all(
    SCALES.map(async (scale) => {
      const [icon, logo, primaryLogo, thumbnail, artwork] = await Promise.all([
        renderIcon({ scale }),
        renderWordmark({ letterHeightPt: PT.logoLetters, canvasHeightPt: PT.logoHeight, color: palette.hex.wordmark, scale }),
        renderWordmark({ letterHeightPt: PT.primaryLogoLetters, canvasHeightPt: PT.primaryLogoHeight, color: palette.hex.wordmark, scale }),
        renderThumbnail(photo, { focal, face, scale }),
        renderArtwork(photo, { focal, theme: palette.id, scale }),
      ]);
      files[named("icon", scale)] = icon;
      files[named("logo", scale)] = logo;
      files[named("primaryLogo", scale)] = primaryLogo;
      files[named("thumbnail", scale)] = thumbnail;
      files[named("artwork", scale)] = artwork;
    }),
  );
  return files;
}

module.exports = {
  SCALES,
  PT,
  FOCAL_Y,
  VEIL,
  brandGlyphs,
  cropWindow,
  renderWordmark,
  renderIcon,
  renderThumbnail,
  renderArtwork,
  renderPassAssets,
};
