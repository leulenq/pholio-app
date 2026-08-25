"use strict";

/**
 * Discover parse v2 — orchestrator (WS4.2).
 *
 *   brief text
 *     → normalize + hash
 *     → discover_parse_cache lookup (knex; tolerates a missing table)
 *     → on miss: Groq gpt-oss-120b strict json_schema (contract-schema) with a
 *       few-shot system prompt
 *     → validate-contract (reconcile, whitelist, protected-class set-aside,
 *       credential gate)
 *     → cache write
 *     → return { contract, dropped, needs_confirmation_fields, multi_role,
 *                credential_gate, source }
 *
 * On Groq error/timeout the intent-parser regex/lexicon decomposition is mapped
 * into a best-effort single-role contract whose numeric constraints are only
 * applied when extract-values confirms them (never a hard-applied regex guess).
 *
 * This is the live natural-language boundary for Discover. Its contract is
 * evaluated only as factual filtering; it is never used to score or rank talent.
 */

const crypto = require("crypto");
const config = require("../../../../config");
const { CONTRACT_SCHEMA } = require("./contract-schema");
const { validateContract } = require("./validate-contract");
const { emptyContract, emptyHard } = require("./contract-schema");
const { decomposeQueryFallback } = require("../../lib/intent-parser");
const { GENDER_DB_MAP } = require("./field-whitelist");

const PARSE_MODEL = () => config.groq.textModel;
const PARSE_TEMPERATURE = 0.1;
// Reasoning models spend completion tokens before the JSON body.
const PARSE_MAX_TOKENS = 2200;
const DEFAULT_TIMEOUT_MS = 8000;

// ── Groq client (lazy, mirrors art-director.js) ──────────────────────────────

let groqClient = null;
let groqInitFailed = false;

function getGroq() {
  if (groqClient) return groqClient;
  if (groqInitFailed) return null;
  const apiKey = config.groq?.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    // eslint-disable-next-line global-require
    const Groq = require("groq-sdk");
    groqClient = new Groq({ apiKey });
    return groqClient;
  } catch (err) {
    groqInitFailed = true;
    return null;
  }
}

/** Test seam: inject a mock Groq client. */
function __setGroqClient(client) {
  groqClient = client;
  groqInitFailed = false;
}

// ── prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You convert an agency casting BRIEF into a strict JSON roles contract for talent search.

Return ONE role per distinct person the brief describes. "2 women 22-30 and 1 man in his 40s" => two roles (count reflects how many of that role are wanted). Never merge distinct roles.

For every constraint, ALWAYS copy the exact source substring into its "span" field. A downstream deterministic parser re-reads the span to get the real number/date — your job is to identify the span and the operator, not to compute the value. Still fill a/b with your best numeric reading.

