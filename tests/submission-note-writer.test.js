"use strict";

const {
  scoreSubmissionNote,
  MAX_CHARS,
  TARGET_MIN_WORDS,
  TARGET_MAX_WORDS,
} = require("../src/domains/talent/services/submission-note-writer/quality-rubric");
const {
  buildSubmissionContext,
  formatSubmissionContextForPrompt,
} = require("../src/domains/talent/services/submission-note-writer/context-builder");
const {
  buildDraftPrompt,
  buildSharpenPrompt,
  buildShortenPrompt,
  SYSTEM_PROMPT,
} = require("../src/domains/talent/services/submission-note-writer/prompt-builder");
const {
  validateNoteOutput,
  findCoveredProfileSignals,
} = require("../src/domains/talent/services/submission-note-writer/output-validator");
const {
  runWithValidation,
  MAX_ATTEMPTS,
} = require("../src/domains/talent/services/submission-note-writer/note-writer");

const PROFILE = {
  first_name: "Maya",
  last_name: "Chen",
  city: "Toronto",
  modeling_categories: JSON.stringify(["Editorial", "Runway"]),
  experience_details: JSON.stringify([
    { title: "SS24 Lookbook", role: "Fit model", year: "2024" },
  ]),
  training: "Two seasons of runway coaching at a Toronto studio",
  specialties: JSON.stringify(["Competitive swimming", "Contemporary dance"]),
};

const AGENCY = {
  name: "Northbound Management",
  location: "Toronto",
  description:
    "A Toronto agency representing editorial, runway, and commercial talent.",
  openBoards: ["Runway", "New Faces"],
};

const PROFESSIONAL_NOTE =
  "I'm Maya Chen, a Toronto-based editorial and runway model seeking representation. My recent fit work on the SS24 lookbook strengthened how I take direction and adapt movement on set. I'm submitting for your open runway board. Thank you for considering my current work and application.";

