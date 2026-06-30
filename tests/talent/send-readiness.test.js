"use strict";

const {
  evaluateSendReadiness,
} = require("../../src/domains/talent/services/send-readiness");
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

function freshDigitals() {
  return [
    {
      id: "headshot",
      shot_type: "headshot",
      image_type: "digital",
      captured_at: daysAgo(10),
      rights_status: "cleared",
      license_type: "owned",
      copyright_owner: "Alex River",
    },
    {
      id: "full",
      shot_type: "full_length",
      image_type: "digital",
      captured_at: daysAgo(10),
      rights_status: "cleared",
      license_type: "owned",
      copyright_owner: "Alex River",
    },
  ];
}

describe("evaluateSendReadiness", () => {
  test("core ready but missing contact is not send-ready", () => {
    const result = evaluateSendReadiness(
      { ...BASE_PROFILE, email: "", phone: "" },
      freshDigitals(),
    );

    expect(result.isCoreReady).toBe(true);
    expect(result.isSendReady).toBe(false);
    expect(result.sendBlockers.some((b) => b.code === "missing_contact")).toBe(
      true,
    );
  });

  test("stale digitals block send readiness", () => {
    const result = evaluateSendReadiness(BASE_PROFILE, [
      {
        id: "headshot",
        shot_type: "headshot",
        image_type: "digital",
        captured_at: daysAgo(100),
        rights_status: "cleared",
      },
      {
        id: "full",
        shot_type: "full_length",
        image_type: "digital",
        captured_at: daysAgo(100),
        rights_status: "cleared",
      },
    ]);

    expect(result.isSendReady).toBe(false);
    expect(result.sendBlockers.some((b) => b.code === "stale_digitals")).toBe(
      true,
    );
  });

  test("complete package is send-ready", () => {
    const result = evaluateSendReadiness(BASE_PROFILE, freshDigitals());

    expect(result.isCoreReady).toBe(true);
    expect(result.isSendReady).toBe(true);
    expect(result.sendBlockers).toHaveLength(0);
  });

  test("retouched digitals are blocked while retouched book frames remain allowed", () => {
    const blocked = evaluateSendReadiness(BASE_PROFILE, [
      ...freshDigitals().map((image, index) =>
        index === 0
          ? { ...image, retouched_at: "2026-06-01T00:00:00.000Z" }
          : image,
      ),
      {
        id: "book",
        shot_type: "editorial",
        image_type: "portfolio",
        retouched_at: "2026-06-01T00:00:00.000Z",
        ...freshDigitals()[0],
        image_type: "portfolio",
        shot_type: "editorial",
      },
    ]);
    expect(
      blocked.sendBlockers.some(
        (item) => item.code === "retouched_digital_not_allowed",
      ),
    ).toBe(true);

    const allowed = evaluateSendReadiness(BASE_PROFILE, [
      ...freshDigitals(),
      {
        ...freshDigitals()[0],
        id: "book",
        image_type: "portfolio",
        shot_type: "editorial",
        retouched_at: "2026-06-01T00:00:00.000Z",
      },
    ]);
    expect(
      allowed.sendBlockers.some(
        (item) => item.code === "retouched_digital_not_allowed",
      ),
    ).toBe(false);
  });

  test("minor without verified guardian consent is not send-ready", () => {
    const minor = {
      ...BASE_PROFILE,
      date_of_birth: "2012-01-01",
    };

    const result = evaluateSendReadiness(minor, freshDigitals());
    expect(result.isSendReady).toBe(false);
    expect(
      result.sendBlockers.some(
        (blocker) => blocker.code === "minor_guardian_consent_required",
      ),
    ).toBe(true);
    expect(
      result.sendBlockers.some(
        (blocker) => blocker.code === "guardian_agency_consent_required",
      ),
    ).toBe(false);
  });

  test("minor requires consent scoped to the selected agency", () => {
    const minor = {
      ...BASE_PROFILE,
      date_of_birth: "2012-01-01",
      guardian_consent_at: "2026-01-01T00:00:00.000Z",
    };

    const blocked = evaluateSendReadiness(minor, freshDigitals());
    expect(blocked.isSendReady).toBe(false);
    expect(
      blocked.sendBlockers.some(
        (blocker) => blocker.code === "guardian_agency_consent_required",
      ),
    ).toBe(true);

    const authorized = evaluateSendReadiness(
      minor,
      freshDigitals(),
      new Map(),
      { agencyConsentGranted: true },
    );
    expect(
      authorized.sendBlockers.some(
        (blocker) => blocker.code === "guardian_agency_consent_required",
      ),
    ).toBe(false);
  });

  test("men can satisfy measurements via chest and must provide chest", () => {
    const withChest = evaluateSendReadiness(
      {
        ...BASE_PROFILE,
        gender: "Male",
        bust: null,
        bust_cm: null,
        chest_cm: 96,
      },
      freshDigitals(),
    );
    expect(withChest.isSendReady).toBe(true);
    expect(
      withChest.sendBlockers.some((b) => b.code === "missing_measurements"),
    ).toBe(false);

    const withoutChest = evaluateSendReadiness(
      {
        ...BASE_PROFILE,
        gender: "Male",
        chest: null,
        chest_cm: null,
        bust_cm: 90,
      },
      freshDigitals(),
    );
    expect(withoutChest.isSendReady).toBe(false);
    expect(
      withoutChest.sendBlockers.some((b) => b.code === "missing_measurements"),
    ).toBe(true);
  });

  test("missing distribution rights blocks send readiness", () => {
    const result = evaluateSendReadiness(BASE_PROFILE, [
      {
        id: "headshot",
        shot_type: "headshot",
        image_type: "digital",
        captured_at: daysAgo(10),
        rights_status: "cleared",
      },
      {
        id: "full",
        shot_type: "full_length",
        image_type: "digital",
        captured_at: daysAgo(10),
      },
    ]);

    expect(result.isSendReady).toBe(false);
    expect(
      result.sendBlockers.some((b) => b.code === "missing_distribution_rights"),
    ).toBe(true);
  });
});
