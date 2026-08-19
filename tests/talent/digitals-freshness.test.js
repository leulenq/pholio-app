"use strict";

const {
  AGING_MAX_DAYS,
  CURRENT_MAX_DAYS,
  STATES,
  digitalsFreshness,
  groupSets,
  imageFreshness,
  setFreshness,
} = require("../../src/domains/talent/services/digitals-freshness");

const NOW = new Date("2026-08-11T12:00:00.000Z");

function daysAgo(days) {
  return new Date(NOW.getTime() - days * 86400000).toISOString();
}

/** A digital slot image. `image_type` is what marks it as a digital. */
function digital(overrides = {}) {
  return { id: `img-${Math.random().toString(36).slice(2, 8)}`, image_type: "digital", ...overrides };
}

describe("Digitals freshness", () => {
  describe("one image", () => {
    test("is current inside the window and aging just past it", () => {
      expect(imageFreshness(digital({ captured_at: daysAgo(1) }), NOW).state).toBe(STATES.CURRENT);
      expect(imageFreshness(digital({ captured_at: daysAgo(CURRENT_MAX_DAYS) }), NOW).state).toBe(
        STATES.CURRENT,
      );
      expect(
        imageFreshness(digital({ captured_at: daysAgo(CURRENT_MAX_DAYS + 1) }), NOW).state,
      ).toBe(STATES.AGING);
    });

    test("is stale past the aging window", () => {
      expect(imageFreshness(digital({ captured_at: daysAgo(AGING_MAX_DAYS) }), NOW).state).toBe(
        STATES.AGING,
      );
      expect(
        imageFreshness(digital({ captured_at: daysAgo(AGING_MAX_DAYS + 1) }), NOW).state,
      ).toBe(STATES.STALE);
    });

    /*
     * The upload path deliberately leaves `captured_at` null rather than
     * stamping the upload time, because an image uploaded today may have been
     * taken years ago. Inferring an age from `created_at` here would quietly
     * undo that and report an unknown set as fresh.
     */
    test("is undated when there is no capture date, whatever the upload date", () => {
      const uploadedToday = digital({ captured_at: null, created_at: NOW.toISOString() });
      const result = imageFreshness(uploadedToday, NOW);
      expect(result.state).toBe(STATES.UNDATED);
      expect(result.ageDays).toBeNull();
      expect(result.capturedOn).toBeNull();
    });

    test("treats an unparseable or future date as unknown rather than fresh", () => {
      expect(imageFreshness(digital({ captured_at: "not a date" }), NOW).state).toBe(
        STATES.UNDATED,
      );
      // A future capture date is a bad date, not a fresher picture.
      const future = imageFreshness(digital({ captured_at: daysAgo(-30) }), NOW);
      expect(future.ageDays).toBe(0);
      expect(future.state).toBe(STATES.CURRENT);
    });
  });

  describe("a set takes its weakest member", () => {
    test("is only as current as its oldest picture", () => {
      const set = setFreshness(
        [
          digital({ captured_at: daysAgo(2) }),
          digital({ captured_at: daysAgo(200) }),
          digital({ captured_at: daysAgo(10) }),
        ],
        NOW,
      );
      expect(set.state).toBe(STATES.STALE);
      expect(set.ageDays).toBe(200);
    });

    // The rule the whole module exists for.
    test("is never current when any member is undated", () => {
      const set = setFreshness(
        [digital({ captured_at: daysAgo(2) }), digital({ captured_at: null })],
        NOW,
      );
      expect(set.state).toBe(STATES.UNDATED);
      expect(set.undatedCount).toBe(1);
      expect(set.imageCount).toBe(2);
    });

    test("still reports a real problem over an unknown one", () => {
      // An undated image does not hide that another is genuinely stale.
      const set = setFreshness(
        [digital({ captured_at: daysAgo(400) }), digital({ captured_at: null })],
        NOW,
      );
      expect(set.state).toBe(STATES.STALE);
    });

    test("is undated when nothing in it is dated", () => {
      const set = setFreshness([digital({ captured_at: null }), digital({})], NOW);
      expect(set.state).toBe(STATES.UNDATED);
      expect(set.capturedOn).toBeNull();
      expect(set.agingOn).toBeNull();
    });

    test("publishes the dates it will cross, for a prompt rather than a nag", () => {
      const set = setFreshness([digital({ captured_at: "2026-08-01T00:00:00.000Z" })], NOW);
      expect(set.capturedOn).toBe("2026-08-01");
      expect(set.agingOn).toBe("2026-10-30"); // +90d
      expect(set.staleOn).toBe("2027-01-28"); // +180d
    });
  });

  describe("grouping", () => {
    test("groups by explicit set, then by shoot date", () => {
      const groups = groupSets([
        digital({ id: "a", set_id: "s1", captured_at: daysAgo(5) }),
        digital({ id: "b", set_id: "s1", captured_at: daysAgo(5) }),
        digital({ id: "c", captured_at: daysAgo(40) }),
        digital({ id: "d", captured_at: daysAgo(40) }),
        digital({ id: "e", captured_at: null }),
      ]);
      expect(groups).toHaveLength(3);
      expect(groups.find((g) => g.key === "set:s1").images).toHaveLength(2);
      expect(groups.find((g) => g.key === "undated").images).toHaveLength(1);
    });

    test("never invents a set for undated images", () => {
      const groups = groupSets([digital({ captured_at: null }), digital({ captured_at: null })]);
      expect(groups).toHaveLength(1);
      expect(groups[0].key).toBe("undated");
    });
  });

  describe("across a talent's digitals", () => {
    test("reports the newest datable set as the one that leads", () => {
      const freshness = digitalsFreshness(
        [
          digital({ set_id: "old", captured_at: daysAgo(300) }),
          digital({ set_id: "new", captured_at: daysAgo(3) }),
        ],
        NOW,
      );
      expect(freshness.state).toBe(STATES.CURRENT);
      expect(freshness.currentSet.ageDays).toBe(3);
      // The older set is kept — versions, not overwrites.
      expect(freshness.sets).toHaveLength(2);
      expect(freshness.sets[1].state).toBe(STATES.STALE);
    });

    test("gives a refresh date rather than a recurring prompt", () => {
      const freshness = digitalsFreshness(
        [digital({ captured_at: "2026-08-01T00:00:00.000Z" })],
        NOW,
      );
      expect(freshness.refreshDueOn).toBe("2026-10-30");
      expect(freshness.guidance).toMatch(/current digitals/);
    });

    test("says plainly when nothing is dated", () => {
      const freshness = digitalsFreshness([digital({ captured_at: null })], NOW);
      expect(freshness.state).toBe(STATES.UNDATED);
      expect(freshness.refreshDueOn).toBeNull();
      expect(freshness.guidance).toMatch(/Nobody knows when these were taken/);
    });

    test("distinguishes a partly-dated set from a wholly undated one", () => {
      const freshness = digitalsFreshness(
        [
          digital({ set_id: "s", captured_at: daysAgo(4) }),
          digital({ set_id: "s", captured_at: null }),
        ],
        NOW,
      );
      expect(freshness.state).toBe(STATES.UNDATED);
      expect(freshness.guidance).toMatch(/cannot be called current/);
    });

    test("ignores portfolio and comp card images", () => {
      const freshness = digitalsFreshness(
        [
          { id: "p", image_type: "portfolio", captured_at: daysAgo(900) },
          digital({ captured_at: daysAgo(2) }),
        ],
        NOW,
      );
      expect(freshness.state).toBe(STATES.CURRENT);
      expect(freshness.currentSet.imageCount).toBe(1);
    });

    test("reports no digitals rather than a false state", () => {
      const freshness = digitalsFreshness([], NOW);
      expect(freshness.hasDigitals).toBe(false);
      expect(freshness.sets).toEqual([]);
      expect(freshness.guidance).toMatch(/No digitals yet/);
    });
  });
});
