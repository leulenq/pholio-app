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
  let warn;

  beforeEach(() => {
    delete process.env.GROQ_TEXT_MODEL;
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (prevModel === undefined) delete process.env.GROQ_TEXT_MODEL;
    else process.env.GROQ_TEXT_MODEL = prevModel;
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
    const config = loadConfig();
    expect(config.groq.visionModel).toBe(
      "meta-llama/llama-4-scout-17b-16e-instruct",
    );
  });
});
