"use strict";

const {
  structuredBoostForProfile,
} = require("../../src/domains/agency/services/discover-retrieval");

// Compliance guardrail: ethnicity / skin-tone must not act as a positive default
// ranking signal (LL144 / EU AI Act / fair hiring). See design doc §7.4.
describe("discover-retrieval :: no ethnicity/skin-tone boost", () => {
  const profile = {
    ethnicity: ["Korean"],
    skin_tone: "deep",
    bio_curated: "Korean-American model based in Seoul",
    gender: "female",
    city: "Seoul",
  };

  it("does not boost on a heritage constraint", () => {
    const { boost, legHits } = structuredBoostForProfile(profile, [
      { field: "heritage", value: "Korean", confidence: 0.9 },
    ]);
    expect(boost).toBe(0);
    expect(legHits).not.toHaveProperty("heritage");
  });

  it("still boosts on legitimate non-protected signals (gender)", () => {
    const { boost, legHits } = structuredBoostForProfile(profile, [
      { field: "gender", value: "female", confidence: 0.9 },
    ]);
    expect(boost).toBeGreaterThan(0);
    expect(legHits).toHaveProperty("gender");
  });
});
