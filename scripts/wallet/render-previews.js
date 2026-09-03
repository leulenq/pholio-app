#!/usr/bin/env node
/**
 * Pholio ID — Wallet preview rig.
 *
 *   node scripts/wallet/render-previews.js [--out docs/wallet/previews]
 *
 * Runs realistic fixture profiles through the REAL pass builder (content,
 * face location, artwork, no signing) and renders each result the way Apple
 * Wallet lays it out — the iOS 27 poster generic face, the iOS 26 generic
 * face, the collapsed stack strip, and the details sheet — then screenshots
 * them with headless Chromium into PNGs plus an index.html review sheet.
 *
 * The HTML here is a measured approximation of Wallet's layout built from
 * Apple's published geometry (358pt pass, 30pt primary logo, 50pt logo box,
 * 90pt square thumbnail, 358×448 artwork, square QR); it is a review tool for
 * hierarchy, crops, colour and edge cases, not a pixel-exact Wallet render.
 * The pass.json and images it displays are the exact bytes a device gets.
 *
 * Fixture photographs are the repo's own sample assets (client/public/assets).
 */

"use strict";

const fs = require("fs/promises");
const path = require("path");
const QRCode = require("qrcode");
const { buildPassFiles } = require("../../src/domains/wallet/services/pass-builder");

const ROOT = path.resolve(__dirname, "../..");
const ASSETS = path.join(ROOT, "client/public/assets");
const FONTS = path.join(ROOT, "public/fonts/compcard");
const PASS_TYPE = "pass.studio.pholio.talent";
const TEAM = "TEAM12345";
const BASE_URL = "https://app.pholio.studio";

const photo = (file, extra = {}) => ({
  id: `img-${file}`,
  absolute_path: path.join(ASSETS, file),
  is_primary: true,
  sort: 0,
  status: "active",
  ...extra,
});

/** Realistic profiles, chosen to exercise every branch of the content model. */
const FIXTURES = [
  {
    id: "editorial-woman",
    title: "Editorial, mother agency + placement",
    profile: {
      id: "11111111-1111-4111-8111-111111111111", slug: "ava-martinez", first_name: "Ava", last_name: "Martinez",
      gender: "Female", stats_track: "womenswear", height_cm: 178, bust_cm: 81, waist_cm: 61, hips_cm: 89,
      dress_size: "4", shoe_size: "9", hair_color: "dark brown", eye_color: "hazel", measurements_updated_at: "2026-06-12T10:00:00Z", city: "New York",
    },
    images: [photo("model_studio_warm.jpg")],
    representations: [
      { status: "active", agency_name: "Northstar Models", relationship_type: "mother", market: "New York", is_exclusive: true },
      { status: "active", external_agency_name: "Maison Étoile", relationship_type: "placement", market: "Paris", division: "Women" },
    ],
  },
  {
    id: "menswear-direct",
    title: "Menswear, direct bookings, metric-heavy stats",
    profile: {
      id: "22222222-2222-4222-8222-222222222222", slug: "kwame-osei", first_name: "Kwame", last_name: "Osei",
      gender: "Male", height_cm: 188, chest_cm: 97, waist_cm: 79, inseam_cm: 86, shoe_size: "44 EU", hair_color: "black", eye_color: "brown",
    },
    images: [photo("model_full_body.jpg")],
    representations: [],
  },
  {
    id: "long-name-actor",
    title: "Long name, actor, no measurements, seeking representation",
    profile: {
      id: "33333333-3333-4333-8333-333333333333", slug: "anastasia-w", first_name: "Anastasia-Wilhelmina", last_name: "Oyelaran-Whitfield",
      discipline: "actor", height_cm: 170, hair_color: "black", eye_color: "dark brown", seeking_representation: true,
    },
    images: [photo("model_bw_contrast.jpg")],
    representations: [],
  },
  {
    id: "teen-consented",
    title: "Minor with guardian consent (kids track: no body measurements)",
    profile: {
      id: "44444444-4444-4444-8444-444444444444", slug: "lily-park", first_name: "Lily", last_name: "Park",
      gender: "Female", date_of_birth: "2012-03-15", guardian_consent_at: "2026-05-01T00:00:00Z", height_cm: 158,
      bust_cm: 76, waist_cm: 61, hips_cm: 84, dress_size: "12", shoe_size: "6", hair_color: "blonde", eye_color: "blue",
    },
    images: [photo("model_golden_hour.jpg", { shot_type: "headshot" }), photo("model_full_body.jpg", { id: "img-full", is_primary: false, sort: 1, shot_type: "full_length" })],
    representations: [{ status: "active", agency_name: "Bright Young Talent Management Group", relationship_type: "mother", market: "Los Angeles" }],
  },
  {
    id: "sparse-legacy",
    title: "Sparse profile: no height, legacy current_agency only",
    profile: {
      id: "55555555-5555-4555-8555-555555555555", slug: "jo-reyes", first_name: "Jo", last_name: "Reyes",
      current_agency: "Select Model Management", eye_color: "green",
    },
    images: [photo("model_golden_hour.jpg")],
    representations: [],
  },
];

