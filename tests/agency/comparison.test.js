"use strict";

/**
 * Comparison view (plan A4 #4): "side-by-side, uniform fields and crops. The
 * digital equivalent of comp cards on a table."
 *
 * Comp cards on a table work because every card is the same size, carries the
 * same fields in the same order, and shows the same shots — and because nothing
 * on the table ranks anything. These tests hold that shape, since it is the
 * only thing separating this feature from the match-scoring apparatus A1
 * forbids and this codebase already removed once.
 */

const {
  COMPARISON_FIELDS,
  COMPARISON_SLOTS,
  MAX_COMPARED,
  comparisonRecord,
} = require("../../src/domains/agency/services/comparison");

const application = (id, overrides = {}) => ({
  id,
  status: "pending",
  created_at: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

const frozen = (profile = {}, images = []) => ({
  profile: {
    first_name: "Ada",
    last_name: "Editorial",
    height_cm: 178,
    waist_cm: 61,
    city: "New York",
    ...profile,
  },
  images,
});

const frame = (shotType) => ({
  id: `img-${shotType}`,
  shot_type: shotType,
  image_type: "digital",
  public_url: `https://cdn.example/${shotType}.jpg`,
  path: `/u/${shotType}.jpg`,
  sort: 0,
});

describe("every record is the same shape", () => {
  test("all applicants return every field, in the same order", () => {
    const sparse = comparisonRecord({
      application: application("a1"),
      frozen: frozen({ waist_cm: null, hips_cm: null }),
      minor: false,
    });
    const full = comparisonRecord({
      application: application("a2"),
      frozen: frozen({ hips_cm: 89, shoe_size: "40", hair_color: "Brown" }),
      minor: false,
    });

    const keys = COMPARISON_FIELDS.map((f) => f.key);
    expect(sparse.fields.map((f) => f.key)).toEqual(keys);
    expect(full.fields.map((f) => f.key)).toEqual(keys);
  });

  test("all applicants return every slot, in comp-card order", () => {
    const record = comparisonRecord({
      application: application("a1"),
      frozen: frozen({}, [frame("headshot")]),
      minor: false,
    });
    expect(record.slots.map((s) => s.key)).toEqual(
      COMPARISON_SLOTS.map((s) => s.key),
    );
  });

  test("track-specific fields are declared for everyone, not swapped per applicant", () => {
    // A menswear and a womenswear applicant compared side by side must still
    // line up row for row; the empty cell is the true answer.
    const keys = COMPARISON_FIELDS.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["bust", "chest", "dress", "suit"]));
  });
});

describe("a gap is a gap", () => {
  test("a measurement the applicant did not give is null, not a placeholder", () => {
    const record = comparisonRecord({
      application: application("a1"),
      frozen: frozen({ waist_cm: null, inseam_cm: undefined, shoe_size: "" }),
      minor: false,
    });
    const value = (key) => record.fields.find((f) => f.key === key).value;

    expect(value("waist")).toBeNull();
    expect(value("inseam")).toBeNull();
    expect(value("shoe")).toBeNull();
    // Never a zero, a dash or an estimate — each would read as a measurement.
    expect(value("waist")).not.toBe(0);
    expect(value("waist")).not.toBe("—");
  });

  test("a slot with no frame stays empty rather than borrowing another shot", () => {
    const record = comparisonRecord({
      application: application("a1"),
      frozen: frozen({}, [frame("headshot")]),
      minor: false,
    });
    const slot = (key) => record.slots.find((s) => s.key === key);

    expect(slot("headshot").image).not.toBeNull();
    // Uniformity is the point: a full-length cell showing a headshot would make
    // the row lie.
    expect(slot("full_length").image).toBeNull();
    expect(slot("profile").image).toBeNull();
  });

  test("an application with no frozen package still returns the full shape", () => {
    const record = comparisonRecord({
      application: application("a1"),
      frozen: null,
      minor: false,
    });
    expect(record.fields).toHaveLength(COMPARISON_FIELDS.length);
    expect(record.slots).toHaveLength(COMPARISON_SLOTS.length);
    expect(record.hasSnapshot).toBe(false);
    expect(record.name).toBe("Unknown applicant");
  });
});

describe("nothing here ranks anything", () => {
  test("a record carries no score, rank, rating or match of any kind", () => {
    const record = comparisonRecord({
      application: application("a1"),
      frozen: frozen(),
      minor: false,
    });
    const serialized = JSON.stringify(record).toLowerCase();
    for (const forbidden of ["score", "rank", "rating", "match", "percentile", "fit_"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("no date of birth reaches the comparison — banded age only", () => {
    const record = comparisonRecord({
      application: application("a1"),
      frozen: frozen({ date_of_birth: "1999-04-02" }),
      minor: false,
    });
    expect(JSON.stringify(record)).not.toContain("1999-04-02");
    expect(record).not.toHaveProperty("dateOfBirth");
  });
});

describe("a minor's body frames are withheld, and the gap is explained", () => {
  test("only the headshot survives, and the record says why", () => {
    const record = comparisonRecord({
      application: application("a1"),
      frozen: frozen({}, [frame("headshot"), frame("full_length"), frame("profile")]),
      minor: true,
    });
    const slot = (key) => record.slots.find((s) => s.key === key);

    expect(slot("headshot").image).not.toBeNull();
    expect(slot("full_length").image).toBeNull();
    expect(slot("profile").image).toBeNull();
    // Without this a reviewer reads a withheld column as an applicant who sent
    // nothing.
    expect(record.withheldForMinor).toBe(true);
  });
});

describe("the table has a size", () => {
  test("six, which is what fits at a comparable scale", () => {
    expect(MAX_COMPARED).toBe(6);
  });
});
