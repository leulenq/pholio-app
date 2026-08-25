"use strict";

/**
 * Request-refresh eligibility (plan §9.3 "Requests — more materials / refresh").
 *
 * The mechanism is a discriminator on an existing table. The thing worth
 * testing is the rule that stops it becoming a nag: an organizer may only ask
 * for a reshoot when the digitals are genuinely not current, and the freshness
 * engine decides that — not the reviewer, and not date arithmetic re-invented
 * at the call site.
 */

const {
  DIGITALS_KEYS,
  refreshEligibility,
  refreshMessage,
} = require("../../src/domains/agency/services/refresh-requests");

const NOW = new Date("2026-08-24T12:00:00.000Z");

function digital(daysAgo, overrides = {}) {
  const captured =
    daysAgo === null
      ? null
      : new Date(NOW.getTime() - daysAgo * 86400000).toISOString();
  return {
    id: `img-${daysAgo}-${Math.random().toString(16).slice(2, 8)}`,
    image_type: "digital",
    shot_type: "headshot",
    set_id: "set-one",
    captured_at: captured,
    created_at: NOW.toISOString(),
    ...overrides,
  };
}

describe("a current set cannot be asked to reshoot", () => {
  test("digitals from last week are refused", () => {
    const result = refreshEligibility([digital(7), digital(7)], NOW);
    expect(result.allowed).toBe(false);
    expect(result.state).toBe("current");
    expect(result.reason).toMatch(/current/i);
  });

  test("the refusal names the convention rather than just saying no", () => {
    const { reason } = refreshEligibility([digital(10)], NOW);
    expect(reason).toMatch(/three months/i);
  });
});

describe("an aged set can", () => {
  test("past three months is refreshable", () => {
    const result = refreshEligibility([digital(120), digital(120)], NOW);
    expect(result.allowed).toBe(true);
    expect(result.state).toBe("aging");
  });

  test("past six months is refreshable", () => {
    const result = refreshEligibility([digital(400)], NOW);
    expect(result.allowed).toBe(true);
    expect(result.state).toBe("stale");
  });

  test("the OLDEST frame in the set decides, not the newest", () => {
    // One recent frame must not rescue a set whose other frames have aged out.
    const result = refreshEligibility([digital(5), digital(300)], NOW);
    expect(result.allowed).toBe(true);
    expect(result.state).toBe("stale");
  });
});

describe("undated digitals are refreshable, and that is the point", () => {
  test("a set with no capture date can be asked for again", () => {
    const result = refreshEligibility([digital(null), digital(null)], NOW);
    expect(result.allowed).toBe(true);
    expect(result.state).toBe("undated");
  });

  test("one undated frame stops a recent set counting as current", () => {
    const result = refreshEligibility([digital(5), digital(null)], NOW);
    expect(result.allowed).toBe(true);
    expect(result.state).toBe("undated");
  });

  test("the talent is told the frames carry no date, not that they are old", () => {
    const message = refreshMessage("undated", "Wilhelmina");
    expect(message).toMatch(/no capture date/i);
    expect(message).not.toMatch(/months old/i);
  });
});

describe("what cannot be judged is not asserted", () => {
  test("unclassified frames are refused rather than assumed stale", () => {
    const unclassified = [{ id: "a", captured_at: null, created_at: null }];
    const result = refreshEligibility(unclassified, NOW);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not classified/i);
  });

  test("no digitals at all is a materials request, and says so", () => {
    const bookOnly = [{ id: "b", image_type: "portfolio", captured_at: null }];
    const result = refreshEligibility(bookOnly, NOW);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/materials instead/i);
  });

  test("an empty submission is refused, not crashed on", () => {
    expect(refreshEligibility([], NOW).allowed).toBe(false);
    expect(refreshEligibility(null, NOW).allowed).toBe(false);
  });
});

describe("the talent-facing copy", () => {
  test.each([["aging"], ["stale"], ["undated"]])(
    "%s explains the situation without evaluating the person",
    (state) => {
      const message = refreshMessage(state, "Ford Models");
      expect(message).toContain("Ford Models");
      expect(message).not.toMatch(/\b(bad|poor|weak|unflattering|unattractive)\b/i);
    },
  );

  test("falls back to a neutral subject when the agency is unnamed", () => {
    expect(refreshMessage("aging", null)).toMatch(/^The agency/);
  });
});

describe("the keys asked for", () => {
  test("are the apply-stage digitals", () => {
    expect(DIGITALS_KEYS).toEqual([
      "digital_headshot",
      "digital_full_length",
      "digital_profile",
    ]);
  });
});
