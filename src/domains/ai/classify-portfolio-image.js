"use strict";

const Groq = require("groq-sdk");
const config = require("../../config");
const {
  IMAGE_TYPE_VALUES,
  SHOT_TYPE_VALUES,
  STYLE_TYPE_VALUES,
} = require("../../shared/lib/validation");

const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

let _groq = null;

function getGroq() {
  if (_groq) return _groq;
  const apiKey = config.groq?.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  _groq = new Groq({ apiKey });
  return _groq;
}

function buildPrompt({ heuristicDraft, forensicsSummary, styleImageOnly = false }) {
  const shotLocked =
    styleImageOnly && heuristicDraft?.shot_type
      ? `\nHeuristic locked shot_type as "${heuristicDraft.shot_type}" (confidence ${heuristicDraft.confidence}). Return that shot_type unchanged; focus on style_type and image_type.`
      : "";

  return `You classify talent portfolio photos for a modeling agency platform.

Allowed values (use exactly these strings or null):
- shot_type: ${SHOT_TYPE_VALUES.join(", ")}
- style_type: ${STYLE_TYPE_VALUES.join(", ")}
- image_type: ${IMAGE_TYPE_VALUES.join(" | ")} (digital = natural digitals/polaroids; portfolio = styled book shots)

Industry image_type rules (critical):
- Label DIGITALS as image_type "digital" only when the image looks like agency digitals/polaroids: raw and unretouched skin, minimal or no makeup, plain background, neutral/basic clothing, and straightforward natural presentation.
- Label BOOK/PORTFOLIO as image_type "portfolio" when the image is styled editorial/commercial/beauty/fashion: art direction, polished grooming, visible styling, dramatic lighting, campaign mood, or creative set context.
- Never label heavy retouching, studio glamour, or polished beauty/editorial imagery as "digital" even if pose/background appears simple.
- If uncertain between digital and portfolio, choose portfolio when styling, retouch, or makeup reads as produced.

Heuristic draft: ${JSON.stringify(heuristicDraft || {})}
Image signals: ${forensicsSummary || "none"}${shotLocked}

Return JSON only:
{
  "shot_type": string or null,
  "style_type": string or null,
  "image_type": string or null,
  "confidence": { "shot_type": 0-1, "style_type": 0-1, "image_type": 0-1 },
  "shot_type_alternates": [{ "value": string, "confidence": 0-1 }],
  "signals": {
    "expression": "neutral | smile | serious",
    "pose_yaw": "front | three_quarter | profile_left | profile_right | back",
    "body_visibility": "face_only | bust | three_quarter | full_length",
    "background": "plain | studio | environmental",
    "styling_register": "natural | polished | editorial",
    "retouch_likelihood": "none | light | heavy",
    "makeup_level": "none | minimal | styled"
  },
  "reasoning": "one sentence",
  "uncertainty_factors": []
}`;
}

function summarizeForensics(intel) {
  if (!intel || typeof intel !== "object") return "";
  const parts = [];
  if (intel.width && intel.height) {
    parts.push(`aspect=${(intel.width / intel.height).toFixed(2)}`);
  }
  const f = intel.forensics;
  if (f?.quiet?.top?.quietness != null) {
    parts.push(`bg_quiet_top=${f.quiet.top.quietness}`);
  }
  if (f?.saturation != null) parts.push(`saturation=${f.saturation}`);
  if (f?.contrast != null) parts.push(`contrast=${f.contrast}`);
  return parts.join("; ");
}

function detectImageMime(buffer) {
  if (!buffer || buffer.length < 4) return "image/jpeg";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return "image/jpeg";
}

const HEURISTIC_SKIP_THRESHOLD = 0.9;

function columnUnset(value) {
  return value == null || String(value).trim() === "";
}

/** Groq needed for style/image_type when those columns are empty. */
function needsGroqVision(imageRow) {
  if (!imageRow) return true;
  return columnUnset(imageRow.style_type) || columnUnset(imageRow.image_type);
}

/**
 * Skip Groq when heuristic shot is confident and style/image already set (§5.1).
 */
function shouldSkipGroqVision(heuristicDraft, imageRow) {
  const hConf = Number(heuristicDraft?.confidence) || 0;
  return (
    hConf >= HEURISTIC_SKIP_THRESHOLD &&
    !!heuristicDraft?.shot_type &&
    !needsGroqVision(imageRow)
  );
}

