const {
  buildSystemPrompt,
  buildGeneratePrompt,
  buildRefinePrompt,
  buildRetryNudge,
  buildDivisionGuidance,
  normalizeBioOptions,
  DIVISION_TONE,
} = require("../src/domains/talent/services/bio-writer/prompt-builder");
const {
  scoreBio,
} = require("../src/domains/talent/services/bio-writer/quality-rubric");
const {
  validateBioOutput,
} = require("../src/domains/talent/services/bio-writer/output-validator");
const {
  buildBioContext,
} = require("../src/domains/talent/services/bio-writer/context-builder");
const {
  PROFILE_DIVISIONS,
} = require("../src/shared/constants/profile-division");

const baseContext = {
  name: "Jane Doe",
  signals: [
    { key: "market", label: "Market", fact: "New York, USA" },
    { key: "lanes", label: "Lanes", fact: "Editorial, Commercial" },
    { key: "credits", label: "Credits", fact: "Vogue Italia · Editorial · 2024" },
  ],
};

describe("normalizeBioOptions", () => {
  it("defaults to standard length and third person", () => {
    expect(normalizeBioOptions()).toEqual({ length: "standard", person: "third" });
    expect(normalizeBioOptions({})).toEqual({ length: "standard", person: "third" });
  });

  it("accepts valid overrides and ignores unknown values", () => {
    expect(normalizeBioOptions({ length: "tight", person: "first" })).toEqual({
      length: "tight",
      person: "first",
    });
    expect(normalizeBioOptions({ length: "huge", person: "second" })).toEqual({
      length: "standard",
      person: "third",
    });
  });
});

describe("buildSystemPrompt modes", () => {
  it("defaults preserve third person + standard length guidance", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/third person/i);
    expect(prompt).toMatch(/35 to 80 words/);
  });

  it("first person mode instructs the talent's own voice", () => {
    const prompt = buildSystemPrompt({ person: "first" });
    expect(prompt).toMatch(/first person/i);
    expect(prompt).not.toMatch(/Write in third person/);
  });

  it("tight length narrows the word target", () => {
    const prompt = buildSystemPrompt({ length: "tight" });
    expect(prompt).toMatch(/25 to 45 words/);
    expect(prompt).toMatch(/1 to 2 sentences/);
  });
});

describe("division-aware prompts", () => {
  it("exposes tone guidance for every division", () => {
    Object.values(PROFILE_DIVISIONS).forEach((division) => {
      expect(typeof DIVISION_TONE[division]).toBe("string");
      expect(DIVISION_TONE[division].length).toBeGreaterThan(10);
    });
  });

  it("injects division label + tagline + tone into the block", () => {
    const block = buildDivisionGuidance({
      division: PROFILE_DIVISIONS.FASHION_EDITORIAL,
      divisionLabel: "Fashion & Editorial",
      divisionTagline: "Bookers scan for clean digitals.",
    });
    expect(block).toMatch(/DIVISION POSITIONING/);
    expect(block).toMatch(/Fashion & Editorial/);
    expect(block).toMatch(/clean digitals/);
    expect(block).toMatch(/editorial and selective/i);
  });

  it("returns empty division block when division is unknown", () => {
    expect(buildDivisionGuidance({})).toBe("");
    expect(buildDivisionGuidance({ division: "nonexistent" })).toBe("");
  });

  it("commercial division yields approachable tone in generate prompt", () => {
    const ctx = {
      ...baseContext,
      division: PROFILE_DIVISIONS.COMMERCIAL_LIFESTYLE,
      divisionLabel: "Commercial & Lifestyle",
      divisionTagline: "Bookers scan for smile energy.",
    };
    const prompt = buildGeneratePrompt(ctx, { length: "standard", person: "third" });
    expect(prompt).toMatch(/approachable and relatable/i);
    expect(prompt).toMatch(/Commercial & Lifestyle/);
  });
});

