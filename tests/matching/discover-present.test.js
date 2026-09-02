"use strict";

/**
 * Discover presentation — the strings a booker actually reads.
 * Chip text, per-result facts and notes, and the response notes
 * (tasks/discover-audit-2026-09.md §4).
 */

const {
  spanOffsets,
  buildFilters,
  roleSummary,
  buildFacts,
  buildResultNotes,
  buildResponseNotes,
  formatDateRange,
} = require("../../src/domains/agency/services/discover/present");
const {
  evaluateProfile,
} = require("../../src/domains/agency/services/discover/constraint-eval");

const NO_EM_DASH = /[—–]/;

describe("filter chips", () => {
  test("booker language, provenance span, and edit metadata", () => {
    const brief = 'Editorial women 5\'9" and up, based in NYC';
    const filters = buildFilters(brief, {
      gender_presentation: ["female"],
      height_cm: { op: "min", a: 175, value: 175, span: '5\'9"' },
      boards: ["editorial"],
      location: { market: "new-york", local_only: false, span: "NYC" },
    });

    expect(filters.map((f) => f.text)).toEqual([
      "Women",
      '5\'9" and up',
      "New York",
      "Editorial",
    ]);

    const height = filters.find((f) => f.field === "height_cm");
    expect(height.id).toBe("height_cm");
    expect(height.op).toBe("min");
    expect(height.value).toEqual({ a: 175, b: null });
    expect(height.span).toEqual(spanOffsets(brief, '5\'9"'));
    expect(height.editable).toBe("number");
    expect(height.unit).toBe("cm");
    expect(height.edit_value).toBe("175");

    for (const filter of filters) expect(filter.text).not.toMatch(NO_EM_DASH);
  });

  test("every chip rule in the contract", () => {
    const text = (hard) => buildFilters("", hard).map((f) => f.text);

    expect(text({ gender_presentation: ["male"] })).toEqual(["Men"]);
    expect(text({ gender_presentation: ["non_binary"] })).toEqual(["Non-binary"]);
    expect(text({ height_cm: { op: "max", value: 173 } })).toEqual([`Under 5'8"`]);
    expect(text({ height_cm: { op: "between", value: { a: 173, b: 178 } } })).toEqual([
      `5'8" to 5'10"`,
    ]);
    expect(text({ height_cm: { op: "approx", value: 175 } })).toEqual([`Around 5'9"`]);
    expect(text({ playing_age: { op: "between", value: { a: 22, b: 30 } } })).toEqual([
      "Plays 22 to 30",
    ]);
    expect(
      text({ measurements: { waist_cm: { op: "exact", value: 61 } } }),
    ).toEqual(["Waist 61 cm (24 in)"]);
    expect(
      text({ measurements: { dress_size: { value: "4", region: "US" } } }),
    ).toEqual(["Dress US 4"]);
    expect(text({ shoe: { size: 9, region: "US" } })).toEqual(["Shoe US 9"]);
    expect(text({ location: { market: "new-york", local_only: true } })).toEqual([
      "New York, local only",
    ]);
    expect(
      text({ availability: [{ kind: "shoot", from: "2026-07-09", to: "2026-07-14" }] }),
    ).toEqual(["Available Jul 9 to 14"]);
    expect(
      text({ availability: [{ kind: "fitting", from: "2026-07-09", to: null }] }),
    ).toEqual(["Available from Jul 9"]);
    expect(text({ visible_tattoos: false })).toEqual(["No visible tattoos"]);
    expect(text({ visible_tattoos: true })).toEqual(["Visible tattoos"]);
    expect(text({ boards: ["editorial", "runway"] })).toEqual(["Editorial or Runway"]);
    expect(text({ hair_color: ["blonde", "red"] })).toEqual(["Blonde or red hair"]);
    expect(text({ eye_color: ["green"] })).toEqual(["Green eyes"]);
    expect(text({ union: "union" })).toEqual(["Union"]);
    expect(text({ union: "non_union" })).toEqual(["Non-union"]);
    expect(text({ union: "either" })).toEqual(["Union or non-union"]);
    expect(text({ representation_status: ["unrepresented"] })).toEqual(["Unrepresented"]);
    expect(text({ representation_status: ["seeking"] })).toEqual([
      "Seeking representation",
    ]);
    expect(text({ experience_level: "new_face" })).toEqual(["New faces"]);
    expect(text({ heritage: ["black_african_descent"] })).toEqual([
      "Black/African Descent",
    ]);
    expect(text({ heritage: ["east_asian", "south_asian"] })).toEqual([
      "East Asian or South Asian",
    ]);
  });

  test("a constraint the re-parse could not confirm is never a chip", () => {
    const filters = buildFilters("about yea tall", {
      height_cm: { op: "min", value: 175, needs_confirmation: true },
      boards: ["editorial"],
    });
    expect(filters.map((f) => f.field)).toEqual(["boards"]);
  });

  test("roleSummary joins the chip texts", () => {
    expect(
      roleSummary(
        {
          label: "role 1",
          hard: {
            gender_presentation: ["female"],
            height_cm: { op: "min", value: 175 },
            location: { market: "new-york" },
          },
        },
        "",
      ),
    ).toBe(`Women, 5'9" and up, New York`);
  });

  test("dates read as a booker writes them", () => {
    expect(formatDateRange("2026-07-09", "2026-07-14")).toBe("Jul 9 to 14");
    expect(formatDateRange("2026-07-30", "2026-08-02")).toBe("Jul 30 to Aug 2");
    expect(formatDateRange("2026-07-09", null)).toBe("Jul 9");
  });
});

