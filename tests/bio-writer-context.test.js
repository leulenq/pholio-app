const {
  buildBioContext,
  formatContextForPrompt,
  resolveRichness,
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
    expect(formatted).toContain("Booking lanes: Editorial");
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

describe("bio-writer context richness", () => {
  it("grades a full profile as rich", () => {
    const ctx = buildBioContext({
      first_name: "Maya",
      last_name: "Chen",
      city: "Toronto, Canada",
      modeling_categories: JSON.stringify(["Editorial", "Runway"]),
      experience_details: JSON.stringify([
        { title: "Sable Journal", role: "Editorial", year: "2024" },
      ]),
      training: "Two seasons of runway coaching at a Toronto studio",
      languages: JSON.stringify(["English", "French"]),
      seeking_representation: true,
    });
    expect(ctx.richness).toBe("rich");
  });

  it("grades a name-plus-one-lane profile as thin", () => {
    const ctx = buildBioContext({
      first_name: "Tomas",
      last_name: "Ilic",
      modeling_categories: JSON.stringify(["Commercial"]),
    });
    expect(ctx.richness).toBe("thin");
  });

  it("grades a short market-plus-lane profile as thin, not moderate", () => {
    const ctx = buildBioContext({
      first_name: "Tomas",
      last_name: "Ilic",
      city: "Halifax",
      modeling_categories: JSON.stringify(["Commercial"]),
    });
    expect(ctx.signalCount).toBe(2);
    expect(ctx.richness).toBe("thin");
  });

  it("grades a mid-detail profile as moderate", () => {
    const ctx = buildBioContext({
      first_name: "Maya",
      last_name: "Chen",
      city: "Toronto, Canada",
      modeling_categories: JSON.stringify(["Editorial", "Runway"]),
      training: "Two seasons of runway coaching at a Toronto studio",
    });
    expect(ctx.richness).toBe("moderate");
  });

  it("uses richness directly from resolveRichness", () => {
    expect(resolveRichness([])).toBe("thin");
    expect(
      resolveRichness([
        { fact: "Toronto, Canada" },
        { fact: "Editorial, Runway, Commercial" },
        { fact: "Two seasons of runway coaching at a Toronto studio" },
      ]),
    ).toBe("moderate");
  });

  it("keeps the empty-context prompt line honest about length", () => {
    const blob = formatContextForPrompt({ signals: [] });
    expect(blob).toMatch(/one or two honest sentences/i);
    expect(blob).toMatch(/do not pad/i);
  });
});
