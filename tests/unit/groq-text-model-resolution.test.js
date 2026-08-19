"use strict";

/**
 * Guards the Groq TEXT-model migration off llama-3.3-70b-versatile:
 *
 *  1. No source file under src/ hardcodes a known-deprecated model id, so
 *     GROQ_TEXT_MODEL stays a working rollback lever for every call site.
 *  2. Reasoning-class models (gpt-oss) get a completion budget large enough to
 *     survive the reasoning pass that runs before the answer body. A writer
 *     budget sized for the answer alone (100–600 tokens) returns an empty
 *     completion — the failure this migration exists to avoid.
 */

const fs = require("fs");
const path = require("path");

const config = require("../../src/config");
const {
  resolveTextModel,
  isReasoningTextModel,
  resolveCompletionBudget,
  buildTextCompletionParams,
  REASONING_MIN_COMPLETION_TOKENS,
  REASONING_TOKEN_HEADROOM,
} = require("../../src/shared/lib/groq-text-model");

const SRC_DIR = path.join(__dirname, "..", "..", "src");
// config.js is the one place a deprecated id is allowed: it *names* the ids in
// order to warn about them.
const ALLOWED = new Set([path.join(SRC_DIR, "config.js")]);

function collectSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...collectSourceFiles(full));
    } else if (/\.(js|cjs|mjs|ejs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("deprecated Groq text models are not hardcoded", () => {
  const deprecated = config.groq.deprecatedTextModels;

  test("config publishes the deprecated-model list", () => {
    expect(Array.isArray(deprecated)).toBe(true);
    expect(deprecated.length).toBeGreaterThan(0);
  });

  test("no file under src/ (except config.js) contains a deprecated model id", () => {
    const offenders = [];
    for (const file of collectSourceFiles(SRC_DIR)) {
      if (ALLOWED.has(file)) continue;
      const contents = fs.readFileSync(file, "utf8");
      for (const id of deprecated) {
        if (contents.includes(id)) {
          offenders.push(`${path.relative(SRC_DIR, file)} → ${id}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("text-model resolution", () => {
  test("resolves from config, and an explicit override wins", () => {
    expect(resolveTextModel()).toBe(config.groq.textModel);
    expect(resolveTextModel("some/other-model")).toBe("some/other-model");
  });

  test("recognizes the gpt-oss family as reasoning-class", () => {
    expect(isReasoningTextModel("openai/gpt-oss-120b")).toBe(true);
    expect(isReasoningTextModel("openai/gpt-oss-20b")).toBe(true);
    expect(isReasoningTextModel("llama-3.3-70b-versatile")).toBe(false);
  });

  test("the shipped default is reasoning-class", () => {
    expect(isReasoningTextModel()).toBe(true);
  });
});

describe("completion budget", () => {
  test("non-reasoning models get exactly the caller's answer budget", () => {
    expect(resolveCompletionBudget("llama-3.3-70b-versatile", 200)).toBe(200);
    expect(resolveCompletionBudget("llama-3.3-70b-versatile", 600)).toBe(600);
  });

  test("reasoning models never get less than art-director's proven floor", () => {
    // The writers ask for 100–340 answer tokens; all of them must clear 1600.
    for (const answerTokens of [100, 170, 200, 220, 240, 280, 340]) {
      expect(
        resolveCompletionBudget("openai/gpt-oss-120b", answerTokens),
      ).toBeGreaterThanOrEqual(REASONING_MIN_COMPLETION_TOKENS);
    }
  });

  test("a larger answer budget adds to the reasoning allowance, not into it", () => {
    const small = resolveCompletionBudget("openai/gpt-oss-120b", 200);
    const large = resolveCompletionBudget("openai/gpt-oss-120b", 600);
    // 400 more answer tokens buys 400 more tokens — the reasoning allowance is
    // never the thing that shrinks to pay for a longer answer.
    expect(large - small).toBe(400);
    expect(large).toBeGreaterThanOrEqual(600 + REASONING_TOKEN_HEADROOM);
  });
});

describe("buildTextCompletionParams", () => {
  const messages = [{ role: "user", content: "hi" }];

  test("reasoning models get low effort, a generous budget, and no top_p", () => {
    const params = buildTextCompletionParams({
      messages,
      model: "openai/gpt-oss-120b",
      temperature: 0.45,
      maxTokens: 200,
      topP: 0.85,
    });
    expect(params.model).toBe("openai/gpt-oss-120b");
    expect(params.temperature).toBe(0.45);
    expect(params.max_completion_tokens).toBeGreaterThanOrEqual(
      REASONING_MIN_COMPLETION_TOKENS,
    );
    // Short factual prose: low effort cuts the dominant reasoning spend, and
    // the budget above keeps the remaining spend from truncating the body.
    expect(params.reasoning_effort).toBe("low");
    expect(params.reasoning_effort).toBe(config.groq.textReasoningEffort);
    // Neither art-director nor discover/parse sends top_p to gpt-oss.
    expect(params.top_p).toBeUndefined();
  });

  test("non-reasoning models keep the previous request shape verbatim", () => {
    const rollbackModel = config.groq.deprecatedTextModels[0];
    const params = buildTextCompletionParams({
      messages,
      model: rollbackModel,
      temperature: 0.45,
      maxTokens: 280,
      topP: 0.85,
    });
    // No reasoning_effort and no inflated budget: a non-reasoning rollback
    // target gets byte-for-byte the request the writers used before.
    expect(params).toEqual({
      model: rollbackModel,
      messages,
      temperature: 0.45,
      max_completion_tokens: 280,
      top_p: 0.85,
    });
  });
});
