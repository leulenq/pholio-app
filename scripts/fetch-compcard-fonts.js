#!/usr/bin/env node
/**
 * Vendor the comp card font library as static TTFs.
 *
 * Downloads every family/weight in the composition engine's font library
 * (src/domains/pdf/composition/font-library.js) from the Google Fonts CSS2
 * API into public/fonts/compcard/, so that:
 *   1. the perception engine can MEASURE real shaped advances (harfbuzzjs),
 *   2. the PDF/preview renderer can @font-face locally instead of depending
 *      on the fonts CDN at draw time.
 *
 * All families are libre (OFL) — see public/fonts/compcard/README.md.
 * Re-run to refresh: node scripts/fetch-compcard-fonts.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const { FAMILIES } = require("../src/domains/pdf/composition/font-library");

const OUT_DIR = path.join(__dirname, "..", "public", "fonts", "compcard");

const slugify = (family) => family.toLowerCase().replace(/\s+/g, "-");

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "curl/7.68" } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "curl/7.68" } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let downloaded = 0;
  let skipped = 0;
  for (const [family, meta] of Object.entries(FAMILIES)) {
    const weightsParam = meta.weights.join(";");
    const cssUrl = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weightsParam}&display=swap`;
    const css = await fetchText(cssUrl);
    // Legacy-UA CSS: one @font-face per weight with a truetype URL.
    const blocks = css.split("@font-face").slice(1);
    for (const block of blocks) {
      const weight = (block.match(/font-weight:\s*(\d+)/) || [])[1];
      const url = (block.match(/src:\s*url\(([^)]+\.ttf)\)/) || [])[1];
      if (!weight || !url) continue;
      const file = path.join(OUT_DIR, `${slugify(family)}-${weight}.ttf`);
      if (fs.existsSync(file) && fs.statSync(file).size > 10000) {
        skipped += 1;
        continue;
      }
      const buf = await fetchBuffer(url);
      fs.writeFileSync(file, buf);
      downloaded += 1;
      console.log(`  ${path.basename(file)} (${Math.round(buf.length / 1024)} KB)`);
    }
  }
  console.log(`Done: ${downloaded} downloaded, ${skipped} already present → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
