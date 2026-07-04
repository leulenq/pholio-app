/**
 * Tests for Profile Completeness Calculation
 *
 * Field-split aligned (tasks/field-split-design-2026-07-01.md, Wave 2B):
 * `comfort_levels` (content boundaries) moved to the private, verified-adult
 * `adult_context`, and `emergency_contact_*` / `reference_*` / `work_eligibility`
 * moved to `confirmed_job_safety` (booking-scoped, not generic profile scope).
 * Neither drives global completeness anymore. These tests verify the
 * corrected six-section model: personalInfo, physicalProfile,
 * socialPortfolio, skillsLifestyle, availabilityLocations, representation.
 */

const {
  calculateProfileCompleteness,
} = require("../../src/domains/talent/services/completeness");

const SECTION_KEYS = [
  "personalInfo",
  "physicalProfile",
  "socialPortfolio",
  "skillsLifestyle",
  "availabilityLocations",
  "representation",
];

describe("Profile Completeness Calculation", () => {
  describe("Empty Profile", () => {
    test("should return 0% completeness for null profile", () => {
      const result = calculateProfileCompleteness(null, []);
      expect(result.percentage).toBe(0);
      expect(result.isComplete).toBe(false);
      expect(Object.keys(result.sections)).toHaveLength(0);
    });

    test("should return 0% completeness for empty profile object (no hardcoded sections)", () => {
      const result = calculateProfileCompleteness({}, []);
      expect(result.percentage).toBe(0);
      expect(result.isComplete).toBe(false);
      expect(Object.keys(result.sections).sort()).toEqual(
        [...SECTION_KEYS].sort(),
      );
      // Every section — including skillsLifestyle — must be incomplete on an
      // empty profile. skillsLifestyle used to be hardcoded `complete: true`;
      // that was the bug that made empty profiles score 12%.
      Object.values(result.sections).forEach((section) => {
        expect(section.complete).toBe(false);
        expect(section.status).toBe("incomplete");
      });
    });
  });

  describe("Section: Personal Information", () => {
    test("complete with first name, last name, and date_of_birth", () => {
      const profile = {
        first_name: "John",
        last_name: "Doe",
        date_of_birth: "1995-03-15",
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.personalInfo.complete).toBe(true);
    });

    test("accepts legacy dob field", () => {
      const profile = { first_name: "John", last_name: "Doe", dob: "1995-03-15" };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.personalInfo.complete).toBe(true);
    });

    test("incomplete when date_of_birth is missing", () => {
      const profile = { first_name: "John", last_name: "Doe" };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.personalInfo.complete).toBe(false);
    });

    test("incomplete when last name is missing", () => {
      const profile = { first_name: "John", date_of_birth: "1995-03-15" };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.personalInfo.complete).toBe(false);
    });
  });

  describe("Section: Physical Profile (core measurements)", () => {
    test("complete for womenswear track with bust/waist/hips", () => {
      const profile = {
        stats_track: "womenswear",
        height_cm: 175,
        bust_cm: 86,
        waist_cm: 61,
        hips_cm: 89,
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.physicalProfile.complete).toBe(true);
    });

    test("complete for menswear track with chest/waist/hips (chest required, bust does not substitute)", () => {
      const profile = {
        stats_track: "menswear",
        height_cm: 183,
        chest_cm: 100,
        waist_cm: 81,
        hips_cm: 96,
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.physicalProfile.complete).toBe(true);
    });

    test("incomplete for menswear track when only bust_cm is present (no chest_cm)", () => {
      const profile = {
        stats_track: "menswear",
        height_cm: 183,
        bust_cm: 100,
        waist_cm: 81,
        hips_cm: 96,
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.physicalProfile.complete).toBe(false);
    });

    test("incomplete when height is missing", () => {
      const profile = { bust_cm: 86, waist_cm: 61, hips_cm: 89 };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.physicalProfile.complete).toBe(false);
    });

    test("incomplete when waist/hips are missing", () => {
      const profile = { height_cm: 175, bust_cm: 86 };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.physicalProfile.complete).toBe(false);
    });
  });

  describe("Section: Social & Portfolio", () => {
    test("complete with a social handle and at least one image", () => {
      const profile = { instagram_handle: "@john_doe" };
      const images = [{ id: 1, path: "/uploads/image1.jpg" }];
      const result = calculateProfileCompleteness(profile, images);
      expect(result.sections.socialPortfolio.complete).toBe(true);
    });

    test("complete with a portfolio_url and at least one image", () => {
      const profile = { portfolio_url: "https://example.com" };
      const images = [{ id: 1, path: "/uploads/image1.jpg" }];
      const result = calculateProfileCompleteness(profile, images);
      expect(result.sections.socialPortfolio.complete).toBe(true);
    });

    test("incomplete when only images exist (no social/link)", () => {
      const images = [{ id: 1, path: "/uploads/image1.jpg" }];
      const result = calculateProfileCompleteness({}, images);
      expect(result.sections.socialPortfolio.complete).toBe(false);
      expect(result.sections.socialPortfolio.message).toBe("social");
    });

    test("incomplete when only a social handle exists (no images)", () => {
      const profile = { instagram_handle: "@john_doe" };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.socialPortfolio.complete).toBe(false);
      expect(result.sections.socialPortfolio.message).toBe("portfolio");
    });
  });

  describe("Section: Skills & Lifestyle (must reflect real data, never hardcoded)", () => {
    test("complete with a non-empty specialties array", () => {
      const profile = { specialties: JSON.stringify(["Editorial", "Commercial"]) };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.complete).toBe(true);
    });

    test("complete with a non-empty skills array", () => {
      const profile = { skills: JSON.stringify(["Runway", "Print"]) };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.complete).toBe(true);
    });

    test("complete with a non-empty languages array", () => {
      const profile = { languages: JSON.stringify(["English", "Spanish"]) };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.complete).toBe(true);
    });

    test("complete with specializations text", () => {
      const profile = { specializations: "Fitness modeling" };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.complete).toBe(true);
    });

    test("complete with sufficiently detailed training text", () => {
      const profile = { training: "Four years at a conservatory acting program." };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.complete).toBe(true);
    });

    test("incomplete on an empty profile (no hardcoded true)", () => {
      const result = calculateProfileCompleteness({}, []);
      expect(result.sections.skillsLifestyle.complete).toBe(false);
    });

    test("incomplete with an empty specialties array", () => {
      const profile = { specialties: JSON.stringify([]) };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.complete).toBe(false);
    });

    test("incomplete with malformed JSON (never throws)", () => {
      const profile = { specialties: "not valid json" };
      expect(() => calculateProfileCompleteness(profile, [])).not.toThrow();
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.complete).toBe(false);
    });

    test("does NOT count comfort_levels / content boundaries (moved to adult_context)", () => {
      const profile = { comfort_levels: JSON.stringify(["Swimwear", "Lingerie"]) };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.skillsLifestyle.complete).toBe(false);
      expect(result.sections.comfortBoundaries).toBeUndefined();
    });
  });

  describe("Section: Availability & Locations", () => {
    test("complete with schedule and a base city", () => {
      const profile = { availability_schedule: "Full-time", city: "New York" };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.availabilityLocations.complete).toBe(true);
    });

    test("complete with travel availability (false) and a secondary city", () => {
      const profile = { availability_travel: false, city_secondary: "Miami" };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.availabilityLocations.complete).toBe(true);
    });

    test("incomplete when only availability is set (no base city)", () => {
      const profile = { availability_schedule: "Full-time" };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.availabilityLocations.complete).toBe(false);
    });

    test("incomplete when only a city is set (no availability signal)", () => {
      const profile = { city: "New York" };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.availabilityLocations.complete).toBe(false);
    });
  });

  describe("Section: Representation", () => {
    test("complete when seeking_representation is explicitly true", () => {
      const profile = { seeking_representation: true };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.representation.complete).toBe(true);
    });

    test("complete when seeking_representation is explicitly false", () => {
      const profile = { seeking_representation: false };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.representation.complete).toBe(true);
    });

    test("incomplete when seeking_representation is null/undefined", () => {
      const result = calculateProfileCompleteness({}, []);
      expect(result.sections.representation.complete).toBe(false);
    });
  });

  describe("Sections removed by the Wave 2B field split", () => {
    test("comfortBoundaries and referencesEmergency are no longer completeness sections", () => {
      const profile = {
        comfort_levels: JSON.stringify(["Swimwear"]),
        reference_name: "Jane Smith",
        reference_email: "jane@example.com",
        reference_phone: "1234567890",
        emergency_contact_name: "John Doe",
        emergency_contact_phone: "0987654321",
        work_eligibility: true,
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.comfortBoundaries).toBeUndefined();
      expect(result.sections.referencesEmergency).toBeUndefined();
      // Filling in only moved-out fields must not move the score off 0%.
      expect(result.percentage).toBe(0);
    });
  });

  describe("Overall Completeness Percentage", () => {
    test("0% for an empty profile", () => {
      const result = calculateProfileCompleteness({}, []);
      expect(result.percentage).toBe(0);
      expect(result.isComplete).toBe(false);
    });

    test("floor(1/6 * 100) = 16% for exactly 1 of 6 sections complete", () => {
      const profile = {
        first_name: "John",
        last_name: "Doe",
        date_of_birth: "1995-03-15",
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.percentage).toBe(16);
      expect(result.isComplete).toBe(false);
    });

    test("50% for 3 of 6 sections complete", () => {
      const profile = {
        // personalInfo
        first_name: "John",
        last_name: "Doe",
        date_of_birth: "1995-03-15",
        // physicalProfile
        stats_track: "womenswear",
        height_cm: 175,
        bust_cm: 86,
        waist_cm: 61,
        hips_cm: 89,
        // skillsLifestyle
        specialties: JSON.stringify(["Editorial"]),
        // availabilityLocations / socialPortfolio / representation left empty
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.percentage).toBe(50);
      expect(result.isComplete).toBe(false);
    });

    test("100% when every section is genuinely complete", () => {
      const profile = {
        first_name: "John",
        last_name: "Doe",
        date_of_birth: "1995-03-15",
        stats_track: "womenswear",
        height_cm: 175,
        bust_cm: 86,
        waist_cm: 61,
        hips_cm: 89,
        specialties: JSON.stringify(["Editorial"]),
        availability_schedule: "Full-time",
        city: "New York",
        instagram_handle: "@johndoe",
        seeking_representation: true,
      };
      const images = [{ id: 1, path: "/uploads/image1.jpg" }];
      const result = calculateProfileCompleteness(profile, images);
      expect(result.percentage).toBe(100);
      expect(result.isComplete).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("handles null/undefined/empty-string values gracefully", () => {
      const profile = {
        first_name: null,
        last_name: undefined,
        date_of_birth: "",
      };
      const result = calculateProfileCompleteness(profile, []);
      expect(result.sections.personalInfo.complete).toBe(false);
    });

    test("handles a non-array images parameter without throwing", () => {
      const profile = { instagram_handle: "@john", portfolio_url: "https://example.com" };
      expect(() => calculateProfileCompleteness(profile, null)).not.toThrow();
      const result = calculateProfileCompleteness(profile, null);
      // No images present, so social/portfolio still requires a real image.
      expect(result.sections.socialPortfolio.complete).toBe(false);
    });

    test("preserves the return shape consumers rely on", () => {
      const result = calculateProfileCompleteness({}, []);
      expect(result).toHaveProperty("percentage");
      expect(result).toHaveProperty("isComplete");
      expect(result).toHaveProperty("sections");
      expect(result).toHaveProperty("nextSteps");
      expect(result).toHaveProperty("coreReady");
      expect(result).toHaveProperty("displayBreakdown");
    });
  });
});
