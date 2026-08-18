"use strict";

/**
 * The truthfulness contract for the bio writer: every claim in an output must
 * trace back to a field the talent actually filled in. These cases are the
 * regression net for "a bio that fabricates a Vogue credit is worse than no
 * writer at all".
 */

const {
  findFabrications,
  findDroppedUserFacts,
  collectGroundedEntities,
  findCoveredSignals,
} = require("../src/domains/talent/services/bio-writer/grounding");
const {
  validateBioOutput,
  deriveRichness,
} = require("../src/domains/talent/services/bio-writer/output-validator");
const {
  buildBioContext,
} = require("../src/domains/talent/services/bio-writer/context-builder");
const {
  buildFactLedger,
  buildGeneratePrompt,
} = require("../src/domains/talent/services/bio-writer/prompt-builder");

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

const GROUNDED_BIO =
  "Maya Chen is a Toronto-based editorial and runway model. She shot Sable Journal in 2024 and the Corvid Denim lookbook in 2023. She speaks English and French and is open to representation.";

describe("fabrication detection", () => {
  const FABRICATION_CASES = [
    [
      "agency the talent never listed",
      "Maya Chen is a Toronto-based editorial and runway model with Sable Journal credits and Ford Models training behind her.",
      "Ford Models",
      "entity",
    ],
    [
      "publication the talent never listed",
      "Maya Chen is a Toronto-based editorial and runway model whose work has appeared in Vogue and the Corvid Denim lookbook.",
      "Vogue",
      "entity",
    ],
    [
      "brand the talent never listed",
      "Maya Chen is a Toronto-based editorial and runway model who has shot campaigns for Nike and the Corvid Denim lookbook.",
      "Nike",
      "entity",
    ],
    [
      "market the talent never listed",
      "Maya Chen is a Toronto-based editorial and runway model who is also available in Milan for the coming season.",
      "Milan",
      "entity",
    ],
    [
      "invented studio name",
      "Maya Chen is a Toronto-based editorial and runway model trained at the Halloway Academy before shooting Sable Journal.",
      "Halloway Academy",
      "entity",
    ],
    [
      "year with no source",
      "Maya Chen has worked editorial and runway in Toronto since 2019 and shot the Corvid Denim lookbook recently.",
      "2019",
      "year",
    ],
    [
      "tenure claim with no source",
      "Maya Chen is a Toronto-based editorial and runway model with five years of experience and Sable Journal credits.",
      "five years",
      "tenure",
    ],
    [
      "season code with no source",
      "Maya Chen is a Toronto-based editorial and runway model who walked the SS24 season and shot Sable Journal.",
      "SS24",
      "season",
    ],
    [
      "fashion week claim",
      "Maya Chen is a Toronto-based editorial and runway model who has walked Fashion Week and shot Sable Journal.",
      "Fashion Week",
      "entity",
    ],
  ];

  it.each(FABRICATION_CASES)(
    "rejects a bio inventing a %s",
    (_label, bio, phrase, kind) => {
      const result = validateBioOutput(bio, richContext, {});
      expect(result.valid).toBe(false);
      expect(result.rubric.issues).toContain("fabricated_facts");
      expect(result.fabrications).toContainEqual({ phrase, kind });
    },
  );

  it("accepts a bio built only from provided context fields", () => {
    const result = validateBioOutput(GROUNDED_BIO, richContext, {});
    expect(result.fabrications).toEqual([]);
    expect(result.rubric.issues).not.toContain("fabricated_facts");
    expect(result.valid).toBe(true);
  });

  it("accepts the same named facts once the profile actually contains them", () => {
    const withMilan = buildBioContext({
      ...RICH_PROFILE,
      city: "Milan, Italy",
    });
    const bio =
      "Maya Chen is a Milan-based editorial and runway model. She shot Sable Journal in 2024 and the Corvid Denim lookbook in 2023.";
    expect(findFabrications(bio, { context: withMilan })).toEqual([]);
  });

  it("does not mistake grammar for a claim", () => {
    const bio =
      "Maya Chen is a Toronto-based editorial and runway model. Trained over two seasons of runway coaching, she shot Sable Journal in 2024. She is open to representation.";
    expect(findFabrications(bio, { context: richContext })).toEqual([]);
  });

  it("does not treat industry vocabulary as an invented name", () => {
    const bio =
      "Maya Chen is a Toronto-based editorial and runway model. She has tearsheets from Sable Journal, tests toward her book, and fits showroom samples in market.";
    expect(findFabrications(bio, { context: richContext })).toEqual([]);
  });

  it("catches a high-risk name in any casing", () => {
    const found = findFabrications(
      "Maya Chen is a toronto model who shoots editorial for vogue and books runway in milan every season.",
      { context: richContext },
    );
    expect(found.map((f) => f.phrase.toLowerCase())).toEqual(
      expect.arrayContaining(["vogue", "milan"]),
    );
  });

  it("grounds refine output against the talent's own bio, not just the profile", () => {
    const userBio =
      "I shot a lookbook for Alder Supply last spring and I have been modelling in Toronto since then.";
    const refined =
      "Maya Chen is a Toronto-based editorial and runway model. She shot a lookbook for Alder Supply and books editorial in the Toronto market.";

    expect(findFabrications(refined, { context: richContext })).not.toEqual([]);
    expect(
      findFabrications(refined, { context: richContext, existingBio: userBio }),
    ).toEqual([]);
  });
});

