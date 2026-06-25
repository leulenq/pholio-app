const {
  buildTrainingSummaryContext,
} = require("../src/domains/talent/services/training-summary-writer/context-builder");
const {
  validateTrainingSummaryOutput,
} = require("../src/domains/talent/services/training-summary-writer/output-validator");

describe("training-summary-writer output validator", () => {
  const profile = {
    first_name: "Avery",
    last_name: "Lane",
    training:
      "Barbizon NYC · Runway Intensive · 2022\nThe Acting Center · On-Camera Workshop · 2023",
    experience_details: JSON.stringify([
      { title: "Nike Campaign", role: "Commercial", year: "2024" },
      { title: "Vogue Italia", role: "Editorial", year: "2023" },
    ]),
  };

  const context = buildTrainingSummaryContext(profile);

  test("accepts scannable format output with dot-separated lines", () => {
    const formatted = [
      "Barbizon NYC · Runway Intensive · 2022",
      "The Acting Center · On-Camera Workshop · 2023",
    ].join("\n");

    const result = validateTrainingSummaryOutput(formatted, context, {
      mode: "format",
      inputText: formatted,
    });

    expect(result.valid).toBe(true);
    expect(result.lines.length).toBe(2);
    expect(result.issues).toEqual([]);
  });

  test("flags non-scannable format output structure", () => {
    const blob =
      "Studied runway and on-camera training in New York with multiple sessions in 2022 and 2023.";

    const result = validateTrainingSummaryOutput(blob, context, {
      mode: "format",
      inputText: blob,
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("missing_scannable_structure");
  });

  test("rejects invented institutions in expand mode", () => {
    const expanded =
      "Juilliard School · Conservatory Acting Program · 2024\nBarbizon NYC · Runway Intensive · 2022";

    const result = validateTrainingSummaryOutput(expanded, context, {
      mode: "expand",
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("ungrounded_institution");
    expect(result.ungroundedInstitutions).toContain("Juilliard School");
  });

  test("requires 2-3 sentences for summarize mode", () => {
    const tooShort = "Barbizon NYC training prepared Avery for runway castings.";
    const result = validateTrainingSummaryOutput(tooShort, context, {
      mode: "summarize",
      inputText: tooShort,
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("sentence_count");
  });
});
