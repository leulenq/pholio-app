const {
  buildSystemPrompt,
  buildGeneratePrompt,
  buildRefinePrompt,
  buildRetryNudge,
  buildDivisionGuidance,
  normalizeBioOptions,
  DIVISION_TONE,
  EXAMPLES,
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
  richness: "moderate",
  signals: [
    { key: "market", label: "Market", fact: "New York, USA" },
    { key: "lanes", label: "Lanes", fact: "Editorial, Commercial" },
    { key: "credits", label: "Credits", fact: "Sable Journal · Editorial · 2024" },
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
    "I'm a New York-based editorial and commercial model. I shot editorial for Sable Journal in 2024 and I am open to agency representation.";

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
      "Jane Doe is a New York editorial and commercial model with a 2024 Sable Journal editorial to her name, open to agency representation.";
    const result = scoreBio(tightBio, { length: "tight" });
    expect(result.issues).not.toContain("too_short");
    expect(result.issues).not.toContain("too_long");
    expect(result.pass).toBe(true);
  });
});

describe("validateBioOutput mode passthrough", () => {
  it("accepts a first-person bio when person=first", () => {
    const bio =
      "I'm a New York editorial and commercial model with a 2024 Sable Journal editorial credit, and I'm open to agency representation.";
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

describe("mode-specific prompt content", () => {
  const MODES = [
    ["tight", "third"],
    ["tight", "first"],
    ["standard", "third"],
    ["standard", "first"],
  ];

  it.each(MODES)("system prompt for %s/%s carries the house rules", (length, person) => {
    const prompt = buildSystemPrompt({ length, person });

    expect(prompt).toMatch(/TRUTH \(non-negotiable\)/);
    expect(prompt).toMatch(/BANNED LANGUAGE/);
    expect(prompt).toMatch(/INDUSTRY LANGUAGE/);
    expect(prompt).toMatch(/passionate/);
    expect(prompt).toMatch(/aspiring model/);
    expect(prompt).toMatch(/boards and divisions/);
    expect(prompt).toMatch(/based in X/);
    // Trade nouns and per-market representation — the industry tells.
    expect(prompt).toMatch(/tearsheet/);
    expect(prompt).toMatch(/represented by X in Toronto/);
    expect(prompt).toMatch(/models walk runway/);
  });

  it.each(MODES)("system prompt for %s/%s ships examples in that voice", (length, person) => {
    const prompt = buildSystemPrompt({ length, person });
    const examples = EXAMPLES[`${length}:${person}`];

    expect(prompt).toContain(examples.rich);
    expect(prompt).toContain(examples.thin);
    expect(prompt).toMatch(/REJECTED \(never write like this\)/);
    // Examples are invented on purpose so a copied name is caught downstream.
    expect(prompt).toMatch(/Ravensport/);
    expect(prompt).toMatch(/Marlowe Magazine/);
  });

  it("keeps the thin-context instruction out of prompts for full profiles", () => {
    const thin = buildGeneratePrompt({ ...baseContext, richness: "thin" }, {});
    const rich = buildGeneratePrompt({ ...baseContext, richness: "rich" }, {});

    expect(thin).toMatch(/This profile is thin/);
    expect(rich).not.toMatch(/This profile is thin/);
  });
});

describe("buildRetryNudge details", () => {
  it("names invented facts, banned language, and dropped facts", () => {
    const nudge = buildRetryNudge(
      ["fabricated_facts", "generic_filler", "dropped_user_fact"],
      { length: "tight", person: "third" },
      {
        fabrications: [{ phrase: "Ford Models", kind: "entity" }],
        banned: { words: ["passionate"], phrases: ["unique blend"] },
        droppedUserFacts: ["Alder"],
      },
    );

    expect(nudge).toMatch(/Ford Models/);
    expect(nudge).toMatch(/passionate/);
    expect(nudge).toMatch(/unique blend/);
    expect(nudge).toMatch(/Alder/);
  });

  it("stays a single line when there is nothing specific to report", () => {
    expect(buildRetryNudge(["short"]).split("\n")).toHaveLength(1);
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
