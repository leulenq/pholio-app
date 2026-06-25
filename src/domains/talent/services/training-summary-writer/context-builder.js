"use strict";

const {
  buildBioContext,
  summarizeCredits,
} = require("../bio-writer/context-builder");

const MAX_TRAINING_LINES = 6;
const MAX_CREDIT_LINES = 4;

function splitTrainingText(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(/\r?\n|[;]+/)
    .map((line) => line.replace(/^[\s\-*•]+/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_TRAINING_LINES);
}

function splitCreditSignal(signalFact) {
  if (!signalFact || typeof signalFact !== "string") return [];
  return signalFact
    .split("|")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_CREDIT_LINES);
}

function uniqLines(lines) {
  const seen = new Set();
  return lines.filter((line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectAllowedPhrases(lines = []) {
  const phrases = new Set();
  for (const line of lines) {
    if (!line) continue;
    const lower = String(line).toLowerCase().trim();
    if (!lower) continue;
    phrases.add(lower);
    lower
      .split(/[|,·/()-]/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3)
      .forEach((part) => phrases.add(part));
  }
  return [...phrases];
}

function buildTrainingSummaryContext(profile = {}) {
  const bioContext = buildBioContext(profile);
  const trainingFromProfile = splitTrainingText(profile.training);
  const creditLines = summarizeCredits(profile.experience_details).slice(
    0,
    MAX_CREDIT_LINES,
  );

  const trainingSignals = bioContext.signals
    .filter((signal) => signal.key === "training")
    .flatMap((signal) => splitTrainingText(signal.fact));

  const creditSignals = bioContext.signals
    .filter((signal) => signal.key === "credits")
    .flatMap((signal) => splitCreditSignal(signal.fact));

  const trainingLines = uniqLines([...trainingFromProfile, ...trainingSignals]).slice(
    0,
    MAX_TRAINING_LINES,
  );
  const credits = uniqLines([...creditLines, ...creditSignals]).slice(
    0,
    MAX_CREDIT_LINES,
  );

  const signals = [
    ...trainingLines.map((line) => ({ type: "training", text: line })),
    ...credits.map((line) => ({ type: "credit", text: line })),
  ];

  return {
    name: bioContext.name || "Talent",
    trainingLines,
    creditLines: credits,
    signals,
    signalCount: signals.length,
    hasSignals: signals.length > 0,
    allowedPhrases: collectAllowedPhrases(signals.map((signal) => signal.text)),
  };
}

function formatExpandContextForPrompt(context = {}) {
  const trainingRows = context.trainingLines || [];
  const creditRows = context.creditLines || [];
  if (!trainingRows.length && !creditRows.length) {
    return "(No verified training or credit signals available.)";
  }

  const lines = [];
  if (trainingRows.length) {
    lines.push("TRAINING SIGNALS:");
    trainingRows.forEach((line) => lines.push(`- ${line}`));
  }
  if (creditRows.length) {
    lines.push("CREDIT SIGNALS:");
    creditRows.forEach((line) => lines.push(`- ${line}`));
  }

  return lines.join("\n");
}

module.exports = {
  buildTrainingSummaryContext,
  formatExpandContextForPrompt,
  splitTrainingText,
  collectAllowedPhrases,
};
