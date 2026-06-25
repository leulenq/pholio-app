const {
  analyzePackageIntelligence,
  auditSubmissionPackage,
  analyzeRecency,
  getImageAgeDays,
  resolveReadinessGuidance,
} = require("../../src/domains/talent/services/package-intelligence");

describe("package-intelligence", () => {
  const now = new Date("2026-06-24T12:00:00.000Z");

  test("portfolio headshot does NOT count for digital headshot slot", () => {
    const images = [
      {
        id: "1",
        shot_type: "headshot",
        image_type: "portfolio",
        style_type: "editorial",
        created_at: now.toISOString(),
      },
    ];
    const result = analyzePackageIntelligence({ images, now });
    expect(result.slots.headshot).toBe(false);
    expect(result.slots.hasStyledHeadshot).toBe(true);
  });

  test("stale digitals detected at 100 days", () => {
    const old = new Date(now);
    old.setDate(old.getDate() - 100);
    const images = [
      {
        id: "1",
        shot_type: "headshot",
        image_type: "digital",
        created_at: old.toISOString(),
        captured_at: old.toISOString(),
      },
    ];
    const result = analyzePackageIntelligence({ images, now });
    expect(result.recency.isStale).toBe(true);
    expect(result.recency.oldestDays).toBe(100);
    expect(result.advisories.some((a) => a.id === "stale_digitals")).toBe(true);
  });

  test("portfolio_as_digital advisory for styled digital tag", () => {
    const images = [
      {
        id: "1",
        shot_type: "headshot",
        image_type: "digital",
        metadata: {
          ai: {
            classification: {
              signals: {
                styling_register: "editorial",
                retouch_likelihood: "heavy",
              },
            },
          },
        },
        created_at: now.toISOString(),
      },
    ];
    const result = analyzePackageIntelligence({ images, now });
    expect(
      result.advisories.some((a) => a.id === "portfolio_as_digital"),
    ).toBe(true);
  });

  test("getImageAgeDays prefers captured_at over created_at", () => {
    const captured = new Date(now);
    captured.setDate(captured.getDate() - 10);
    const created = new Date(now);
    created.setDate(created.getDate() - 50);
    const days = getImageAgeDays(
      { captured_at: captured.toISOString(), created_at: created.toISOString() },
      now,
    );
    expect(days).toBe(10);
  });

  test("fresh digitals are not stale", () => {
    const recent = new Date(now);
    recent.setDate(recent.getDate() - 10);
    const recency = analyzeRecency(
      [
        {
          id: "1",
          shot_type: "headshot",
          image_type: "digital",
          captured_at: recent.toISOString(),
        },
      ],
      now,
    );
    expect(recency.isStale).toBe(false);
    expect(recency.oldestDays).toBe(10);
  });

  test("untyped images do not count as digital slot", () => {
    const { isDigitalSlot } = require("../../src/domains/talent/services/profile-readiness-images");
    expect(isDigitalSlot({ shot_type: "headshot" })).toBe(false);
    expect(isDigitalSlot({ shot_type: "full_length" })).toBe(false);
    expect(isDigitalSlot({ shot_type: "headshot", image_type: "digital" })).toBe(true);
  });

  test("auditSubmissionPackage reports canSend false without full set", () => {
    const images = [
      {
        id: "1",
        shot_type: "headshot",
        image_type: "digital",
        created_at: now.toISOString(),
      },
    ];
    const audit = auditSubmissionPackage({ images, now });
    expect(audit.slots.headshot).toBe(true);
    expect(audit.slots.fullBody).toBe(false);
    expect(audit.canSend).toBe(false);
  });

  test("book full-length frames trigger contextual advisory, not generic missing", () => {
    const images = [
      {
        id: "1",
        shot_type: "headshot",
        image_type: "portfolio",
        style_type: "editorial",
        created_at: now.toISOString(),
      },
      {
        id: "2",
        shot_type: "full_length",
        image_type: "portfolio",
        style_type: "editorial",
        created_at: now.toISOString(),
      },
    ];
    const result = analyzePackageIntelligence({ images, now });
    expect(result.slots.fullBody).toBe(false);
    expect(result.slots.hasBookFullLength).toBe(true);
    expect(result.slots.bookFullLengthCount).toBe(1);
    expect(
      result.advisories.some((a) => a.id === "book_full_length_not_digital"),
    ).toBe(true);
    expect(
      result.advisories.some(
        (a) => a.id === "missing_slot" && a.slot === "full_body",
      ),
    ).toBe(false);
  });

  test("resolveReadinessGuidance returns book-vs-digital copy for photo_full_body", () => {
    const images = [
      {
        id: "1",
        shot_type: "full_length",
        image_type: "portfolio",
        created_at: now.toISOString(),
      },
    ];
    const { advisories } = analyzePackageIntelligence({ images, now });
    const guided = resolveReadinessGuidance("photo_full_body", advisories, {
      label: "Full-Length Digital",
      why: "Default why",
    });
    expect(guided.label).toBe("Full-Length Digital");
    expect(guided.why).toContain("full-length book images");
    expect(guided.task).toBe("Add a clean digital full-length shot");
  });
});