const THEMES = ["ink", "paper"];

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}

function dataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

/** Wallet formats dated fields itself (dateStyle); the mock does the same. */
function shownValue(f) {
  if (f.dateStyle && f.dateStyle !== "PKDateStyleNone") {
    const date = new Date(f.value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  }
  return f.value;
}

function field(f, cls = "") {
  if (!f) return "";
  return `<div class="field ${cls}">${f.label ? `<div class="label">${esc(f.label)}</div>` : ""}<div class="value">${esc(shownValue(f))}</div></div>`;
}

async function renderCase(fixture, theme) {
  const built = await buildPassFiles({
    profile: fixture.profile,
    user: {},
    images: fixture.images,
    representations: fixture.representations,
    portfolioUrl: `${BASE_URL}/p/${fixture.profile.slug}`,
    passTypeIdentifier: PASS_TYPE,
    teamIdentifier: TEAM,
    theme,
    now: new Date("2026-09-03T12:00:00Z"),
  });
  const { pass, view } = built.content;
  const qr = await QRCode.toDataURL(pass.barcodes[0].message, { margin: 0, width: 400, color: { dark: "#000000", light: "#FFFFFF" } });
  const img = (name) => dataUrl(built.files[name]);
  const poster = pass.posterGeneric;
  const generic = pass.generic;
  const p = view.palette;

  const posterHtml = `
<div class="pass poster" style="background:${p.background};color:${p.foreground}">
  <img class="artwork" src="${img("artwork@2x.png")}" alt="">
  <div class="poster-top">
    <img class="primary-logo" src="${img("primaryLogo@3x.png")}" alt="Pholio">
    <div class="headers" style="--label:${p.label}">${poster.headerFields.map((f) => field(f, "header")).join("")}</div>
  </div>
  <div class="poster-bottom" style="--label:${p.label}">
    <div class="title">${esc(poster.primaryFields[0].value)}</div>
    <div class="strip" style="background:${pass.footerBackgroundColor}">
      ${field(poster.footerFields[0], "footer")}
      <div class="qr-plate small"><img src="${qr}" alt=""></div>
    </div>
  </div>
</div>`;

  const genericHtml = `
<div class="pass generic" style="background:${p.background};color:${p.foreground};--label:${p.label}">
  <div class="row top">
    <img class="logo" src="${img("logo@3x.png")}" alt="Pholio">
    <div class="headers">${generic.headerFields.map((f) => field(f, "header")).join("")}</div>
  </div>
  <div class="row body">
    <div class="primary"><div class="value">${esc(generic.primaryFields[0].value)}</div></div>
    <img class="thumb" src="${img("thumbnail@3x.png")}" alt="">
  </div>
  <div class="row secondary">${generic.secondaryFields.map((f) => field(f)).join("")}</div>
  <div class="row auxiliary">${generic.auxiliaryFields.map((f) => field(f)).join("")}</div>
  <div class="barcode"><div class="qr-plate"><img src="${qr}" alt=""></div><div class="alt">${esc(pass.barcodes[0].altText)}</div></div>
</div>`;

  const stackHtml = `
<div class="stack">
  <div class="card other a"></div>
  <div class="card other b"></div>
  <div class="card ours" style="background:${p.background};color:${p.foreground};--label:${p.label}">
    <img class="logo" src="${img("logo@3x.png")}" alt="Pholio">
    <div class="headers">${generic.headerFields.map((f) => field(f, "header")).join("")}</div>
  </div>
  <div class="card other c"></div>
</div>`;

  const backHtml = `
<div class="back" style="--label:${p.label}">
  <div class="back-head"><img class="icon" src="${img("icon@2x.png")}" alt=""><div><div class="org">Pholio</div><div class="desc">${esc(pass.description)}</div></div></div>
  ${generic.backFields.map((f) => `<div class="back-row"><div class="label">${esc(f.label)}</div><div class="value">${esc(shownValue(f)).replace(/\n/g, "<br>")}</div></div>`).join("")}
</div>`;

  return {
    id: `${fixture.id}--${theme}`,
    fixture,
    theme,
    view,
    pass,
    subject: built.subject,
    hero: built.hero.id,
    sizes: Object.fromEntries(Object.entries(built.files).map(([k, v]) => [k, v.length])),
    html: `<section class="case" id="${fixture.id}--${theme}">
  <h2>${esc(fixture.title)} <span class="theme">${theme}</span></h2>
  <div class="boards">
    <figure><figcaption>iOS 27+ · posterGeneric</figcaption>${posterHtml}</figure>
    <figure><figcaption>iOS 26 and earlier · generic</figcaption>${genericHtml}</figure>
    <figure><figcaption>Collapsed in the stack</figcaption>${stackHtml}</figure>
    <figure class="wide"><figcaption>Details sheet (back fields)</figcaption>${backHtml}</figure>
  </div>
  <p class="meta">hero ${esc(built.hero.id)} · subject ${esc(built.subject.source)} (${built.subject.focal.x.toFixed(2)}, ${built.subject.focal.y.toFixed(2)}) · artwork@3x ${(built.files["artwork@3x.png"].length / 1024).toFixed(0)} KB · bundle images ${(Object.values(built.files).reduce((a, b) => a + b.length, 0) / 1024).toFixed(0)} KB${view.warnings.length ? ` · warnings: ${esc(view.warnings.join("; "))}` : ""}</p>
</section>`,
  };
}

function css(fontDir) {
  const font = (file) => `url("file://${fontDir}/${file}")`;
  return `
@font-face { font-family: "Inter"; font-weight: 400; src: ${font("inter-400.ttf")}; }
@font-face { font-family: "Inter"; font-weight: 600; src: ${font("inter-600.ttf")}; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px; background: #101010; color: #ddd; font-family: Inter, -apple-system, sans-serif; }
h1 { font-weight: 600; font-size: 20px; margin: 0 0 8px; }
h1 + p { margin: 0 0 28px; color: #999; font-size: 13px; max-width: 80ch; }
.case { margin-bottom: 48px; }
.case h2 { font-size: 15px; font-weight: 600; margin: 0 0 14px; color: #eee; }
.case h2 .theme { color: #C9A55A; font-weight: 400; margin-left: 8px; }
.boards { display: flex; gap: 28px; align-items: flex-start; flex-wrap: wrap; }
figure { margin: 0; }
figcaption { font-size: 11px; color: #888; margin-bottom: 8px; letter-spacing: 0.02em; }
.meta { font-size: 11px; color: #777; margin: 12px 0 0; }
.pass { width: 358px; border-radius: 14px; position: relative; overflow: hidden; box-shadow: 0 12px 32px rgba(0,0,0,.5); }
.label { font-size: 10px; font-weight: 600; letter-spacing: 0.06em; color: var(--label); line-height: 1.2; }
.value { font-size: 15px; font-weight: 400; line-height: 1.25; white-space: nowrap; }
/* poster generic */
.poster { height: 448px; }
.poster .artwork { position: absolute; inset: 0; width: 358px; height: 448px; display: block; }
.poster-top { position: absolute; top: 14px; left: 16px; right: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
.poster .primary-logo { height: 30px; width: auto; display: block; }
.headers { display: flex; gap: 14px; text-align: right; }
.header .value { font-size: 16px; }
.poster-bottom { position: absolute; left: 0; right: 0; bottom: 0; }
.poster .title { font-size: 28px; font-weight: 600; letter-spacing: -0.01em; padding: 0 16px 10px; line-height: 1.1; }
.poster .strip { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px 16px; }
.qr-plate { background: #fff; border-radius: 8px; padding: 8px; display: inline-block; }
.qr-plate img { width: 112px; height: 112px; display: block; image-rendering: pixelated; }
.qr-plate.small img { width: 56px; height: 56px; }
.qr-plate.small { padding: 6px; border-radius: 6px; }
/* generic */
.generic { padding: 12px 16px 16px; }
.generic .row { display: flex; gap: 18px; }
.generic .top { justify-content: space-between; align-items: center; height: 50px; margin-bottom: 8px; }
.generic .logo { height: 50px; width: auto; display: block; }
.generic .body { justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
.generic .primary { min-width: 0; flex: 1 1 auto; }
.generic .primary .value { font-size: 28px; font-weight: 600; letter-spacing: -0.01em; padding-top: 8px; overflow: hidden; text-overflow: ellipsis; }
.generic .thumb { width: 90px; height: 90px; display: block; flex: 0 0 auto; }
.generic .secondary, .generic .auxiliary { margin-bottom: 12px; }
.generic .auxiliary { gap: 22px; }
.generic .barcode { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 6px; }
.generic .alt { font-size: 10px; opacity: .7; }
/* stack */
.stack { position: relative; width: 358px; height: 300px; }
.stack .card { position: absolute; left: 0; width: 358px; height: 220px; border-radius: 14px; box-shadow: 0 -6px 18px rgba(0,0,0,.45); }
.stack .other.a { top: 0; background: linear-gradient(135deg,#1c2a44,#0e1730); }
.stack .other.b { top: 52px; background: linear-gradient(135deg,#7a1f2b,#3d0f16); }
.stack .ours { top: 104px; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; height: 240px; align-items: flex-start; }
.stack .ours .logo { height: 40px; width: auto; }
.stack .other.c { top: 156px; background: linear-gradient(135deg,#2b2b2b,#111); }
/* back */
.back { width: 358px; background: #fff; color: #111; border-radius: 14px; padding: 16px; box-shadow: 0 12px 32px rgba(0,0,0,.5); }
.back .label { color: #6b6560; }
.back-head { display: flex; gap: 12px; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #eee; margin-bottom: 4px; }
.back-head .icon { width: 38px; height: 38px; border-radius: 9px; }
.back-head .org { font-weight: 600; font-size: 15px; }
.back-head .desc { font-size: 12px; color: #666; }
.back-row { padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
.back-row .value { white-space: normal; font-size: 14px; margin-top: 2px; }
`;
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const outDir = path.resolve(ROOT, outIndex >= 0 ? args[outIndex + 1] : "docs/wallet/previews");
  await fs.mkdir(outDir, { recursive: true });

  const cases = [];
  for (const fixture of FIXTURES) {
    for (const theme of THEMES) {
      // eslint-disable-next-line no-await-in-loop
      cases.push(await renderCase(fixture, theme));
    }
  }

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pholio ID — Wallet previews</title><style>${css(FONTS)}</style></head><body>
<h1>Pholio ID — Apple Wallet previews</h1>
<p>Each case is built by the real pass builder (content, face location, artwork) and laid out with Apple's published pass geometry. Left to right: the iOS 27 poster face, the iOS 26 generic face, the pass collapsed in the Wallet stack, and the details sheet. Generated ${new Date().toISOString().slice(0, 10)} by scripts/wallet/render-previews.js.</p>
${cases.map((c) => c.html).join("\n")}
</body></html>`;
  const indexPath = path.join(outDir, "index.html");
  await fs.writeFile(indexPath, html);
  await fs.writeFile(
    path.join(outDir, "cases.json"),
    JSON.stringify(cases.map(({ id, theme, view, pass, subject, hero, sizes }) => ({ id, theme, hero, subject, sizes, view, pass })), null, 2),
  );

  let puppeteer;
  try {
    // eslint-disable-next-line global-require
    puppeteer = require("puppeteer");
  } catch {
    console.log(`Wrote ${indexPath} (puppeteer unavailable; no PNGs).`);
    return;
  }
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  const browser = await puppeteer.launch({ headless: true, executablePath, args: ["--no-sandbox", "--allow-file-access-from-files"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1640, height: 1200, deviceScaleFactor: 1.25 });
    await page.goto(`file://${indexPath}`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    for (const c of cases) {
      const el = await page.$(`#${c.id}`);
      // eslint-disable-next-line no-await-in-loop
      await el.screenshot({ path: path.join(outDir, `${c.id}.png`) });
    }
    console.log(`Wrote ${cases.length} previews to ${outDir}`);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { FIXTURES, renderCase };
