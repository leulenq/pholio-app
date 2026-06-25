"use strict";

const {
  scoreSubmissionNote,
  MAX_CHARS,
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
} = require("../src/domains/talent/services/submission-note-writer/output-validator");

const PROFILE = {
  first_name: "Maya",
  last_name: "Chen",
  city: "Toronto",
  modeling_categories: JSON.stringify(["Editorial", "Runway"]),
  experience_details: JSON.stringify([
    { title: "SS24 Lookbook", role: "Fit model", year: "2024" },
  ]),
  training: "Two seasons of runway coaching at a Toronto studio",
};

const AGENCY = { name: "Northbound Management", location: "Toronto" };

describe("submission-note quality-rubric", () => {
  test("passes a warm first-person note", () => {
    const note =
      "I'm a Toronto-based editorial and runway model, and I'd love to be considered by Northbound Management. My recent fit work on the SS24 lookbook taught me how to take direction quickly on set. I think my look would fit the houses you represent.";
    const result = scoreSubmissionNote(note);
    expect(result.pass).toBe(true);
    expect(result.issues).not.toContain("third_person");
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
      "I am a passionate and driven model who is incredibly hardworking. I would love to join your agency and bring my dynamic energy to your roster every single day.";
    const result = scoreSubmissionNote(note);
    expect(result.issues).toContain("generic_filler");
    expect(result.pass).toBe(false);
  });

  test("fails on AI mentions", () => {
    const note =
      "As an AI language model, I have written this note for the talent to introduce myself to your agency and share my interest in representation.";
    const result = scoreSubmissionNote(note);
    expect(result.issues).toContain("ai_mention");
    expect(result.pass).toBe(false);
  });

  test("flags a generic 'I am a model' opener", () => {
    const note =
      "I am a model from Toronto and I would love to work with your agency. I have done runway and editorial work and I am ready for the next step in my career.";
    const result = scoreSubmissionNote(note);
    expect(result.issues).toContain("generic_opener");
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
    const context = buildSubmissionContext(PROFILE, { agency: AGENCY });
    expect(context.name).toBe("Maya Chen");
    expect(context.signalCount).toBeGreaterThan(0);
    expect(context.agencyName).toBe("Northbound Management");
    expect(context.agencyLocation).toBe("Toronto");
  });

  test("falls back to agencyName when no agency object", () => {
    const context = buildSubmissionContext(PROFILE, {
      agencyName: "Elite Faces",
    });
    expect(context.agencyName).toBe("Elite Faces");
    expect(context.agencyLocation).toBeNull();
  });

  test("formatted prompt brief includes name, signals, and addressee", () => {
    const context = buildSubmissionContext(PROFILE, { agency: AGENCY });
    const brief = formatSubmissionContextForPrompt(context);
    expect(brief).toContain("Maya Chen");
    expect(brief).toContain("Northbound Management");
    expect(brief).toMatch(/Editorial|Runway/);
  });

  test("handles a missing agency gracefully", () => {
    const context = buildSubmissionContext(PROFILE, {});
    expect(context.agencyName).toBeNull();
    const brief = formatSubmissionContextForPrompt(context);
    expect(brief).toContain("name not provided");
  });
});

describe("submission-note prompt-builder", () => {
  const context = buildSubmissionContext(PROFILE, { agency: AGENCY });

  test("system prompt frames a first-person booker voice and bans filler", () => {
    expect(SYSTEM_PROMPT).toMatch(/first person/i);
    expect(SYSTEM_PROMPT).toMatch(/passionate/);
    expect(SYSTEM_PROMPT).toMatch(/AI/);
  });

  test("draft prompt references the talent and the agency", () => {
    const prompt = buildDraftPrompt(context);
    expect(prompt).toContain("Maya Chen");
    expect(prompt).toContain("Northbound Management");
    expect(prompt).toMatch(/1200 characters/);
  });

  test("sharpen prompt embeds the existing note", () => {
    const prompt = buildSharpenPrompt(context, "I'm a Toronto runway model.");
    expect(prompt).toContain("EXISTING NOTE");
    expect(prompt).toContain("Toronto runway model");
  });

  test("shorten prompt targets a tighter note", () => {
    const prompt = buildShortenPrompt(context, "A long note ".repeat(20));
    expect(prompt).toMatch(/400 characters/);
  });
});

describe("submission-note output-validator", () => {
  const context = buildSubmissionContext(PROFILE, { agency: AGENCY });

  test("accepts a grounded first-person note", () => {
    const note =
      "I'm a Toronto editorial and runway model, and I'd be glad to be considered by Northbound Management. My recent fit work sharpened how I move on set, and I think my look suits your roster.";
    const result = validateNoteOutput(note, context, { existingNote: note });
    expect(result.valid).toBe(true);
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
      "I'm a Toronto model who recently shot the Vogue Italia Spring Campaign and walked for Paris Fashion Week. I'd love to join your roster.";
    const result = validateNoteOutput(note, context);
    expect(result.ungrounded.length).toBeGreaterThanOrEqual(2);
  });

  test("allows the agency name as an addressee without flagging it", () => {
    const note =
      "I'm a Toronto runway model and I'd love to be considered by Northbound Management. My recent fit work prepared me for representation.";
    const result = validateNoteOutput(note, context, { existingNote: note });
    expect(result.ungrounded).not.toContain("Northbound Management");
  });
});
