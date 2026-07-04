"use strict";

const {
  boundedString,
  normalizeCompCard,
} = require("../../src/domains/agency/services/application-submission-package");

describe("agency submission package display normalization", () => {
  test("rejects non-string display values and bounds legacy strings", () => {
    expect(boundedString({ unsafe: true })).toBeNull();
    expect(boundedString("x".repeat(200), 12)).toHaveLength(12);
  });

  test("normalizes legacy comp-card payloads before agency rendering", () => {
    const normalized = normalizeCompCard({
      id: { unsafe: true },
      name: { unsafe: true },
      seed: "seed",
      lockGridIds: ["one", { unsafe: true }, "two"],
    });
    expect(normalized).toMatchObject({
      id: null,
      name: "Comp card",
      seed: "seed",
      lockGridIds: ["one", null, "two"],
    });
  });
});
