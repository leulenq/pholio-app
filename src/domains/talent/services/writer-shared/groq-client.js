"use strict";

const Groq = require("groq-sdk");
const config = require("../../../../config");
const {
  buildTextCompletionParams,
} = require("../../../../shared/lib/groq-text-model");

let _groq = null;

function getGroq() {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY || config.groq?.apiKey;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY not configured");
    }
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

/** Test seam: inject a mock Groq client (mirrors discover/parse.js). */
function __setGroqClient(client) {
  _groq = client;
}

function stripQuotedResponse(text) {
  if (!text) return "";
  let out = text.trim();
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function countWords(text) {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Raw system+user completion for the writers.
 *
 * The model is never passed in by a writer: it resolves from
 * `config.groq.textModel` at call time (GROQ_TEXT_MODEL stays the rollback
 * lever). `maxTokens` is the expected ANSWER length — a reasoning-class model
 * gets the reasoning allowance added on top, because it spends completion
 * tokens thinking before it writes anything. See shared/lib/groq-text-model.js.
 *
 * @param {{ system: string, user: string, model?: string, temperature?: number,
 *   maxTokens?: number }} opts
 * @returns {Promise<string>} unmodified completion text — each writer owns its
 *   own stripping/validation layer.
 */
async function createChatCompletion({
  system,
  user,
  model,
  temperature = 0.45,
  maxTokens = 280,
}) {
  const completion = await getGroq().chat.completions.create(
    buildTextCompletionParams({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      model,
      temperature,
      maxTokens,
      topP: 0.85,
    }),
  );

  return completion.choices[0]?.message?.content;
}

/**
 * @param {{ system: string, user: string, model?: string, temperature?: number, maxTokens?: number }} opts
 */
async function callGroqChat(opts) {
  return stripQuotedResponse(await createChatCompletion(opts));
}

function groqUnavailable(err) {
  const msg = err?.message || "";
  return msg.includes("GROQ") || msg.includes("API key");
}

module.exports = {
  getGroq,
  __setGroqClient,
  stripQuotedResponse,
  countWords,
  createChatCompletion,
  callGroqChat,
  groqUnavailable,
};
