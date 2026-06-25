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

const MAX_ATTEMPTS = 2;

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
 * Run the model with rubric validation and a single retry on weak output.
 */
async function runWithValidation({
  context,
  userPrompt,
  mode,
  existingNote = "",
  maxTokens,
}) {
  let lastIssues = [];
  let lastNote = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const prompt =
      attempt === 0
        ? userPrompt
        : `${userPrompt}\n\n${buildRetryNudge(lastIssues)}`;

    const raw = await callModel(prompt, {
      temperature: attempt === 0 ? 0.5 : 0.4,
      maxTokens,
    });

    if (!raw) {
      lastIssues = ["empty"];
      continue;
    }

    lastNote = raw;
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

  if (lastNote && countWords(lastNote) >= 10) {
    console.warn(
      `[Submission Note] ${mode} returning best-effort after ${MAX_ATTEMPTS} attempts`,
    );
    const validation = validateNoteOutput(lastNote, context, {
      existingNote,
      mode,
    });
    return buildResult(lastNote, mode, context, validation, MAX_ATTEMPTS, true);
  }

  throw new Error("Submission note output failed quality validation");
}

function buildResult(note, mode, context, validation, attempts, qualityWarning) {
  // Hard guarantee on the application note limit.
  const trimmed = note.length > MAX_CHARS ? note.slice(0, MAX_CHARS).trim() : note;
  return {
    mode,
    note: trimmed,
    wordCount: countWords(trimmed),
    charCount: trimmed.length,
    qualityScore: validation.rubric.score,
    contextSignalsUsed: context.signalCount,
    attempts,
    ...(qualityWarning ? { qualityWarning: true } : {}),
  };
}

async function draftNote({ context }) {
  return runWithValidation({
    context,
    userPrompt: buildDraftPrompt(context),
    mode: "draft",
    maxTokens: 340,
  });
}

async function sharpenNote({ context, note }) {
  return runWithValidation({
    context,
    userPrompt: buildSharpenPrompt(context, note),
    mode: "sharpen",
    existingNote: note,
    maxTokens: 340,
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
};