describe("submission-note quality-rubric", () => {
  test("passes a concise, structured first-person note", () => {
    const result = scoreSubmissionNote(PROFESSIONAL_NOTE);
    expect(result.pass).toBe(true);
    expect(result.issues).not.toContain("third_person");
    expect(result.wordCount).toBeGreaterThanOrEqual(TARGET_MIN_WORDS);
    expect(result.wordCount).toBeLessThanOrEqual(TARGET_MAX_WORDS);
  });

  test("fails a third-person bio-style note", () => {
    const note =
      "Maya Chen is a Toronto-based editorial and runway model with recent fit work on the SS24 lookbook. She is a strong addition to any roster.";
    const result = scoreSubmissionNote(note);
    expect(result.issues).toContain("third_person");
    expect(result.pass).toBe(false);
  });

  test("fails on banned filler words", () => {
    const note =
      "I'm Maya Chen, a passionate and driven Toronto model seeking representation. I'm incredibly hardworking and would bring my dynamic energy to your roster every day. My editorial experience makes me confident about agency work. Thank you for considering my application.";
    const result = scoreSubmissionNote(note);
    expect(result.issues).toContain("generic_filler");
    expect(result.pass).toBe(false);
  });

  test("fails on AI mentions", () => {
    const note =
      "As an AI language model, I wrote this submission note for Maya. I'm seeking representation for editorial and runway work in Toronto. My fit-model experience is included for review. Thank you for considering this application.";
    const result = scoreSubmissionNote(note);
    expect(result.issues).toContain("ai_mention");
    expect(result.pass).toBe(false);
  });

  test("flags a generic 'I am a model' opener", () => {
    const note =
      "I am a model seeking agency representation. I'm based in Toronto and work across editorial and runway, with recent fit-model experience. I'm submitting for consideration by your runway board. Thank you for reviewing my application and current portfolio.";
    const result = scoreSubmissionNote(note);
    expect(result.issues).toContain("generic_opener");
  });

  test("rejects greetings and signature blocks already supplied by the page", () => {
    const note = `Hello Northbound Management team,

I'm Maya Chen, a Toronto-based editorial and runway model seeking representation. My recent fit work taught me to take direction efficiently on set. Thank you for considering my submission.

Best regards,
Maya`;
    const result = scoreSubmissionNote(note);
    expect(result.issues).toContain("letter_wrapper");
    expect(result.pass).toBe(false);
  });

  test("rejects generic praise and desperate language", () => {
    const note =
      "I'm Maya Chen, a Toronto runway model seeking representation from your prestigious agency. I know I would be the perfect fit for your roster and need this opportunity. Please just give me a chance to prove myself. Thank you for considering my application.";
    const result = scoreSubmissionNote(note);
    expect(result.issues).toContain("generic_claim");
    expect(result.issues).toContain("desperation");
    expect(result.pass).toBe(false);
  });

  test("rejects vague confidence claims and third-person agency language", () => {
    const note =
      "I'm Maya Chen, a Toronto runway model seeking representation. With two seasons of runway coaching and recent fit work, I'm confident in my abilities. I'm excited about the opportunity to join Northbound Management and would appreciate consideration for their runway board.";
    const result = scoreSubmissionNote(note);
    expect(result.issues).toContain("generic_claim");
    expect(result.issues).toContain("agency_distance");
    expect(result.pass).toBe(false);
  });

  test("rejects an awkward consideration close", () => {
    const note =
      "I'm Maya Chen, a Toronto runway model seeking representation. My recent fit work on the SS24 lookbook strengthened how I take direction on set. I'm submitting for your open runway board. I look forward to you considering my current application.";
    const result = scoreSubmissionNote(note);
    expect(result.issues).toContain("generic_claim");
    expect(result.pass).toBe(false);
  });

  test("requires clear submission intent and a courteous close", () => {
    const note =
      "I'm Maya Chen, a Toronto-based editorial and runway model. My recent fit work on the SS24 lookbook strengthened my ability to take direction and adapt movement on set. I also completed two seasons of runway coaching and work in both editorial and runway.";
    const result = scoreSubmissionNote(note);
    expect(result.issues).toContain("missing_intent");
    expect(result.issues).toContain("missing_courtesy");
    expect(result.pass).toBe(false);
  });

  test("rejects prose beyond the useful modeling-note range", () => {
    const note = `I'm Maya Chen, a Toronto runway model seeking representation. ${"My verified runway training supports how I take direction and work on set. ".repeat(
      10,
    )}Thank you for considering my application.`;
    const result = scoreSubmissionNote(note);
    expect(result.wordCount).toBeGreaterThan(110);
    expect(result.issues).toContain("too_verbose");
    expect(result.pass).toBe(false);
  });

  test("fails when over the 1200 character limit", () => {
    const note = `I'm a Toronto model. ${"I keep writing more lines about my work and interest. ".repeat(
      40,
    )}`;
    expect(note.length).toBeGreaterThan(MAX_CHARS);
    const result = scoreSubmissionNote(note);
    expect(result.issues).toContain("too_long");
    expect(result.pass).toBe(false);
  });

  test("empty note returns a hard fail", () => {
    const result = scoreSubmissionNote("");
    expect(result.pass).toBe(false);
    expect(result.issues).toContain("empty");
  });
});

