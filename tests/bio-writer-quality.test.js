const {
  scoreBio,
  findBannedLanguage,
  passesBioQuality,
  resolveBounds,
} = require("../src/domains/talent/services/bio-writer/quality-rubric");
const {
  validateBioOutput,
} = require("../src/domains/talent/services/bio-writer/output-validator");

const sampleContext = {
  name: "Maya Chen",
  richness: "rich",
  signals: [
    { key: "market", label: "Market", fact: "Toronto, Canada" },
    { key: "lanes", label: "Booking lanes", fact: "Editorial, Runway" },
    {
      key: "credits",
      label: "Credits",
      fact: "Sable Journal · Editorial · 2024 | Corvid Denim · Lookbook · 2023",
    },
    {
      key: "training",
      label: "Training",
      fact: "Two seasons of runway coaching at a Toronto studio",
    },
  ],
};

const GROUNDED_BIO =
  "Maya Chen is a Toronto-based editorial and runway model. She shot Sable Journal in 2024 and the Corvid Denim lookbook in 2023. Two seasons of coaching sit behind that work.";

describe("bio-writer quality rubric — shape", () => {
  it("passes a grounded, concrete third-person bio", () => {
    const result = scoreBio(GROUNDED_BIO);
    expect(result.pass).toBe(true);
    expect(result.issues).not.toContain("generic_filler");
    expect(result.wordCount).toBeGreaterThanOrEqual(28);
    expect(result.wordCount).toBeLessThanOrEqual(85);
  });

  it("fails first-person output when third-person voice is expected", () => {
    const result = scoreBio(
      "I am a Toronto model. I shoot editorial and runway and I book steadily in the Toronto market every season.",
    );
    expect(result.pass).toBe(false);
    expect(result.issues).toContain("first_person");
  });

  it("fails measurement leakage", () => {
    const bio =
      "Maya Chen is 180 cm tall with a 86 cm bust, working editorial in Toronto with strong runway range.";
    const result = scoreBio(bio);
    expect(result.pass).toBe(false);
    expect(result.issues).toContain("measurement_leak");
  });

  it("treats every hard-failure issue as unrecoverable regardless of score", () => {
    expect(passesBioQuality(100, [])).toBe(true);
    expect(passesBioQuality(100, ["short"])).toBe(true);
    expect(passesBioQuality(100, ["generic_filler"])).toBe(false);
    expect(passesBioQuality(100, ["fabricated_facts"])).toBe(false);
    expect(passesBioQuality(69, [])).toBe(false);
  });
});

describe("bio-writer quality rubric — AI-slop register", () => {
  const SLOP_CASES = [
    ["passionate", "Maya Chen is a passionate Toronto model booking editorial and runway work across the market this season.", "generic_filler"],
    ["dynamic", "Maya Chen is a dynamic Toronto model booking editorial and runway work across the market this season.", "generic_filler"],
    ["versatile", "Maya Chen is a versatile Toronto model booking editorial and runway work across the market this season.", "generic_filler"],
    ["captivating", "Maya Chen is a captivating Toronto model booking editorial and runway work across the market this season.", "generic_filler"],
    ["stunning", "Maya Chen is a stunning Toronto model booking editorial and runway work across the market this season.", "generic_filler"],
    ["seamlessly", "Maya Chen seamlessly moves between editorial and runway work in Toronto and books steadily across the market.", "generic_filler"],
    ["unique blend", "Maya Chen brings a unique blend of editorial and runway range to the Toronto market every single season.", "ai_slop"],
    ["with a passion for", "With a passion for the craft, Maya Chen books editorial and runway work across the Toronto market.", "ai_slop"],
    ["brings X to every shoot", "Maya Chen brings real focus to every shoot she books, working editorial and runway across the Toronto market.", "ai_slop"],
    ["whether X or Y", "Whether editorial or runway, Maya Chen books consistently across the Toronto market and delivers on set.", "ai_slop"],
    ["sought-after", "Maya Chen is a sought-after Toronto model booking editorial and runway work across the market this season.", "ai_slop"],
    ["turns heads", "Maya Chen turns heads on Toronto sets, booking editorial and runway work across the market this season.", "ai_slop"],
  ];

  it.each(SLOP_CASES)("rejects %s", (_label, bio, expectedIssue) => {
    const result = scoreBio(bio);
    expect(result.issues).toContain(expectedIssue);
    expect(result.pass).toBe(false);
  });

  it("rejects a tricolon opener but keeps a genuine three-lane list", () => {
    const tricolon = scoreBio(
      "Poised, polished, and camera-ready, Maya Chen books editorial and runway work across the Toronto market this season.",
    );
    expect(tricolon.issues).toContain("tricolon_opener");
    expect(tricolon.pass).toBe(false);

    const laneList = scoreBio(
      "Maya Chen is a Toronto-based editorial, runway, and showroom model who books steadily across the market each season.",
    );
    expect(laneList.issues).not.toContain("tricolon_opener");
    expect(laneList.pass).toBe(true);
  });

  it("rejects em-dash chains but allows a single em dash", () => {
    const chain = scoreBio(
      "Maya Chen is a Toronto model — editorial and runway — who shot Sable Journal in 2024 and books steadily.",
    );
    expect(chain.issues).toContain("em_dash_chain");
    expect(chain.pass).toBe(false);

    const single = scoreBio(
      "Maya Chen is a Toronto-based editorial and runway model — she shot Sable Journal in 2024 and books steadily.",
    );
    expect(single.issues).not.toContain("em_dash_chain");
    expect(single.pass).toBe(true);
  });

  it("reports the exact banned terms so the retry can name them", () => {
    const banned = findBannedLanguage(
      "A passionate and versatile model with a unique blend of range, no stranger to editorial sets.",
    );
    expect(banned.words).toEqual(expect.arrayContaining(["passionate", "versatile"]));
    expect(banned.phrases).toEqual(
      expect.arrayContaining(["unique blend", "no stranger to"]),
    );
  });
});

