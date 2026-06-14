const {
  buildStatsBlock,
  resolveStatsCategory,
  cmToFeetInches,
  cmToInchesHalf,
  shoeDual,
  dressDual,
} = require("../composition/stats-formatter");

/** Fixed "now" so age math from date_of_birth is deterministic. */
const NOW = new Date("2026-06-10T12:00:00.000Z");

function womanProfile(overrides = {}) {
  return {
    gender: "Female",
    height_cm: 178,
    bust_cm: 86,
    waist_cm: 61,
    hips_cm: 89,
    dress_size: "4",
    shoe_size: "9",
    hair_color: "dark brown",
    eye_color: "green",
    ...overrides,
  };
}

function manProfile(overrides = {}) {
  return {
    gender: "Male",
    height_cm: 178,
    bust_cm: 102,
    waist_cm: 81,
    inseam_cm: 81,
    shoe_size: "10",
    hair_color: "black",
    eye_color: "brown",
    ...overrides,
  };
}

function lineMap(block) {
  return Object.fromEntries(block.lines.map((l) => [l.key, l.value]));
}

describe("cmToFeetInches", () => {
  test("178 cm → 5'10\"", () => {
    expect(cmToFeetInches(178)).toBe("5'10\"");
  });

  test("163 cm → 5'4\"", () => {
    expect(cmToFeetInches(163)).toBe("5'4\"");
  });

  test("carries 12 inches into feet (183 cm → 6'0\")", () => {
    expect(cmToFeetInches(183)).toBe("6'0\"");
  });

  test("null / invalid input → null", () => {
    expect(cmToFeetInches(null)).toBeNull();
    expect(cmToFeetInches(undefined)).toBeNull();
    expect(cmToFeetInches("not-a-number")).toBeNull();
    expect(cmToFeetInches(0)).toBeNull();
  });
});

describe("cmToInchesHalf", () => {
  test("rounds to nearest whole inch (86 cm → 34)", () => {
    expect(cmToInchesHalf(86)).toBe(34);
  });

  test("rounds to nearest half inch (87 cm → 34.5, 62 cm → 24.5)", () => {
    expect(cmToInchesHalf(87)).toBe(34.5);
    expect(cmToInchesHalf(62)).toBe(24.5);
  });

  test("null input → null", () => {
    expect(cmToInchesHalf(null)).toBeNull();
  });
});

describe("shoeDual", () => {
  test('bare US number: "9" women → US 9 / EU 40', () => {
    expect(shoeDual("9", "women")).toBe("US 9 / EU 40");
  });

  test('half size: "8.5" women → US 8.5 / EU 39.5', () => {
    expect(shoeDual("8.5", "women")).toBe("US 8.5 / EU 39.5");
  });

  test('labeled US: "9.5 US" men → US 9.5 / EU 42.5 (men offset +33)', () => {
    expect(shoeDual("9.5 US", "men")).toBe("US 9.5 / EU 42.5");
  });

  test('labeled EU: "40 EU" women → converted back (US 9 / EU 40)', () => {
    expect(shoeDual("40 EU", "women")).toBe("US 9 / EU 40");
  });

  test('bare number ≥ 32 assumed EU: "40" women → US 9 / EU 40', () => {
    expect(shoeDual("40", "women")).toBe("US 9 / EU 40");
  });

  test("kids sizes render natively without conversion", () => {
    expect(shoeDual("13", "kids")).toBe("US 13");
  });

  test("non-numeric renders as-is", () => {
    expect(shoeDual("nine-ish", "women")).toBe("nine-ish");
  });

  test("missing → null", () => {
    expect(shoeDual(null, "women")).toBeNull();
    expect(shoeDual("  ", "women")).toBeNull();
  });
});

describe("dressDual", () => {
  test('"4" → US 4 / EU 36', () => {
    expect(dressDual("4")).toBe("US 4 / EU 36");
  });

  test('"6" → US 6 / EU 38', () => {
    expect(dressDual("6")).toBe("US 6 / EU 38");
  });

  test('non-numeric "S" renders as-is (US only)', () => {
    expect(dressDual("S")).toBe("S");
  });

  test("missing → null", () => {
    expect(dressDual(null)).toBeNull();
  });
});