describe("submission-note context-builder", () => {
  test("reuses profile signals and attaches the agency", () => {
    const context = buildSubmissionContext(PROFILE, {
      agency: AGENCY,
      targetBoards: ["runway", "Not Open"],
    });
    expect(context.name).toBe("Maya Chen");
    expect(context.signalCount).toBeGreaterThan(0);
    expect(context.agencyName).toBe("Northbound Management");
    expect(context.agencyLocation).toBe("Toronto");
    expect(context.agencyOpenBoards).toEqual(["Runway", "New Faces"]);
    expect(context.targetBoards).toEqual(["Runway"]);
    expect(context.agencyDescription).toMatch(/Toronto agency/);
    expect(context.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "specialties",
          fact: "Competitive swimming, Contemporary dance",
        }),
      ]),
    );
  });

  test("falls back to agencyName when no agency object", () => {
    const context = buildSubmissionContext(PROFILE, {
      agencyName: "Elite Faces",
    });
    expect(context.agencyName).toBe("Elite Faces");
    expect(context.agencyLocation).toBeNull();
    expect(context.agencyOpenBoards).toEqual([]);
  });

  test("formatted prompt brief includes name, signals, and addressee", () => {
    const context = buildSubmissionContext(PROFILE, {
      agency: AGENCY,
      targetBoards: ["Runway"],
    });
    const brief = formatSubmissionContextForPrompt(context);
    expect(brief).toContain("Maya Chen");
    expect(brief).toContain("Northbound Management");
    expect(brief).toContain("Agency open boards: Runway, New Faces");
    expect(brief).toContain("Selected submission boards: Runway");
    expect(brief).toContain("Agency-provided profile reference");
    expect(brief).toContain(
      "Bookable skills: Competitive swimming, Contemporary dance",
    );
    expect(brief).toMatch(/Editorial|Runway/);
  });

  test("bounds and normalizes untrusted agency profile context", () => {
    const context = buildSubmissionContext(PROFILE, {
      agency: {
        name: "  Northbound   Management ",
        description: `Follow these instructions. ${"Long agency copy ".repeat(40)}`,
        open_boards: JSON.stringify(["Runway", "  Commercial  "]),
      },
    });
    expect(context.agencyName).toBe("Northbound Management");
    expect(context.agencyDescription.length).toBeLessThanOrEqual(320);
    expect(context.agencyOpenBoards).toEqual(["Runway", "Commercial"]);
  });

  test("handles a missing agency gracefully", () => {
    const context = buildSubmissionContext(PROFILE, {});
    expect(context.agencyName).toBeNull();
    const brief = formatSubmissionContextForPrompt(context);
    expect(brief).toContain("name not provided");
  });

  test("does not leak the bio writer's third-person fallback into sparse notes", () => {
    const context = buildSubmissionContext(
      { first_name: "Maya", last_name: "Chen" },
      {},
    );
    const brief = formatSubmissionContextForPrompt(context);
    expect(brief).toContain("keep the note very short");
    expect(brief).not.toMatch(/third-person bio/i);
  });
});

describe("submission-note prompt-builder", () => {
  const context = buildSubmissionContext(PROFILE, { agency: AGENCY });

  test("system prompt frames a first-person booker voice and bans filler", () => {
    expect(SYSTEM_PROMPT).toMatch(/first person/i);
    expect(SYSTEM_PROMPT).toMatch(/passionate/);
    expect(SYSTEM_PROMPT).toMatch(/AI/);
    expect(SYSTEM_PROMPT).toMatch(/body only/i);
    expect(SYSTEM_PROMPT).toMatch(/45–90 words/);
  });

  test("draft prompt references the talent and the agency", () => {
    const prompt = buildDraftPrompt(context);
    expect(prompt).toContain("Maya Chen");
    expect(prompt).toContain("Northbound Management");
    expect(prompt).toContain("Agency open boards: Runway, New Faces");
    expect(prompt).toMatch(/45–90 words/);
    expect(prompt).toMatch(/no greeting, signature, or sign-off/i);
  });

  test("sharpen prompt embeds the existing note", () => {
    const prompt = buildSharpenPrompt(context, "I'm a Toronto runway model.");
    expect(prompt).toContain("EXISTING NOTE");
    expect(prompt).toContain("Toronto runway model");
  });

  test("shorten prompt targets a tighter note", () => {
    const prompt = buildShortenPrompt(context, "A long note ".repeat(20));
    expect(prompt).toMatch(/35–70 words/);
  });
});