describe("bio-writer quality rubric — hobbyist register", () => {
  const HOBBYIST_CASES = [
    ["aspiring model", "Maya Chen is an aspiring model in Toronto who works editorial and runway jobs whenever she can get them."],
    ["loves fashion", "Maya Chen is a Toronto model who loves fashion and books editorial and runway work across the market."],
    ["dreams of", "Maya Chen is a Toronto model who dreams of walking runway shows and books editorial work in the market."],
    ["at a young age", "Maya Chen started modeling at a young age in Toronto and now books editorial and runway work in market."],
    ["new to the industry", "Maya Chen is new to the industry in Toronto and books editorial and runway work across the market."],
  ];

  it.each(HOBBYIST_CASES)("rejects %s", (_label, bio) => {
    const result = scoreBio(bio);
    expect(result.issues).toContain("hobbyist_register");
    expect(result.pass).toBe(false);
  });

  it("accepts correct industry phrasing for the same talent", () => {
    const result = scoreBio(
      "Maya Chen is a Toronto-based new face working editorial and runway, and is open to representation in the market.",
    );
    expect(result.issues).not.toContain("hobbyist_register");
    expect(result.pass).toBe(true);
  });
});

describe("bio-writer bounds", () => {
  it("caps length by context richness on top of the length mode", () => {
    expect(resolveBounds("standard", "rich")).toEqual({
      hardMin: 18,
      softMin: 28,
      softMax: 85,
      hardMax: 95,
    });
    expect(resolveBounds("standard", "moderate").hardMax).toBe(72);
    expect(resolveBounds("standard", "thin")).toEqual({
      hardMin: 10,
      softMin: 14,
      softMax: 38,
      hardMax: 46,
    });
    // Richness only ever tightens the mode, never loosens it.
    expect(resolveBounds("tight", "rich").softMax).toBe(50);
    expect(resolveBounds("tight", "thin").softMax).toBe(38);
  });
});

describe("bio-writer output validator", () => {
  it("validates a fully grounded bio", () => {
    const { valid, rubric } = validateBioOutput(GROUNDED_BIO, sampleContext);
    expect(rubric.score).toBeGreaterThan(70);
    expect(valid).toBe(true);
  });

  it("rejects the same bio once one invented credit is added", () => {
    const { valid, fabrications } = validateBioOutput(
      GROUNDED_BIO.replace("Two seasons of coaching", "Ford Models training"),
      sampleContext,
    );
    expect(valid).toBe(false);
    expect(fabrications.map((f) => f.phrase)).toContain("Ford Models");
  });
});
