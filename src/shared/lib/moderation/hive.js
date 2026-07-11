/**
 * Hive visual-moderation adapter (WS10 / PR 12).
 *
 * Implements the pluggable moderation-provider seam in
 * `src/shared/lib/content-moderation.js` against Hive's synchronous
 * visual-moderation REST API (https://thehive.ai). Native fetch only — no SDK
 * — matching how `src/domains/ai/embeddings.js` calls OpenAI.
 *
 * Launch posture (locked decision): Hive NEVER auto-rejects. A monitored class
 * score at/above the flag threshold maps to `review` (the visible manual
 * review queue); everything else maps to `approved`. Rejection is reserved for
 * the structural checks in content-moderation.js (undecodable files) and for
 * human moderators.
 *
 * Failure posture: any problem (missing key, HTTP error, timeout, unparseable
 * response) returns `null` so the caller falls back to the heuristic provider
 * result. An upload must never fail because Hive is down.
 *
 * Request shape (verify against live keys before enabling in production):
 *   POST https://api.thehive.ai/api/v2/task/sync
 *   Authorization: Token <HIVE_API_KEY>
 *   multipart/form-data with the raw image bytes under the `image` field.
 *   Bytes are submitted directly (not a URL) because R2 objects may be
 *   private and the exact processed buffer is what we persist.
 *
 * Response shape consumed:
 *   { status: [ { response: { output: [ { classes: [ {class, score} ] } ] } } ] }
 */

const config = require("../../../config");

// Mirrors MODERATION_STATUS in ../content-moderation.js. Declared locally
// (rather than required) because content-moderation.js requires this adapter —
// importing it back would create a circular require. A unit test asserts the
// two vocabularies stay in sync.
const HIVE_VERDICT = Object.freeze({
  APPROVED: "approved",
  REVIEW: "review",
});

const HIVE_SYNC_ENDPOINT = "https://api.thehive.ai/api/v2/task/sync";

// Hive classes that route an upload into the manual review queue. Deliberately
// conservative: `general_suggestive` is monitored too, so borderline imagery
// lands in front of a human instead of silently passing.
const HIVE_FLAG_CLASSES = Object.freeze(["general_nsfw", "general_suggestive"]);

const DEFAULT_FLAG_THRESHOLD = 0.5;
const DEFAULT_TIMEOUT_MS = 8000;

// Log-once guard for the "provider=hive but no key" degradation, so a busy
// upload path doesn't spam the logs with an identical warning per image.
let warnedMissingKey = false;

/** Test hook — reset the log-once guard between test cases. */
function __resetHiveWarnings() {
  warnedMissingKey = false;
}

function moderationConfig() {
  return (config && config.moderation) || {};
}

/**
 * Resolve adapter options. Environment variables are read at call time (so
 * tests and live re-configuration work) and fall back to `config.moderation`,
 * then to conservative defaults.
 *
 * @param {{apiKey?: string, threshold?: number, timeoutMs?: number, endpoint?: string}} [overrides]
 */
function resolveHiveOptions(overrides = {}) {
  const cfg = moderationConfig();

  const apiKey =
    overrides.apiKey ?? process.env.HIVE_API_KEY ?? cfg.hiveApiKey ?? null;

  let threshold = Number(
    overrides.threshold ??
      process.env.MODERATION_HIVE_FLAG_THRESHOLD ??
      cfg.hiveThreshold,
  );
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    threshold = DEFAULT_FLAG_THRESHOLD;
  }

  let timeoutMs = Number(
    overrides.timeoutMs ??
      process.env.MODERATION_HIVE_TIMEOUT_MS ??
      cfg.hiveTimeoutMs,
  );
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    timeoutMs = DEFAULT_TIMEOUT_MS;
  }

  const endpoint = overrides.endpoint || HIVE_SYNC_ENDPOINT;

  return { apiKey, threshold, timeoutMs, endpoint };
}

/**
 * Extract `{ class: score }` pairs from a Hive sync response. Tolerant of the
 * nesting Hive uses (`status[].response.output[].classes[]`) and returns an
 * empty object for anything unrecognizable so the caller can treat it as a
 * failed call rather than crash.
 *
 * @param {unknown} payload - parsed response JSON
 * @returns {Record<string, number>}
 */
