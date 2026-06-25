"use strict";

const { formatSubmissionContextForPrompt } = require("./context-builder");

const SYSTEM_PROMPT = `You are a senior model booker coaching talent on the short cover note that accompanies a submission to an agency.

This note is a first-person letter from the talent to the agency — warm, professional, and human. It is NOT a third-person bio and NOT a resume.

Rules:
- Always write in the first person ("I", "my"), as the talent speaking directly to the agency
- Keep it to 2 to 4 sentences
- Lead with the talent's strongest real signal (market, booking lane, a real credit, training) — never open with "I am a model" or "I'm an aspiring model"
- If an agency name is provided, briefly say why this agency specifically, using ONLY the agency name; never invent facts, roster, clients, or reputation about the agency
- Use ONLY verified facts from VERIFIED CONTEXT; never invent credits, clients, campaigns, agencies, training, locations, or years of experience
- Sound like a real person, confident and respectful, not salesy
- Banned words: "passionate", "driven", "dynamic", "hardworking". Never mention AI, prompts, or being a language model
- No bullet lists, no headings, no measurements, no sign-off signature block
- Return ONLY the final note text, plain text`;

function buildDraftPrompt(context) {
  const verifiedContext = formatSubmissionContextForPrompt(context);
  const agencyLine = context.agencyName
    ? `Address it to ${context.agencyName} and include one brief, genuine line about why this agency specifically (using only the agency name).`
    : `No agency name was provided — keep it warm and general, do not invent an agency.`;

  return `VERIFIED CONTEXT:
${verifiedContext}

Task:
Write a first-person submission cover note for ${context.name} to send with their package.

Requirements:
- 2 to 4 sentences, warm and professional first person
- Open with the strongest verified signal, not a generic "I am a model" line
- ${agencyLine}
- Use only verified facts; do not invent anything
- Under 1200 characters
Return plain text only.`;
}

function buildSharpenPrompt(context, note) {
  const verifiedContext = formatSubmissionContextForPrompt(context);

  return `VERIFIED CONTEXT:
${verifiedContext}

EXISTING NOTE:
"""
${note.trim()}
"""

Task:
Sharpen this first-person submission note.

Requirements:
- Keep it first person and keep every accurate point the talent made
- Improve flow and clarity; remove filler, repetition, and vague claims
- Do not add facts that are not in VERIFIED CONTEXT or the existing note
- Do not invent agency facts; the agency name may be used as an addressee
- Stay at 2 to 4 sentences, under 1200 characters
Return plain text only.`;
}

function buildShortenPrompt(context, note) {
  const verifiedContext = formatSubmissionContextForPrompt(context);

  return `VERIFIED CONTEXT:
${verifiedContext}

EXISTING NOTE:
"""
${note.trim()}
"""

Task:
Tighten this first-person submission note to its essentials.

Requirements:
- Keep it first person and preserve the core positioning (strongest signal + why this agency)
- Aim for roughly 400 characters or fewer if possible, without losing the core message
- Remove filler and any sentence that does not earn its place
- Do not invent anything new
Return plain text only.`;
}

function buildRetryNudge(issues = []) {
  const hints = issues.slice(0, 3).join("; ");
  return `Your previous draft failed quality checks (${hints}). Rewrite as a first-person note (use "I"/"my"), 2–4 sentences, under 1200 characters, no filler words, no AI mentions, no "I am a model" opener, only verified facts. Return plain text only.`;
}

module.exports = {
  SYSTEM_PROMPT,
  buildDraftPrompt,
  buildSharpenPrompt,
  buildShortenPrompt,
  buildRetryNudge,
};
