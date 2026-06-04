#!/usr/bin/env node
/**
 * Export logo lockups from Brand Reference.html as PNG files.
 * Usage: node scripts/export-brand-logos.js
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const ROOT = path.resolve(__dirname, "..");
const HTML_PATH = path.join(ROOT, "Brand Reference.html");
const OUTPUT_DIR = path.join(ROOT, "brand-reference-logos");

const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function resolveChromeExecutable() {
  for (const candidate of CHROME_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function slugify(value) {
  return String(value || "logo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  if (!fs.existsSync(HTML_PATH)) {
    console.error(`Missing file: ${HTML_PATH}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const executablePath = resolveChromeExecutable();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });

  await page.goto(`file://${HTML_PATH}`, { waitUntil: "networkidle0" });
  await page.evaluateHandle("document.fonts.ready");

  const logos = await page.evaluate(() => {
    const section = document.querySelector("section.cream");
    if (!section) return [];

    const stages = [...section.querySelectorAll(".logo-stage")];
    return stages.map((stage, index) => {
      let caption = stage.nextElementSibling;
      if (!caption || !caption.classList.contains("logo-caption")) {
        caption = stage.parentElement?.querySelector(".logo-caption") || null;
      }
      const label =
        caption?.querySelector(".l")?.textContent?.trim() ||
        `logo-${index + 1}`;
      return { index, label };
    });
  });

  const stageHandles = await page.$$("section.cream .logo-stage");

  if (stageHandles.length !== logos.length) {
    console.warn(
      `Expected ${logos.length} stages, found ${stageHandles.length} handles`,
    );
  }

  for (let i = 0; i < stageHandles.length; i += 1) {
    const { label } = logos[i];
    const filename = `${String(i + 1).padStart(2, "0")}-${slugify(label)}.png`;
    const filepath = path.join(OUTPUT_DIR, filename);

    await stageHandles[i].screenshot({ path: filepath, type: "png" });
    console.log(`Exported ${filename} (${label})`);
  }

  await browser.close();
  console.log(
    `\nDone. ${stageHandles.length} PNG files saved to:\n${OUTPUT_DIR}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
