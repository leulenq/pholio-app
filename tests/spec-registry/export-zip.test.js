"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const { buildZip, crc32 } = require("../../src/domains/spec-registry/export/zip");

/**
 * The ZIP writer is hand-rolled, so it is verified against something that is
 * not itself. `zlib.crc32` is an independent implementation of the checksum,
 * and the `unzip` CLI is an independent implementation of the container — if
 * both agree, the archive is real rather than merely self-consistent.
 */
describe("spec-correct export — ZIP container", () => {
  test("checksums agree with zlib's own CRC32", () => {
    const samples = [
      Buffer.alloc(0),
      Buffer.from("a"),
      Buffer.from("the quick brown fox"),
      Buffer.from([0x00, 0xff, 0x7f, 0x80, 0x01]),
      // Larger than one CRC table pass, and not compressible — like a JPEG.
      Buffer.from(Array.from({ length: 5000 }, (_, index) => (index * 37) % 256)),
    ];
    for (const sample of samples) {
      expect(crc32(sample)).toBe(zlib.crc32(sample));
    }
  });

  test("writes an archive the system unzip accepts, with the exact bytes back", () => {
    const files = [
      { name: "elite-model-management-full-length.jpg", data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]) },
      { name: "elite-model-management-close-up.jpg", data: Buffer.from("not really a jpeg, but bytes") },
      { name: "README.txt", data: Buffer.from("Requirements as published by Elite.\n", "utf8") },
    ];
    const archive = buildZip(files);

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pholio-zip-"));
    const archivePath = path.join(directory, "export.zip");
    fs.writeFileSync(archivePath, archive);

    // Exits non-zero if any CRC, header or directory entry is wrong.
    execFileSync("unzip", ["-t", archivePath], { stdio: "pipe" });
    execFileSync("unzip", ["-qq", "-o", archivePath, "-d", directory], { stdio: "pipe" });

    for (const file of files) {
      expect(fs.readFileSync(path.join(directory, file.name))).toEqual(file.data);
    }
    expect(fs.readdirSync(directory).sort()).toEqual(
      ["export.zip", ...files.map((file) => file.name)].sort(),
    );

    fs.rmSync(directory, { recursive: true, force: true });
  });

  test("is byte-identical for identical input, so an unchanged set reads as unchanged", () => {
    const files = [{ name: "a.jpg", data: Buffer.from("same") }];
    expect(buildZip(files, { modifiedAt: new Date("2026-08-14T00:00:00.000Z") })).toEqual(
      buildZip(files, { modifiedAt: new Date("2026-08-14T00:00:00.000Z") }),
    );
  });

  test("refuses a duplicate name rather than writing a silently truncated set", () => {
    expect(() =>
      buildZip([
        { name: "elite-close-up.jpg", data: Buffer.from("one") },
        { name: "elite-close-up.jpg", data: Buffer.from("two") },
      ]),
    ).toThrow(/unique/i);
  });

  test("refuses an empty archive and an unnamed entry", () => {
    expect(() => buildZip([])).toThrow(/at least one file/i);
    expect(() => buildZip([{ name: "", data: Buffer.from("x") }])).toThrow(/non-empty/i);
  });

  test("clamps a pre-1980 timestamp instead of wrapping it into the future", () => {
    // The MS-DOS date field has no room for years before 1980; the epoch-zero
    // default would otherwise wrap to a date decades out.
    const archive = buildZip([{ name: "a.txt", data: Buffer.from("x") }], {
      modifiedAt: new Date(0),
    });
    const dosDate = archive.readUInt16LE(12);
    expect(dosDate >> 9).toBe(0); // 1980 + 0
  });
});
