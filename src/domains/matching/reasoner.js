/**
 * matching/reasoner.js — grounded LLM reasoning layer (decision support).
 *
 * Judges genuinely subjective/aesthetic fit and writes the human-facing rationale,
 * CONSTRAINED to the structured evidence + retrieved cases it is given. It is
 * advisory: it never changes feasibility (gates are deterministic) and it never
 * silently moves the numeric fit_index — its output is attached as `reasoning`
 * so the numeric backbone stays deterministic, auditable, and explainable.
 *
 * Compliance: grounded (cite-only), logged with the evaluation, and explicitly
 * instructed to ignore race/ethnicity/skin tone. Degrades to null with no API key.
 */

"use strict";

const config = require("../../config");

let _groq = null;
function getGroq() {
  const apiKey = config.groq?.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  if (!_groq) {
    const Groq = require("groq-sdk");
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

const SYSTEM = `You are a senior booker giving a casting director decision support on talent fit.
You are given STRUCTURED EVIDENCE about one talent versus a brief, plus similar past cases.
Rules:
- Reason ONLY from the evidence and cases provided. Do not invent stats, look details, or facts.
- Judge subjective/aesthetic fit (does the look read for this brief?) that the numbers can't capture.
- Cite the evidence dimensions you rely on.
- NEVER use or mention race, ethnicity, or skin tone as a factor.
- Be concise and casting-native. You advise; a human decides.
Return ONLY valid JSON:
{ "aesthetic_read": 0.0-1.0, "rationale": "<= 40 words", "cited": ["dimension", ...] }`;

/**
 * @param {Object} p
 * @param {Object} p.profile
 * @param {Object} p.evidence          dimension → evidence unit
 * @param {Object} p.aggregation       choquet output (shapley/interactions)
 * @param {Object} p.constraintResult  feasibility result
 * @param {*}      [p.lookTarget]
 * @param {Array}  [p.cases]           retrieved similar cases
 * @param {number} [p.timeoutMs=6000]
 * @returns {Promise<Object|null>} { aesthetic_read, rationale, cited, provider } or null
 */
async function reasonAboutFit({ profile, evidence, aggregation, constraintResult, lookTarget, cases, timeoutMs = 6000 }) {
  const groq = getGroq();
  if (!groq) return null;

  // Compact, grounded payload — structured evidence only, no raw PII beyond first name.
  const evidenceBrief = Object.values(evidence || {}).map((e) => ({
    dimension: e.dimension,
    satisfaction: Number((e.strength ?? 0).toFixed(2)),
    confidence: Number((e.confidence ?? 0).toFixed(2)),
    note: e.note,
  }));
  const payload = {
    first_name: profile.first_name || null,
    look_target: lookTarget || null,
    feasible: constraintResult?.feasible ?? null,
    signal_importance: aggregation?.shapley || {},
    evidence: evidenceBrief,
    similar_cases: (cases || []).map((c) => ({ posture: c.posture, band: c.band, similarity: c.similarity })),
  };

  try {
    const completion = await Promise.race([
      groq.chat.completions.create({
        model: config.groq.textModel,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify(payload) },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("reasoner timeout")), timeoutMs)),
    ]);

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const read = Number(parsed.aesthetic_read);
    return {
      aesthetic_read: Number.isFinite(read) ? Math.max(0, Math.min(1, read)) : null,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 300) : null,
      cited: Array.isArray(parsed.cited) ? parsed.cited.slice(0, 8) : [],
      provider: "groq",
    };
  } catch (err) {
    console.warn("[matching/reasoner] skipped:", err.message);
    return null;
  }
}

module.exports = { reasonAboutFit };
