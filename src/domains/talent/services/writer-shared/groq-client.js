"use strict";

const Groq = require("groq-sdk");
const config = require("../../../../config");

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

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
 * @param {{ system: string, user: string, model?: string, temperature?: number, maxTokens?: number }} opts
 */
async function callGroqChat({
  system,
  user,
  model = DEFAULT_MODEL,
  temperature = 0.45,
  maxTokens = 280,
}) {
  const completion = await getGroq().chat.completions.create({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    model,
    temperature,
    max_completion_tokens: maxTokens,
    top_p: 0.85,
  });

  return stripQuotedResponse(completion.choices[0]?.message?.content);
}

function groqUnavailable(err) {
  const msg = err?.message || "";
  return msg.includes("GROQ") || msg.includes("API key");
}

module.exports = {
  DEFAULT_MODEL,
  getGroq,
  stripQuotedResponse,
  countWords,
  callGroqChat,
  groqUnavailable,
};
