"use strict";

/**
 * End-to-end behaviour of the generate/refine loop with the Groq call mocked
 * through the injectable `generate` hook. No network, no API key.
 */

const {
  generateBio,
  refineBio,
  stripBioResponse,
  MAX_ATTEMPTS,
} = require("../src/domains/talent/services/bio-writer/bio-writer");
const {
  buildBioContext,
} = require("../src/domains/talent/services/bio-writer/context-builder");

const RICH_PROFILE = {
  first_name: "Maya",
  last_name: "Chen",
  city: "Toronto, Canada",
  modeling_categories: JSON.stringify(["Editorial", "Runway"]),
  experience_details: JSON.stringify([
    { title: "Sable Journal", role: "Editorial", year: "2024" },
    { title: "Corvid Denim", role: "Lookbook", year: "2023" },
  ]),
  training: "Two seasons of runway coaching at a Toronto studio",
  languages: JSON.stringify(["English", "French"]),
  seeking_representation: true,
};

const richContext = buildBioContext(RICH_PROFILE);

const CLEAN_BIOS = {
  "standard:third":
    "Maya Chen is a Toronto-based editorial and runway model. She shot Sable Journal in 2024 and the Corvid Denim lookbook in 2023. Two seasons of coaching sit behind that work, and she speaks English and French.",
  "standard:first":
    "I model editorial and runway out of Toronto. I shot Sable Journal in 2024 and the Corvid Denim lookbook in 2023. Two seasons of coaching sit behind that work, and I speak English and French.",
  "tight:third":
    "Maya Chen is a Toronto-based editorial and runway model. She shot Sable Journal in 2024 and the Corvid Denim lookbook in 2023, and is open to representation.",
  "tight:first":
    "I am a Toronto-based editorial and runway model. I shot Sable Journal in 2024 and the Corvid Denim lookbook in 2023, and I am open to representation.",
};

const FABRICATING_DRAFT =
  "Maya Chen is a Toronto-based editorial and runway model with Ford Models training whose work has appeared in Vogue since 2019.";

const SLOP_DRAFT =
  "A passionate and versatile talent with a unique blend of range, Maya Chen seamlessly captivates on every Toronto set she books.";

/** Mock model: returns the queued drafts in order, repeating the last one. */
function mockModel(...drafts) {
  const calls = [];
  const fn = async (systemPrompt, userPrompt, options) => {
    calls.push({ systemPrompt, userPrompt, options });
    return drafts[Math.min(calls.length - 1, drafts.length - 1)];
  };
  fn.calls = calls;
  return fn;
}

const MODES = [
  ["tight", "third"],
  ["tight", "first"],
  ["standard", "third"],
  ["standard", "first"],
];

