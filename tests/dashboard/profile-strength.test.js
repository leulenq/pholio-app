const {
  calculateProfileStrength,
  REQUIRED_POINTS,
  IMPROVE_POINTS,
} = require("../../src/domains/talent/services/profile-strength");

describe("Agency readiness scoring", () => {
  test("returns zero for empty profile", () => {
    const result = calculateProfileStrength(null);
    expect(result.score).toBe(0);
    expect(result.isCoreReady).toBe(false);
    expect(result.isRequiredComplete).toBe(false);
  });

  test("requires headshot and full-body — not just any image", () => {
    const withSingleImage = calculateProfileStrength({
      first_name: "Alex",
      last_name: "River",
      city: "New York",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 175,
      bust_cm: 86,
      waist_cm: 61,
      hips_cm: 90,
      images: [{ id: "1", path: "/a.jpg", is_primary: true }],
    });

    expect(withSingleImage.isRequiredComplete).toBe(false);
    expect(withSingleImage.fieldCompletion.photo_headshot).toBe(false);
    expect(withSingleImage.fieldCompletion.photo_full_body).toBe(false);
  });

  test("digital headshot counts; styled portfolio headshot does not", () => {
    const digital = calculateProfileStrength({
      first_name: "Alex",
      last_name: "River",
      city: "New York",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 175,
      bust_cm: 86,
      waist_cm: 61,
      hips_cm: 90,
      images: [
        { id: "1", shot_type: "headshot", image_type: "digital", path: "/head.jpg" },
      ],
    });
    expect(digital.fieldCompletion.photo_headshot).toBe(true);

    const portfolio = calculateProfileStrength({
      first_name: "Alex",
      last_name: "River",
      city: "New York",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 175,
      bust_cm: 86,
      waist_cm: 61,
      hips_cm: 90,
      images: [
        {
          id: "1",
          shot_type: "headshot",
          image_type: "portfolio",
          style_type: "editorial",
          path: "/styled.jpg",
        },
      ],
    });
    expect(portfolio.fieldCompletion.photo_headshot).toBe(false);
  });

  test("book full-length frames surface contextual guidance in nextSteps", () => {
    const result = calculateProfileStrength({
      first_name: "Mia",
      last_name: "Voss",
      city: "New York",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 175,
      bust_cm: 86,
      waist_cm: 61,
      hips_cm: 90,
      images: [
        {
          id: "1",
          shot_type: "headshot",
          image_type: "portfolio",
          style_type: "editorial",
        },
        {
          id: "2",
          shot_type: "full_length",
          image_type: "portfolio",
          style_type: "editorial",
        },
      ],
    });

    expect(result.fieldCompletion.photo_full_body).toBe(false);
    const fullBodyStep = result.allNextSteps.find((s) => s.key === "photo_full_body");
    expect(fullBodyStep).toBeDefined();
    expect(fullBodyStep.title).toBe("Full-Length Digital");
    expect(fullBodyStep.why).toContain("full-length book images");
  });

  test("marks core ready with agency submission essentials", () => {
    const result = calculateProfileStrength({
      first_name: "Alex",
      last_name: "River",
      city: "New York",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 175,
      bust_cm: 86,
      waist_cm: 61,
      hips_cm: 90,
      images: [
        { id: "1", shot_type: "headshot", image_type: "digital", path: "/head.jpg" },
        { id: "2", shot_type: "full_length", image_type: "digital", path: "/body.jpg" },
      ],
    });

    expect(result.requiredScore).toBe(REQUIRED_POINTS);
    expect(result.isCoreReady).toBe(true);
    expect(result.isRequiredComplete).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThan(100);
  });

  test("scores 100% for a complete agency-grade package", () => {
    const result = calculateProfileStrength({
      first_name: "Alex",
      last_name: "River",
      city: "New York",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 175,
      bust_cm: 86,
      waist_cm: 61,
      hips_cm: 90,
      eye_color: "Brown",
      hair_color: "Black",
      shoe_size: "8",
      weight_kg: 58,
      skin_tone: "Medium",
      work_status: "Available",
      experience_level: "New Face",
      training: "Runway fundamentals and commercial acting workshops.",
      instagram_handle: "@alexriver",
      email: "alex@example.com",
      phone: "+1 555 0100",
      bio_raw: "New York–based model focused on commercial and lifestyle work with runway training.",
      images: [
        { id: "1", shot_type: "headshot", image_type: "digital", path: "/head.jpg" },
        { id: "2", shot_type: "full_length", image_type: "digital", path: "/body.jpg" },
        {
          id: "3",
          shot_type: "profile_left",
          image_type: "digital",
          path: "/profile.jpg",
        },
        {
          id: "4",
          shot_type: "headshot",
          image_type: "digital",
          path: "/smile.jpg",
          metadata: { ai: { signals: { expression: "smile" } } },
        },
        { id: "5", shot_type: "back", image_type: "digital", path: "/back.jpg" },
        {
          id: "6",
          shot_type: "three_quarter",
          style_type: "editorial",
          image_type: "portfolio",
          path: "/editorial.jpg",
        },
        {
          id: "7",
          shot_type: "full_length",
          style_type: "commercial",
          image_type: "portfolio",
          path: "/commercial.jpg",
        },
      ],
    });

    expect(result.score).toBe(100);
    expect(result.improveScore).toBe(IMPROVE_POINTS);
  });

  test("tracks improve-tier digitals in fieldCompletion", () => {
    const result = calculateProfileStrength({
      first_name: "Alex",
      last_name: "River",
      city: "New York",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 175,
      bust_cm: 86,
      waist_cm: 61,
      hips_cm: 90,
      images: [
        { id: "1", shot_type: "headshot", image_type: "digital", path: "/head.jpg" },
        { id: "2", shot_type: "full_length", image_type: "digital", path: "/body.jpg" },
        {
          id: "3",
          shot_type: "profile_left",
          image_type: "digital",
          path: "/profile.jpg",
        },
        {
          id: "4",
          shot_type: "headshot",
          image_type: "digital",
          path: "/smile.jpg",
          metadata: { ai: { signals: { expression: "smile" } } },
        },
        { id: "5", shot_type: "back", image_type: "digital", path: "/back.jpg" },
        {
          id: "6",
          shot_type: "three_quarter",
          style_type: "editorial",
          image_type: "portfolio",
          path: "/editorial.jpg",
        },
        {
          id: "7",
          shot_type: "full_length",
          style_type: "commercial",
          image_type: "portfolio",
          path: "/commercial.jpg",
        },
      ],
    });

    expect(result.fieldCompletion.photo_profile).toBe(true);
    expect(result.fieldCompletion.photo_smile).toBe(true);
    expect(result.fieldCompletion.photo_back).toBe(true);
    expect(result.fieldCompletion.photo_editorial).toBe(true);
    expect(result.fieldCompletion.photo_lifestyle).toBe(true);
  });

  test("awards points when profile-side digital is added", () => {
    const baseProfile = {
      first_name: "Alex",
      last_name: "River",
      city: "New York",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 175,
      bust_cm: 86,
      waist_cm: 61,
      hips_cm: 90,
      images: [
        { id: "1", shot_type: "headshot", image_type: "digital", path: "/head.jpg" },
        { id: "2", shot_type: "full_length", image_type: "digital", path: "/body.jpg" },
      ],
    };

    const baseline = calculateProfileStrength(baseProfile);
    const withProfileDigital = calculateProfileStrength({
      ...baseProfile,
      images: [
        ...baseProfile.images,
        {
          id: "3",
          shot_type: "profile_left",
          image_type: "digital",
          path: "/profile.jpg",
        },
      ],
    });

    expect(baseline.fieldCompletion.photo_profile).toBe(false);
    expect(withProfileDigital.fieldCompletion.photo_profile).toBe(true);
    expect(withProfileDigital.improveScore - baseline.improveScore).toBe(2);
    expect(withProfileDigital.score - baseline.score).toBe(2);
  });

  test("marks stale digitals as incomplete recency", () => {
    const staleDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    const result = calculateProfileStrength({
      first_name: "Alex",
      last_name: "River",
      city: "New York",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 175,
      bust_cm: 86,
      waist_cm: 61,
      hips_cm: 90,
      images: [
        {
          id: "1",
          shot_type: "headshot",
          image_type: "digital",
          path: "/head.jpg",
          created_at: staleDate,
        },
        {
          id: "2",
          shot_type: "full_length",
          image_type: "digital",
          path: "/body.jpg",
          created_at: staleDate,
        },
      ],
    });

    expect(result.fieldCompletion.photo_headshot).toBe(true);
    expect(result.fieldCompletion.photo_full_body).toBe(true);
    expect(result.fieldCompletion.digitals_recency).toBe(false);
    expect(result.allNextSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "digitals_recency", tier: "Improve" }),
      ]),
    );
  });

  test("minor without consent prioritizes guardian consent over measurements", () => {
    const minorDob = new Date();
    minorDob.setFullYear(minorDob.getFullYear() - 16);
    const dob = minorDob.toISOString().slice(0, 10);

    const result = calculateProfileStrength({
      first_name: "Jamie",
      last_name: "Lee",
      city: "Los Angeles",
      date_of_birth: dob,
      gender: "Female",
      height_cm: 168,
      images: [{ id: "1", shot_type: "headshot", path: "/head.jpg" }],
    });

    expect(result.isRequiredComplete).toBe(false);
    expect(result.fieldCompletion.guardian_consent).toBe(false);
    expect(result.fieldCompletion.measurements).toBe(false);
    expect(result.missingCoreItems).toEqual(
      expect.arrayContaining(["Guardian Consent", "Work Permit on File"]),
    );
    expect(result.missingCoreItems).not.toEqual(
      expect.arrayContaining(["Measurements (Bust/Waist/Hips)", "Full-Body Photo"]),
    );
  });

  test("minor with consent resumes adult-sensitive requirements", () => {
    const minorDob = new Date();
    minorDob.setFullYear(minorDob.getFullYear() - 16);
    const dob = minorDob.toISOString().slice(0, 10);

    const result = calculateProfileStrength({
      first_name: "Jamie",
      last_name: "Lee",
      city: "Los Angeles",
      date_of_birth: dob,
      gender: "Female",
      height_cm: 168,
      guardian_consent_at: "2026-01-01T00:00:00.000Z",
      work_permit_on_file: true,
      bust_cm: 81,
      waist_cm: 58,
      hips_cm: 86,
      images: [
        { id: "1", shot_type: "headshot", image_type: "digital", path: "/head.jpg" },
        { id: "2", shot_type: "full_length", image_type: "digital", path: "/body.jpg" },
      ],
    });

    expect(result.isRequiredComplete).toBe(true);
    expect(result.fieldCompletion.measurements).toBe(true);
    expect(result.fieldCompletion.photo_full_body).toBe(true);
  });
});
