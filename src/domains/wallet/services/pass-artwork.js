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
 * The pass is a designed object, not a photograph with type on it: two flat
 * fields of the theme's material with a band of the other material across
 * the middle, and a circular portrait medallion straddling the upper
 * boundary. Photography and typography never overlap; every element has a
 * zone. See POSTER and DISC below.
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
const FOCAL_Y = Object.freeze({ thumbnail: 0.44 });

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

/**
 * The portrait disc. The reference object for Pholio ID is a medallion: a
 * circular portrait that straddles the boundary between two fields. The crop
 * is a headshot (face ≈ 46% of the diameter) when a face box is known,
 * otherwise a head-and-shoulders square around the focal point. A thin gold
 * ring separates the disc from both fields whatever the photograph's own
 * background does.
 */
const DISC = Object.freeze({ faceFraction: 0.46, looseSide: 0.72, looseSidePortrait: 0.55, tallTopCap: 0.04, ringPt: 1.5 });

async function renderDisc(photo, { focal, face, diameterPx, ringPx, ringColor }) {
  const src = await normalizedPhoto(photo);
  const maxSide = Math.min(src.width, src.height);
  let window;
  if (face && face.h > 0) {
    const wanted = Math.round((face.h * src.height) / DISC.faceFraction);
    const side = clamp(wanted, Math.round(maxSide * 0.3), maxSide);
    const cx = (face.x + face.w / 2) * src.width;
    const cy = (face.y + face.h * 0.5) * src.height;
    window = {
      left: Math.round(clamp(cx - side / 2, 0, src.width - side)),
      top: Math.round(clamp(cy - side * FOCAL_Y.thumbnail, 0, src.height - side)),
      width: side,
      height: side,
    };
  } else {
    // No face box: a head-and-shoulders guess. Tall frames (three-quarter and
    // full-length shots), and the head is near the top of the frame, so the
    // crop is anchored there rather than trusting the focal point downward.
    const tall = src.height > src.width * 1.2;
    const side = Math.round(maxSide * (tall ? DISC.looseSidePortrait : DISC.looseSide));
    const fx = clamp(Number(focal?.x) || 0.5, 0, 1);
    const fy = clamp(Number(focal?.y) || 0.38, 0, 1);
    const wantedTop = fy * src.height - side * FOCAL_Y.thumbnail;
    const topCap = tall ? src.height * DISC.tallTopCap : src.height;
    window = {
      left: Math.round(clamp(fx * src.width - side / 2, 0, src.width - side)),
      top: Math.round(clamp(Math.min(wantedTop, topCap), 0, src.height - side)),
      width: side,
      height: side,
    };
  }
  const inner = diameterPx - ringPx * 2;
  const square = await sharp(src.buffer).extract(window).resize(inner, inner).toBuffer();
  const circle = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}"><circle cx="${inner / 2}" cy="${inner / 2}" r="${inner / 2}" fill="#fff"/></svg>`,
  );
  const portrait = await sharp(square).ensureAlpha().composite([{ input: circle, blend: "dest-in" }]).png().toBuffer();
  const ring = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${diameterPx}" height="${diameterPx}"><circle cx="${diameterPx / 2}" cy="${diameterPx / 2}" r="${diameterPx / 2 - ringPx / 2}" fill="none" stroke="${ringColor}" stroke-width="${ringPx}"/></svg>`,
  );
  return transparent(diameterPx, diameterPx)
    .composite([{ input: portrait, left: ringPx, top: ringPx }, { input: ring }])
    .png()
    .toBuffer();
}

/** iOS 26 thumbnail: the disc itself, transparent outside the circle, at Wallet's 90pt. */
async function renderThumbnail(photo, { focal, face, scale, theme }) {
  const palette = resolveTheme(theme);
  const diameterPx = Math.round(PT.thumbnail * scale);
  return renderDisc(photo, { focal, face, diameterPx, ringPx: Math.max(1, Math.round(DISC.ringPt * scale)), ringColor: palette.hex.ring });
}

/**
 * Poster composition (358×448pt), fractions of height:
 *   0.00–0.28  field      wordmark top-left, height header top-right (Wallet)
 *   0.28–0.51  band       the medallion straddles the 0.28 boundary
 *   0.51–1.00  field      Wallet's title sits here, then the footer strip + QR
 * Field and band are the theme's two materials; the three text positions
 * Wallet controls all fall on the field, so one foreground color serves all.
 */
const POSTER = Object.freeze({ bandTop: 0.28, bandBottom: 0.51, discDiameter: 0.4 });

async function renderArtwork(photo, { focal, face, theme, scale }) {
  const palette = resolveTheme(theme);
  const width = Math.round(PT.artworkWidth * scale);
  const height = Math.round(PT.artworkHeight * scale);
  const bandTop = Math.round(height * POSTER.bandTop);
  const bandBottom = Math.round(height * POSTER.bandBottom);
  const diameterPx = Math.round(width * POSTER.discDiameter);
  const disc = await renderDisc(photo, { focal, face, diameterPx, ringPx: Math.max(1, Math.round(DISC.ringPt * scale)), ringColor: palette.hex.ring });
  const band = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="0" y="${bandTop}" width="${width}" height="${bandBottom - bandTop}" fill="${palette.hex.band}"/></svg>`,
  );
  return sharp({ create: { width, height, channels: 4, background: palette.hex.background } })
    .composite([
      { input: band },
      { input: disc, left: Math.round((width - diameterPx) / 2), top: Math.round(bandTop - diameterPx / 2) },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
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
        renderThumbnail(photo, { focal, face, scale, theme: palette.id }),
        renderArtwork(photo, { focal, face, theme: palette.id, scale }),
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
  DISC,
  POSTER,
  brandGlyphs,
  cropWindow,
  renderWordmark,
  renderIcon,
  renderDisc,
  renderThumbnail,
  renderArtwork,
  renderPassAssets,
};