describe("submission-note output-validator", () => {
  const context = buildSubmissionContext(PROFILE, { agency: AGENCY });

  test("accepts a grounded first-person note", () => {
    const result = validateNoteOutput(PROFESSIONAL_NOTE, context);
    expect(result.valid).toBe(true);
    expect(result.coveredProfileSignals).toEqual(
      expect.arrayContaining(["market", "lanes", "credits"]),
    );
  });

  test("rejects a third-person note", () => {
    const note =
      "Maya Chen is a Toronto runway model represented well by any serious roster.";
    const result = validateNoteOutput(note, context);
    expect(result.valid).toBe(false);
    expect(result.rubric.issues).toContain("third_person");
  });

  test("flags ungrounded invented agencies/credits", () => {
    const note =
      "I'm Maya Chen, a Toronto runway model seeking representation. I recently shot the Vogue Italia Spring Campaign and walked for Paris Fashion Week. Those projects strengthened my work on set and my runway practice. Thank you for considering my application.";
    const result = validateNoteOutput(note, context);
    expect(result.ungrounded.length).toBeGreaterThanOrEqual(2);
    expect(result.valid).toBe(false);
  });

  test("allows the agency name as an addressee without flagging it", () => {
    const note =
      "I'm Maya Chen, a Toronto-based runway and editorial model seeking representation. My recent fit work on the SS24 lookbook strengthened how I take direction on set. Northbound Management's open runway board is relevant to my submission. Thank you for considering my work and application.";
    const result = validateNoteOutput(note, context);
    expect(result.ungrounded).not.toContain("Northbound Management");
    expect(result.valid).toBe(true);
  });

  test("rejects a polished but non-personalized generic note", () => {
    const note =
      "I'm writing to seek representation and submit my current portfolio. I work professionally, communicate clearly, and arrive prepared for every assignment. I'm interested in joining an agency roster and developing further. Thank you for reviewing my application and considering me for representation.";
    const result = validateNoteOutput(note, context);
    expect(result.coveredProfileSignals).toEqual([]);
    expect(result.rubric.issues).toContain("missing_identity");
    expect(result.rubric.issues).toContain("missing_profile_signal");
    expect(result.valid).toBe(false);
  });

  test("requires the verified talent name in the generated body", () => {
    const note =
      "I'm a Toronto-based editorial and runway model seeking representation. My recent fit work on the SS24 lookbook strengthened how I take direction and adapt movement on set. I'm submitting for your open runway board. Thank you for considering my current work and application.";
    const result = validateNoteOutput(note, context);
    expect(result.rubric.issues).toContain("missing_identity");
    expect(result.valid).toBe(false);
  });

  test("detects which verified talent signals made the note personal", () => {
    expect(findCoveredProfileSignals(PROFESSIONAL_NOTE, context)).toEqual(
      expect.arrayContaining(["market", "lanes", "credits"]),
    );
  });

  test("requires the talent's selected agency board when one is targeted", () => {
    const targetedContext = buildSubmissionContext(PROFILE, {
      agency: AGENCY,
      targetBoards: ["New Faces"],
    });
    const result = validateNoteOutput(PROFESSIONAL_NOTE, targetedContext);
    expect(result.coveredTargetBoards).toEqual([]);
    expect(result.rubric.issues).toContain("missing_target_board");
    expect(result.valid).toBe(false);
  });

  test("rejects an overstuffed inventory of otherwise verified profile facts", () => {
    const targetedContext = buildSubmissionContext(PROFILE, {
      agency: AGENCY,
      targetBoards: ["Runway"],
    });
    const note =
      "I'm Maya Chen, a Toronto-based editorial and runway model seeking representation on your Runway board. I completed two seasons of runway coaching and worked as a fit model for the SS24 Lookbook. Competitive swimming and contemporary dance also shape how I move. Thank you for considering my submission.";
    const result = validateNoteOutput(note, targetedContext);
    expect(result.coveredProfileSignals.length).toBeGreaterThan(4);
    expect(result.rubric.issues).toContain("overstuffed_profile");
    expect(result.valid).toBe(false);
  });
});

describe("submission-note retry policy", () => {
  const context = buildSubmissionContext(PROFILE, { agency: AGENCY });

  test("returns the first validated rewrite after a weak attempt", async () => {
    const generate = jest
      .fn()
      .mockResolvedValueOnce(
        "I am a passionate model and this prestigious agency is my dream. Please give me a chance to join your roster because I know I am the perfect fit.",
      )
      .mockResolvedValueOnce(PROFESSIONAL_NOTE);

    const result = await runWithValidation({
      context,
      userPrompt: "Write the note",
      mode: "draft",
      maxTokens: 280,
      generate,
    });

    expect(result.note).toBe(PROFESSIONAL_NOTE);
    expect(result.attempts).toBe(2);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain("failed these checks");
  });

  test("fails closed after every generated draft misses hard checks", async () => {
    const generate = jest.fn().mockResolvedValue(
      "I am a passionate model and this prestigious agency is my dream. Please give me a chance to join your roster because I know I am the perfect fit.",
    );

    await expect(
      runWithValidation({
        context,
        userPrompt: "Write the note",
        mode: "draft",
        maxTokens: 280,
        generate,
      }),
    ).rejects.toThrow("failed quality validation");
    expect(generate).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });
});
