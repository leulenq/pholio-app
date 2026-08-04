"use strict";

const path = require("path");

// Prevent module imports from inheriting a configured development/production DB.
const TEST_DB_PATH = path.join(
  "/tmp",
  `pholio-manual-matching-${process.pid}-${Date.now()}.sqlite3`,
);
process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "sqlite3";
process.env.DATABASE_URL = `sqlite://${TEST_DB_PATH}`;
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";

const {
  isAutomatedMatchingEnabled,
  manualBoardResponse,
} = require("../../src/domains/agency/routes/matching").__testables;
const {
  isLearnedPreferencesEnabled,
  learnAgencyPreferences,
} = require("../../src/domains/matching/preference-learner");

describe("manual talent-board launch mode", () => {
  test.each([
    [{}, false],
    [{ PHOLIO_ENABLE_AUTOMATED_MATCHING: "true" }, false],
    [{ PHOLIO_ENABLE_LEARNED_PREFERENCES: "true" }, false],
    [
      {
        PHOLIO_ENABLE_AUTOMATED_MATCHING: "true",
        PHOLIO_ENABLE_LEARNED_PREFERENCES: "true",
      },
      true,
    ],
  ])("matching and learned preferences require both explicit flags", (env, expected) => {
    expect(isAutomatedMatchingEnabled(env)).toBe(expected);
    expect(isLearnedPreferencesEnabled(env)).toBe(expected);
  });

  test("manual board response preserves the already-deterministic submission order without scores", () => {
    // The route SQL orders board_applications by created_at then id before this
    // function sees rows. This fixture verifies the response neither ranks nor
    // reorders that input.
    const rows = [
      { id: "submission-1", first_name: "First", last_name: "Talent", city: "Brooklyn", match_score: 99 },
      { id: "submission-2", first_name: "Second", last_name: "Talent", city: "Queens", app_match: 10 },
      { id: "submission-3", first_name: "Third", last_name: "Talent", city: "Bronx" },
    ];
    const response = manualBoardResponse({ type: "board", id: "board-1" }, rows);

    expect(response.mode).toBe("manual");
    expect(response.ranked.map((candidate) => candidate.profile_id)).toEqual([
      "submission-1",
      "submission-2",
      "submission-3",
    ]);
    expect(response.ranked.every((candidate) => !Object.hasOwn(candidate, "score"))).toBe(true);
    expect(response.ranked.every((candidate) => !Object.hasOwn(candidate, "match_score"))).toBe(true);
    expect(response.partial_order).toEqual({ outranks: [], incomparable: [], tiers: [] });
    expect(response.candidate_notice).toBeNull();
  });

  test("manual mode never reads or writes a learned preference model", async () => {
    const originalAutomated = process.env.PHOLIO_ENABLE_AUTOMATED_MATCHING;
    const originalLearned = process.env.PHOLIO_ENABLE_LEARNED_PREFERENCES;
    delete process.env.PHOLIO_ENABLE_AUTOMATED_MATCHING;
    delete process.env.PHOLIO_ENABLE_LEARNED_PREFERENCES;
    const db = jest.fn(() => {
      throw new Error("manual mode must not touch matching tables");
    });

    try {
      await expect(
        learnAgencyPreferences(db, {
          agencyId: "agency-1",
          scopeType: "board",
          scopeId: "board-1",
        }),
      ).resolves.toBeNull();
      expect(db).not.toHaveBeenCalled();
    } finally {
      if (originalAutomated === undefined) delete process.env.PHOLIO_ENABLE_AUTOMATED_MATCHING;
      else process.env.PHOLIO_ENABLE_AUTOMATED_MATCHING = originalAutomated;
      if (originalLearned === undefined) delete process.env.PHOLIO_ENABLE_LEARNED_PREFERENCES;
      else process.env.PHOLIO_ENABLE_LEARNED_PREFERENCES = originalLearned;
    }
  });
});
