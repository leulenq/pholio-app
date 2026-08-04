"use strict";

const {
  buildDiscoverIndexText,
  buildVisualIndexText,
  buildCastingIndexText,
  buildMarketIndexText,
  buildLexicalDocument,
  flattenImageAnalysis,
  deriveAgeBand,
} = require("../../src/domains/ai/embeddings");
const {
  stripSensitiveVisionFields,
} = require("../../src/domains/ai/analyzeProfileImage");

// Compliance guardrail (Discover WS2 / council review LB-7.2): protected
// Selection corpora are deliberately narrower than display/filter fields.
// Names, location, demographics, appearance, free text, image-derived output,
// and physical stats must never reach an embedding or lexical document.

// DOB computed relative to "now" so the derived band is stable over time
// (~27 years old, comfortably inside the "late twenties" band).
const dob = new Date();
dob.setFullYear(dob.getFullYear() - 27);
dob.setMonth(dob.getMonth() - 3);
const DOB_ISO = dob.toISOString();

const fixtureProfile = {
  first_name: "Ama",
  last_name: "Testcase",
  gender: "Female",
  city: "Lagos",
  date_of_birth: DOB_ISO,
  age: 27, // deprecated column — must never be indexed as an exact value
  skin_tone: "Deep ebony",
  ethnicity: JSON.stringify(["Korean", "Nigerian"]),
  hair_color: "Black",
  eye_color: "Brown",
  height_cm: 175,
  body_type: "Athletic",
  archetype: "Editorial Icon",
  experience_level: "New face",
  modeling_categories: JSON.stringify(["editorial", "curve"]),
  bio_curated: "A commanding presence on set.",
  look_descriptor: "Angular editorial face with commercial warmth.",
  image_analysis: JSON.stringify({
    skinTone: "warm golden undertones with deep ebony richness",
    boneStructure: "high cheekbones, strong jawline",
    featureContrast: "high contrast features",
    lookType: "editorial",
    castingNotes: "Strong presence, photographs beautifully.",
    marketSignals: ["editorial", "runway"],
    bookingStrengths: ["angular jawline"],
    measurementEstimates: {
      height_cm: 176,
      bust_cm: 87,
      waist_cm: 62,
      hips_cm: 91,
      weight_kg: 54,
      build_type: "Slim",
      confidence: "Medium",
    },
  }),
};

// Every entry must be absent (case-insensitive) from all index/lexical text.
const DENYLIST = [
  // skin tone — column value, JSONB value, and field names
  "skin tone",
  "skintone",
  "skin_tone",
  "ebony",
  "golden undertones",
  // protected-trait field names and values
  "ethnicity",
  "heritage",
  "korean",
  "nigerian",
  // AI measurement estimates — field name and the estimate numbers
  "measurement",
  "176",
  "87",
  "62",
  "91",
  "54",
  // exact age
  "age: 27",
  "age:27",
];

const scoutExtras = {
  scout: {
    face_structure: "sculpted planes",
    body_impression: "long lean lines",
    vibe_tags: ["edgy", "modern"],
  },
};

function expectNoDenylistedTokens(text, label) {
  const lower = String(text).toLowerCase();
  for (const token of DENYLIST) {
    if (lower.includes(token)) {
      throw new Error(
        `${label} leaked denylisted token "${token}" — output was:\n${text}`,
      );
    }
  }
}

describe("vision/index compliance :: no protected traits or AI measurements in index text", () => {
  const builders = {
    buildDiscoverIndexText: () =>
      buildDiscoverIndexText(fixtureProfile, scoutExtras),
    buildVisualIndexText: () =>
      buildVisualIndexText(fixtureProfile, scoutExtras),
    buildCastingIndexText: () => buildCastingIndexText(fixtureProfile),
    buildMarketIndexText: () =>
      buildMarketIndexText(fixtureProfile, scoutExtras),
    buildLexicalDocument: () =>
      buildLexicalDocument(fixtureProfile, scoutExtras),
    flattenImageAnalysis: () =>
      flattenImageAnalysis(fixtureProfile.image_analysis),
  };

  for (const [name, build] of Object.entries(builders)) {
    it(`${name} emits no denylisted token`, () => {
      const text = build();
      expect(typeof text).toBe("string");
      expectNoDenylistedTokens(text, name);
    });
  }

  it("builders emit only the approved selection vocabulary", () => {
    const text = buildDiscoverIndexText(fixtureProfile, scoutExtras);
    expect(text).toContain("Experience: New face");
    expect(text).toContain("Booking lanes: Editorial");
    expect(text).not.toMatch(/bone structure|height|gender|market signals/i);
  });

  it("does not index age, even as a coarse band", () => {
    const text = buildDiscoverIndexText(fixtureProfile, scoutExtras);
    expect(text).not.toMatch(/\bage(?: band)?:/i);
  });
});

describe("deriveAgeBand", () => {
  const ref = new Date("2026-07-10T12:00:00Z");

  it("returns null for missing, invalid, or minor DOBs", () => {
    expect(deriveAgeBand(null, ref)).toBeNull();
    expect(deriveAgeBand("not-a-date", ref)).toBeNull();
    expect(deriveAgeBand("2012-01-01", ref)).toBeNull(); // 14 — minor
  });

  it("handles both date-only and full ISO timestamp DOB formats", () => {
    expect(deriveAgeBand("1998-03-15", ref)).toBe("late twenties");
    expect(deriveAgeBand("1998-03-15T05:00:00.000Z", ref)).toBe(
      "late twenties",
    );
  });

  it("maps ages to coarse bands", () => {
    expect(deriveAgeBand("2007-01-01", ref)).toBe(
      "late teens to early twenties",
    ); // 19
    expect(deriveAgeBand("2003-01-01", ref)).toBe("early to mid twenties"); // 23
    expect(deriveAgeBand("1990-01-01", ref)).toBe("thirties"); // 36
    expect(deriveAgeBand("1980-01-01", ref)).toBe("forties"); // 46
    expect(deriveAgeBand("1970-01-01", ref)).toBe("fifties plus"); // 56
  });
});

describe("stripSensitiveVisionFields", () => {
  it("removes skinTone and measurementEstimates but keeps casting fields", () => {
    const analysis = {
      skinTone: "warm golden undertones",
      skin_tone: "warm",
      measurementEstimates: { bust_cm: 87 },
      measurement_estimates: { bust_cm: 87 },
      boneStructure: "high cheekbones",
      lookType: "editorial",
      marketSignals: ["editorial"],
    };
    const cleaned = stripSensitiveVisionFields(analysis);
    expect(cleaned).not.toHaveProperty("skinTone");
    expect(cleaned).not.toHaveProperty("skin_tone");
    expect(cleaned).not.toHaveProperty("measurementEstimates");
    expect(cleaned).not.toHaveProperty("measurement_estimates");
    expect(cleaned.boneStructure).toBe("high cheekbones");
    expect(cleaned.lookType).toBe("editorial");
    expect(cleaned.marketSignals).toEqual(["editorial"]);
  });

  it("returns an empty object for non-object input", () => {
    expect(stripSensitiveVisionFields(null)).toEqual({});
    expect(stripSensitiveVisionFields("junk")).toEqual({});
  });
});
