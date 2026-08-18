"use strict";

/**
 * Groq TEXT-model resolution, shared by every text/JSON call site.
 *
 * Two things belong here and nowhere else:
 *
 * 1. WHICH model. Always `config.groq.textModel` (default openai/gpt-oss-120b,
 *    GROQ_TEXT_MODEL is the rollback lever). Hardcoding an id at a call site is
 *    how the previous llama default survived its own deprecation notice in four
 *    writers — and how the lever silently stops working. The shut-down ids are
 *    listed in config as `groq.deprecatedTextModels`; a test asserts no file
 *    under src/ names one.
 *
 * 2. HOW MANY completion tokens. gpt-oss-class models are REASONING models:
 *    they spend completion tokens on an internal reasoning pass BEFORE the
 *    answer body, so a budget sized for the answer alone returns an empty
 *    completion. The writers ask for 100–600 answer tokens; the reasoning pass,
 *    not the answer, is the dominant term.
 *
 * The budget follows the two call sites proven live against gpt-oss on this
 * account — src/domains/pdf/composition/art-director.js
 * (max_completion_tokens: 1600 for a ~1k-token JSON brief) and
 * src/domains/agency/services/discover/parse.js (2200). Neither sends top_p, so
 * neither does a reasoning-class request here.
 *
 * Those two run at default reasoning effort. Callers routed through this module
 * write short factual prose instead of a structured brief, so they run at
 * `config.groq.textReasoningEffort` ("low" by default,
 * GROQ_TEXT_REASONING_EFFORT to retune): low effort cuts the dominant token
 * spend while the generous budget above keeps whatever reasoning does happen
 * from truncating the body. Art-director and discover/parse build their own
 * params and are deliberately untouched by this module.
 */

const config = require("../../config");

// The gpt-oss family is the reasoning-class text model on this account. Match
// the family, not a pinned id, so a version bump does not silently fall back to
// non-reasoning budgets.
const REASONING_TEXT_MODEL_PATTERN = /gpt-oss/i;

// Floor: art-director's proven budget. Headroom: added on top of the caller's
// answer budget so a longer answer never eats into the reasoning allowance.
const REASONING_MIN_COMPLETION_TOKENS = 1600;
const REASONING_TOKEN_HEADROOM = 1400;

/** The configured text model, or an explicit per-call override. */
function resolveTextModel(model) {
  return model || config.groq?.textModel;
}

/** Does this model spend completion tokens reasoning before it answers? */
function isReasoningTextModel(model) {
  return REASONING_TEXT_MODEL_PATTERN.test(String(resolveTextModel(model) || ""));
}

/**
 * Completion budget for an expected answer of `answerTokens`.
 * Non-reasoning models get exactly what the caller asked for.
 */
function resolveCompletionBudget(model, answerTokens) {
  const answer = Number(answerTokens);
  const requested = Number.isFinite(answer) && answer > 0 ? answer : 0;
  if (!isReasoningTextModel(model)) return requested || undefined;
  return Math.max(
    REASONING_MIN_COMPLETION_TOKENS,
    requested + REASONING_TOKEN_HEADROOM,
  );
}

/**
 * Provider params for a text completion, with the model and the completion
 * budget resolved for the model class.
 *
 * @param {{ messages: Array, model?: string, temperature?: number,
 *   maxTokens?: number, topP?: number, extra?: object }} opts
 *   `topP` is the caller's existing nucleus setting — kept for non-reasoning
 *   models (no behavior change) and dropped for reasoning models, which the
 *   in-repo proven configuration does not send it for.
 */
function buildTextCompletionParams({
  messages,
  model,
  temperature,
  maxTokens,
  topP,
  extra,
} = {}) {
  const resolved = resolveTextModel(model);
  const reasoning = isReasoningTextModel(resolved);
  const params = {
    model: resolved,
    messages,
    ...(temperature === undefined ? {} : { temperature }),
    ...extra,
  };

  const budget = resolveCompletionBudget(resolved, maxTokens);
  if (budget !== undefined) params.max_completion_tokens = budget;
  if (reasoning) {
    const effort = config.groq?.textReasoningEffort;
    if (effort) params.reasoning_effort = effort;
  } else if (topP !== undefined) {
    params.top_p = topP;
  }

  return params;
}

module.exports = {
  resolveTextModel,
  isReasoningTextModel,
  resolveCompletionBudget,
  buildTextCompletionParams,
  REASONING_MIN_COMPLETION_TOKENS,
  REASONING_TOKEN_HEADROOM,
};
