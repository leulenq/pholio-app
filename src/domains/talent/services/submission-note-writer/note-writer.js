"use strict";

const { callGroqChat, countWords } = require("../writer-shared/groq-client");
const {
  SYSTEM_PROMPT,
  buildDraftPrompt,
  buildSharpenPrompt,
  buildShortenPrompt,
  buildRetryNudge,
} = require("./prompt-builder");
const { validateNoteOutput } = require("./output-validator");
const { MAX_CHARS } = require("./quality-rubric");

const MAX_ATTEMPTS = 3;

function normalizeNote(text) {
  if (!text) return "";
  return String(text)
    .replace(/^note:\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function callModel(userPrompt, { temperature = 0.5, maxTokens = 340 } = {}) {
  const raw = await callGroqChat({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    temperature,
    maxTokens,
  });
  return normalizeNote(raw);
}

/**
 * Run the model with rubric validation and bounded retries on weak output.
 */
async function runWithValidation({
  context,
  userPrompt,
  mode,
  existingNote = "",
  maxTokens,
  generate = callModel,
}) {
  let lastIssues = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const prompt =
      attempt === 0
        ? userPrompt
        : `${userPrompt}\n\n${buildRetryNudge(lastIssues)}`;

    const raw = await generate(prompt, {
      temperature: attempt === 0 ? 0.4 : 0.25,
      maxTokens,
    });

    if (!raw) {
      lastIssues = ["empty"];
      continue;
    }

    const validation = validateNoteOutput(raw, context, { existingNote, mode });

    if (validation.valid) {
      return buildResult(raw, mode, context, validation, attempt + 1);
    }

    lastIssues = validation.rubric.issues;
    console.warn(
      `[Submission Note] ${mode} attempt ${attempt + 1} below quality bar:`,
      validation.rubric.issues,
    );
  }

  throw new Error("Submission note output failed quality validation");
}

function buildResult(note, mode, context, validation, attempts) {
  if (note.length > MAX_CHARS) {
    throw new Error("Validated submission note exceeded the character limit");
  }

  return {
    mode,
    note,
    wordCount: countWords(note),
    charCount: note.length,
    qualityScore: validation.rubric.score,
    contextSignalsUsed: context.signalCount,
    attempts,
  };
}

async function draftNote({ context }) {
  return runWithValidation({
    context,
    userPrompt: buildDraftPrompt(context),
    mode: "draft",
    maxTokens: 280,
  });
}

async function sharpenNote({ context, note }) {
  return runWithValidation({
    context,
    userPrompt: buildSharpenPrompt(context, note),
    mode: "sharpen",
    existingNote: note,
    maxTokens: 280,
  });
}

async function shortenNote({ context, note }) {
  return runWithValidation({
    context,
    userPrompt: buildShortenPrompt(context, note),
    mode: "shorten",
    existingNote: note,
    maxTokens: 220,
  });
}

module.exports = {
  draftNote,
  sharpenNote,
  shortenNote,
  runWithValidation,
  normalizeNote,
  SYSTEM_PROMPT,
  MAX_ATTEMPTS,
};
