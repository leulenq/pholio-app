"use strict";

const {
  OpenCallBriefError,
  briefColumns,
  briefDTO,
  hasBrief,
  isClosedByDeadline,
  normalizeBrief,
} = require("../../src/domains/agency/services/open-call-brief");

const TODAY = "2026-08-11";

function validBrief(overrides = {}) {
  return {
    who: "New faces for our women's board, London.",
    what: "Four digitals: close-up, profile, waist-up and full length. No makeup, hair back.",
    eligibility: "16 and over. No height requirement for the commercial board.",
    nextSteps: "We review every week and reply within 30 days, either way.",
    deadline: "2026-09-30",
    ongoing: false,
    ...overrides,
  };
}

describe("Open call brief", () => {
  describe("what an agency must answer", () => {
    test("accepts a complete brief", () => {
      const brief = normalizeBrief(validBrief(), TODAY);
      expect(brief.who).toMatch(/women's board/);
      expect(brief.deadline).toBe("2026-09-30");
      expect(brief.ongoing).toBe(false);
    });

    test.each(["who", "what", "nextSteps"])("requires %s", (field) => {
      expect(() => normalizeBrief(validBrief({ [field]: "" }), TODAY)).toThrow(
        expect.objectContaining({ code: "brief_incomplete", field }),
      );
    });

    test("rejects a gesture rather than an answer", () => {
      expect(() => normalizeBrief(validBrief({ who: "tbd" }), TODAY)).toThrow(
        expect.objectContaining({ code: "brief_incomplete" }),
      );
    });

    test("eligibility may be empty — an open call open to everyone says nothing", () => {
      const brief = normalizeBrief(validBrief({ eligibility: "" }), TODAY);
      expect(brief.eligibility).toBe("");
      expect(briefColumns(brief, null).brief_eligibility).toBeNull();
    });

    test("caps each field", () => {
      expect(() => normalizeBrief(validBrief({ who: "x".repeat(601) }), TODAY)).toThrow(
        expect.objectContaining({ code: "brief_too_long", field: "who" }),
      );
    });

    test("rejects a non-object brief", () => {
      for (const value of [null, undefined, "brief", []]) {
        expect(() => normalizeBrief(value, TODAY)).toThrow(
          expect.objectContaining({ code: "brief_required" }),
        );
      }
    });
  });

  describe("the deadline is a decision, not always a date", () => {
    test("a continuously running call is a complete answer", () => {
      const brief = normalizeBrief(
        validBrief({ deadline: "", ongoing: true }),
        TODAY,
      );
      expect(brief.ongoing).toBe(true);
      expect(brief.deadline).toBeNull();
    });

    test("silence about the deadline is not", () => {
      expect(() =>
        normalizeBrief(validBrief({ deadline: "", ongoing: false }), TODAY),
      ).toThrow(expect.objectContaining({ code: "brief_deadline_required" }));
    });

    test("a call cannot be both ongoing and closing", () => {
      expect(() =>
        normalizeBrief(validBrief({ deadline: "2026-09-30", ongoing: true }), TODAY),
      ).toThrow(expect.objectContaining({ code: "brief_deadline_conflict" }));
    });

    test("rejects a deadline that has already passed", () => {
      expect(() =>
        normalizeBrief(validBrief({ deadline: "2026-08-10" }), TODAY),
      ).toThrow(expect.objectContaining({ code: "brief_deadline_past" }));
      // Today still counts as open.
      expect(normalizeBrief(validBrief({ deadline: TODAY }), TODAY).deadline).toBe(TODAY);
    });

    test("rejects a date that is not one", () => {
      for (const deadline of ["30/09/2026", "2026-13-01", "soon"]) {
        expect(() => normalizeBrief(validBrief({ deadline }), TODAY)).toThrow(
          expect.objectContaining({ code: "brief_deadline_invalid" }),
        );
      }
    });
  });

  describe("closing", () => {
    test("a dated call closes the day after its deadline", () => {
      expect(isClosedByDeadline({ brief_deadline: "2026-08-12" }, TODAY)).toBe(false);
      expect(isClosedByDeadline({ brief_deadline: TODAY }, TODAY)).toBe(false);
      expect(isClosedByDeadline({ brief_deadline: "2026-08-10" }, TODAY)).toBe(true);
    });

    test("an ongoing call and a link with no brief never close", () => {
      expect(isClosedByDeadline({ brief_deadline: null, brief_ongoing: true }, TODAY)).toBe(false);
      expect(isClosedByDeadline({}, TODAY)).toBe(false);
      expect(isClosedByDeadline(null, TODAY)).toBe(false);
    });

    // Postgres hands `date` columns back as Date objects, SQLite as strings.
    test("reads a Date-typed deadline the same as a string one", () => {
      const asDate = new Date("2026-08-10T00:00:00.000Z");
      expect(isClosedByDeadline({ brief_deadline: asDate }, TODAY)).toBe(true);
      expect(briefDTO({ brief_completed_at: "x", brief_deadline: asDate }).deadline).toBe(
        "2026-08-10",
      );
    });
  });

  describe("what the applicant is shown", () => {
    test("a link with no brief shows nothing rather than blanks", () => {
      expect(hasBrief({ brief_who: "something" })).toBe(false);
      expect(briefDTO({ brief_who: "something" })).toBeNull();
    });

    test("a completed brief round-trips through storage", () => {
      const brief = normalizeBrief(validBrief(), TODAY);
      const columns = briefColumns(brief, "2026-08-11T00:00:00.000Z");
      expect(hasBrief(columns)).toBe(true);

      const dto = briefDTO(columns);
      expect(dto).toEqual({
        who: brief.who,
        what: brief.what,
        eligibility: brief.eligibility,
        nextSteps: brief.nextSteps,
        deadline: "2026-09-30",
        ongoing: false,
      });
    });
  });

  test("every failure is a 400 the agency can act on", () => {
    try {
      normalizeBrief(validBrief({ who: "" }), TODAY);
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenCallBriefError);
      expect(error.status).toBe(400);
      expect(error.message).toEqual(expect.any(String));
    }
  });
});