// Rejection paths log by design; keep the suite output readable.
let warnSpy;
beforeEach(() => {
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe("generateBio across every mode", () => {
  it.each(MODES)("returns a clean %s/%s bio on the first attempt", async (length, person) => {
    const generate = mockModel(CLEAN_BIOS[`${length}:${person}`]);
    const result = await generateBio({
      context: richContext,
      options: { length, person },
      generate,
    });

    expect(result.bio).toBe(CLEAN_BIOS[`${length}:${person}`]);
    expect(result.mode).toBe("generate");
    expect(result.length).toBe(length);
    expect(result.person).toBe(person);
    expect(result.attempts).toBe(1);
    expect(result.qualityWarning).toBeUndefined();
    expect(result.wordCount).toBeGreaterThan(20);
    expect(result.qualityScore).toBeGreaterThanOrEqual(70);
    expect(generate).toHaveLength(3);
  });

  it.each(MODES)("never returns a fabricating %s/%s draft", async (length, person) => {
    const generate = mockModel(FABRICATING_DRAFT);
    await expect(
      generateBio({ context: richContext, options: { length, person }, generate }),
    ).rejects.toThrow("failed quality validation");
    expect(generate.calls).toHaveLength(MAX_ATTEMPTS);
  });

  it.each(MODES)("never returns an AI-slop %s/%s draft", async (length, person) => {
    const generate = mockModel(SLOP_DRAFT);
    await expect(
      generateBio({ context: richContext, options: { length, person }, generate }),
    ).rejects.toThrow("failed quality validation");
  });

  it("passes the mode-specific system prompt to the model", async () => {
    const generate = mockModel(CLEAN_BIOS["tight:first"]);
    await generateBio({
      context: richContext,
      options: { length: "tight", person: "first" },
      generate,
    });

    const { systemPrompt, userPrompt } = generate.calls[0];
    expect(systemPrompt).toMatch(/first person/i);
    expect(systemPrompt).not.toMatch(/Write in third person/);
    expect(systemPrompt).toMatch(/25 to 45 words/);
    expect(systemPrompt).toMatch(/BANNED LANGUAGE/);
    expect(systemPrompt).toMatch(/EXAMPLES/);
    expect(userPrompt).toMatch(/NAMEABLE FACTS/);
  });
});

describe("retry behaviour", () => {
  it("retries a fabricating draft and names the invented facts in the nudge", async () => {
    const generate = mockModel(FABRICATING_DRAFT, CLEAN_BIOS["standard:third"]);
    const result = await generateBio({ context: richContext, generate });

    expect(result.attempts).toBe(2);
    expect(result.bio).toBe(CLEAN_BIOS["standard:third"]);

    const retryPrompt = generate.calls[1].userPrompt;
    expect(retryPrompt).toMatch(/not in VERIFIED CONTEXT and must not appear/);
    expect(retryPrompt).toMatch(/Ford Models/);
    expect(retryPrompt).toMatch(/2019/);
  });

  it("retries a slop draft and names the banned language in the nudge", async () => {
    const generate = mockModel(SLOP_DRAFT, CLEAN_BIOS["standard:third"]);
    const result = await generateBio({ context: richContext, generate });

    expect(result.attempts).toBe(2);
    const retryPrompt = generate.calls[1].userPrompt;
    expect(retryPrompt).toMatch(/Remove this banned language/);
    expect(retryPrompt).toMatch(/passionate/);
    expect(retryPrompt).toMatch(/unique blend/);
  });

  it("lowers temperature on retry", async () => {
    const generate = mockModel(SLOP_DRAFT, CLEAN_BIOS["standard:third"]);
    await generateBio({ context: richContext, generate });

    expect(generate.calls[0].options.temperature).toBeGreaterThan(
      generate.calls[1].options.temperature,
    );
  });

  it("keeps retrying past an empty completion", async () => {
    const generate = mockModel("", CLEAN_BIOS["standard:third"]);
    const result = await generateBio({ context: richContext, generate });
    expect(result.attempts).toBe(2);
  });

  it("throws when every attempt comes back empty", async () => {
    const generate = mockModel("");
    await expect(generateBio({ context: richContext, generate })).rejects.toThrow(
      "failed quality validation",
    );
  });

  it("returns a best-effort bio when the only defects are soft", async () => {
    const softDraft =
      "Maya Chen is a Toronto model. She books editorial work. She shot Sable Journal in 2024. She shot the Corvid Denim lookbook in 2023. Her runway coaching ran two seasons in Toronto and she is open to representation and available for editorial bookings across the market for the coming season and beyond";

    const generate = mockModel(softDraft);
    const result = await generateBio({
      context: richContext,
      options: { length: "tight" },
      generate,
    });

    expect(result.bio).toBe(softDraft);
    expect(result.qualityWarning).toBe(true);
    expect(result.attempts).toBe(MAX_ATTEMPTS);
    expect(result.qualityScore).toBeLessThan(70);
  });
});

describe("refineBio", () => {
  const USER_BIO =
    "I'm Maya Chen, a Toronto model. I shot editorial for Sable Journal in 2024 and I did a lookbook for Alder Supply. I am passionate about fashion.";

  const refineContext = buildBioContext(RICH_PROFILE, { existingBio: USER_BIO });

  const KEEPS_FACTS =
    "Maya Chen is a Toronto-based editorial model. She shot editorial for Sable Journal in 2024 and a lookbook for Alder Supply.";
  const DROPS_FACT =
    "Maya Chen is a Toronto-based editorial and runway model who shot editorial for Sable Journal in 2024.";

  it("accepts a refine that keeps every talent-written fact", async () => {
    const generate = mockModel(KEEPS_FACTS);
    const result = await refineBio({
      context: refineContext,
      bio: USER_BIO,
      generate,
    });

    expect(result.mode).toBe("refine");
    expect(result.bio).toBe(KEEPS_FACTS);
    expect(result.attempts).toBe(1);
  });

  it("retries when the refine drops a fact the talent wrote", async () => {
    const generate = mockModel(DROPS_FACT, KEEPS_FACTS);
    const result = await refineBio({
      context: refineContext,
      bio: USER_BIO,
      generate,
    });

    expect(result.attempts).toBe(2);
    expect(result.bio).toBe(KEEPS_FACTS);
    expect(generate.calls[1].userPrompt).toMatch(/You dropped facts the talent wrote/);
    expect(generate.calls[1].userPrompt).toMatch(/Alder/);
  });

  it("refuses to ship a refine that keeps losing the talent's facts", async () => {
    const generate = mockModel(DROPS_FACT);
    await expect(
      refineBio({ context: refineContext, bio: USER_BIO, generate }),
    ).rejects.toThrow("failed quality validation");
    expect(generate.calls).toHaveLength(MAX_ATTEMPTS);
  });

  it("treats the talent's own bio as grounding for names absent from the profile", async () => {
    const generate = mockModel(KEEPS_FACTS);
    const result = await refineBio({
      context: refineContext,
      bio: USER_BIO,
      generate,
    });
    // "Alder Supply" appears nowhere in the profile — only the talent wrote it.
    expect(result.bio).toMatch(/Alder Supply/);
  });

  it("puts the existing bio and the ledger in the refine prompt", async () => {
    const generate = mockModel(KEEPS_FACTS);
    await refineBio({ context: refineContext, bio: USER_BIO, generate });

    const { userPrompt } = generate.calls[0];
    expect(userPrompt).toMatch(/EXISTING BIO/);
    expect(userPrompt).toMatch(/NAMEABLE FACTS/);
    expect(userPrompt).toMatch(/you may not drop them/);
  });
});

describe("route contract", () => {
  it("returns every field the bio route reads", async () => {
    const generate = mockModel(CLEAN_BIOS["standard:third"]);
    const result = await generateBio({
      context: richContext,
      options: { length: "standard", person: "third" },
      generate,
    });

    expect(Object.keys(result).sort()).toEqual(
      ["attempts", "bio", "length", "mode", "person", "qualityScore", "wordCount"].sort(),
    );
  });
});

describe("stripBioResponse", () => {
  const CASES = [
    ["plain text", "Maya Chen is a Toronto model.", "Maya Chen is a Toronto model."],
    ['wrapping quotes', '"Maya Chen is a Toronto model."', "Maya Chen is a Toronto model."],
    ["bio label", "Bio: Maya Chen is a Toronto model.", "Maya Chen is a Toronto model."],
    [
      "preamble",
      "Here is the refined bio:\n\nMaya Chen is a Toronto model.",
      "Maya Chen is a Toronto model.",
    ],
    [
      "chatty preamble",
      "Sure! Here's a tighter version:\nMaya Chen is a Toronto model.",
      "Maya Chen is a Toronto model.",
    ],
    [
      "markdown emphasis",
      "**Maya Chen** is a Toronto model.",
      "Maya Chen is a Toronto model.",
    ],
    [
      "code fence",
      "```\nMaya Chen is a Toronto model.\n```",
      "Maya Chen is a Toronto model.",
    ],
    [
      "trailing offer",
      "Maya Chen is a Toronto model.\n\nLet me know if you'd like it shorter!",
      "Maya Chen is a Toronto model.",
    ],
    [
      "internal newlines collapse",
      "Maya Chen is a Toronto model.\nShe books runway.",
      "Maya Chen is a Toronto model. She books runway.",
    ],
    ["empty", "", ""],
  ];

  it.each(CASES)("normalizes %s", (_label, input, expected) => {
    expect(stripBioResponse(input)).toBe(expected);
  });
});
