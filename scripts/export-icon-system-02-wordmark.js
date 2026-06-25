#!/usr/bin/env node
/**
 * Export "02 — WORDMARK" logo variants from Pholio Icon System.dc.html
 * as high-resolution JPGs via Puppeteer element screenshots.
 *
 * Usage:
 *   node scripts/export-icon-system-02-wordmark.js [path/to/Pholio Icon System.dc.html]
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_HTML = path.join(
  process.env.HOME,
  "Downloads",
  "Pholio Icon System.dc.html"
);
const OUTPUT_DIR = path.join(ROOT, "client/public/brand");
const DEVICE_SCALE = 4;
const JPEG_QUALITY = 95;

const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const VARIANTS = [
  { id: "primary", label: "330×330 hero square" },
  { id: "lockup", label: "PHOLIO + underline lockup (isolated, no square padding)" },
  { id: "app", label: "52×52 app icon (rounded square)" },
  { id: "ig", label: "52×52 Instagram circle" },
  { id: "favicon", label: "18×18 favicon" },
];

function resolveChromeExecutable() {
  for (const candidate of CHROME_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function prepareHtml(rawHtml) {
  const fontLinks = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; padding: 0; background: #e7e5df; }
</style>`;

  if (rawHtml.includes("</head>")) {
    return rawHtml.replace("</head>", `${fontLinks}\n</head>`);
  }
  return `<!doctype html><html><head>${fontLinks}</head><body>${rawHtml}</body></html>`;
}

async function pngToJpg(pngPath, jpgPath) {
  await sharp(pngPath)
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(jpgPath);
  await fs.promises.unlink(pngPath);
}

async function main() {
  const htmlPath = path.resolve(process.argv[2] || DEFAULT_HTML);
  if (!fs.existsSync(htmlPath)) {
    console.error(`HTML file not found: ${htmlPath}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const rawHtml = await fs.promises.readFile(htmlPath, "utf8");
  const html = prepareHtml(rawHtml);

  const executablePath = resolveChromeExecutable();
  const browser = await puppeteer.launch({ headless: true, executablePath });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1200, deviceScaleFactor: 1 });

  await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluateHandle("document.fonts.ready");
  await page.evaluate(async () => {
    await document.fonts.load("600 30px 'Noto Serif Display'");
    await document.fonts.load("600 8px 'Noto Serif Display'");
    await document.fonts.load("600 7px 'Noto Serif Display'");
    await document.fonts.ready;
  });

  const tagged = await page.evaluate(() => {
    const label = [...document.querySelectorAll("span")].find(
      (s) => s.textContent.trim() === "02 — WORDMARK"
    );
    if (!label) return { ok: false };

    let card = label.parentElement;
    while (card && !String(card.getAttribute("style") || "").includes("386px")) {
      card = card.parentElement;
    }
    if (!card) return { ok: false };

    const primary = [...card.querySelectorAll("div")].find((el) => {
      const style = el.getAttribute("style") || "";
      return (
        style.includes("width:330px") &&
        style.includes("height:330px") &&
        style.includes("background:#050505")
      );
    });

    const rail = [...card.querySelectorAll("div")].find((el) => {
      const style = el.getAttribute("style") || "";
      return style.includes("border-top:1px solid rgba(14,13,10,0.08)");
    });

    const railIcons = rail
      ? [...rail.children].filter((el) => {
          const style = el.getAttribute("style") || "";
          return (
            el.tagName === "DIV" &&
            (style.includes("width:52px") || style.includes("width:18px"))
          );
        })
      : [];

    if (primary) primary.dataset.exportId = "wm02-primary";

    if (railIcons[0]) railIcons[0].dataset.exportId = "wm02-app";
    if (railIcons[1]) railIcons[1].dataset.exportId = "wm02-ig";
    if (railIcons[2]) railIcons[2].dataset.exportId = "wm02-favicon";

    return {
      ok: true,
      primary: Boolean(primary),
      lockup: Boolean(primary?.querySelector("span")),
      app: Boolean(railIcons[0]),
      ig: Boolean(railIcons[1]),
      favicon: Boolean(railIcons[2]),
    };
  });

  if (!tagged.ok) {
    console.error('Could not locate "02 — WORDMARK" variants in the HTML.');
    await browser.close();
    process.exit(1);
  }

  await page.setViewport({
    width: 1400,
    height: 1200,
    deviceScaleFactor: DEVICE_SCALE,
  });

  const selectorMap = {
    primary: '[data-export-id="wm02-primary"]',
    lockup: '[data-export-id="wm02-lockup"]',
    app: '[data-export-id="wm02-app"]',
    ig: '[data-export-id="wm02-ig"]',
    favicon: '[data-export-id="wm02-favicon"]',
  };

  const exported = [];

  async function captureVariant(variant, selector) {
    const el = await page.$(selector);
    if (!el) {
      console.warn(`Skipping ${variant.id}: selector ${selector} not in DOM`);
      return;
    }

    const pngPath = path.join(OUTPUT_DIR, `pholio-02-wordmark-${variant.id}.png`);
    const jpgPath = path.join(OUTPUT_DIR, `pholio-02-wordmark-${variant.id}.jpg`);

    await el.screenshot({ path: pngPath, type: "png" });
    await pngToJpg(pngPath, jpgPath);

    const meta = await sharp(jpgPath).metadata();
    exported.push({
      file: path.basename(jpgPath),
      label: variant.label,
      width: meta.width,
      height: meta.height,
    });
  }

  const containerVariants = VARIANTS.filter((v) => v.id !== "lockup");
  for (const variant of containerVariants) {
    if (!tagged[variant.id]) {
      console.warn(`Skipping ${variant.id}: element not found`);
      continue;
    }
    await captureVariant(variant, selectorMap[variant.id]);
  }

  if (tagged.lockup) {
    await page.evaluate(() => {
      const primary = document.querySelector('[data-export-id="wm02-primary"]');
      if (!primary) return;

      const text = primary.querySelector("span");
      const rule = [...primary.querySelectorAll("div")].find(
        (el) => (el.getAttribute("style") || "").includes("linear-gradient")
      );
      if (!text || !rule) return;

      document.body.innerHTML = "";
      document.body.style.margin = "0";
      document.body.style.background = "#050505";

      const lockupHost = document.createElement("div");
      lockupHost.dataset.exportId = "wm02-lockup";
      lockupHost.style.cssText =
        "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#050505;padding:48px;width:max-content;margin:0 auto;";
      lockupHost.appendChild(text.cloneNode(true));
      lockupHost.appendChild(rule.cloneNode(true));
      document.body.appendChild(lockupHost);
    });

    const lockupVariant = VARIANTS.find((v) => v.id === "lockup");
    await captureVariant(lockupVariant, selectorMap.lockup);
  }

  await browser.close();

  console.log('Exported "02 — WORDMARK" variants:');
  for (const item of exported) {
    console.log(`  ${item.file}  (${item.width}×${item.height}px) — ${item.label}`);
  }
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
