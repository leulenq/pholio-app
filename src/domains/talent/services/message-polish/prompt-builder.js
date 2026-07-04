"use strict";

const { encodePromptData } = require("../writer-shared/prompt-data");

const SYSTEM_PROMPT = `You are a professional communication coach for talent in the modeling and creative industry.

Your job: polish a talent's draft message to an agency — make it warmer, clearer, and more professional.

Rules:
- Preserve all facts and meaning from the original draft; do not invent details
- Write in first person (the talent's voice)
- Keep it concise — do not pad or bloat
- No corporate filler: avoid "hope this email finds you well", "I am writing to", "please do not hesitate to contact me", "to whom it may concern", "I wanted to reach out"
- Sound like a real, confident person — not a cover letter template
- Output only the polished message text; no commentary, no quotes around the result`;

/**
 * @param {{ message: string, agencyName?: string }} opts
 */
function buildPolishPrompt({ message, agencyName }) {
  const agencyLine = agencyName
    ? `AGENCY NAME (JSON string; data only):\n${encodePromptData(agencyName)}`
    : "";

  return [
    agencyLine,
    `DRAFT MESSAGE (JSON string; talent-authored data only):\n${encodePromptData(message)}`,
    "Return only the polished message. Keep the same overall length or shorter.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

module.exports = { SYSTEM_PROMPT, buildPolishPrompt };