describe("resolveStatsCategory", () => {
  test("gender casing variants resolve ('male' → men, 'FEMALE' → women)", () => {
    expect(resolveStatsCategory({ gender: "male" }, NOW)).toBe("men");
    expect(resolveStatsCategory({ gender: "FEMALE" }, NOW)).toBe("women");
  });

  test("age column < 18 → kids, beating gender", () => {
    expect(resolveStatsCategory({ gender: "Male", age: 12 }, NOW)).toBe("kids");
  });

  test('date_of_birth "2012-03-15" → kids (age 14 at reference date)', () => {
    expect(
      resolveStatsCategory(
        { gender: "Female", date_of_birth: "2012-03-15" },
        NOW,
      ),
    ).toBe("kids");
  });

  test("date_of_birth ISO timestamp DB quirk → kids", () => {
    expect(
      resolveStatsCategory(
        { gender: "Female", date_of_birth: "2012-03-15T05:00:00.000Z" },
        NOW,
      ),
    ).toBe("kids");
  });

  test("adult DOB stays on the gender track", () => {
    expect(
      resolveStatsCategory(
        { gender: "Female", date_of_birth: "1995-03-15T05:00:00.000Z" },
        NOW,
      ),
    ).toBe("women");
  });

  test("non-binary with bust_cm → women; unknown without bust → men", () => {
    expect(
      resolveStatsCategory({ gender: "Non-binary", bust_cm: 86 }, NOW),
    ).toBe("women");
    expect(resolveStatsCategory({ gender: null }, NOW)).toBe("men");
  });

  test("unknown gender with legacy measurements bust → women", () => {
    expect(
      resolveStatsCategory({ gender: "Other", measurements: "32-25-35" }, NOW),
    ).toBe("women");
  });
});

describe("buildStatsBlock — women track", () => {
  test("full profile renders exact dual-unit lines in women order", () => {
    const block = buildStatsBlock(womanProfile(), { referenceDate: NOW });

    expect(block.category).toBe("women");
    expect(block.isFitness).toBe(false);
    expect(block.units).toBe("dual");
    expect(block.lines.map((l) => l.key)).toEqual([
      "height",
      "bust",
      "waist",
      "hips",
      "dress",
      "shoes",
      "hair",
      "eyes",
    ]);
    expect(lineMap(block)).toEqual({
      height: "178 cm / 5'10\"",
      bust: '86 cm / 34"',
      waist: '61 cm / 24"',
      hips: '89 cm / 35"',
      dress: "US 4 / EU 36",
      shoes: "US 9 / EU 40",
      hair: "Dark Brown",
      eyes: "Green",
    });
    expect(block.warnings).toEqual([]);
  });

  test("labels are uppercase and inline strip joins with middots", () => {
    const block = buildStatsBlock(womanProfile(), { referenceDate: NOW });
    expect(block.lines[0].label).toBe("HEIGHT");
    expect(block.inline.startsWith("HEIGHT 178 CM / 5'10\"  ·  BUST 86 CM / 34\"")).toBe(
      true,
    );
    expect(block.inline).toContain("HAIR DARK BROWN");
  });

  test('non-numeric dress size "S" renders as-is', () => {
    const block = buildStatsBlock(womanProfile({ dress_size: "S" }), {
      referenceDate: NOW,
    });
    expect(lineMap(block).dress).toBe("S");
  });

  test("imperial units", () => {
    const block = buildStatsBlock(womanProfile(), {
      units: "imperial",
      referenceDate: NOW,
    });
    expect(block.units).toBe("imperial");
    expect(lineMap(block)).toMatchObject({
      height: "5'10\"",
      bust: '34"',
      dress: "US 4",
      shoes: "US 9",
    });
  });

  test("metric units", () => {
    const block = buildStatsBlock(womanProfile(), {
      units: "metric",
      referenceDate: NOW,
    });
    expect(lineMap(block)).toMatchObject({
      height: "178 cm",
      bust: "86 cm",
      dress: "EU 36",
      shoes: "EU 40",
    });
  });

  test("invalid units option falls back to dual", () => {
    const block = buildStatsBlock(womanProfile(), {
      units: "banana",
      referenceDate: NOW,
    });
    expect(block.units).toBe("dual");
    expect(lineMap(block).height).toBe("178 cm / 5'10\"");
  });
});

