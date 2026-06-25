#!/usr/bin/env node
/**
 * Export the Pholio dashboard wordmark as SVG, PNG, and JPG.
 * Matches agency + talent shell styling (Noto Serif Display, PHOLIO, platform gold).
 *
 * Usage: node scripts/export-pholio-wordmark.js
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

const WORDMARK = {
  text: "PHOLIO",
  fontFamily: "'Noto Serif Display', Georgia, serif",
  fontSize: 48,
  fontWeight: 400,
  letterSpacing: "0.2em",
  color: "#C9A55A",
  creamBg: "#FAF8F5",
};

function resolveChromeExecutable() {
  for (const candidate of CHROME_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function wordmarkHtml({ transparent = true } = {}) {
  const bg = transparent ? "transparent" : WORDMARK.creamBg;
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
    width: fit-content;
    height: fit-content;
    background: ${bg};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .wordmark {
    display: inline-block;
    font-family: ${WORDMARK.fontFamily};
    font-size: ${WORDMARK.fontSize}px;
    font-weight: ${WORDMARK.fontWeight};
    letter-spacing: ${WORDMARK.letterSpacing};
    color: ${WORDMARK.color};
    text-transform: uppercase;
    line-height: 1;
    white-space: nowrap;
    padding: 24px;
  }
</style>
</head>
<body>
  <span class="wordmark" id="wordmark">${WORDMARK.text}</span>
</body>
</html>`;
}

function buildSvg({ width, height, textWidth, textHeight, x, y }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pholio">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+Display:wght@400&amp;display=swap');
      .pholio-wordmark {
        font-family: 'Noto Serif Display', Georgia, serif;
        font-size: ${WORDMARK.fontSize}px;
        font-weight: 400;
        letter-spacing: ${WORDMARK.letterSpacing};
        fill: ${WORDMARK.color};
        text-transform: uppercase;
      }
    </style>
  </defs>
  <text class="pholio-wordmark" x="${x}" y="${y}" dominant-baseline="alphabetic">${WORDMARK.text}</text>
</svg>
`;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const executablePath = resolveChromeExecutable();
  const browser = await puppeteer.launch({ headless: true, executablePath });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 200, deviceScaleFactor: 3 });

  await page.setContent(wordmarkHtml({ transparent: true }), {
    waitUntil: "networkidle0",
  });
  await page.evaluateHandle("document.fonts.ready");

  const metrics = await page.evaluate(() => {
    const el = document.getElementById("wordmark");
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      fontSize: parseFloat(style.fontSize),
      letterSpacing: style.letterSpacing,
      color: style.color,
    };
  });

  const pngPath = path.join(OUTPUT_DIR, "pholio-wordmark.png");
  const jpgPath = path.join(OUTPUT_DIR, "pholio-wordmark.jpg");
  const svgPath = path.join(OUTPUT_DIR, "pholio-wordmark.svg");

  const wordmarkHandle = await page.$("#wordmark");
  await wordmarkHandle.screenshot({
    path: pngPath,
    type: "png",
    omitBackground: true,
  });

  const pngBuffer = await fs.promises.readFile(pngPath);
  await sharp(pngBuffer)
    .flatten({ background: WORDMARK.creamBg })
    .jpeg({ quality: 95, mozjpeg: true })
    .toFile(jpgPath);

  const pad = 24;
  const svgWidth = Math.ceil(metrics.width + pad * 2);
  const svgHeight = Math.ceil(metrics.height + pad * 2);
  const baselineY = pad + metrics.height * 0.82;

  const svg = buildSvg({
    width: svgWidth,
    height: svgHeight,
    textWidth: metrics.width,
    textHeight: metrics.height,
    x: pad,
    y: baselineY,
  });
  await fs.promises.writeFile(svgPath, svg, "utf8");

  await browser.close();

  console.log("Exported Pholio wordmark assets:");
  console.log(`  SVG  → ${svgPath}`);
  console.log(`  PNG  → ${pngPath} (transparent)`);
  console.log(`  JPG  → ${jpgPath} (cream #FAF8F5 background)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
