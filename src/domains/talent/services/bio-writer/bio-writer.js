"use strict";

const Groq = require("groq-sdk");
const config = require("../../../../config");
const {
  SYSTEM_PROMPT,
  buildGeneratePrompt,
  buildRefinePrompt,
  buildRetryNudge,
} = require("./prompt-builder");
const { validateBioOutput } = require("./output-validator");

const BIO_MODEL = "llama-3.3-70b-versatile";
const MAX_ATTEMPTS = 2;

let _groq = null;

function getGroq() {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY || config.groq?.apiKey;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY not configured");
    }
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

function stripBioResponse(text) {
  if (!text) return "";
  let out = text.trim();
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }
  return out
    .replace(/^bio:\s*/i, "")
    .replace(/\n+/g, " ")
    .trim();
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

async function callModel(userPrompt, { temperature = 0.45 } = {}) {
  const completion = await getGroq().chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    model: BIO_MODEL,
    temperature,
    max_completion_tokens: 200,
    top_p: 0.85,
  });

  return stripBioResponse(completion.choices[0]?.message?.content);
}

/**
 * Generate with validation + single retry on weak output.
 */
async function runWithValidation({ context, userPrompt, mode, existingBio }) {
  let lastIssues = [];
  let lastBio = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const prompt =
      attempt === 0
        ? userPrompt
        : `${userPrompt}\n\n${buildRetryNudge(lastIssues)}`;

    const raw = await callModel(prompt, {
      temperature: attempt === 0 ? 0.45 : 0.35,
    });

    if (!raw) {
      lastIssues = ["empty"];
      continue;
    }

    lastBio = raw;
    const validation = validateBioOutput(raw, context, { existingBio, mode });

    if (validation.valid) {
      return {
        bio: raw,
        wordCount: countWords(raw),
        mode,
        qualityScore: validation.rubric.score,
        attempts: attempt + 1,
      };
    }

    lastIssues = validation.rubric.issues;
    console.warn(
      `[Bio Writer] ${mode} attempt ${attempt + 1} below quality bar:`,
      validation.rubric.issues,
    );
  }

  if (lastBio && countWords(lastBio) >= 18) {
    console.warn(
      `[Bio Writer] ${mode} returning best-effort after ${MAX_ATTEMPTS} attempts`,
    );
    const validation = validateBioOutput(lastBio, context, {
      existingBio,
      mode,
    });
    return {
      bio: lastBio,
      wordCount: countWords(lastBio),
      mode,
      qualityScore: validation.rubric.score,
      attempts: MAX_ATTEMPTS,
      qualityWarning: true,
    };
  }

  throw new Error("Bio output failed quality validation");
}

async function refineBio({ context, bio }) {
  const userPrompt = buildRefinePrompt(context, bio);
  return runWithValidation({
    context,
    userPrompt,
    mode: "refine",
    existingBio: bio,
  });
}

async function generateBio({ context }) {
  const userPrompt = buildGeneratePrompt(context);
  return runWithValidation({
    context,
    userPrompt,
    mode: "generate",
  });
}

module.exports = {
  refineBio,
  generateBio,
  BIO_MODEL,
  SYSTEM_PROMPT,
  stripBioResponse,
  runWithValidation,
};