Operators (op): "min" (5'9" and up), "max" (under 5'8"), "between" (5'8"-5'10", or a stated range), "approx" (around/about 5'9", ±3cm), "exact" (exactly).

Rules:
- HEIGHT into height_cm as a constraint (a in cm). Copy the literal span ("5'9\\"", "175cm", "1.75m", "five nine").
- PLAYING AGE into playing_age (a=low, b=high). "22 to 30" => a:22,b:30. "18 to play younger" => the playable age they can portray (younger), not their real age: a:16,b:19 with span "18 to play younger". Never use real DOB.
- MEASUREMENTS: each length into measurements.*_cm as a constraint; sizes into dress_size/suit_size ALWAYS with a region tag (US 6 vs UK 6 vs EU 38). Set measurements.exact=true when the brief says "exact"/"fit".
- SHOE into shoe {size, region}. Default region US only when clearly US context.
- LOCATION: "local to NYC"/"works as a local in New York" => location.market="new-york", local_only=true. Use canonical market slugs.
- AVAILABILITY: one entry per window. "fittings through June 26, shoot July 9-14" => two entries [{kind:"fitting", span:"through June 26"},{kind:"shoot", span:"July 9-14"}]. Copy spans; the date parser resolves them.
- NEGATIONS become typed booleans: "no visible tattoos" => visible_tattoos:false. "no tattoos" => visible_tattoos:false.
- ENUM SETS are OR: "blonde or red" => hair_color:["blonde","red"]. gender_presentation, boards, hair_color, eye_color, representation_status are arrays.
- REPRESENTATION: "unrepresented"/"freelance only" => representation_status:["unrepresented"]. "seeking a mother agency" => ["seeking"].
- CREDENTIALS: "has tearsheets", "shows walked", "fit experience", "published work" => credentials{...:true} with span.
- ETHNICITY / HERITAGE / SKIN TONE are NEVER filters. Put any such term in set_aside with reason "not_used_for_filtering" and keep it out of hard and soft_query. (Hair/eye colour like "black hair" is fine.)
- soft_query = the remaining aesthetic/vibe language only (e.g. "editorial, androgynous, strong bone structure"). unparsed_remainder = anything you could not place.
- Any hard field the brief does not mention MUST be null.`;

function buildUserPrompt(text, now) {
  const iso = now.toISOString().slice(0, 10);
  return `Today's date is ${iso}. Resolve relative dates ("next week", "through June 26") against it.\n\nBRIEF:\n${text}`;
}

// ── caching ──────────────────────────────────────────────────────────────────

function normalizeText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hashText(text) {
  return crypto.createHash("sha256").update(normalizeText(text)).digest("hex");
}

async function readCache(knex, queryHash) {
  if (!knex) return null;
  try {
    const row = await knex("discover_parse_cache")
      .where({ query_hash: queryHash })
      .first();
    if (!row || row.contract == null) return null;
    return typeof row.contract === "string" ? JSON.parse(row.contract) : row.contract;
  } catch (err) {
    // Missing table / DB down — cache is best-effort.
    return null;
  }
}

async function writeCache(knex, queryHash, contract, model) {
  if (!knex) return;
  try {
    const payload = {
      query_hash: queryHash,
      contract: JSON.stringify(contract),
      model,
      created_at: knex.fn.now(),
    };
    await knex("discover_parse_cache")
      .insert(payload)
      .onConflict("query_hash")
      .merge();
  } catch (err) {
    // best-effort
  }
}

// ── Groq call ────────────────────────────────────────────────────────────────

async function callGroq(text, now, timeoutMs) {
  const groq = getGroq();
  if (!groq) return null;

  let timer = null;
  try {
    const request = groq.chat.completions.create({
      model: PARSE_MODEL(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(text, now) },
      ],
      temperature: PARSE_TEMPERATURE,
      max_completion_tokens: PARSE_MAX_TOKENS,
      response_format: { type: "json_schema", json_schema: CONTRACT_SCHEMA },
    });
    Promise.resolve(request).catch(() => {}); // pre-handle late rejection
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const response = await Promise.race([request, timeout]);
    if (!response) return null;
    const content = response.choices?.[0]?.message?.content || "";
    return JSON.parse(content);
  } catch (err) {
    console.warn(`[discover-parse] Groq failed (${err.message}) — using fallback`);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── regex/lexicon fallback → best-effort contract ────────────────────────────

function fallbackContract(text) {
  const decomposed = decomposeQueryFallback(text);
  const hard = emptyHard();

  for (const c of decomposed.constraints || []) {
    if (c.field === "gender") {
      const key = String(c.value).toLowerCase().replace(/[^a-z]/g, "_");
      const norm = key === "non_binary" ? "non_binary" : key;
      if (GENDER_DB_MAP[norm]) hard.gender_presentation = [norm];
    } else if (c.field === "hair_color") {
      hard.hair_color = [String(c.value).toLowerCase()];
    } else if (c.field === "eye_color") {
      hard.eye_color = [String(c.value).toLowerCase()];
    } else if (c.field === "min_height") {
      // Numeric guess — carry the original brief as the span so reconcile()
      // decides whether it is safe to apply; otherwise it needs_confirmation.
      hard.height_cm = {
        op: "min",
        a: Number(c.value),
        b: null,
        span: text,
        confidence: 0.5,
      };
    } else if (c.field === "city") {
      const slug = String(c.value).toLowerCase().replace(/\s+/g, "-");
      hard.location = { market: slug, local_only: null, travel_ok: null, span: c.value };
    }
  }

  return {
    roles: [
      {
        label: "role 1",
        count: 1,
        hard,
        soft_query: decomposed.residual_query || String(text || "").trim(),
      },
    ],
    set_aside: [],
    unparsed_remainder: "",
  };
}

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * Parse an agency brief into a validated roles contract.
 * @param {string} text
 * @param {object} [opts]
 * @param {import("knex").Knex} [opts.knex] — for discover_parse_cache
 * @param {Date}   [opts.now] — reference date for relative dates / tests
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{contract, dropped, needs_confirmation_fields, multi_role,
 *   credential_gate, source}>}
 */
async function parseBrief(text, opts = {}) {
  const now = opts.now || new Date();
  const knex = opts.knex || null;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const trimmed = String(text || "").trim();

  if (!trimmed) {
    const validated = validateContract(emptyContract(), { now });
    return { ...validated, credential_gate: false, source: "empty" };
  }

  const queryHash = hashText(trimmed);

  // 1. cache
  const cached = await readCache(knex, queryHash);
  if (cached) {
    return {
      contract: cached,
      dropped: [],
      needs_confirmation_fields: [],
      multi_role: (cached.roles || []).length > 1,
      credential_gate: Boolean(cached.credential_gate),
      source: "cache",
    };
  }

  // 2. Groq (strict) → 3. fallback
  let raw = await callGroq(trimmed, now, timeoutMs);
  let source = "groq";
  if (!raw) {
    raw = fallbackContract(trimmed);
    source = "fallback";
  }

  // 4. validate + normalize
  const validated = validateContract(raw, { now });
  const out = {
    ...validated,
    credential_gate: Boolean(validated.contract.credential_gate),
    source,
  };

  // 5. cache write (only trustworthy model output; never cache a fallback)
  if (source === "groq") {
    await writeCache(knex, queryHash, validated.contract, PARSE_MODEL());
  }

  return out;
}

module.exports = {
  parseBrief,
  fallbackContract,
  hashText,
  normalizeText,
  SYSTEM_PROMPT,
  __setGroqClient,
};