describe("prompt ledger mirrors the validator", () => {
  it("lists exactly the named facts the bio may use", () => {
    const entities = collectGroundedEntities(richContext);
    expect(entities).toEqual(
      expect.arrayContaining([
        "Maya Chen",
        "Toronto",
        "Sable Journal",
        "Corvid Denim",
        "2024",
        "2023",
      ]),
    );
    expect(entities).not.toContain("Vogue");
  });

  it("renders the ledger into the generate prompt as encoded data", () => {
    const prompt = buildGeneratePrompt(richContext, {});
    expect(prompt).toMatch(/NAMEABLE FACTS/);
    expect(prompt).toMatch(/Sable Journal/);
    expect(prompt).toMatch(/must appear in NAMEABLE FACTS/);
  });

  it("tells the model to name nothing when the profile names nothing", () => {
    const ledger = buildFactLedger({ name: "Talent", signals: [] });
    expect(ledger).toMatch(/do not name any agency, brand, client/i);
  });
});

describe("thin context handling", () => {
  const thinContext = buildBioContext({
    first_name: "Tomas",
    last_name: "Ilic",
    city: "Halifax",
    modeling_categories: JSON.stringify(["Commercial"]),
  });

  it("classifies a nearly-empty profile as thin", () => {
    expect(thinContext.richness).toBe("thin");
    expect(deriveRichness(thinContext)).toBe("thin");
  });

  it("accepts two honest sentences", () => {
    const result = validateBioOutput(
      "Tomas Ilic is a commercial model based in Halifax. He is available for commercial bookings in that market.",
      thinContext,
      {},
    );
    expect(result.valid).toBe(true);
    expect(result.rubric.issues).not.toContain("too_short");
    expect(result.rubric.issues).not.toContain("padded");
  });

  it("rejects a padded bio on the same thin profile", () => {
    const padded =
      "Tomas Ilic is a commercial model based in Halifax with a strong presence and a natural ability to connect with the camera, bringing warmth and professionalism to lifestyle sets while building a reputation as a reliable talent for brands across the region.";
    const result = validateBioOutput(padded, thinContext, {});
    expect(result.valid).toBe(false);
    expect(result.rubric.issues).toContain("padded");
  });

  it("still allows the full window when the profile is rich", () => {
    const long =
      "Maya Chen is a Toronto-based editorial and runway model. She shot Sable Journal in 2024 and the Corvid Denim lookbook in 2023. Two seasons of runway coaching sit behind that work. She speaks English and French, and is open to representation in the Toronto market.";
    const result = validateBioOutput(long, richContext, {});
    expect(result.richness).toBe("rich");
    expect(result.rubric.issues).not.toContain("padded");
    expect(result.valid).toBe(true);
  });

  it("rejects a bio that uses none of the profile", () => {
    const result = validateBioOutput(
      "She is the kind of presence that holds a frame, calm under direction and easy on set with any crew she meets.",
      richContext,
      {},
    );
    expect(result.rubric.issues).toContain("no_grounded_signal");
    expect(result.valid).toBe(false);
  });

  it("reports which signals the bio actually used", () => {
    expect(findCoveredSignals(GROUNDED_BIO, richContext)).toEqual(
      expect.arrayContaining(["market", "lanes", "credits"]),
    );
  });
});

describe("refine preserves talent-authored facts", () => {
  const USER_BIO =
    "I'm Maya Chen, a Toronto model. I shot editorial for Sable Journal in 2024 and I did a lookbook for Alder Supply. I am passionate about fashion.";
  const refineContext = buildBioContext(RICH_PROFILE, { existingBio: USER_BIO });

  it("accepts a refine that tightens prose and keeps every fact", () => {
    const refined =
      "Maya Chen is a Toronto-based editorial model. She shot editorial for Sable Journal in 2024 and a lookbook for Alder Supply.";
    const result = validateBioOutput(refined, refineContext, {
      existingBio: USER_BIO,
      mode: "refine",
    });
    expect(result.droppedUserFacts).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rejects a refine that quietly drops a client the talent wrote", () => {
    const refined =
      "Maya Chen is a Toronto-based editorial and runway model who shot editorial for Sable Journal in 2024.";
    const result = validateBioOutput(refined, refineContext, {
      existingBio: USER_BIO,
      mode: "refine",
    });
    expect(result.rubric.issues).toContain("dropped_user_fact");
    expect(result.droppedUserFacts).toEqual(
      expect.arrayContaining(["Alder", "Supply"]),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects a refine that drops a date the talent wrote", () => {
    const refined =
      "Maya Chen is a Toronto-based editorial model. She shot editorial for Sable Journal and a lookbook for Alder Supply.";
    const result = validateBioOutput(refined, refineContext, {
      existingBio: USER_BIO,
      mode: "refine",
    });
    expect(result.droppedUserFacts).toContain("2024");
    expect(result.valid).toBe(false);
  });

  it("lets refine delete banned language without counting it as a lost fact", () => {
    expect(
      findDroppedUserFacts(
        "Maya Chen is a Toronto-based editorial model who shot Sable Journal in 2024 and a lookbook for Alder Supply.",
        USER_BIO,
        refineContext,
      ),
    ).toEqual([]);
  });

  it("lets a third-to-first person refine drop the talent's own name", () => {
    const thirdPersonBio =
      "Maya Chen is a Toronto model who shot editorial for Sable Journal in 2024.";
    expect(
      findDroppedUserFacts(
        "I model editorial in Toronto and shot Sable Journal in 2024.",
        thirdPersonBio,
        refineContext,
      ),
    ).toEqual([]);
  });

  it("does not apply the preservation rule to generate", () => {
    const result = validateBioOutput(GROUNDED_BIO, richContext, {
      mode: "generate",
      existingBio: USER_BIO,
    });
    expect(result.droppedUserFacts).toEqual([]);
  });
});
