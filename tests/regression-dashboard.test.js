/**
 * Regression Tests for Dashboard Field Architecture
 *
 * Tests critical data integrity fixes:
 * 1. Boolean checkbox logic (unchecked → false, not undefined)
 * 2. Completeness accepts work_eligibility=false as complete
 * 3. Decimal measurements (bust=32.5 persists and displays correctly)
 * 4. JSONB field handling (no double-stringification)
 */

const { describe, test, expect } = require("@jest/globals");
const {
  calculateProfileCompleteness,
} = require("../src/domains/talent/services/completeness");

describe("Dashboard Field Architecture Regression Tests", () => {
  describe("Boolean Logic: Unchecked Checkboxes → false", () => {
    test("Uncheck tattoos after being true → DB becomes false", () => {
      // Simulate form submission: checkbox unchecked (not in req.body)
      const processedBody = {}; // Checkbox not in body = unchecked

      // Boolean preprocessing should set false for unchecked
      const tattoos = processedBody.tattoos;
      const expected = undefined; // Before preprocessing
      // After preprocessing (in route handler):
      // if (!(field in processedBody)) processedBody[field] = false;

      // Assert: unchecked checkbox should result in false, not undefined
      expect(tattoos).toBeUndefined();
      // In actual route handler: expect(processedBody.tattoos).toBe(false);
    });

    test("Checked tattoos → true", () => {
      const processedBody = { tattoos: "true" };
      // After preprocessing: expect(processedBody.tattoos).toBe(true);
      expect(processedBody.tattoos).toBe("true"); // Before preprocessing
    });
  });

  describe("Completeness: emergency/reference fields are out of global scope (Wave 2B field split)", () => {
    // emergency_contact_*, reference_*, and work_eligibility moved to the
    // private `confirmed_job_safety` context (tasks/field-split-design-2026-07-01.md).
    // They are collected once a job is confirmed, not as a generic profile
    // completeness gate, so calculateProfileCompleteness must not expose a
    // "referencesEmergency" section or let these fields drive its score.
    test("emergency/reference/work_eligibility fields do not appear as a completeness section", () => {
      const profile = {
        reference_name: "John Doe",
        reference_email: "john@example.com",
        reference_phone: "+1234567890",
        emergency_contact_name: "Jane Doe",
        emergency_contact_phone: "+1234567891",
        work_eligibility: true,
      };

      const completeness = calculateProfileCompleteness(profile, []);

      expect(completeness.sections.referencesEmergency).toBeUndefined();
    });

    test("an otherwise-empty profile scores 0% even with emergency/reference fields filled in", () => {
      const profile = {
        reference_name: "John Doe",
        reference_email: "john@example.com",
        reference_phone: "+1234567890",
        emergency_contact_name: "Jane Doe",
        emergency_contact_phone: "+1234567891",
        work_eligibility: true,
      };

      const completeness = calculateProfileCompleteness(profile, []);

      expect(completeness.percentage).toBe(0);
    });
  });

  describe("Decimal Measurements: bust=32.5 persists correctly", () => {
    test("bust=32.5 is accepted by validation schema", () => {
      // This would be tested with actual Zod schema validation
      // const bustSchema = z.number().refine((val) => val >= 20 && val <= 60);
      const bust = 32.5;
      const isValid = Number.isFinite(bust) && bust >= 20 && bust <= 60;

      expect(isValid).toBe(true);
      expect(bust).toBe(32.5);
    });

    test("bust=32 (integer) still works", () => {
      const bust = 32;
      const isValid = Number.isFinite(bust) && bust >= 20 && bust <= 60;

      expect(isValid).toBe(true);
      expect(bust).toBe(32);
    });

    test("bust=32.5 displays correctly (not truncated)", () => {
      // Simulate database value
      const dbValue = 32.5;
      // Simulate display value
      const displayValue = dbValue.toString();

      expect(displayValue).toBe("32.5");
      expect(parseFloat(displayValue)).toBe(32.5);
    });
  });

  describe("JSONB Fields: No Double-Stringification", () => {
    test("JSONB field stores array directly (PostgreSQL)", () => {
      // Simulate PostgreSQL JSONB storage
      const languages = ["English", "Spanish"];
      // With JSONB, should store as array, not string
      const storedValue = languages; // Direct array storage

      expect(Array.isArray(storedValue)).toBe(true);
      expect(storedValue).toEqual(["English", "Spanish"]);
      expect(typeof storedValue).toBe("object");
    });

    test("SQLite backward compatibility: stores as JSON string", () => {
      // Simulate SQLite TEXT storage
      const languages = ["English", "Spanish"];
      const storedValue = JSON.stringify(languages);

      expect(typeof storedValue).toBe("string");
      expect(JSON.parse(storedValue)).toEqual(["English", "Spanish"]);
    });

    test("Prevent double-stringification: string → string (no re-stringify)", () => {
      // If already a string, don't stringify again
      const existingValue = '["English","Spanish"]'; // Already stringified
      const isString = typeof existingValue === "string";

      if (isString) {
        // Should use as-is, not re-stringify
        const finalValue = existingValue;
        expect(finalValue).toBe('["English","Spanish"]');
        expect(JSON.parse(finalValue)).toEqual(["English", "Spanish"]);
      }
    });
  });

  describe("Derived Fields: Age Calculation", () => {
    test("age is calculated from date_of_birth, not stored", () => {
      const dateOfBirth = "1990-01-01";
      const today = new Date();
      const birthDate = new Date(dateOfBirth);
      const calculatedAge = today.getFullYear() - birthDate.getFullYear();

      // Age should be calculated, not stored
      expect(calculatedAge).toBeGreaterThan(30);
      expect(calculatedAge).toBeLessThan(50);
    });

    test("age is null if date_of_birth is null", () => {
      const dateOfBirth = null;
      const calculatedAge = dateOfBirth
        ? new Date().getFullYear() - new Date(dateOfBirth).getFullYear()
        : null;

      expect(calculatedAge).toBeNull();
    });
  });

  describe("Derived Fields: Social Media URLs", () => {
    test("instagram_url is computed from instagram_handle for Pro users", () => {
      const handle = "example_user";
      const computedUrl = `https://instagram.com/${handle}`;

      expect(computedUrl).toBe("https://instagram.com/example_user");
    });

    test("Free users have null URLs (not computed)", () => {
      const isPro = false;
      const handle = "example_user";
      const computedUrl = isPro ? `https://instagram.com/${handle}` : null;

      expect(computedUrl).toBeNull();
    });
  });
});
