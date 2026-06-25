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
    },
    {
      id: "full",
      shot_type: "full_length",
      image_type: "digital",
      captured_at: daysAgo(10),
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
      },
      {
        id: "full",
        shot_type: "full_length",
        image_type: "digital",
        captured_at: daysAgo(100),
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
});
