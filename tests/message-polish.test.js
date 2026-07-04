"use strict";

/**
 * Message Polish — unit tests (no live Groq calls)
 *
 * Covers:
 *   - output-validator: validateInput min length, max length, empty
 *   - output-validator: validateOutput empty, filler detection
 *   - prompt-builder: buildPolishPrompt shape
 */

const {
  validateInput,
  validateOutput,
  MIN_INPUT_LENGTH,
  MAX_INPUT_LENGTH,
  BANNED_FILLER,
} = require("../src/domains/talent/services/message-polish/output-validator");

const {
  buildPolishPrompt,
  SYSTEM_PROMPT,
} = require("../src/domains/talent/services/message-polish/prompt-builder");

// ---------------------------------------------------------------------------
// validateInput
// ---------------------------------------------------------------------------

describe("validateInput", () => {
  test("rejects empty string", () => {
    const result = validateInput("");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  test("rejects null", () => {
    const result = validateInput(null);
    expect(result.valid).toBe(false);
  });

  test(`rejects messages shorter than ${MIN_INPUT_LENGTH} characters`, () => {
    const short = "Hi".padEnd(MIN_INPUT_LENGTH - 1, ".");
    const result = validateInput(short);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at least/i);
  });

  test(`accepts a message of exactly ${MIN_INPUT_LENGTH} characters`, () => {
    const exact = "a".repeat(MIN_INPUT_LENGTH);
    const result = validateInput(exact);
    expect(result.valid).toBe(true);
  });

  test("accepts a normal message", () => {
    const result = validateInput(
      "Hi, I'd love to submit my book for your open call this season.",
    );
    expect(result.valid).toBe(true);
  });

  test(`rejects messages over ${MAX_INPUT_LENGTH} characters`, () => {
    const huge = "a".repeat(MAX_INPUT_LENGTH + 1);
    const result = validateInput(huge);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/4000/);
  });

  test(`accepts a message of exactly ${MAX_INPUT_LENGTH} characters`, () => {
    const exact = "a".repeat(MAX_INPUT_LENGTH);
    const result = validateInput(exact);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateOutput
// ---------------------------------------------------------------------------

describe("validateOutput", () => {
  test("rejects empty output", () => {
    const result = validateOutput("");
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("empty_output");
  });

  test("rejects whitespace-only output", () => {
    const result = validateOutput("   ");
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("empty_output");
  });

  test("rejects output shorter than min length", () => {
    const result = validateOutput("ok");
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("output_too_short");
  });

  test("detects banned filler: 'hope this finds you well'", () => {
    const result = validateOutput(
      "I hope this finds you well. I'd love to submit my portfolio to your agency.",
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("banned_filler"))).toBe(true);
  });

  test("detects banned filler: 'i am writing to'", () => {
    const result = validateOutput(
      "I am writing to express my interest in working with your agency.",
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("banned_filler"))).toBe(true);
  });

  test("detects banned filler: 'i wanted to reach out'", () => {
    const result = validateOutput(
      "I wanted to reach out about your open call for commercial talent.",
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("banned_filler"))).toBe(true);
  });

  test("detects banned filler: 'please do not hesitate to contact'", () => {
    const result = validateOutput(
      "Please do not hesitate to contact me if you need more information.",
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("banned_filler"))).toBe(true);
  });

  test("accepts clean professional message", () => {
    const result = validateOutput(
      "Hi, my name is Sara and I'm a commercial model based in New York. " +
        "I'd love to be considered for representation — my book focuses on editorial and lifestyle work. " +
        "Happy to share my full portfolio if helpful.",
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// BANNED_FILLER list completeness
// ---------------------------------------------------------------------------

describe("BANNED_FILLER list", () => {
  test("contains known problematic phrases", () => {
    expect(BANNED_FILLER).toContain("hope this finds you well");
    expect(BANNED_FILLER).toContain("i am writing to");
    expect(BANNED_FILLER).toContain("i wanted to reach out");
    expect(BANNED_FILLER).toContain("please do not hesitate to contact");
    expect(BANNED_FILLER).toContain("to whom it may concern");
  });
});

// ---------------------------------------------------------------------------
// buildPolishPrompt
// ---------------------------------------------------------------------------

describe("buildPolishPrompt", () => {
  test("includes the draft message in the user prompt", () => {
    const prompt = buildPolishPrompt({
      message: "Hey, just checking in about my application.",
    });
    expect(prompt).toContain("Hey, just checking in about my application.");
  });

  test("includes agencyName when provided", () => {
    const prompt = buildPolishPrompt({
      message: "Hi, I'd love to work with you.",
      agencyName: "Next Model Management",
    });
    expect(prompt).toContain("Next Model Management");
  });

  test("does not include agency line when agencyName is omitted", () => {
    const prompt = buildPolishPrompt({
      message: "Hi, I'd love to work with you.",
    });
    expect(prompt).not.toMatch(/addressed to/i);
  });
});

// ---------------------------------------------------------------------------
// SYSTEM_PROMPT sanity
// ---------------------------------------------------------------------------

describe("SYSTEM_PROMPT", () => {
  test("mentions first person and preserving meaning", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/first person/);
    expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/preserv/);
  });

  test("mentions banned filler patterns", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/hope this/);
  });
});
