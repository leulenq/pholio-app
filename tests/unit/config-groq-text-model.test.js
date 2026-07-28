"use strict";

// config.js is a singleton — load it in an isolated module registry per case.
function loadConfig() {
  let cfg;
  jest.isolateModules(() => {
    cfg = require("../../src/config");
  });
  return cfg;
}

describe("config.groq.textModel", () => {
  const prevModel = process.env.GROQ_TEXT_MODEL;
  const prevVisionModel = process.env.GROQ_VISION_MODEL;
  const prevVisionEffort = process.env.GROQ_VISION_REASONING_EFFORT;
  let warn;

  beforeEach(() => {
    delete process.env.GROQ_TEXT_MODEL;
    delete process.env.GROQ_VISION_MODEL;
    delete process.env.GROQ_VISION_REASONING_EFFORT;
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    const restore = (key, prev) => {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    };
    restore("GROQ_TEXT_MODEL", prevModel);
    restore("GROQ_VISION_MODEL", prevVisionModel);
    restore("GROQ_VISION_REASONING_EFFORT", prevVisionEffort);
    warn.mockRestore();
  });

  test("defaults to openai/gpt-oss-120b without a deprecation warning", () => {
    const config = loadConfig();
    expect(config.groq.textModel).toBe("openai/gpt-oss-120b");
    const deprecationWarnings = warn.mock.calls.filter(([msg]) =>
      String(msg).includes("deprecated"),
    );
    expect(deprecationWarnings).toEqual([]);
  });

  test("GROQ_TEXT_MODEL env override still wins (rollback lever)", () => {
    process.env.GROQ_TEXT_MODEL = "llama-3.3-70b-versatile";
    const config = loadConfig();
    expect(config.groq.textModel).toBe("llama-3.3-70b-versatile");
  });

  test("warns at startup when the configured model is known-deprecated", () => {
    process.env.GROQ_TEXT_MODEL = "llama-3.3-70b-versatile";
    loadConfig();
    expect(
      warn.mock.calls.some(
        ([msg]) =>
          String(msg).includes("llama-3.3-70b-versatile") &&
          String(msg).includes("deprecated"),
      ),
    ).toBe(true);
  });

  test("does not warn for a non-deprecated override", () => {
    process.env.GROQ_TEXT_MODEL = "openai/gpt-oss-120b";
    loadConfig();
    const deprecationWarnings = warn.mock.calls.filter(([msg]) =>
      String(msg).includes("deprecated"),
    );
    expect(deprecationWarnings).toEqual([]);
  });

  test("visionModel is unchanged by the text-model migration", () => {
    process.env.GROQ_TEXT_MODEL = "openai/gpt-oss-120b";
    const config = loadConfig();
    // The vision default moved off meta-llama/llama-4-scout-17b-16e-instruct
    // when Groq decommissioned it (it now returns model_not_found). What this
    // test guards is that the TEXT model migration never drags the vision
    // model with it — not the specific id.
    expect(config.groq.visionModel).toBe("qwen/qwen3.6-27b");
    expect(config.groq.visionModel).not.toBe(config.groq.textModel);
  });

  test("GROQ_VISION_MODEL overrides the vision default", () => {
    process.env.GROQ_VISION_MODEL = "some/other-vision-model";
    const config = loadConfig();
    expect(config.groq.visionModel).toBe("some/other-vision-model");
  });

  test("vision reasoning effort defaults to none for reasoning models", () => {
    // qwen3.6 spends its whole completion budget thinking at default effort
    // and returns nothing, which Groq rejects as invalid JSON.
    expect(loadConfig().groq.visionReasoningEffort).toBe("none");
  });
});
