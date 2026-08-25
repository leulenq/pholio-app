"use strict";

/**
 * The one-click templated decline (plan §9.3, §9.6 #4).
 *
 * What is being protected here is not the mechanism — a nullable column and a
 * lookup table are not hard — but the three rules that make it safe to send at
 * scale: a reason is optional, it describes the agency and never the person,
 * and the wording is fixed rather than composed. Those rules are the feature.
 */

const {
  DECLINE_REASONS,
  declineReason,
  declineReasonOptions,
  normalizeDeclineReason,
  talentMessageFor,
} = require("../../src/domains/agency/services/decline-reasons");

describe("a reason is optional", () => {
  test.each([[undefined], [null], [""]])(
    "%p means declined without a reason, not an error",
    (value) => {
      expect(normalizeDeclineReason(value)).toEqual({ ok: true, id: null });
    },
  );

  test("no reason yields no talent-facing message to substitute", () => {
    expect(talentMessageFor(null)).toBeNull();
    expect(talentMessageFor(undefined)).toBeNull();
    expect(declineReason(null)).toBeNull();
  });
});

describe("only the published vocabulary is accepted", () => {
  test.each(DECLINE_REASONS.map((reason) => [reason.id]))(
    "%s round-trips",
    (id) => {
      expect(normalizeDeclineReason(id)).toEqual({ ok: true, id });
      expect(talentMessageFor(id)).toEqual(expect.any(String));
    },
  );

  test("an unknown id is refused, and the error names what is allowed", () => {
    const result = normalizeDeclineReason("too_short");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("too_short");
    expect(result.error).toContain("board_full");
  });

  test("a non-string is refused rather than coerced", () => {
    expect(normalizeDeclineReason(42).ok).toBe(false);
    expect(normalizeDeclineReason({ id: "board_full" }).ok).toBe(false);
    expect(normalizeDeclineReason(["board_full"]).ok).toBe(false);
  });

  test("surrounding whitespace is tolerated, not treated as a new reason", () => {
    expect(normalizeDeclineReason("  board_full  ")).toEqual({
      ok: true,
      id: "board_full",
    });
  });
});

describe("every reason describes the agency, never the person", () => {
  // The rule that makes this survivable at scale. A decline about the agency's
  // situation can be sent to four hundred people; a judgement about a person
  // cannot, no matter how it is worded.
  const ABOUT_THE_PERSON =
    /\b(you (are|look|seem) (too|not)|your (face|body|look|weight|height) (is|was)|not (pretty|attractive|thin|tall) enough|unattractive)\b/i;

  test.each(DECLINE_REASONS.map((r) => [r.id, r.talentMessage]))(
    "%s does not judge the applicant",
    (_id, message) => {
      expect(message).not.toMatch(ABOUT_THE_PERSON);
    },
  );

  test("the one reason that points at the submission points at fixable work", () => {
    // `materials` is deliberately the only reason about the submission rather
    // than the agency, because it is the only decline a talent can act on.
    const materials = declineReason("materials");
    expect(materials.talentMessage).toMatch(/digitals/i);
    expect(materials.invitesReturn).toBe(true);
  });
});

describe("the vocabulary has one definition", () => {
  test("options carry the verbatim message the talent will read", () => {
    const options = declineReasonOptions();
    expect(options).toHaveLength(DECLINE_REASONS.length);

    for (const option of options) {
      const source = declineReason(option.id);
      // A reviewer must be able to read the exact words before sending them.
      expect(option.talentMessage).toBe(source.talentMessage);
      expect(option.label).toBe(source.agencyLabel);
    }
  });

  test("ids are unique and stable-shaped for storage", () => {
    const ids = DECLINE_REASONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z_]+$/);
      // The column is varchar(40).
      expect(id.length).toBeLessThanOrEqual(40);
    }
  });

  test("the list is frozen — a reason cannot be edited at runtime", () => {
    expect(Object.isFrozen(DECLINE_REASONS)).toBe(true);
    expect(Object.isFrozen(DECLINE_REASONS[0])).toBe(true);
  });
});
