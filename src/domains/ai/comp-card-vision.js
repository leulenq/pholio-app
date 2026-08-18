"use strict";

/*
 * Comp card OCR fallback.
 *
 * ------------------------------------------------------------------------------
 * COMPLIANCE POSITION — read `docs/comp-card-import-architecture.md` before
 * changing anything in this file.
 * ------------------------------------------------------------------------------
 *
 * This module transcribes the *text printed on* a comp card. It exists only
 * because some cards are exported flattened, with no text layer to read
 * (`src/shared/lib/pdf-text.js` handles every card that has one, with no model
 * involved at all).
 *
 * A comp card is mostly photographs of one person, so this is the one place in the
 * import path where a model sees a picture of a face. Three properties keep that
 * outside Illinois BIPA (740 ILCS 14) and its Texas/Colorado/Washington analogues:
 *
 *   1. **No face geometry is computed, requested or returned.** The task is
 *      optical character recognition. BIPA excludes photographs; what it does not
 *      exclude is a face-geometry template *derived* from a photograph
 *      (*Monroy v. Shutterfly*, N.D. Ill. 2017). No template is derived here.
 *   2. **Nothing is persisted but text.** The image is held in memory for the
 *      duration of one request and never written to disk, never embedded, never
 *      keyed to a person. There is no store that could be used to re-identify
 *      anyone, which is the *Zellmer v. Meta* (9th Cir. 2024) line.
 *   3. **No cross-image linking, ever.** The card's photographs are never compared
 *      to the talent's uploaded portfolio — not to "verify the card is theirs",
 *      not transiently. That comparison is the single highest-risk operation in
 *      the product and it is not implemented anywhere.
 *
 * The prompt below also forbids describing the person at all. That is a second,
 * independent requirement: plan invariant A1.5 bars inferring appearance, type,
 * "potential" or protected traits from imagery, regardless of biometrics law. A
 * transcription model asked to "describe the card" will volunteer exactly that,
 * so it is asked to transcribe text and nothing else, and any commentary it
 * returns anyway is dropped by `sanitiseLines()` rather than trusted.
 */

const Groq = require("groq-sdk");
const config = require("../../config");

// Single source of truth — see config.groq.visionModel. Never hardcode here.
const VISION_MODEL = config.groq.visionModel;

/** Anything longer than this is prose, not a line off a card. */
const MAX_LINE_LENGTH = 120;
/** A card has a stat block and a masthead, not an essay. */
const MAX_LINES = 80;

let _groq = null;

function getGroq() {
  const apiKey = config.groq?.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  if (!_groq) _groq = new Groq({ apiKey });
  return _groq;
}

const SYSTEM_PROMPT = `You are an optical character recognition tool. You transcribe text that is printed on a document image. You do not describe images and you do not describe people.`;

const USER_PROMPT = `Transcribe every piece of text printed on this model comp card, in reading order.

Rules:
- Output ONLY text that is literally printed on the card. Transcribe it exactly, including units and punctuation such as " and '.
- Do NOT describe the photographs. Do NOT describe, characterise, estimate or comment on any person, their appearance, build, age, ethnicity, or anything else about how they look. If you cannot read printed text, output nothing for that region.
- Do not infer or invent values. If a measurement is unreadable, omit it rather than guessing.
- Keep each printed line as its own array entry. Keep a label and its value together on one line, exactly as printed (e.g. "HEIGHT 5'11\\"").

Return JSON only, in this exact shape:
{ "lines": ["...", "..."] }`;

/**
 * Reject anything that is not a plausible transcribed line.
 *
 * The model is instructed not to describe anyone; this is what makes that a
 * property of the system rather than a request. Descriptive sentences are long and
 * contain descriptive verbs, so both are filtered — a card line is short and
 * telegraphic. Anything dropped here is simply not extracted, which the flow
 * already handles as "not found".
 */
const DESCRIPTIVE_MARKERS =
  /\b(?:appears?|looks?|seems?|photo(?:graph)?s? (?:of|show)|image shows?|depicts?|wearing|posing|the model (?:is|has)|she (?:is|has)|he (?:is|has)|they (?:are|have)|appears to be|estimated|approximately \d+ years)\b/i;

function sanitiseLines(rawLines) {
  const seen = new Set();
  const out = [];

  for (const entry of Array.isArray(rawLines) ? rawLines : []) {
    if (typeof entry !== "string") continue;
    const text = entry.replace(/\s+/g, " ").trim();
    if (!text || text.length > MAX_LINE_LENGTH) continue;
    if (DESCRIPTIVE_MARKERS.test(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_LINES) break;
  }

  return out;
}

/**
 * Transcribe a comp card image.
 *
 * Returns `{ available: false }` rather than throwing when Groq is not configured
 * or the call fails: import must never dead-end, and a card that cannot be read is
 * a card the talent fills in by hand.
 *
 * @param {Buffer} imageBuffer  a PNG or JPEG, already normalised by the caller
 * @param {string} mimeType
 * @returns {Promise<{ available: boolean, lines: string[], reason?: string }>}
 */
async function transcribeCompCard(imageBuffer, mimeType = "image/png") {
  const groq = getGroq();
  if (!groq) {
    return { available: false, lines: [], reason: "vision_not_configured" };
  }

  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;

  try {
    const completion = await groq.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: USER_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      // The configured vision model supports json_object but not json_schema, and
      // is a reasoning model that must have its reasoning pass suppressed or it
      // spends the whole budget thinking and returns nothing. Both per config.js.
      response_format: { type: "json_object" },
      reasoning_effort: config.groq.visionReasoningEffort,
      temperature: 0,
      max_completion_tokens: 1500,
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return { available: false, lines: [], reason: "empty_completion" };
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { available: false, lines: [], reason: "unparseable_completion" };
    }

    const lines = sanitiseLines(parsed?.lines);
    if (!lines.length) {
      return { available: false, lines: [], reason: "no_text_found" };
    }

    return { available: true, lines };
  } catch (err) {
    console.error("[comp-card-vision] transcription failed:", err?.message || err);
    return { available: false, lines: [], reason: "vision_error" };
  }
}

module.exports = {
  DESCRIPTIVE_MARKERS,
  MAX_LINES,
  MAX_LINE_LENGTH,
  VISION_MODEL,
  sanitiseLines,
  transcribeCompCard,
};