describe("buildGeneratePrompt / buildRefinePrompt modes", () => {
  it("generate prompt reflects tight + first-person choices", () => {
    const prompt = buildGeneratePrompt(baseContext, {
      length: "tight",
      person: "first",
    });
    expect(prompt).toMatch(/first-person/i);
    expect(prompt).toMatch(/tight \(~25-45 words\)/);
  });

  it("refine prompt reflects standard + third-person defaults", () => {
    const prompt = buildRefinePrompt(baseContext, "Existing bio text here.", {});
    expect(prompt).toMatch(/third person/i);
    expect(prompt).toMatch(/standard \(~35-80 words\)/);
    expect(prompt).toMatch(/Existing bio text here\./);
  });
});

describe("buildRetryNudge modes", () => {
  it("nudges third person + standard window by default", () => {
    const nudge = buildRetryNudge(["short"]);
    expect(nudge).toMatch(/third person/);
    expect(nudge).toMatch(/35–80 words/);
  });

  it("nudges first person + tight window when requested", () => {
    const nudge = buildRetryNudge(["long"], { length: "tight", person: "first" });
    expect(nudge).toMatch(/first person/);
    expect(nudge).toMatch(/25–45 words/);
  });
});

describe("scoreBio person/length awareness", () => {
  const firstPersonBio =
    "I'm a New York-based editorial and commercial model with recent work for Vogue Italia, and I love bringing range to every shoot I step onto.";

  it("flags first person under default third-person scoring", () => {
    const result = scoreBio(firstPersonBio);
    expect(result.issues).toContain("first_person");
  });

  it("does not flag first person when person=first", () => {
    const result = scoreBio(firstPersonBio, { person: "first" });
    expect(result.issues).not.toContain("first_person");
    expect(result.pass).toBe(true);
  });

  it("passes a tight bio within the 25-45 word window", () => {
    const tightBio =
      "Jane Doe is a New York editorial and commercial model with recent Vogue Italia work and Ford Models training, open to agency representation.";
    const result = scoreBio(tightBio, { length: "tight" });
    expect(result.issues).not.toContain("too_short");
    expect(result.issues).not.toContain("too_long");
    expect(result.pass).toBe(true);
  });
});

describe("validateBioOutput mode passthrough", () => {
  it("accepts a first-person bio when person=first", () => {
    const bio =
      "I'm a New York editorial and commercial model with Vogue Italia credits and Ford Models training, and I'm open to agency representation.";
    const { valid, rubric } = validateBioOutput(bio, baseContext, {
      person: "first",
    });
    expect(rubric.issues).not.toContain("first_person");
    expect(valid).toBe(true);
  });

  it("still rejects first person when third-person voice is expected", () => {
    const bio =
      "I am a passionate model based in New York. I love fashion and I bring dynamic energy to every shoot I do.";
    const { valid } = validateBioOutput(bio, baseContext, { person: "third" });
    expect(valid).toBe(false);
  });
});

describe("context-builder division resolution", () => {
  it("defaults to fashion_editorial with label + tagline", () => {
    const ctx = buildBioContext({
      first_name: "Jane",
      last_name: "Doe",
      city: "New York",
      modeling_categories: JSON.stringify(["Editorial"]),
    });
    expect(ctx.division).toBe(PROFILE_DIVISIONS.FASHION_EDITORIAL);
    expect(ctx.divisionLabel).toBe("Fashion & Editorial");
    expect(typeof ctx.divisionTagline).toBe("string");
  });

  it("resolves performance division from specialties", () => {
    const ctx = buildBioContext({
      first_name: "Sam",
      last_name: "Lee",
      city: "Los Angeles",
      specialties: JSON.stringify(["Actor", "Host"]),
      modeling_categories: JSON.stringify(["Commercial"]),
    });
    expect(ctx.division).toBe(PROFILE_DIVISIONS.TALENT_PERFORMANCE);
    expect(ctx.divisionLabel).toBe("Talent & Performance");
  });
});
