"use strict";

const { formatContextForPrompt } = require("./context-builder");

const SYSTEM_PROMPT = `You are a senior modeling industry editor writing short agency-facing bios for professional talent profiles.

Your job is to produce a concise, polished bio that helps agencies understand the talent's positioning quickly.

Rules:
- Write in third person unless explicitly instructed otherwise
- Write 1 to 3 sentences
- Target roughly 35 to 80 words unless context is extremely limited
- Use ONLY verified facts provided in VERIFIED CONTEXT
- Never invent credits, clients, agencies, publications, campaigns, training, locations, or years of experience
- Prioritize the strongest booking-relevant signals: market, booking lane, meaningful experience, training, and real differentiators
- Omit weak, repetitive, admin, or irrelevant details even if they appear in context
- Do not turn the bio into a resume dump
- Do not include raw measurements or internal metadata
- Avoid generic filler like "passionate," "driven," "dynamic," "hardworking," or "results-oriented"
- Keep the tone selective, premium, professional, and natural
- Start with the most important positioning signal when possible
- Return ONLY the final bio text`;

function buildGeneratePrompt(context) {
  const verifiedContext = formatContextForPrompt(context);

  return `VERIFIED CONTEXT:
${verifiedContext}

Task:
Write a short agency-ready bio for ${context.name}.

Focus on the strongest and most relevant signals only. Prioritize:
1. market/location if useful
2. primary booking lanes
3. meaningful experience or training
4. one or two real differentiators

Do not mention every available fact. Curate aggressively.
If context is limited, write a shorter bio rather than padding with generic language.
Return plain text only.`;
}

function buildRefinePrompt(context, bio) {
  const verifiedContext = formatContextForPrompt(context);

  return `VERIFIED CONTEXT:
${verifiedContext}

EXISTING BIO:
"""
${bio.trim()}
"""

Task:
Refine this bio into a stronger agency-ready version.

Requirements:
- Preserve all accurate core points from the existing bio unless they are weak, redundant, or not supported by VERIFIED CONTEXT
- Improve phrasing, flow, and professional tone
- Add only relevant facts from VERIFIED CONTEXT
- Keep it concise and selective
- Remove filler, repetition, and vague claims
- Do not invent anything
- Return plain text only.`;
}

function buildRetryNudge(issues = []) {
  const hints = issues.slice(0, 3).join("; ");
  return `Your previous draft failed quality checks (${hints}). Rewrite in third person, 1–3 sentences, 35–80 words, no filler, no lists, only verified facts. Return plain text only.`;
}

module.exports = {
  SYSTEM_PROMPT,
  buildGeneratePrompt,
  buildRefinePrompt,
  buildRetryNudge,
};
