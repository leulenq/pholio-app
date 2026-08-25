const { curateBio } = require("../../src/shared/lib/curate");

describe("curateBio fallback copy", () => {
  test("empty/blank input falls back to a plain 'is on Pholio' statement", () => {
    const result = curateBio("", "Jane", "Doe");
    expect(result).toBe("Jane Doe is on Pholio.");
  });

  test("input that sanitizes to nothing (e.g. only stripped characters) uses the same fallback", () => {
    // cleanString/whitespace collapse can leave an empty string even when
    // the raw input was non-empty; the fallback must still fire here.
    const result = curateBio("   ", "Alex", "Rivera");
    expect(result).toBe("Alex Rivera is on Pholio.");
  });

  test("fallback never claims Pholio represents the talent", () => {
    const result = curateBio("", "Jane", "Doe");
    expect(result.toLowerCase()).not.toContain("represented by");
  });

  test("fallback never ships the wrong product name", () => {
    const result = curateBio("", "Jane", "Doe");
    expect(result).not.toMatch(/zipsite/i);
  });

  test("non-empty bio is curated normally and is untouched by the fallback", () => {
    const result = curateBio("working actor & model", "Jane", "Doe");
    expect(result).toBe("Working actor and model.");
  });
});
