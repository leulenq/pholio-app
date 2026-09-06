"use strict";

/**
 * `toFeetInches` (src/domains/talent/services/stats.js).
 *
 * Regression: the old implementation rounded the tenths-of-an-inch value
 * BEFORE splitting into feet/inches (`Math.round(inches - feet * 12)`),
 * which let the inches component itself round up to 12 — e.g. 182.6cm
 * rounded to 71.96 in, floor(71.96/12) = 5 ft, remaining
 * round(71.96 - 60) = round(11.96) = 12, rendering as `5' 12"` instead of
 * `6' 0"`. The fix rounds the TOTAL inches once, then splits, so the carry
 * happens before the split rather than after.
 */

const { toFeetInches } = require("../../src/domains/talent/services/stats");

describe("toFeetInches", () => {
  test("182.6cm carries into the next foot instead of rendering 5' 12\"", () => {
    expect(toFeetInches(182.6)).toBe("6' 0\"");
  });

  test("175cm renders 5' 9\"", () => {
    expect(toFeetInches(175)).toBe("5' 9\"");
  });

  test("152.4cm renders 5' 0\" exactly", () => {
    expect(toFeetInches(152.4)).toBe("5' 0\"");
  });

  test("never emits a 12\" remainder for any centimeter value near a foot boundary", () => {
    // Sweep every whole centimeter across a wide range and assert the
    // remaining-inches component is always 0-11.
    for (let cm = 50; cm <= 220; cm += 1) {
      const result = toFeetInches(cm);
      const match = result.match(/^(\d+)' (\d+)"$/);
      expect(match).not.toBeNull();
      const remaining = Number(match[2]);
      expect(remaining).toBeGreaterThanOrEqual(0);
      expect(remaining).toBeLessThanOrEqual(11);
    }
  });

  test("falsy or non-numeric input yields an empty string", () => {
    expect(toFeetInches(0)).toBe("");
    expect(toFeetInches(null)).toBe("");
    expect(toFeetInches(undefined)).toBe("");
    expect(toFeetInches("not-a-number")).toBe("");
  });
});
