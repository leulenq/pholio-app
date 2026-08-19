"use strict";

const { createChatCompletion } = require("../writer-shared/groq-client");
const {
  SYSTEM_PROMPT,
  buildSystemPrompt,
  buildGeneratePrompt,
  buildRefinePrompt,
  buildRetryNudge,
  normalizeBioOptions,
} = require("./prompt-builder");
const { validateBioOutput } = require("./output-validator");
const { HARD_FAILURE_ISSUES } = require("./quality-rubric");

// The model comes from config.groq.textModel via writer-shared/groq-client —
// never hardcoded here. BIO_ANSWER_TOKENS is the expected ANSWER length (a bio
// is <= 80 words); the shared client adds the reasoning allowance on top when
// the configured model is a reasoning model, so this stays a plain answer
// budget rather than a number that has to be re-tuned per model.
const BIO_ANSWER_TOKENS = 200;
const MAX_ATTEMPTS = 3;
const MIN_BEST_EFFORT_WORDS = 12;

/**
 * Strip the wrapper a chat model puts around a one-paragraph answer: a
 * "Here's the bio:" preamble, markdown emphasis, surrounding quotes, and any
 * trailing offer to revise. What is left is the bio itself.
 */
function stripBioResponse(text) {
  if (!text) return "";
  let out = String(text).trim();

  out = out
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```$/, "")
    .trim();

  // "Here is the bio:" / "Sure! Here's a refined version:" preambles.
  // \b matters: without it "Herefordshire-based model: ..." would be eaten.
  out = out
    .replace(/^(?:sure|certainly|absolutely|of course)\b[!,.]?\s*/i, "")
    .replace(/^here(?:'s|’s| is| are)?\b[^\n:]{0,80}:\s*/i, "")
    .replace(/^(?:bio|refined bio|revised bio|final bio|draft)\s*:\s*/i, "")
    .trim();

  // Trailing meta-commentary the model tacks on after the paragraph.
  out = out
    .replace(
      /\n+\s*(?:let me know|i hope this|feel free|would you like|note:)[\s\S]*$/i,
      "",
    )
    .trim();

  out = out.replace(/\*\*/g, "").replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2");

  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'")) ||
    (out.startsWith("“") && out.endsWith("”"))
  ) {
    out = out.slice(1, -1).trim();
  }

  return out
    .replace(/^bio:\s*/i, "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function countWords(text) {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean).length;
}

function hasHardFailure(issues = []) {
  return issues.some((issue) => HARD_FAILURE_ISSUES.has(issue));
}

async function callModel(systemPrompt, userPrompt, { temperature = 0.45 } = {}) {
  const raw = await createChatCompletion({
    system: systemPrompt,
    user: userPrompt,
    temperature,
    maxTokens: BIO_ANSWER_TOKENS,
  });

  return stripBioResponse(raw);
}

function buildResult(bio, { mode, options, validation, attempts, qualityWarning }) {
  return {
    bio,
    wordCount: countWords(bio),
    mode,
    length: options.length,
    person: options.person,
    qualityScore: validation.rubric.score,
    attempts,
    ...(qualityWarning ? { qualityWarning: true } : {}),
  };
}

/**
 * Generate with validation and bounded retries.
 *
 * A draft that fabricates a fact, slips into AI-slop register, or drops a fact
 * the talent wrote is never returned — the writer retries with a nudge naming
 * the exact offence, and throws if it cannot produce a clean draft. Only soft
 * defects (a little short, a little long) fall through as best-effort.
 *
 * @param {{ generate?: Function }} params - `generate` is injectable for tests.
 */
async function runWithValidation({
  context,
  systemPrompt,
  userPrompt,
  mode,
  existingBio,
  options,
  generate = callModel,
}) {
  let lastIssues = [];
  let lastBio = "";
  let lastValidation = null;
  let lastDetails = {};

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const prompt =
      attempt === 0
        ? userPrompt
        : `${userPrompt}\n\n${buildRetryNudge(lastIssues, options, lastDetails)}`;

    const raw = await generate(systemPrompt, prompt, {
      temperature: attempt === 0 ? 0.45 : 0.3,
    });

    if (!raw) {
      lastIssues = ["empty"];
      lastDetails = {};
      continue;
    }

    lastBio = raw;
    const validation = validateBioOutput(raw, context, {
      existingBio,
      mode,
      length: options.length,
      person: options.person,
    });
    lastValidation = validation;

    if (validation.valid) {
      return buildResult(raw, {
        mode,
        options,
        validation,
        attempts: attempt + 1,
      });
    }

    lastIssues = validation.rubric.issues;
    lastDetails = {
      fabrications: validation.fabrications,
      banned: validation.rubric.banned,
      droppedUserFacts: validation.droppedUserFacts,
    };
    console.warn(
      `[Bio Writer] ${mode} attempt ${attempt + 1} below quality bar:`,
      validation.rubric.issues,
    );
  }

  const softFailureOnly =
    lastValidation && !hasHardFailure(lastValidation.rubric.issues);

  if (lastBio && softFailureOnly && countWords(lastBio) >= MIN_BEST_EFFORT_WORDS) {
    console.warn(
      `[Bio Writer] ${mode} returning best-effort after ${MAX_ATTEMPTS} attempts`,
    );
    return buildResult(lastBio, {
      mode,
      options,
      validation: lastValidation,
      attempts: MAX_ATTEMPTS,
      qualityWarning: true,
    });
  }

  console.warn(
    `[Bio Writer] ${mode} rejected after ${MAX_ATTEMPTS} attempts:`,
    lastIssues,
  );
  throw new Error("Bio output failed quality validation");
}

async function refineBio({ context, bio, options = {}, generate }) {
  const normalized = normalizeBioOptions(options);
  const userPrompt = buildRefinePrompt(context, bio, normalized);
  return runWithValidation({
    context,
    systemPrompt: buildSystemPrompt(normalized),
    userPrompt,
    mode: "refine",
    existingBio: bio,
    options: normalized,
    ...(generate ? { generate } : {}),
  });
}

async function generateBio({ context, options = {}, generate }) {
  const normalized = normalizeBioOptions(options);
  const userPrompt = buildGeneratePrompt(context, normalized);
  return runWithValidation({
    context,
    systemPrompt: buildSystemPrompt(normalized),
    userPrompt,
    mode: "generate",
    options: normalized,
    ...(generate ? { generate } : {}),
  });
}

module.exports = {
  refineBio,
  generateBio,
  BIO_ANSWER_TOKENS,
  MAX_ATTEMPTS,
  SYSTEM_PROMPT,
  stripBioResponse,
  runWithValidation,
};
