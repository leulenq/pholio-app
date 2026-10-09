"use strict";

/**
 * Prints a stored card scene to PDF with the same React renderer the studio
 * previews with (client/compcard.html). Two outputs:
 *   digital — trim size, one page per side, for email and submissions;
 *   print   — trim + 1/8in (3mm) bleed + crop marks, for a print shop.
 */

const fs = require("fs");
const path = require("path");
const config = require("../../../config");

const importESM = new Function("specifier", "return import(specifier);");
let puppeteerPromise = null;
const getPuppeteer = () => {
  if (!puppeteerPromise) puppeteerPromise = importESM("puppeteer").then((m) => m.default || m);
  return puppeteerPromise;
};

async function launch() {
  const args = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--no-first-run", "--disable-gpu"];
  const options = { headless: "new", args };
  if (config.isServerless) {
    const chromium = await importESM("@sparticuz/chromium").then((m) => m.default || m).catch(() => null);
    if (chromium) {
      let exe = chromium.executablePath();
      if (exe && typeof exe.then === "function") exe = await exe;
      options.executablePath = exe;
      options.args = [...chromium.args, ...args, "--hide-scrollbars"];
    }
  } else if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  return (await getPuppeteer()).launch(options);
}

const BUILT_PAGE = path.join(__dirname, "..", "..", "..", "..", "public", "dashboard-app", "compcard.html");

function rendererUrl() {
  if (process.env.COMPCARD_RENDER_URL) return process.env.COMPCARD_RENDER_URL;
  if (fs.existsSync(BUILT_PAGE)) return `${String(config.pdfBaseUrl).replace(/\/$/, "")}/dashboard-app/compcard.html`;
  // Development without a client build: the Vite dev server serves the page.
  return "http://localhost:5173/compcard.html";
}

/** Absolute image URLs so the renderer page can load them from any origin. */
function absolutise(scene, absoluteUrl) {
  return {
    ...scene,
    pages: scene.pages.map((p) => ({
      ...p,
      elements: p.elements.map((el) => {
        if (el.type === "photo" && el.src) return { ...el, src: absoluteUrl(el.src) };
        if (el.type === "text" && el.fill && el.fill.kind === "image") return { ...el, fill: { ...el.fill, src: absoluteUrl(el.fill.src) } };
        return el;
      }),
    })),
  };
}

/**
 * @param scene sanitised scene
 * @param opts { variant: 'digital'|'print', title, absoluteUrl }
 * @returns Buffer
 */
async function renderCardPdf(scene, opts = {}) {
  const variant = opts.variant === "print" ? "print" : "digital";
  const browser = await launch();
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.warn("[compcard/render] page error:", e.message));
    await page.goto(rendererUrl(), { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction("typeof window.__renderCard === 'function'", { timeout: 30000 });
    const payload = absolutise(scene, opts.absoluteUrl || ((s) => s));
    const size = await page.evaluate(
      (s, v, title) => window.__renderCard(s, { variant: v, title }),
      payload,
      variant,
      opts.title || "Comp card",
    );
    await page.waitForFunction("window.__cardReady === true || typeof window.__cardError === 'string'", { timeout: 45000 });
    const err = await page.evaluate(() => window.__cardError);
    if (err) throw new Error(`Card renderer failed: ${err}`);
    return Buffer.from(
      await page.pdf({
        width: `${size.w}mm`,
        height: `${size.h}mm`,
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
    );
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { renderCardPdf, rendererUrl };
