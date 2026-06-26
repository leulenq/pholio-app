const {
  validateSubmissionPackage,
} = require("../../src/domains/talent/services/validate-submission-package");
const { daysAgo } = require("./pits-product-harness");

const BASE_PROFILE = {
  first_name: "Alex",
  last_name: "River",
  city: "New York",
  date_of_birth: "1998-01-01",
  gender: "Female",
  height_cm: 175,
  bust_cm: 86,
  waist_cm: 61,
  hips_cm: 90,
  email: "alex@example.com",
  phone: "555-0100",
};

describe("validateSubmissionPackage", () => {
  test("rejects portfolio-only book frames", () => {
    const result = validateSubmissionPackage(BASE_PROFILE, [
      {
        id: "1",
        shot_type: "headshot",
        image_type: "portfolio",
        rights_status: "cleared",
      },
      {
        id: "2",
        shot_type: "full_length",
        image_type: "portfolio",
        rights_status: "cleared",
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "missing_digital_headshot")).toBe(true);
    expect(result.errors.some((e) => e.code === "missing_digital_full_length")).toBe(true);
  });

  test("accepts clean digital core package", () => {
    const result = validateSubmissionPackage(BASE_PROFILE, [
      {
        id: "1",
        shot_type: "headshot",
        image_type: "digital",
        captured_at: daysAgo(10),
        rights_status: "cleared",
      },
      {
        id: "2",
        shot_type: "full_length",
        image_type: "digital",
        captured_at: daysAgo(10),
        rights_status: "cleared",
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects stale digitals", () => {
    const result = validateSubmissionPackage(BASE_PROFILE, [
      {
        id: "1",
        shot_type: "headshot",
        image_type: "digital",
        captured_at: daysAgo(100),
        rights_status: "cleared",
      },
      {
        id: "2",
        shot_type: "full_length",
        image_type: "digital",
        captured_at: daysAgo(100),
        rights_status: "cleared",
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "stale_digitals")).toBe(true);
  });

  test("rejects untyped frames without image_type digital", () => {
    const result = validateSubmissionPackage(BASE_PROFILE, [
      { id: "1", shot_type: "headshot", rights_status: "cleared" },
      { id: "2", shot_type: "full_length", rights_status: "cleared" },
    ]);
    expect(result.ok).toBe(false);
  });

  test("rejects package images without distribution rights", () => {
    const result = validateSubmissionPackage(BASE_PROFILE, [
      {
        id: "1",
        shot_type: "headshot",
        image_type: "digital",
        captured_at: daysAgo(10),
        rights_status: "cleared",
      },
      {
        id: "2",
        shot_type: "full_length",
        image_type: "digital",
        captured_at: daysAgo(10),
      },
    ]);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.code === "missing_distribution_rights"),
    ).toBe(true);
  });
});
