"use strict";

const {
  labelForShot,
  labelForImageType,
  labelForStyle,
  normalizeShotSlug,
  formatFrameTypeLabel,
  frameTypeParts,
  qualityHintFromSignals,
  shotPickerOptions,
  imageTypePickerOptions,
  isDeprecatedImageType,
  advisoryInline,
  pitsSignalParts,
  READINESS_FIELD_LABELS,
} = require("../../src/shared/constants/frame-taxonomy");

describe("frame-taxonomy", () => {
  test("aliases full_body to full_length for labeling", () => {
    expect(normalizeShotSlug("full_body")).toBe("full_length");
    expect(labelForShot("full_body")).toBe("Full length");
    expect(labelForShot("full_length")).toBe("Full length");
  });

  test("unifies portfolio and legacy editorial/runway image types as Book", () => {
    expect(labelForImageType("portfolio")).toBe("Book");
    expect(labelForImageType("editorial")).toBe("Book");
    expect(labelForImageType("runway")).toBe("Book");
    expect(labelForImageType("digital")).toBe("Digitals");
  });

  test("known enums never fall through to raw title case", () => {
    const shot = frameTypeParts("headshot", "digital", "commercial");
    expect(shot.map((p) => p.label)).toEqual(["Headshot", "Digitals", "Commercial"]);
    expect(formatFrameTypeLabel("three_quarter", "portfolio", "editorial")).toBe(
      "Three-quarter · Book · Editorial",
    );
  });

  test("profile_left and profile_right collapse to Profile label", () => {
    expect(labelForShot("profile_left")).toBe("Profile");
    expect(labelForShot("profile_right")).toBe("Profile");
  });

  test("deprecated image types are hidden from new pickers but remain labelable", () => {
    expect(isDeprecatedImageType("editorial")).toBe(true);
    expect(isDeprecatedImageType("portfolio")).toBe(false);
    const pickerValues = imageTypePickerOptions("").map((o) => o.value);
    expect(pickerValues).not.toContain("editorial");
    expect(pickerValues).not.toContain("runway");
    expect(imageTypePickerOptions("editorial").some((o) => o.value === "editorial")).toBe(true);
  });

  test("digitals quality hints route through taxonomy", () => {
    expect(
      qualityHintFromSignals({ styling_register: "editorial" }, "digital"),
    ).toMatch(/styled book work/i);
    expect(qualityHintFromSignals({ background: "environmental" }, "digital")).toMatch(
      /plain backdrop/i,
    );
  });

  test("package advisory inline copy is centralized", () => {
    expect(advisoryInline("book_headshot_not_digital")).toMatch(/digital headshot/i);
    expect(advisoryInline("missing_slot_full_body")).toMatch(/full-length/i);
  });

  test("readiness field labels use consistent digitals language", () => {
    expect(READINESS_FIELD_LABELS.photo_headshot).toBe("Digital Headshot");
    expect(READINESS_FIELD_LABELS.photo_editorial).toBe("Editorial / Creative");
  });

  test("pits signal parts surface expression and digitals quality reads", () => {
    const parts = pitsSignalParts(
      {
        expression: "smile",
        background: "environmental",
        styling_register: "polished",
      },
      "digital",
    );
    expect(parts.map((p) => p.label)).toEqual(
      expect.arrayContaining(["Smiling", "Environmental background", "Polished styling"]),
    );
  });
});
