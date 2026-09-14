"use strict";
// Harmless decoder-boundary proof. No application config, DB, storage or network.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");

async function main() {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../src/shared/lib/uploader.js"), "utf8");
  const start = source.indexOf("const fileFilter =");
  const end = source.indexOf("const upload =", start);
  assert.ok(start >= 0 && end > start);
  const fileFilter = vm.runInNewContext(`${source.slice(start, end)}; fileFilter;`);
  const avif = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).avif().toBuffer();
  let accepted = false;
  fileFilter({}, { originalname: "photo.jpg", mimetype: "image/jpeg", buffer: avif }, (error, ok) => {
    assert.equal(error, null);
    accepted = ok;
  });
  assert.equal(accepted, true);
  assert.equal((await sharp(avif).metadata()).format, "heif");
  const result = await sharp(avif).webp().toBuffer();
  assert.ok(result.length > 0);
  console.log("PROVED: real uploader MIME filter accepts harmless AVIF declared as JPEG; installed Sharp decodes it successfully.");
  console.log(JSON.stringify({ sharp: sharp.versions.sharp, libheif: sharp.versions.heif }));
  console.log("No malformed input or native-code exploit was attempted; production binary exploitability remains untested.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
