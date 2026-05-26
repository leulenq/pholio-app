#!/usr/bin/env node
/**
 * Generate PNG + ICO favicons from client/public/favicon.svg (brand Initial · P.).
 * Run: node scripts/generate-favicons.js
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const SVG = path.join(ROOT, "client/public/favicon.svg");
const OUT_DIRS = [
  path.join(ROOT, "client/public"),
  path.join(ROOT, "public"),
  path.join(ROOT, "public/dashboard-app"),
];

async function writePng(dir, name, size) {
  const out = path.join(dir, name);
  await sharp(SVG)
    .resize(size, size, { fit: "contain", background: "#050505" })
    .png()
    .toFile(out);
  return out;
}

async function main() {
  if (!fs.existsSync(SVG)) {
    console.error("Missing", SVG);
    process.exit(1);
  }

  const png16 = path.join(ROOT, "client/public/favicon-16x16.png");
  const png32 = path.join(ROOT, "client/public/favicon-32x32.png");
  const png180 = path.join(ROOT, "client/public/apple-touch-icon.png");

  await sharp(SVG)
    .resize(16, 16, { fit: "contain", background: "#050505" })
    .png()
    .toFile(png16);
  await sharp(SVG)
    .resize(32, 32, { fit: "contain", background: "#050505" })
    .png()
    .toFile(png32);
  await sharp(SVG)
    .resize(180, 180, { fit: "contain", background: "#050505" })
    .png()
    .toFile(png180);

  let toIco;
  try {
    toIco = require("to-ico");
  } catch {
    console.warn(
      "Install to-ico for favicon.ico: npm install --save-dev to-ico",
    );
    process.exit(0);
  }

  const ico = await toIco([fs.readFileSync(png16), fs.readFileSync(png32)]);
  const icoPath = path.join(ROOT, "client/public/favicon.ico");
  fs.writeFileSync(icoPath, ico);

  const names = [
    "favicon.ico",
    "favicon-16x16.png",
    "favicon-32x32.png",
    "apple-touch-icon.png",
    "favicon.svg",
    "apple-touch-icon.svg",
  ];

  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
    for (const name of names) {
      const src = path.join(ROOT, "client/public", name);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(dir, name));
      }
    }
  }

  console.log(
    "Favicons written to client/public, public/, public/dashboard-app/",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
