"use strict";

const {
  spanOffsets,
  buildUnderstanding,
} = require("../../src/domains/agency/services/discover/present");

describe("Discover natural-language presentation", () => {
  test("keeps source-span provenance for factual constraints", () => {
    const brief = "editorial women, 175cm and up, in New York";
    expect(spanOffsets(brief, "175cm and up")).toEqual([17, 29]);

    const understanding = buildUnderstanding(
      {
        roles: [
          {
            label: "role 1",
            count: 1,
            soft_query: "editorial",
            hard: {
              gender_presentation: ["woman"],
              height_cm: {
                op: "min",
                a: 175,
                b: null,
                span: "175cm and up",
                confidence: 0.98,
              },
            },
          },
        ],
        set_aside: [],
      },
      brief,
      null,
    );

    expect(understanding.applied.map((entry) => entry.field)).toEqual([
      "gender_presentation",
      "height_cm",
    ]);
    expect(understanding.applied[1].span).toEqual([17, 29]);
  });

  test("carries protected terms as set-aside disclosure", () => {
    const understanding = buildUnderstanding(
      {
        roles: [],
        set_aside: [{ text: "Black", reason: "not_used_for_filtering" }],
      },
      "Black editorial talent",
      null,
    );

    expect(understanding.set_aside).toEqual([
      { text: "Black", reason: "not_used_for_filtering" },
    ]);
  });
});