function mergeClassification(heuristic, vlm) {
  if (!vlm) {
    return {
      shot_type: heuristic?.shot_type ?? null,
      style_type: null,
      image_type: null,
      confidence: {
        shot_type: heuristic?.confidence ?? 0,
        style_type: 0,
        image_type: 0,
      },
      signals: heuristic?.signals || {},
      reasoning: "",
      uncertainty_factors: heuristic?.shot_type ? [] : ["no_vlm"],
      heuristic_reasons: heuristic?.reasons || [],
      model: "heuristic-only",
    };
  }

  const hConf = heuristic?.confidence ?? 0;
  const vConf = vlm.confidence?.shot_type ?? 0;
  const shot_type =
    hConf > vConf && heuristic?.shot_type
      ? heuristic.shot_type
      : vlm.shot_type ?? heuristic?.shot_type ?? null;

  return {
    shot_type,
    style_type: vlm.style_type ?? null,
    image_type: vlm.image_type ?? null,
    confidence: {
      shot_type:
        hConf > vConf && heuristic?.shot_type ? hConf : vConf,
      style_type: vlm.confidence?.style_type ?? 0,
      image_type: vlm.confidence?.image_type ?? 0,
    },
    signals: { ...(heuristic?.signals || {}), ...(vlm.signals || {}) },
    reasoning: vlm.reasoning || "",
    uncertainty_factors: vlm.uncertainty_factors || [],
    shot_type_alternates: Array.isArray(vlm.shot_type_alternates)
      ? vlm.shot_type_alternates
      : [],
    heuristic_reasons: heuristic?.reasons || [],
    model: VISION_MODEL,
  };
}

/**
 * Persist the classification's signals block into `image_signals` (WS3.3),
 * one row per image, insert-or-update on image_id. Best-effort: failures are
 * logged and never break classification. Column names mirror the classifier's
 * real output keys (top-level shot/style/image type + the `signals` block).
 *
 * @param {import('knex').Knex|null} db - optional knex instance (backfill/tests);
 *   defaults to the shared client.
 * @param {string} imageId
 * @param {object} classification - merged result from classifyPortfolioImage
 * @returns {Promise<boolean>} true when a row was written
 */
async function persistImageSignals(db, imageId, classification) {
  if (!imageId || !classification) return false;
  try {
    const knex = db || require("../../shared/db/knex");
    const hasTable = await knex.schema.hasTable("image_signals");
    if (!hasTable) return false;

    const signals = classification.signals || {};
    const values = {
      shot_type: classification.shot_type ?? null,
      style_type: classification.style_type ?? null,
      image_type: classification.image_type ?? null,
      expression: signals.expression ?? null,
      pose_yaw: signals.pose_yaw ?? null,
      body_visibility: signals.body_visibility ?? null,
      background: signals.background ?? null,
      styling_register: signals.styling_register ?? null,
      retouch_likelihood: signals.retouch_likelihood ?? null,
      makeup_level: signals.makeup_level ?? null,
      analyzed_at: classification.analyzed_at || new Date().toISOString(),
      model: classification.model || null,
    };

    const { v4: uuidv4 } = require("uuid");
    await knex("image_signals")
      .insert({ id: uuidv4(), image_id: imageId, ...values })
      .onConflict("image_id")
      .merge({ ...values, updated_at: knex.fn.now() });
    return true;
  } catch (err) {
    console.warn(
      "[PITS] persistImageSignals failed:",
      imageId,
      err?.message || String(err),
    );
    return false;
  }
}

/**
 * @param {object} input
 * @param {Buffer} input.imageBuffer
 * @param {object} [input.heuristicDraft]
 * @param {object} [input.imageIntel]
 * @param {object} [input.imageRow]
 * @param {import('knex').Knex} [input.db] - knex instance for signal persistence
 * @returns {Promise<object|null>}
 */
async function classifyPortfolioImage(input) {
  const result = await classifyPortfolioImageCore(input || {});
  if (result && input?.imageRow?.id) {
    await persistImageSignals(input.db || null, input.imageRow.id, result);
  }
  return result;
}

async function classifyPortfolioImageCore({
  imageBuffer,
  heuristicDraft,
  imageIntel,
  imageRow = null,
}) {
  const groq = getGroq();
  const forensicsSummary = summarizeForensics(imageIntel);

  if (shouldSkipGroqVision(heuristicDraft, imageRow)) {
    return mergeClassification(heuristicDraft, null);
  }

  if (!groq || !imageBuffer?.length) {
    return mergeClassification(heuristicDraft, null);
  }

  if (imageBuffer.length > 19 * 1024 * 1024) {
    return mergeClassification(heuristicDraft, null);
  }

  const hConf = Number(heuristicDraft?.confidence) || 0;
  const styleImageOnly =
    hConf >= HEURISTIC_SKIP_THRESHOLD &&
    !!heuristicDraft?.shot_type &&
    needsGroqVision(imageRow);

  try {
    const mime = detectImageMime(imageBuffer);
    const base64Image = imageBuffer.toString("base64");
    const completion = await Promise.race([
      groq.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildPrompt({
                  heuristicDraft,
                  forensicsSummary,
                  styleImageOnly,
                }),
              },
              {
                type: "image_url",
                image_url: { url: `data:${mime};base64,${base64Image}` },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_completion_tokens: 800,
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Groq vision timeout")), 45000);
      }),
    ]);

    let content = completion.choices[0]?.message?.content || "{}";
    content = content.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(content);
    return mergeClassification(heuristicDraft, parsed);
  } catch (err) {
    console.warn("[PITS] Groq classify failed:", err.message);
    return mergeClassification(heuristicDraft, null);
  }
}

module.exports = {
  classifyPortfolioImage,
  persistImageSignals,
  buildPrompt,
  mergeClassification,
  summarizeForensics,
  shouldSkipGroqVision,
  needsGroqVision,
  HEURISTIC_SKIP_THRESHOLD,
};
