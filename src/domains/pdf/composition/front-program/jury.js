/**
 * Vision jury for front-program synthesis (P4 judgment layer).
 *
 * The propose → critique seam from
 * docs/comp-card-frontpage-intelligence-proposal.md §2.3. The aesthetics
 * scorer in synthesize.js ranks K seeded candidates deterministically; this
 * layer RE-RANKS the survivors by SEEING them. The caller renders each
 * program to a PNG (it owns Puppeteer — the jury never imports it), and a
 * single multi-image vision call has an agency art director score every
 * candidate against a fixed rubric. The winner blends the model's eye with
 * the deterministic score.
 *
 * Model: meta-llama/llama-4-scout-17b-16e-instruct — the vision model on this
 * Groq account — with response_format json_schema strict:true. The transport
 * shape is guaranteed by strict decoding but still validated field by field
 * (strict mode guarantees shape, not sense).
 *
 * Failure contract: ANY problem (no key, <2 renderable PNGs, timeout, SDK
 * error, malformed JSON, out-of-range index, non-numeric score) resolves to
 * null. The caller then keeps the aesthetics-scorer winner. NEVER throws.
 *
 * Blend: each metric is min-max normalized across the rendered candidate set,
 * then final = 0.6 * vision_total_norm + 0.4 * aesthetics_norm. Vision is
 * weighted higher so the model's eye leads, with the deterministic score as a
 * stabilizing tie-breaker.
 */

const JURY_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const JURY_TEMPERATURE = 0.3;
const JURY_MAX_TOKENS = 1200;
const DEFAULT_TIMEOUT_MS = 8000;

const VISION_WEIGHT = 0.6;
const AESTHETICS_WEIGHT = 0.4;
const RUBRIC = ["legibility", "balance", "subjectRespect", "premiumFeel"];
const RUBRIC_MAX = RUBRIC.length * 100; // 400

const JURY_SCHEMA = {
  name: "front_candidate_jury",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      scores: {
        type: "array",
        description: "One entry per candidate, keyed by the candidate index shown in the prompt",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            index: { type: "integer", description: "0-based candidate index from the prompt" },
            legibility: { type: "integer", description: "0-100; name/contact read effortlessly, type never fights the image" },
            balance: { type: "integer", description: "0-100; visual-weight balance, alignment, whitespace rhythm" },
            subjectRespect: { type: "integer", description: "0-100; composition honors the talent — no crowding, no text on the face" },
            premiumFeel: { type: "integer", description: "0-100; confident, restrained, high-fashion comp-card register" },
          },
          required: ["index", "legibility", "balance", "subjectRespect", "premiumFeel"],
        },
      },
      winningIndex: { type: "integer", description: "0-based index of the single best candidate" },
      rationale: { type: "string", description: "one line, max 200 chars, why the winner wins" },
    },
    required: ["scores", "winningIndex", "rationale"],
  },
};

const SYSTEM_PROMPT = `You are the senior art director of a top modeling agency, judging printed comp card FRONTS (5.5x8.5in: hero photo + the talent's name, sometimes a contact micro-line). You are shown several candidate designs as images. Score EACH on a 0-100 scale per axis:
- legibility: the name and any contact type read effortlessly; type NEVER fights the image, sits in genuinely quiet areas, has clean contrast.
- balance: confident visual-weight balance, edge alignment, calm whitespace rhythm; nothing crowds the trim edge.
- subjectRespect: the composition honors the talent — the figure and face are unobstructed, no type crossing the face, no claustrophobic crowding.
- premiumFeel: confident, RESTRAINED, high-fashion agency register; reward editorial calm and a clear hero, penalize busy/cluttered/amateur layouts.
Reward confident, restrained, premium composition. Penalize text fighting the image, crowding, and clutter. Then pick the single winningIndex and give a one-line rationale. Return ONLY the JSON.`;

// ── Groq client (lazy, mirrors art-director / ai-advisor pattern) ────────────

let groqClient = null;
let groqInitFailed = false;

function getGroq() {
  if (groqClient) return groqClient;
  if (groqInitFailed) return null;
  if (!process.env.GROQ_API_KEY) return null;
  try {
    // eslint-disable-next-line global-require
    const Groq = require("groq-sdk");
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groqClient;
  } catch (err) {
    groqInitFailed = true;
    return null;
  }
}

// ── message assembly ─────────────────────────────────────────────────────────

