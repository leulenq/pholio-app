"use strict";

const path = require("path");
const {
  resolveStandardFontDataUrl,
} = require("../../src/shared/lib/pdf-text");

describe("PDF text reader runtime dependencies", () => {
  test("does not fail API startup when pdfjs package metadata is absent", () => {
    const missingPackage = () => {
      const error = new Error("Cannot find module 'pdfjs-dist/package.json'");
      error.code = "MODULE_NOT_FOUND";
      throw error;
    };

    expect(resolveStandardFontDataUrl(missingPackage)).toBeUndefined();
  });

  test("uses installed standard fonts when package metadata is available", () => {
    const packageJson = path.join(
      path.sep,
      "runtime",
      "node_modules",
      "pdfjs-dist",
      "package.json",
    );

    expect(resolveStandardFontDataUrl(() => packageJson)).toBe(
      `${path.join(path.dirname(packageJson), "standard_fonts")}${path.sep}`,
    );
  });
});
