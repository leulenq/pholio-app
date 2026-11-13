"use strict";

const {
  buildSubmissionProfileSnapshot,
} = require("../../src/shared/lib/submission-profile");

const NOW = new Date("2026-07-01T12:00:00.000Z");

describe("buildSubmissionProfileSnapshot — minors (audit P0-2)", () => {
  const minor = {
    id: "p1",
    slug: "lily-park",
    first_name: "Lily",
    last_name: "Park",
    city: "Chicago",
    gender: "Female",
    stats_track: "womenswear",
    date_of_birth: "2012-03-15",
    height_cm: 160,
    bust_cm: 78,
    chest_cm: 80,
    waist_cm: 58,
    hips_cm: 82,
    inseam_cm: 70,
    shoe_size: "5",
    dress_size: "8",
    hair_color: "brown",
    eye_color: "green",
    guardian_consent_at: "2026-01-01T00:00:00.000Z",
    phone: "+1 312 555 0100",
  };

  test("strips body measurements and exact age from the frozen snapshot", () => {
    const snapshot = buildSubmissionProfileSnapshot(minor, {
      social: [{ platform: "instagram", handle: "lily", url: "https://instagram.com/lily", verified: false }],
    });

    expect(snapshot.is_minor).toBe(true);
    expect(snapshot.age_band).toBe("under_18");
    expect(snapshot.age).toBeNull();
    expect(snapshot.bust_cm).toBeNull();
    expect(snapshot.chest_cm).toBeNull();
    expect(snapshot.waist_cm).toBeNull();
    expect(snapshot.hips_cm).toBeNull();
    expect(snapshot.inseam_cm).toBeNull();
    expect(snapshot.height_cm).toBe(160);
    expect(snapshot.stats.kids).toBe(true);
    expect(snapshot.stats.fields.map((f) => f.key)).not.toEqual(
      expect.arrayContaining(["bust", "waist", "hips", "chest", "inseam", "age"]),
    );
    expect(snapshot.social).toEqual([]);
  });

  test("an adult snapshot still carries the body set", () => {
    const snapshot = buildSubmissionProfileSnapshot({
      ...minor,
      date_of_birth: "1998-01-01",
      guardian_consent_at: null,
    });
    expect(snapshot.is_minor).toBe(false);
    expect(snapshot.age).toBeGreaterThanOrEqual(18);
    expect(snapshot.bust_cm).toBe(78);
    expect(snapshot.stats.kids).toBe(false);
  });
});
