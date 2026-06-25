"use strict";

const { callGroqChat, countWords } = require("../writer-shared/groq-client");
const { SYSTEM_PROMPT, buildPolishPrompt } = require("./prompt-builder");
const { validateOutput } = require("./output-validator");

const MAX_ATTEMPTS = 2;

/**
 * Polish a talent's draft message to an agency.
 *
 * @param {{ message: string, agencyName?: string }} opts
 * @returns {Promise<{ message: string, wordCount: number, charCount: number }>}
 */
async function polishMessage({ message, agencyName }) {
  const userPrompt = buildPolishPrompt({ message, agencyName });

  let lastOutput = "";
  let lastIssues = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const nudge =
      attempt > 0 && lastIssues.length
        ? `\n\nPrevious attempt had issues: ${lastIssues.join(", ")}. Fix these and try again.`
        : "";

    const raw = await callGroqChat({
      system: SYSTEM_PROMPT,
      user: userPrompt + nudge,
      temperature: attempt === 0 ? 0.4 : 0.3,
      maxTokens: 600,
    });

    if (!raw) {
      lastIssues = ["empty_output"];
      continue;
    }

    lastOutput = raw;
    const validation = validateOutput(raw);

    if (validation.valid) {
      return {
        message: raw,
        wordCount: countWords(raw),
        charCount: raw.length,
      };
    }

    lastIssues = validation.issues;
    console.warn(
      `[Message Polish] attempt ${attempt + 1} failed validation:`,
      validation.issues,
    );
  }

  // Best-effort: return last output if non-empty, even if it has minor issues
  if (lastOutput && lastOutput.trim().length >= 10) {
    console.warn(
      "[Message Polish] returning best-effort after max attempts; issues:",
      lastIssues,
    );
    return {
      message: lastOutput,
      wordCount: countWords(lastOutput),
      charCount: lastOutput.length,
    };
  }

  throw new Error("Message polish failed to produce valid output");
}

module.exports = { polishMessage };
