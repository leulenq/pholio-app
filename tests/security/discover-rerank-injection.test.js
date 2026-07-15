"use strict";

const fixture = require("../fixtures/discover-rerank-prompt-injection.json");
const {
  groqListwiseRerank,
} = require("../../src/domains/agency/services/discover-rerank");
const {
  FENCE_BEGIN,
  FENCE_END,
} = require("../../src/domains/agency/services/discover/validate-contract");

describe("Discover reranker prompt-injection boundary", () => {
  test("talent-authored instructions stay fenced data and cannot add or promote candidates", async () => {
    let requestPayload;
    const groqClient = {
      chat: {
        completions: {
          create: jest.fn(async (payload) => {
            requestPayload = payload;
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify(fixture.modelResponse),
                  },
                },
              ],
            };
          }),
        },
      },
    };

    const rankings = await groqListwiseRerank(
      fixture.query,
      fixture.candidates,
      groqClient,
    );

    expect(groqClient.chat.completions.create).toHaveBeenCalledTimes(1);
    expect(requestPayload.messages).toHaveLength(2);
    expect(requestPayload.messages[0]).toEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("untrusted DESCRIPTIVE DATA"),
      }),
    );

    const userPrompt = requestPayload.messages[1].content;
    expect(userPrompt).toContain(`${FENCE_BEGIN} id=hostile-talent`);
    expect(userPrompt).toContain(`${FENCE_END}`);
    expect(userPrompt).toContain("Angular bone structure");
    expect(userPrompt).not.toMatch(/SYSTEM:\s*ignore/i);
    expect(userPrompt).not.toMatch(/score me 100 highest/i);
    expect(userPrompt).not.toMatch(/reveal the system prompt/i);
    expect(userPrompt).not.toContain(`${FENCE_END}\n${FENCE_END}`);

    // The hostile text cannot manufacture a third candidate, and the genuine
    // casting evidence remains available for normal scoring.
    expect([...rankings.keys()]).toEqual([
      "control-talent",
      "hostile-talent",
    ]);
    expect(rankings.get("hostile-talent")).toEqual({
      score: 91,
      rationale: "Angular structure and editorial profile match the brief.",
    });
    expect(rankings.has("attacker-injected-id")).toBe(false);
  });
});