function extractClassScores(payload) {
  const scores = {};
  const statusList = Array.isArray(payload?.status) ? payload.status : [];
  for (const entry of statusList) {
    const outputs = Array.isArray(entry?.response?.output)
      ? entry.response.output
      : [];
    for (const output of outputs) {
      const classes = Array.isArray(output?.classes) ? output.classes : [];
      for (const cls of classes) {
        const name = cls && typeof cls.class === "string" ? cls.class : null;
        const score = Number(cls?.score);
        if (name && Number.isFinite(score)) {
          scores[name] = score;
        }
      }
    }
  }
  return scores;
}

/**
 * Map Hive class scores to the moderation seam's verdict vocabulary.
 * Monitored class at/above threshold → `review` (manual queue); otherwise
 * `approved`. Never `rejected` — the queue is the decider at launch.
 *
 * @param {Record<string, number>} scores
 * @param {number} threshold
 * @returns {{status: string, reason: string|null, flags: object}}
 */
function verdictFromScores(scores, threshold) {
  const monitored = {};
  for (const cls of HIVE_FLAG_CLASSES) {
    if (Number.isFinite(scores[cls])) monitored[cls] = scores[cls];
  }

  const flagged = HIVE_FLAG_CLASSES.filter(
    (cls) => Number.isFinite(scores[cls]) && scores[cls] >= threshold,
  );

  const flags = {
    hiveScores: monitored,
    hiveThreshold: threshold,
    ...(flagged.length > 0 ? { hiveFlagged: flagged } : {}),
  };

  if (flagged.length > 0) {
    return {
      status: HIVE_VERDICT.REVIEW,
      reason: flagged.map((cls) => `hive_${cls}`).join(","),
      flags,
    };
  }

  return { status: HIVE_VERDICT.APPROVED, reason: null, flags };
}

/**
 * Analyze an image buffer with Hive's synchronous visual-moderation API.
 *
 * @param {Buffer} buffer - processed image bytes (webp from processImage)
 * @param {{apiKey?: string, threshold?: number, timeoutMs?: number, endpoint?: string, contentType?: string}} [overrides]
 * @returns {Promise<{status: string, reason: string|null, flags: object}|null>}
 *   Verdict on success; `null` on ANY failure (missing key, HTTP/timeout/parse
 *   error) — the caller must fall back to the heuristic provider.
 */
async function analyzeBufferWithHive(buffer, overrides = {}) {
  const { apiKey, threshold, timeoutMs, endpoint } =
    resolveHiveOptions(overrides);

  if (!apiKey) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        "[moderation:hive] MODERATION_PROVIDER=hive but HIVE_API_KEY is not set — degrading to the heuristic provider until a key is configured.",
      );
    }
    return null;
  }

  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return null;
  }

  try {
    const form = new FormData();
    form.append(
      "image",
      new Blob([buffer], { type: overrides.contentType || "image/webp" }),
      "upload.webp",
    );

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        Accept: "application/json",
      },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(
        `[moderation:hive] API ${response.status} — falling back to heuristic: ${body.slice(0, 300)}`,
      );
      return null;
    }

    const payload = await response.json();
    const scores = extractClassScores(payload);
    if (Object.keys(scores).length === 0) {
      console.warn(
        "[moderation:hive] response contained no class scores — falling back to heuristic",
      );
      return null;
    }

    return verdictFromScores(scores, threshold);
  } catch (err) {
    const label =
      err?.name === "TimeoutError" || err?.name === "AbortError"
        ? `timeout after ${timeoutMs}ms`
        : err?.message || String(err);
    console.warn(
      `[moderation:hive] request failed (${label}) — falling back to heuristic`,
    );
    return null;
  }
}

module.exports = {
  HIVE_SYNC_ENDPOINT,
  HIVE_FLAG_CLASSES,
  DEFAULT_FLAG_THRESHOLD,
  DEFAULT_TIMEOUT_MS,
  resolveHiveOptions,
  extractClassScores,
  verdictFromScores,
  analyzeBufferWithHive,
  __resetHiveWarnings,
};
