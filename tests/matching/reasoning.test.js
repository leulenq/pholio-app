"use strict";

const {
  cosineSim,
  summarizeCases,
  evidenceVector,
} = require("../../src/domains/matching/case-retriever");
const { AGENCY_DISCLOSURE, CANDIDATE_NOTICE } = require("../../src/domains/matching/notice");

describe("case-retriever :: similarity", () => {
  it("evidenceVector reduces evidence units to a satisfaction vector", () => {
    const v = evidenceVector({
      look: { strength: 0.8, confidence: 1 },
      height: { strength: 0.5 },
      bad: {},
    });
    expect(v).toEqual({ look: 0.8, height: 0.5 });
  });

  it("cosineSim: identical vectors → 1, orthogonal → 0", () => {
    expect(cosineSim({ a: 1, b: 1 }, { a: 1, b: 1 })).toBeCloseTo(1, 6);
    expect(cosineSim({ a: 1 }, { b: 1 })).toBe(0);
  });

  it("summarizeCases reports the advance/consider split", () => {
    const s = summarizeCases([
      { posture: "advance" },
      { posture: "consider" },
      { posture: "not-for-this" },
    ]);
    expect(s.count).toBe(3);
    expect(s.note).toMatch(/2 were advanced\/considered, 1 were not/);
  });

  it("summarizeCases handles an empty case base", () => {
    expect(summarizeCases([]).count).toBe(0);
  });
});

describe("reasoner :: graceful degradation", () => {
  it("returns null when no LLM key is configured (no crash, no fabrication)", async () => {
    const config = require("../../src/config");
    const prevCfg = config.groq?.apiKey;
    const prevEnv = process.env.GROQ_API_KEY;
    if (config.groq) config.groq.apiKey = undefined;
    delete process.env.GROQ_API_KEY;

    // require after clearing so the module reads the cleared config
    delete require.cache[require.resolve("../../src/domains/matching/reasoner")];
    const { reasonAboutFit } = require("../../src/domains/matching/reasoner");
    const out = await reasonAboutFit({
      profile: { first_name: "A" },
      evidence: {},
      aggregation: {},
      constraintResult: { feasible: true },
    });
    expect(out).toBeNull();

    if (config.groq) config.groq.apiKey = prevCfg;
    if (prevEnv !== undefined) process.env.GROQ_API_KEY = prevEnv;
  });
});

describe("compliance notice copy", () => {
  it("agency disclosure frames the output as decision support", () => {
    expect(AGENCY_DISCLOSURE).toMatch(/decision support/i);
  });
  it("candidate notice discloses the tool and excludes protected attributes", () => {
    expect(CANDIDATE_NOTICE).toMatch(/automated tool/i);
    expect(CANDIDATE_NOTICE).toMatch(/does not use race, ethnicity, or skin tone/i);
  });
});
