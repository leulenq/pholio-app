"use strict";

const Groq = require("groq-sdk");
const config = require("../../../../config");
const {
  SYSTEM_PROMPT,
  buildSystemPrompt,
  buildGeneratePrompt,
  buildRefinePrompt,
  buildRetryNudge,
  normalizeBioOptions,
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

async function callModel(systemPrompt, userPrompt, { temperature = 0.45 } = {}) {
  const completion = await getGroq().chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
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
async function runWithValidation({
  context,
  systemPrompt,
  userPrompt,
  mode,
  existingBio,
  options,
}) {
  const { length, person } = options;
  let lastIssues = [];
  let lastBio = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const prompt =
      attempt === 0
        ? userPrompt
        : `${userPrompt}\n\n${buildRetryNudge(lastIssues, options)}`;

    const raw = await callModel(systemPrompt, prompt, {
      temperature: attempt === 0 ? 0.45 : 0.35,
    });

    if (!raw) {
      lastIssues = ["empty"];
      continue;
    }

    lastBio = raw;
    const validation = validateBioOutput(raw, context, {
      existingBio,
      mode,
      length,
      person,
    });

    if (validation.valid) {
      return {
        bio: raw,
        wordCount: countWords(raw),
        mode,
        length,
        person,
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
      length,
      person,
    });
    return {
      bio: lastBio,
      wordCount: countWords(lastBio),
      mode,
      length,
      person,
      qualityScore: validation.rubric.score,
      attempts: MAX_ATTEMPTS,
      qualityWarning: true,
    };
  }

  throw new Error("Bio output failed quality validation");
}

async function refineBio({ context, bio, options = {} }) {
  const normalized = normalizeBioOptions(options);
  const userPrompt = buildRefinePrompt(context, bio, normalized);
  return runWithValidation({
    context,
    systemPrompt: buildSystemPrompt(normalized),
    userPrompt,
    mode: "refine",
    existingBio: bio,
    options: normalized,
  });
}

async function generateBio({ context, options = {} }) {
  const normalized = normalizeBioOptions(options);
  const userPrompt = buildGeneratePrompt(context, normalized);
  return runWithValidation({
    context,
    systemPrompt: buildSystemPrompt(normalized),
    userPrompt,
    mode: "generate",
    options: normalized,
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
