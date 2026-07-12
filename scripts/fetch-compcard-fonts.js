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
const MANIFEST = path.join(OUT_DIR, "variable-manifest.json");

const slugify = (family) => family.toLowerCase().replace(/\s+/g, "-");

/**
 * Variable (multi-axis) TTFs for the axis-bearing families. The Google Fonts
 * CSS2 legacy-UA path only serves per-instance statics (one @font-face per
 * pinned axis value), so the authoritative single-file variable masters come
 * from the upstream OFL sources in the google/fonts repo. Axis ranges below
 * are [min, default, max] verified against each downloaded face (harfbuzz
 * hb_ot_var_get_axis_infos). These files back BOTH exact per-axis measurement
 * (harfbuzz setVariations) and the variable @font-face render path; the
 * per-weight statics stay vendored as the fallback.
 */
const VARIABLE_FONTS = [
  {
    family: "Archivo",
    slug: "archivo",
    unitsPerEm: 1000,
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf",
    axes: { wght: [100, 600, 900], wdth: [62, 100, 125] },
  },
  {
    family: "Fraunces",
    slug: "fraunces",
    unitsPerEm: 2000,
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf",
    axes: { opsz: [9, 9, 144], wght: [100, 900, 900], SOFT: [0, 0, 100], WONK: [0, 1, 1] },
  },
  {
    family: "Bodoni Moda",
    slug: "bodoni-moda",
    unitsPerEm: 2000,
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/bodonimoda/BodoniModa%5Bopsz,wght%5D.ttf",
    axes: { wght: [400, 400, 900], opsz: [6, 11, 96] },
  },
];

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
  console.log(`Statics: ${downloaded} downloaded, ${skipped} already present → ${OUT_DIR}`);

  // Variable masters (axis-bearing families). A family whose variable file
  // cannot be fetched is logged and skipped — the static path stays the
  // authoritative fallback, so the engine never hard-depends on this step.
  const manifest = { generatedAt: new Date().toISOString(), variable: {} };
  let vDownloaded = 0;
  let vSkipped = 0;
  for (const vf of VARIABLE_FONTS) {
    const file = path.join(OUT_DIR, `${vf.slug}-variable.ttf`);
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 50000) {
        vSkipped += 1;
      } else {
        const buf = await fetchBuffer(vf.url);
        // sanity: must be an sfnt (00010000 / true / OTTO) of real size
        const magic = buf.slice(0, 4).toString("hex");
        if (buf.length < 50000 || !["00010000", "74727565", "4f54544f"].includes(magic)) {
          throw new Error(`unexpected payload (magic ${magic}, ${buf.length}B)`);
        }
        fs.writeFileSync(file, buf);
        vDownloaded += 1;
        console.log(`  ${path.basename(file)} (${Math.round(buf.length / 1024)} KB)`);
      }
      manifest.variable[vf.family] = {
        file: `${vf.slug}-variable.ttf`,
        slug: vf.slug,
        unitsPerEm: vf.unitsPerEm,
        axes: vf.axes,
        bytes: fs.statSync(file).size,
      };
    } catch (err) {
      console.warn(`  SKIP variable ${vf.family}: ${err.message} (static fallback stays authoritative)`);
    }
  }
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Variable: ${vDownloaded} downloaded, ${vSkipped} already present; manifest → ${path.basename(MANIFEST)} (${Object.keys(manifest.variable).length} families)`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
