"use strict";

const { callGroqChat, countWords } = require("../writer-shared/groq-client");
const {
  SYSTEM_PROMPT,
  buildFormatPrompt,
  buildSummarizePrompt,
  buildExpandPrompt,
  buildRetryNudge,
} = require("./prompt-builder");
const { validateTrainingSummaryOutput } = require("./output-validator");

const MAX_ATTEMPTS = 2;

function normalizeModelOutput(text, mode) {
  const clean = String(text || "").trim();
  if (!clean) return "";
  if (mode === "summarize") {
    return clean.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  }
  return clean.replace(/\n{3,}/g, "\n\n").trim();
}

function buildModePrompt(mode, context, text) {
  if (mode === "format") return buildFormatPrompt(text);
  if (mode === "summarize") return buildSummarizePrompt(text);
  return buildExpandPrompt(context, text);
}

function getTemperature(mode, attempt) {
  if (mode === "format") return attempt === 0 ? 0.2 : 0.15;
  if (mode === "summarize") return attempt === 0 ? 0.35 : 0.25;
  return attempt === 0 ? 0.28 : 0.2;
}

function buildInsufficientContextError() {
  const err = new Error(
    "Add verified training or credit signals before expanding training summary",
  );
  err.code = "INSUFFICIENT_CONTEXT";
  return err;
}

async function runTrainingSummaryMode({ mode, context, text = "" }) {
  if (mode === "expand" && !context?.hasSignals) {
    throw buildInsufficientContextError();
  }

  const basePrompt = buildModePrompt(mode, context, text);
  let issues = [];
  let fallback = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const userPrompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\n${buildRetryNudge(mode, issues)}`;

    const raw = await callGroqChat({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      temperature: getTemperature(mode, attempt),
      maxTokens: mode === "summarize" ? 170 : 240,
    });

    const summary = normalizeModelOutput(raw, mode);
    if (!summary) {
      issues = ["empty"];
      continue;
    }

    fallback = summary;
    const validation = validateTrainingSummaryOutput(summary, context, {
      mode,
      inputText: text,
    });
    if (validation.valid) {
      return {
        mode,
        summary,
        wordCount: validation.wordCount || countWords(summary),
        attempts: attempt + 1,
      };
    }

    issues = validation.issues;
  }

  if (fallback) {
    const validation = validateTrainingSummaryOutput(fallback, context, {
      mode,
      inputText: text,
    });
    if (validation.valid || validation.issues.length <= 1) {
      return {
        mode,
        summary: fallback,
        wordCount: validation.wordCount || countWords(fallback),
        attempts: MAX_ATTEMPTS,
        qualityWarning: !validation.valid,
      };
    }
  }

  throw new Error("Training summary output failed validation");
}

async function formatTrainingSummary({ context, text }) {
  return runTrainingSummaryMode({ mode: "format", context, text });
}

async function summarizeTrainingSummary({ context, text }) {
  return runTrainingSummaryMode({ mode: "summarize", context, text });
}

async function expandTrainingSummary({ context, text = "" }) {
  return runTrainingSummaryMode({ mode: "expand", context, text });
}

module.exports = {
  formatTrainingSummary,
  summarizeTrainingSummary,
  expandTrainingSummary,
  runTrainingSummaryMode,
  buildInsufficientContextError,
};
