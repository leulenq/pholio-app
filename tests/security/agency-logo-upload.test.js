"use strict";

const fs = require("fs");
const {
  processAgencyLogo,
} = require("../../src/shared/lib/uploader");

describe("agency logo upload hardening", () => {
  const written = [];

  afterEach(() => {
    while (written.length) {
      const file = written.pop();
      if (file && fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  test("rasterizes a script-bearing SVG and never writes active SVG", async () => {
    const svg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="20">
        <script>alert('stored-xss')</script>
        <rect width="40" height="20" fill="#111" onload="alert('xss')" />
      </svg>
    `);

    const result = await processAgencyLogo(
      { buffer: svg, originalname: "logo.svg", mimetype: "image/svg+xml" },
      { agencyId: "security-test", maxWidth: 40, maxHeight: 20 },
    );
    written.push(result.absolutePath);

    expect(result.publicUrl.endsWith(".png")).toBe(true);
    const stored = fs.readFileSync(result.absolutePath);
    expect(stored.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(stored.toString("utf8")).not.toContain("<script");
    expect(stored.toString("utf8")).not.toContain("onload");
  });

  test("rejects relabeled content whose bytes are not PNG or SVG", async () => {
    await expect(
      processAgencyLogo(
        {
          buffer: Buffer.from("not actually an image"),
          originalname: "logo.png",
          mimetype: "image/png",
        },
        { agencyId: "security-test" },
      ),
    ).rejects.toThrow("Agency logo must be a PNG or SVG file");
  });
});
