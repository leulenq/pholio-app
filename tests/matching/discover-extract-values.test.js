"use strict";

/**
 * WS4.3 — deterministic value extraction + reconciliation. Property-style
 * coverage over notation variants; the reconcile() gate is the LB-4 defense.
 */

const {
  extractHeightsCm,
  heightToCm,
  extractLengthsCm,
  lengthToCm,
  extractAges,
  parseSize,
  parseShoe,
  parseDateRange,
  reconcile,
} = require("../../src/domains/agency/services/discover/extract-values");

const REF = new Date("2026-07-01T00:00:00.000Z");

describe("height parsing — every notation of 5'9\" resolves to 175cm", () => {
  const variants = [
    '5\'9"',
    "5' 9",
    "5’9",
    "5 ft 9",
    "5 ft 9 in",
    "5 feet 9 in",
    "5 foot 9",
    "175cm",
    "175 cm",
    "1.75m",
    "1,75 m",
    "five nine",
    "five-nine",
    "five foot nine",
  ];
  test.each(variants)("%s -> 175", (input) => {
    expect(heightToCm(input)).toBe(175);
  });

  test("other heights", () => {
    expect(heightToCm('5\'10"')).toBe(178);
    expect(heightToCm("6'")).toBe(183);
    expect(heightToCm("6'0")).toBe(183);
    expect(heightToCm("1.8m")).toBe(180);
    expect(heightToCm("180cm")).toBe(180);
  });

  test("multiple heights in one span (range)", () => {
    expect(extractHeightsCm('5\'8" to 5\'11"')).toEqual([173, 180]);
  });

  test("unparseable height -> null / []", () => {
    expect(heightToCm("tall and striking")).toBeNull();
    expect(extractHeightsCm("")).toEqual([]);
  });
});

describe("length parsing", () => {
  test.each([['24"', 61], ["24 in", 61], ["24 inches", 61], ["61cm", 61], ["61 cm", 61]])(
    "%s -> %i cm",
    (input, cm) => {
      expect(lengthToCm(input)).toBe(cm);
    },
  );
  test("multiple lengths", () => {
    expect(extractLengthsCm('waist 24" hips 35"')).toEqual([61, 89]);
  });
});

describe("age extraction", () => {
  test("explicit range", () => {
    expect(extractAges("22 to 30")).toEqual([22, 30]);
  });
  test("decade phrasings", () => {
    expect(extractAges("40s")).toEqual([40, 49]);
    expect(extractAges("thirties")).toEqual([30, 39]);
  });
});

describe("size parsing (region-tagged)", () => {
  test("explicit region wins", () => {
    expect(parseSize("US 6")).toEqual({ value: "6", region: "US" });
    expect(parseSize("UK 8")).toEqual({ value: "8", region: "UK" });
    expect(parseSize("EU 38")).toEqual({ value: "38", region: "EU" });
  });
  test("default region when omitted", () => {
    expect(parseSize("size 6", { defaultRegion: "US" })).toEqual({
      value: "6",
      region: "US",
    });
    expect(parseSize("size 6", { defaultRegion: "UK" })).toEqual({
      value: "6",
      region: "UK",
    });
  });
  test("shoe", () => {
    expect(parseShoe("EU 40")).toEqual({ size: 40, region: "EU" });
    expect(parseShoe("size 9", { defaultRegion: "US" })).toEqual({
      size: 9,
      region: "US",
    });
  });
});

describe("date parsing (chrono, reference-anchored)", () => {
  test("explicit range July 9-14", () => {
    expect(parseDateRange("July 9-14", REF)).toEqual({
      from: "2026-07-09",
      to: "2026-07-14",
    });
  });
  test("single date", () => {
    expect(parseDateRange("July 9", REF)).toEqual({
      from: "2026-07-09",
      to: null,
    });
  });
  test("through June 26", () => {
    const r = parseDateRange("through June 26", new Date("2026-06-01T00:00:00Z"));
    expect(r.from).toBe("2026-06-26");
  });
  test("relative 'next week' resolves forward", () => {
    const r = parseDateRange("next week", REF);
    expect(r.from > "2026-07-01").toBe(true);
  });
  test("unparseable -> null", () => {
    expect(parseDateRange("sometime soon-ish maybe")).toBeNull();
  });
});

describe("reconcile() — the LB-4 gate", () => {
  test("agreeing height passes and applies", () => {
    const r = reconcile(
      { op: "min", a: 175, b: null, span: '5\'9"' },
      { kind: "height" },
    );
    expect(r).toEqual({ value: 175, agrees: true, needs_confirmation: false });
  });

  test("misparsed height (5'9\" claimed as 165) is caught", () => {
    const r = reconcile(
      { op: "min", a: 165, b: null, span: '5\'9"' },
      { kind: "height" },
    );
    expect(r.agrees).toBe(false);
    expect(r.needs_confirmation).toBe(true);
  });

  test("unparseable span needs confirmation and is not applied", () => {
    const r = reconcile(
      { op: "min", a: 175, b: null, span: "tall-ish" },
      { kind: "height" },
    );
    expect(r).toEqual({ value: null, agrees: false, needs_confirmation: true });
  });

  test("truncated date range (July 9-14 claimed as ending Jul 9) is caught", () => {
    const r = reconcile(
      { kind: "shoot", from: "2026-07-09", to: "2026-07-09", span: "July 9-14" },
      { kind: "date", now: REF },
    );
    expect(r.value).toEqual({ from: "2026-07-09", to: "2026-07-14" });
    expect(r.needs_confirmation).toBe(true);
  });

  test("agreeing date range passes", () => {
    const r = reconcile(
      { from: "2026-07-09", to: "2026-07-14", span: "July 9-14" },
      { kind: "date", now: REF },
    );
    expect(r.agrees).toBe(true);
    expect(r.needs_confirmation).toBe(false);
  });

  test("region mismatch on size is caught", () => {
    const r = reconcile(
      { value: "6", region: "UK", span: "US 6" },
      { kind: "size" },
    );
    expect(r.agrees).toBe(false);
    expect(r.needs_confirmation).toBe(true);
  });

  test("playing-age range agrees when both bounds re-parse", () => {
    const r = reconcile(
      { op: "between", a: 22, b: 30, span: "22 to 30" },
      { kind: "age" },
    );
    expect(r.agrees).toBe(true);
    expect(r.value).toEqual({ a: 22, b: 30 });
  });
});