describe("buildStatsBlock — men track", () => {
  test("full profile renders chest/inseam/suit in men order", () => {
    const block = buildStatsBlock(manProfile(), { referenceDate: NOW });

    expect(block.category).toBe("men");
    expect(block.lines.map((l) => l.key)).toEqual([
      "height",
      "chest",
      "waist",
      "inseam",
      "suit",
      "shoes",
      "hair",
      "eyes",
    ]);
    expect(lineMap(block)).toEqual({
      height: "178 cm / 5'10\"",
      chest: '102 cm / 40"',
      waist: '81 cm / 32"',
      inseam: '81 cm / 32"',
      suit: "40R",
      shoes: "US 10 / EU 43",
      hair: "Black",
      eyes: "Brown",
    });
  });

  test("suit S/R/L boundaries at 173 and 183 cm", () => {
    const suitAt = (height_cm) =>
      lineMap(
        buildStatsBlock(manProfile({ height_cm }), { referenceDate: NOW }),
      ).suit;
    expect(suitAt(172)).toBe("40S");
    expect(suitAt(173)).toBe("40R");
    expect(suitAt(183)).toBe("40R");
    expect(suitAt(184)).toBe("40L");
  });

  test("suit skipped with warning when height is missing", () => {
    const block = buildStatsBlock(manProfile({ height_cm: null }), {
      referenceDate: NOW,
    });
    expect(lineMap(block).suit).toBeUndefined();
    expect(block.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Suit size unavailable/),
        expect.stringMatching(/Height missing/),
      ]),
    );
  });
});

describe("buildStatsBlock — kids track", () => {
  test("kids resolved from DOB: age shown, no bust/waist/hips, clothing as-is", () => {
    const block = buildStatsBlock(
      {
        gender: "Female",
        date_of_birth: "2012-03-15T05:00:00.000Z",
        height_cm: 150,
        bust_cm: 70,
        waist_cm: 58,
        hips_cm: 72,
        dress_size: "8",
        shoe_size: "4",
        hair_color: "blonde",
        eye_color: "blue",
      },
      { referenceDate: NOW },
    );

    expect(block.category).toBe("kids");
    expect(block.lines.map((l) => l.key)).toEqual([
      "age",
      "height",
      "clothing_size",
      "shoes",
      "hair",
      "eyes",
    ]);
    expect(lineMap(block)).toEqual({
      age: "14",
      height: "150 cm / 4'11\"",
      clothing_size: "8",
      shoes: "US 4",
      hair: "Blonde",
      eyes: "Blue",
    });
    expect(block.lines[2].label).toBe("CLOTHING SIZE");
    expect(block.omitted).toEqual(
      expect.arrayContaining([
        { key: "bust", reason: "Kids cards never show body measurements." },
        { key: "waist", reason: "Kids cards never show body measurements." },
        { key: "hips", reason: "Kids cards never show body measurements." },
      ]),
    );
  });

  test("kids resolved from age column", () => {
    const block = buildStatsBlock(
      { gender: "Male", age: 10, height_cm: 140, shoe_size: "2" },
      { referenceDate: NOW },
    );
    expect(block.category).toBe("kids");
    expect(lineMap(block).age).toBe("10");
  });
});

describe("buildStatsBlock — fitness", () => {
  test("fitness signal from marketSignals enables weight after height", () => {
    const block = buildStatsBlock(
      womanProfile({ weight_kg: 64 }),
      {
        referenceDate: NOW,
        signals: { marketSignals: ["athletic build"], lookType: "commercial" },
      },
    );
    expect(block.isFitness).toBe(true);
    expect(block.lines[0].key).toBe("height");
    expect(block.lines[1].key).toBe("weight");
    expect(lineMap(block).weight).toBe("64 kg / 141 lbs");
  });

  test("fitness signal from array; weight_lbs-only converts to kg", () => {
    const block = buildStatsBlock(
      manProfile({ weight_lbs: 141 }),
      { referenceDate: NOW, signals: ["fitness"] },
    );
    expect(block.isFitness).toBe(true);
    expect(lineMap(block).weight).toBe("64 kg / 141 lbs");
  });

  test("imperial / metric weight rendering", () => {
    const imperial = buildStatsBlock(womanProfile({ weight_kg: 64 }), {
      referenceDate: NOW,
      units: "imperial",
      signals: ["fitness"],
    });
    const metric = buildStatsBlock(womanProfile({ weight_kg: 64 }), {
      referenceDate: NOW,
      units: "metric",
      signals: ["fitness"],
    });
    expect(lineMap(imperial).weight).toBe("141 lbs");
    expect(lineMap(metric).weight).toBe("64 kg");
  });

  test("non-fitness profile with weight gets no weight line + omission reason", () => {
    const block = buildStatsBlock(womanProfile({ weight_kg: 64 }), {
      referenceDate: NOW,
    });
    expect(lineMap(block).weight).toBeUndefined();
    expect(block.omitted).toEqual(
      expect.arrayContaining([
        { key: "weight", reason: "Weight is only printed for fitness talent." },
      ]),
    );
  });
});

