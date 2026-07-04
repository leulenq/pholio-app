"use strict";

const MIN_INPUT_LENGTH = 10;
const MAX_INPUT_LENGTH = 4000;

const BANNED_FILLER = [
  "hope this email finds you well",
  "hope this finds you well",
  "i am writing to",
  "i'm writing to",
  "please do not hesitate to contact",
  "please don't hesitate to contact",
  "to whom it may concern",
  "i wanted to reach out",
  "i am reaching out",
  "i'm reaching out",
  "kind regards,",
  "best regards,",
  "warm regards,",
];

/**
 * Validate the raw input message before sending to the AI.
 * @param {string} message
 * @returns {{ valid: boolean, error?: string }}
 */
function validateInput(message) {
  if (!message || typeof message !== "string") {
    return { valid: false, error: "Message is required" };
  }
  const trimmed = message.trim();
  if (trimmed.length < MIN_INPUT_LENGTH) {
    return {
      valid: false,
      error: `Message must be at least ${MIN_INPUT_LENGTH} characters to polish`,
    };
  }
  if (trimmed.length > MAX_INPUT_LENGTH) {
    return {
      valid: false,
      error: `Message must be ${MAX_INPUT_LENGTH} characters or fewer`,
    };
  }
  return { valid: true };
}

/**
 * Validate the AI output before returning to client.
 * @param {string} output
 * @returns {{ valid: boolean, issues: string[] }}
 */
function validateOutput(output) {
  const issues = [];

  if (!output || !output.trim()) {
    issues.push("empty_output");
    return { valid: false, issues };
  }

  if (output.trim().length < MIN_INPUT_LENGTH) {
    issues.push("output_too_short");
  }

  const lower = output.toLowerCase();
  for (const filler of BANNED_FILLER) {
    if (lower.includes(filler)) {
      issues.push(`banned_filler:${filler}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

module.exports = {
  validateInput,
  validateOutput,
  MIN_INPUT_LENGTH,
  MAX_INPUT_LENGTH,
  BANNED_FILLER,
};