function buildUserContent(rendered) {
  const content = [
    {
      type: "text",
      text: `Here are ${rendered.length} candidate comp-card fronts to judge, indexed 0 to ${rendered.length - 1}. Score every candidate on all four axes, then choose the single best.`,
    },
  ];
  rendered.forEach((cand, i) => {
    content.push({ type: "text", text: `Candidate ${i}:` });
    content.push({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${cand.png.toString("base64")}` },
    });
  });
  return content;
}

// ── validation (strict mode guarantees shape, not sense) ─────────────────────

function isInt0to100(v) {
  return Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100;
}

/**
 * Validate the raw model response against the count of rendered candidates.
 * Returns a per-index map of rubric scores + winningIndex + rationale, or
 * null on any defect (missing index, out-of-range, non-numeric, dup, gap).
 */
function validateVerdict(raw, count) {
  if (!raw || typeof raw !== "object") return null;
  if (!Array.isArray(raw.scores) || raw.scores.length !== count) return null;

  const byIndex = new Array(count).fill(null);
  for (const entry of raw.scores) {
    if (!entry || typeof entry !== "object") return null;
    const idx = Number(entry.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= count) return null;
    if (byIndex[idx]) return null; // duplicate index
    const rubric = {};
    for (const axis of RUBRIC) {
      if (!isInt0to100(entry[axis])) return null;
      rubric[axis] = Number(entry[axis]);
    }
    byIndex[idx] = rubric;
  }
  if (byIndex.some((r) => r == null)) return null; // gap — not every candidate scored

  const winningIndex = Number(raw.winningIndex);
  if (!Number.isInteger(winningIndex) || winningIndex < 0 || winningIndex >= count) {
    return null; // out-of-range winning index → reject
  }

  const rationale =
    typeof raw.rationale === "string" ? raw.rationale.trim().slice(0, 200) : "";
  return { byIndex, winningIndex, rationale };
}

// ── blend ────────────────────────────────────────────────────────────────────

function normalize(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  // flat distribution → neutral 0.5 so a tied metric doesn't decide anything
  return values.map((v) => (range > 0 ? (v - min) / range : 0.5));
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Re-rank front-program candidates with a vision jury.
 *
 * @param {object} args
 * @param {Array<{ program: object, score: number }>} args.candidates — the
 *   K candidates from synthesize.js (program + deterministic aesthetics score).
 * @param {(program: object) => Promise<Buffer|null>} args.renderPng — caller-
 *   owned renderer (it owns Puppeteer); returns a PNG buffer or null.
 * @param {number} [args.timeoutMs=8000]
 * @returns {Promise<{ winnerIndex: number, scores: object[], rationale: string }|null>}
 *   winnerIndex indexes the ORIGINAL candidates array. null on any failure —
 *   the caller then keeps the aesthetics-scorer winner.
 */
async function rankFrontCandidates({ candidates, renderPng, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!Array.isArray(candidates) || candidates.length < 2) return null;
  if (typeof renderPng !== "function") return null;

  const groq = getGroq();
  if (!groq) {
    console.log("[front-jury] no Groq client — keeping aesthetics-scorer winner");
    return null;
  }

  // Render each candidate (caller owns Puppeteer). A null/throw drops that
  // candidate from the jury; we judge whoever rendered.
  const rendered = [];
  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    let png = null;
    try {
      png = await renderPng(cand?.program);
    } catch (err) {
      png = null;
    }
    if (Buffer.isBuffer(png) && png.length > 0) {
      rendered.push({ origIndex: i, png, aesthetics: Number(cand?.score) || 0 });
    }
  }

  if (rendered.length < 2) {
    console.log(`[front-jury] only ${rendered.length} renderable candidate(s) — keeping aesthetics-scorer winner`);
    return null;
  }

  let timer = null;
  try {
    const request = groq.chat.completions.create({
      model: JURY_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserContent(rendered) },
      ],
      temperature: JURY_TEMPERATURE,
      max_completion_tokens: JURY_MAX_TOKENS,
      response_format: { type: "json_schema", json_schema: JURY_SCHEMA },
    });
    Promise.resolve(request).catch(() => {}); // pre-handle late rejections
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const response = await Promise.race([request, timeout]);
    if (!response) {
      console.warn(`[front-jury] timed out after ${timeoutMs}ms — keeping aesthetics-scorer winner`);
      return null;
    }

    const content = response.choices?.[0]?.message?.content || "";
    const verdict = validateVerdict(JSON.parse(content), rendered.length);
    if (!verdict) {
      console.warn("[front-jury] verdict failed validation — keeping aesthetics-scorer winner");
      return null;
    }

    // Blend: normalize both signals across the rendered set, weight vision 0.6.
    const visionTotals = rendered.map((_, i) =>
      RUBRIC.reduce((sum, axis) => sum + verdict.byIndex[i][axis], 0),
    );
    const aestheticsRaw = rendered.map((c) => c.aesthetics);
    const visionNorm = normalize(visionTotals);
    const aestheticsNorm = normalize(aestheticsRaw);

    let bestLocal = 0;
    let bestFinal = -Infinity;
    const scores = rendered.map((c, i) => {
      const final =
        VISION_WEIGHT * visionNorm[i] + AESTHETICS_WEIGHT * aestheticsNorm[i];
      if (final > bestFinal) {
        bestFinal = final;
        bestLocal = i;
      }
      return {
        index: c.origIndex,
        vision: { ...verdict.byIndex[i] },
        visionTotal: visionTotals[i],
        visionTotalNorm: Math.round(visionNorm[i] * 1000) / 1000,
        aesthetics: c.aesthetics,
        aestheticsNorm: Math.round(aestheticsNorm[i] * 1000) / 1000,
        final: Math.round(final * 1000) / 1000,
      };
    });

    const winnerIndex = rendered[bestLocal].origIndex;
    console.log(
      `[front-jury] ${rendered.length} judged — winner candidate ${winnerIndex} (model pick local ${verdict.winningIndex}, blended local ${bestLocal})`,
    );
    return { winnerIndex, scores, rationale: verdict.rationale };
  } catch (error) {
    console.warn(`[front-jury] failed (${error.message}) — keeping aesthetics-scorer winner`);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = {
  rankFrontCandidates,
  validateVerdict,
  normalize,
  JURY_SCHEMA,
  JURY_MODEL,
  RUBRIC,
  RUBRIC_MAX,
  VISION_WEIGHT,
  AESTHETICS_WEIGHT,
};