describe("per-result facts and notes", () => {
  const hard = {
    gender_presentation: ["female"],
    height_cm: { op: "min", value: 175 },
    playing_age: { op: "between", value: { a: 24, b: 30 } },
    measurements: { waist_cm: { op: "max", value: 63 } },
    location: { market: "new-york" },
    visible_tattoos: false,
    boards: ["editorial"],
    hair_color: ["blonde"],
    eye_color: ["green"],
    heritage: ["hispanic_latino"],
    union: "union",
    experience_level: "new_face",
  };

  const passing = {
    gender: "Female",
    height_cm: 178,
    playing_age_min: 24,
    playing_age_max: 30,
    waist_cm: 61,
    market: "new-york",
    tattoos: false,
    hair_color: "Blonde",
    eye_color: "Green",
    ethnicity: '["Hispanic/Latino"]',
    union_membership: "SAG-AFTRA",
    experience_level: "New face",
  };

  test("facts are the declared values that answered the brief", () => {
    const evaluations = evaluateProfile(passing, hard, { lanes: ["editorial"] });
    expect(buildFacts(evaluations, passing, hard)).toEqual([
      "Woman",
      `5'10"`,
      "Plays 24 to 30",
      "Waist 61 cm (24 in)",
      "New York",
      "No visible tattoos",
      "Editorial",
      "Blonde hair",
      "Green eyes",
      "Hispanic/Latino",
      "Union",
      "New face",
    ]);
    expect(buildResultNotes(evaluations, passing, hard)).toEqual([]);
  });

  test("notes name each miss and each blank in plain words", () => {
    const missing = {
      gender: "Female",
      height_cm: 173,
      playing_age_min: 32,
      playing_age_max: 38,
      waist_cm: 66,
      market: "miami",
      tattoos: true,
      hair_color: "Brown",
      eye_color: "Blue",
      ethnicity: null,
      union_membership: null,
      experience_level: "Experienced",
      availability_status: null,
      modeling_categories: '["commercial"]',
    };
    const withAvailability = {
      ...hard,
      availability: [{ kind: "shoot", from: "2026-07-09", to: "2026-07-14" }],
    };
    const evaluations = evaluateProfile(missing, withAvailability, {});
    const notes = buildResultNotes(evaluations, missing, withAvailability);

    expect(notes).toEqual([
      `5'8", 1 in under`,
      "Plays 32 to 38",
      "Waist 66 cm (26 in)",
      "Based in Miami",
      "Availability not listed",
      "Has visible tattoos",
      "Commercial board",
      "Brown hair",
      "Blue eyes",
      "Heritage not listed",
      "Union status not listed",
      "Experienced",
    ]);
    for (const note of notes) expect(note).not.toMatch(NO_EM_DASH);
  });

  test("a height over the ceiling reads as over, blanks read as not listed", () => {
    const hardMax = { height_cm: { op: "max", value: 173 } };
    expect(
      buildResultNotes(
        evaluateProfile({ height_cm: 180 }, hardMax, {}),
        { height_cm: 180 },
        hardMax,
      ),
    ).toEqual([`5'11", 3 in over`]);

    expect(
      buildResultNotes(evaluateProfile({}, hardMax, {}), {}, hardMax),
    ).toEqual(["Height not listed"]);
  });

  test("a heritage miss never prints the talent's own heritage", () => {
    const hardHeritage = { heritage: ["hispanic_latino"] };
    const profile = { ethnicity: '["East Asian"]' };
    const notes = buildResultNotes(
      evaluateProfile(profile, hardHeritage, {}),
      profile,
      hardHeritage,
    );
    expect(notes).toEqual(["Heritage differs"]);
    expect(notes.join(" ")).not.toContain("East Asian");
  });

  test("an overlapping bookout says which days", () => {
    const hardAvail = {
      availability: [{ kind: "shoot", from: "2026-07-09", to: "2026-07-14" }],
    };
    const profile = { availability_status: "available" };
    const evaluations = evaluateProfile(profile, hardAvail, {
      bookouts: [{ starts_on: "2026-07-10", ends_on: "2026-07-12" }],
    });
    expect(buildResultNotes(evaluations, profile, hardAvail)).toEqual([
      "Booked out Jul 10 to 12",
    ]);
  });
});

describe("response notes", () => {
  test("a field blank for the whole pool is said once, plainly", () => {
    expect(buildResponseNotes({ poolUnknownFields: ["union"] })).toEqual([
      "Union status isn't listed on any profile yet.",
    ]);
  });

  test("credentials, skin tone, and an unreadable number", () => {
    expect(buildResponseNotes({ credentialAsked: true })).toEqual([
      "Tearsheets and show credits aren't listed on profiles yet, so that part of the brief wasn't used.",
    ]);
    expect(
      buildResponseNotes({ setAside: [{ text: "olive skin" }] }),
    ).toEqual(["Skin tone isn't a profile field, so it wasn't used."]);
    expect(
      buildResponseNotes({ needsConfirmation: [{ field: "height_cm" }] }),
    ).toEqual([
      `The height in the brief couldn't be read, so it wasn't used. State it as 5'9" or 175 cm.`,
    ]);
  });

  test("never more than two sentences, and never an em-dash", () => {
    const notes = buildResponseNotes({
      needsConfirmation: [{ field: "height_cm" }],
      credentialAsked: true,
      setAside: [{ text: "olive skin" }],
      poolUnknownFields: ["union", "eye_color"],
    });
    expect(notes).toHaveLength(2);
    for (const note of notes) {
      expect(note).not.toMatch(NO_EM_DASH);
      expect(note.endsWith(".")).toBe(true);
    }
  });
});
