#!/usr/bin/env node
/**
 * Export the Pholio wordmark + gold sweep lockup from canonical source specs.
 *
 * Source of truth:
 *   - Brand Reference.html (.lockup rules — mirrors live Preloader + Logo component)
 *   - pholio-talent-platform/src/components/Branding.tsx (Logo sizes/colors)
 *   - .pholio-landing-ref/components/Preloader.tsx (sweep gradient geometry)
 *
 * Usage: node scripts/export-wordmark-lockup-psd.js
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "client/public/brand");

const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const LOCKUP_SPEC = {
  fontFamily: "'Noto Serif Display', Georgia, serif",
  fontWeight: 400,
  textTransform: "uppercase",
  goldWarm: "#C8A96E",
  gold: "#C9A55A",
  ink: "#050505",
  sweepGradient:
    "linear-gradient(to right, transparent, #C8A96E, transparent)",
  xl: {
    fontSize: 64,
    letterSpacing: "0.2em",
    sweepWidth: 180,
    gap: 16,
    sweepMarginTop: 8,
  },
  md: {
    fontSize: 24,
    letterSpacing: "0.2em",
    sweepWidth: 72,
    gap: 16,
    sweepMarginTop: 0,
  },
};

const DEVICE_SCALE = 4;

function resolveChromeExecutable() {
  for (const candidate of CHROME_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function buildLockupHtml({ variant = "xl", background = "transparent", onCream = false }) {
  const spec = LOCKUP_SPEC[variant];
  const textColor = onCream ? LOCKUP_SPEC.gold : LOCKUP_SPEC.goldWarm;
  const sweepGradient = onCream
    ? `linear-gradient(to right, transparent, ${LOCKUP_SPEC.gold}, transparent)`
    : LOCKUP_SPEC.sweepGradient;
  const bg =
    background === "ink"
      ? LOCKUP_SPEC.ink
      : background === "cream"
        ? "#FAF7F2"
        : "transparent";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+Display:wght@400&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: max-content;
      height: max-content;
      background: ${bg};
    }
    .lockup {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: ${spec.gap}px;
      padding: 48px;
    }
    .word {
      display: inline-flex;
      font-family: ${LOCKUP_SPEC.fontFamily};
      font-weight: ${LOCKUP_SPEC.fontWeight};
      font-size: ${spec.fontSize}px;
      letter-spacing: ${spec.letterSpacing};
      color: ${textColor};
      text-transform: ${LOCKUP_SPEC.textTransform};
      line-height: 1;
      white-space: nowrap;
    }
    .sweep {
      width: ${spec.sweepWidth}px;
      height: 1px;
      margin-top: ${spec.sweepMarginTop}px;
      border-radius: 999px;
      background: ${sweepGradient};
    }
  </style>
</head>
<body>
  <div class="lockup" id="lockup">
    <div class="word" id="word">PHOLIO</div>
    <div class="sweep" id="sweep"></div>
  </div>
</body>
</html>`;
}

async function loadAgPsd() {
  try {
    return require("ag-psd");
  } catch {
    const { execSync } = require("child_process");
    execSync("npm install --no-save ag-psd@28.2.1", {
      cwd: ROOT,
      stdio: "inherit",
    });
    return require("ag-psd");
  }
}

async function prepareLockupPage(page, html) {
  await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(async () => {
    await document.fonts.load("400 64px 'Noto Serif Display'");
    await document.fonts.load("400 24px 'Noto Serif Display'");
    await document.fonts.ready;
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function screenshotElement(page, selector) {
  const element = await page.$(selector);
  if (!element) throw new Error(`Missing selector: ${selector}`);

  const png = await element.screenshot({
    type: "png",
    omitBackground: true,
  });

  return png;
}

async function measureLockup(page) {
  return page.evaluate(() => {
    const lockup = document.getElementById("lockup");
    const word = document.getElementById("word");
    const sweep = document.getElementById("sweep");
    const lockupRect = lockup.getBoundingClientRect();
    const wordRect = word.getBoundingClientRect();
    const sweepRect = sweep.getBoundingClientRect();

    return {
      lockup: {
        width: lockupRect.width,
        height: lockupRect.height,
      },
      word: {
        top: wordRect.top - lockupRect.top,
        left: wordRect.left - lockupRect.left,
        width: wordRect.width,
        height: wordRect.height,
      },
      sweep: {
        top: sweepRect.top - lockupRect.top,
        left: sweepRect.left - lockupRect.left,
        width: sweepRect.width,
        height: sweepRect.height,
      },
    };
  });
}

async function rgbaFromPng(pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data),
  };
}

async function writePsdFromLayers({ width, height, layers, outputPath }) {
  const { writePsd } = await loadAgPsd();
  const psd = {
    width,
    height,
    children: layers.map((layer) => ({
      name: layer.name,
      top: layer.top,
      left: layer.left,
      bottom: layer.top + layer.imageData.height,
      right: layer.left + layer.imageData.width,
      opacity: layer.opacity ?? 1,
      imageData: layer.imageData,
    })),
  };

  const buffer = writePsd(psd, { invalidateTextLayers: true });
  await fs.promises.writeFile(outputPath, Buffer.from(buffer));
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const executablePath = resolveChromeExecutable();
  const browser = await puppeteer.launch({ headless: true, executablePath });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: DEVICE_SCALE });

  const transparentHtml = buildLockupHtml({ variant: "xl", background: "transparent" });
  const inkHtml = buildLockupHtml({ variant: "xl", background: "ink" });

  await prepareLockupPage(page, transparentHtml);
  const layout = await measureLockup(page);
  const [wordPng, sweepPng, lockupPng] = await Promise.all([
    screenshotElement(page, "#word"),
    screenshotElement(page, "#sweep"),
    screenshotElement(page, "#lockup"),
  ]);

  await prepareLockupPage(page, inkHtml);
  const inkPng = await screenshotElement(page, "#lockup");

  await browser.close();

  const wordPath = path.join(OUTPUT_DIR, "pholio-wordmark-lockup-layer-word.png");
  const sweepPath = path.join(OUTPUT_DIR, "pholio-wordmark-lockup-layer-sweep.png");
  const transparentPath = path.join(
    OUTPUT_DIR,
    "pholio-wordmark-lockup-transparent.png",
  );
  const inkPath = path.join(OUTPUT_DIR, "pholio-wordmark-lockup-on-ink.png");
  const psdPath = path.join(OUTPUT_DIR, "pholio-wordmark-lockup.psd");

  await Promise.all([
    fs.promises.writeFile(wordPath, wordPng),
    fs.promises.writeFile(sweepPath, sweepPng),
    fs.promises.writeFile(transparentPath, lockupPng),
    fs.promises.writeFile(inkPath, inkPng),
  ]);

  const lockupMeta = await sharp(lockupPng).metadata();
  const wordImage = await rgbaFromPng(wordPng);
  const sweepImage = await rgbaFromPng(sweepPng);

  const scale = DEVICE_SCALE;
  const psdWidth = Math.round(layout.lockup.width * scale);
  const psdHeight = Math.round(layout.lockup.height * scale);

  const inkBackground = await sharp({
    create: {
      width: psdWidth,
      height: psdHeight,
      channels: 4,
      background: { r: 5, g: 5, b: 5, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  await writePsdFromLayers({
    width: psdWidth,
    height: psdHeight,
    outputPath: psdPath,
    layers: [
      {
        name: "Background / Ink #050505",
        top: 0,
        left: 0,
        imageData: await rgbaFromPng(inkBackground),
        opacity: 1,
      },
      {
        name: "Wordmark / PHOLIO",
        top: Math.round(layout.word.top * scale),
        left: Math.round(layout.word.left * scale),
        imageData: wordImage,
      },
      {
        name: "Gold Sweep Underline",
        top: Math.round(layout.sweep.top * scale),
        left: Math.round(layout.sweep.left * scale),
        imageData: sweepImage,
      },
    ],
  });

  const meta = await sharp(transparentPath).metadata();
  console.log("Exported Pholio wordmark lockup from canonical source specs:");
  console.log(`  Source CSS: Brand Reference.html (.lockup)`);
  console.log(`  Source component: pholio-talent-platform/src/components/Branding.tsx (Logo)`);
  console.log(`  Source preloader: .pholio-landing-ref/components/Preloader.tsx`);
  console.log("");
  console.log(`  ${path.basename(psdPath)}`);
  console.log(`  ${path.basename(transparentPath)} (${meta.width}×${meta.height}px @${DEVICE_SCALE}x)`);
  console.log(`  ${path.basename(inkPath)}`);
  console.log(`  ${path.basename(wordPath)}`);
  console.log(`  ${path.basename(sweepPath)}`);
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
