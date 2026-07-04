const { buildPrompt } = require("../../src/domains/ai/classify-portfolio-image");

describe("classify-portfolio-image prompt", () => {
  test("includes digitals vs portfolio industry rules", () => {
    const prompt = buildPrompt({ heuristicDraft: {}, forensicsSummary: "" });
    expect(prompt).toMatch(/digitals|polaroid/i);
    expect(prompt).toMatch(/plain background/i);
    expect(prompt).toMatch(/retouch/i);
    expect(prompt).toContain("retouch_likelihood");
  });
});
