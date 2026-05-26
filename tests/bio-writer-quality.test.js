const {
  scoreBio,
} = require("../src/domains/talent/services/bio-writer/quality-rubric");
const {
  validateBioOutput,
} = require("../src/domains/talent/services/bio-writer/output-validator");

const sampleContext = {
  name: "Jane Doe",
  signals: [
    { key: "market", label: "Market", fact: "New York, USA" },
    { key: "lanes", label: "Lanes", fact: "Editorial, Commercial" },
    {
      key: "credits",
      label: "Credits",
      fact: "Vogue Italia · Editorial · 2024",
    },
  ],
};

describe("bio-writer quality rubric", () => {
  it("passes a strong third-person bio", () => {
    const bio =
      "Jane Doe is a New York–based editorial and commercial model with recent work for Vogue Italia. Trained at Ford Models, she works fluently in English and French and is open to agency representation.";
    const result = scoreBio(bio, {
      allowedPhrases: ["new york", "editorial", "vogue"],
    });
    expect(result.pass).toBe(true);
    expect(result.wordCount).toBeGreaterThanOrEqual(28);
    expect(result.wordCount).toBeLessThanOrEqual(85);
  });

  it("fails first-person and filler-heavy output", () => {
    const bio =
      "I am a passionate and driven model based in New York. I love fashion and I am a hardworking professional who brings dynamic energy to every shoot.";
    const result = scoreBio(bio);
    expect(result.pass).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(["first_person", "generic_filler"]),
    );
  });

  it("fails measurement leakage", () => {
    const bio =
      "Jane Doe is 180 cm tall with a 86 cm bust, working editorial in New York with strong commercial range.";
    const result = scoreBio(bio);
    expect(result.pass).toBe(false);
    expect(result.issues).toContain("measurement_leak");
  });
});

describe("bio-writer output validator", () => {
  it("validates against allowed context phrases", () => {
    const bio =
      "Jane Doe is a New York editorial and commercial model with Vogue Italia credits and Ford Models training.";
    const { valid, rubric } = validateBioOutput(bio, sampleContext);
    expect(rubric.score).toBeGreaterThan(50);
    expect(valid).toBe(true);
  });
});
