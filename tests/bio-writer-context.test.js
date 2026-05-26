const {
  buildBioContext,
  formatContextForPrompt,
} = require("../src/domains/talent/services/bio-writer/context-builder");

describe("bio-writer context-builder", () => {
  const richProfile = {
    first_name: "Jane",
    last_name: "Doe",
    city: "New York, USA",
    date_of_birth: "1998-03-15",
    height_cm: 180,
    bust_cm: 86,
    experience_level: "Professional",
    modeling_categories: JSON.stringify(["Editorial", "Commercial"]),
    specialties: JSON.stringify(["Beauty", "Fitness"]),
    languages: JSON.stringify(["English", "French"]),
    training: "Ford Models workshop, 2022",
    seeking_representation: true,
    fit_score_editorial: 82,
    experience_details: JSON.stringify([
      { title: "Vogue Italia", role: "Editorial", year: "2024" },
      { title: "Nike Campaign", role: "Commercial", year: "2023" },
    ]),
    archetype: "Editorial Icon",
    body_type: "Athletic",
    ethnicity: JSON.stringify(["East Asian"]),
    image_analysis: JSON.stringify({ vibe_tags: ["edgy", "commercial"] }),
  };

  it("caps signals and prioritizes booking-relevant fields", () => {
    const ctx = buildBioContext(richProfile);
    expect(ctx.signals.length).toBeLessThanOrEqual(6);
    expect(ctx.name).toBe("Jane Doe");
    expect(ctx.hasMinimumForGenerate).toBe(true);

    const keys = ctx.signals.map((s) => s.key);
    expect(keys).toContain("lanes");
    expect(keys).toContain("market");
    expect(keys).not.toContain("age");
  });

  it("excludes measurements, age, and noisy metadata", () => {
    const ctx = buildBioContext(richProfile);
    const blob = formatContextForPrompt(ctx);
    expect(blob).not.toMatch(/180/);
    expect(blob).not.toMatch(/bust|waist|hips/i);
    expect(blob).not.toMatch(/vibe|edgy/i);
    expect(blob).not.toMatch(/Heritage|Build/i);
  });

  it("uses compact label format for prompts", () => {
    const formatted = formatContextForPrompt(buildBioContext(richProfile));
    expect(formatted).toMatch(/^Market: New York/);
    expect(formatted).toContain("Lanes: Editorial");
    expect(formatted).not.toMatch(/^- /m);
  });

  it("requires market or lanes plus professional signal for generate", () => {
    expect(
      buildBioContext({ first_name: "A", last_name: "B", city: "LA" })
        .hasMinimumForGenerate,
    ).toBe(false);
    expect(
      buildBioContext({
        first_name: "A",
        last_name: "B",
        modeling_categories: JSON.stringify(["Commercial"]),
      }).hasMinimumForGenerate,
    ).toBe(true);
  });

  it("prefers credits over generic experience level", () => {
    const ctx = buildBioContext(richProfile);
    const keys = ctx.signals.map((s) => s.key);
    expect(keys).toContain("credits");
    expect(keys).not.toContain("experience");
  });
});