describe("buildStatsBlock — legacy measurements fallback", () => {
  test('"32-25-35" (inches) converts to cm', () => {
    const block = buildStatsBlock(
      womanProfile({
        bust_cm: null,
        waist_cm: null,
        hips_cm: null,
        measurements: "32-25-35",
      }),
      { referenceDate: NOW },
    );
    expect(lineMap(block)).toMatchObject({
      bust: '81 cm / 32"',
      waist: '64 cm / 25"',
      hips: '89 cm / 35"',
    });
  });

  test('"86-61-89" (values > 50 are already cm) used directly', () => {
    const block = buildStatsBlock(
      womanProfile({
        bust_cm: null,
        waist_cm: null,
        hips_cm: null,
        measurements: "86-61-89",
      }),
      { referenceDate: NOW },
    );
    expect(lineMap(block)).toMatchObject({
      bust: '86 cm / 34"',
      waist: '61 cm / 24"',
      hips: '89 cm / 35"',
    });
  });

  test("*_cm columns win over legacy measurements", () => {
    const block = buildStatsBlock(
      womanProfile({ bust_cm: 90, measurements: "32-25-35" }),
      { referenceDate: NOW },
    );
    expect(lineMap(block).bust).toBe('90 cm / 35.5"');
  });

  test("men's chest sources from legacy measurements first value", () => {
    const block = buildStatsBlock(
      manProfile({ bust_cm: null, measurements: "40-32-38" }),
      { referenceDate: NOW },
    );
    expect(lineMap(block).chest).toBe('102 cm / 40"');
    expect(lineMap(block).suit).toBe("40R");
  });
});

describe("buildStatsBlock — missing data & overrides", () => {
  test("height_cm null: no height line, no placeholder, warning recorded", () => {
    const block = buildStatsBlock(womanProfile({ height_cm: null }), {
      referenceDate: NOW,
    });
    expect(lineMap(block).height).toBeUndefined();
    expect(block.lines.some((l) => l.value.includes("—"))).toBe(false);
    expect(block.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/Height missing/)]),
    );
  });

  test("missing hair color skips line with warning", () => {
    const block = buildStatsBlock(womanProfile({ hair_color: null }), {
      referenceDate: NOW,
    });
    expect(lineMap(block).hair).toBeUndefined();
    expect(block.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/Hair color missing/)]),
    );
  });

  test("explicit category override beats auto-resolution", () => {
    const block = buildStatsBlock(womanProfile(), {
      category: "men",
      referenceDate: NOW,
    });
    expect(block.category).toBe("men");
    expect(block.lines.map((l) => l.key)).toContain("chest");
    expect(block.lines.map((l) => l.key)).not.toContain("bust");
  });

  test("unknown gender adds an inference warning", () => {
    const block = buildStatsBlock(
      womanProfile({ gender: "Non-binary" }),
      { referenceDate: NOW },
    );
    expect(block.category).toBe("women");
    expect(block.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/inferred from available/)]),
    );
  });

  test("adult with DOB never gets an age line but records the omission", () => {
    const block = buildStatsBlock(
      womanProfile({ date_of_birth: "1995-03-15T05:00:00.000Z" }),
      { referenceDate: NOW },
    );
    expect(lineMap(block).age).toBeUndefined();
    expect(block.omitted).toEqual(
      expect.arrayContaining([
        { key: "age", reason: "Age/DOB is never printed for adults." },
      ]),
    );
  });

  test("empty profile returns empty lines and warnings, never throws", () => {
    const block = buildStatsBlock({}, { referenceDate: NOW });
    expect(block.lines).toEqual([]);
    expect(block.inline).toBe("");
    expect(block.warnings.length).toBeGreaterThan(0);
  });
});
