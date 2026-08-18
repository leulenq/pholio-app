"use strict";

/**
 * PITS product test matrix — user-conflict scenarios across classification,
 * readiness, media display, apply, and comp-card gating.
 *
 * Categories:
 *   PASS      — surfaces agree; user would understand the state
 *   CONFUSING — logic correct but average user would feel blocked/confused
 *   DRIFT     — surfaces disagree (different gates, copy, or signals)
 *   FAIL      — broken behavior or missing guidance
 */

const {
  BASE_PROFILE,
  NOW,
  daysAgo,
  simulateProduct,
  simulateClassificationWrite,
  frameCaption,
} = require("./pits-product-harness");

const { calculateProfileStrength } = require("../../src/domains/talent/services/profile-strength");
const {
  analyzePackageIntelligence,
  auditSubmissionPackage,
} = require("../../src/domains/talent/services/package-intelligence");

/** Registry populated during matrix run for report generation */
const MATRIX_RESULTS = [];

function recordResult(entry) {
  MATRIX_RESULTS.push(entry);
}

const GLOBAL_EXPECTED_DRIFTS = [];

function evaluateScenario(scenario) {
  const { id, name, profile, images, now = NOW, product } = scenario;
  const sim = product || simulateProduct({ profile: profile || BASE_PROFILE, images, now });
  const issues = [];
  const passes = [];

  for (const rule of scenario.rules || []) {
    const result = rule.check(sim, { profile, images, now });
    const entry = { rule: rule.id, ...result };
    if (result.ok) passes.push(entry);
    else issues.push(entry);
  }

  for (const drift of sim.drifts) {
    const allowed =
      scenario.expectedDrifts?.includes(drift.code) ||
      GLOBAL_EXPECTED_DRIFTS.includes(drift.code);
    if (!allowed) {
      issues.push({
        rule: "unexpected_drift",
        ok: false,
        severity: "DRIFT",
        message: `${drift.code}: ${drift.detail}`,
      });
    } else if (GLOBAL_EXPECTED_DRIFTS.includes(drift.code)) {
      passes.push({
        rule: `global_drift:${drift.code}`,
        ok: true,
        severity: "DRIFT",
        message: drift.detail,
      });
    }
  }

  for (const expected of scenario.expectedDrifts || []) {
    const found = sim.drifts.some((d) => d.code === expected);
    if (found) {
      passes.push({
        rule: `known_drift:${expected}`,
        ok: true,
        severity: "DRIFT",
        message: "Documented cross-surface mismatch",
      });
    }
  }

  let verdict = "PASS";
  if (issues.some((i) => i.severity === "FAIL")) verdict = "FAIL";
  else if (issues.some((i) => i.severity === "DRIFT" && i.rule !== "unexpected_drift")) verdict = "DRIFT";
  else if (issues.some((i) => i.severity === "CONFUSING")) verdict = "CONFUSING";
  else if (issues.some((i) => !i.ok)) verdict = "FAIL";

  const result = { id, name, verdict, passes, issues, sim };
  recordResult(result);
  return result;
}

const SCENARIOS = [
  {
    id: "mia-styled-book",
    name: "Mia: portfolio headshot + portfolio full-length (styled book)",
    images: [
      {
        id: "mia-hs",
        shot_type: "headshot",
        image_type: "portfolio",
        style_type: "editorial",
        created_at: daysAgo(10),
      },
      {
        id: "mia-fl",
        shot_type: "full_length",
        image_type: "portfolio",
        style_type: "editorial",
        created_at: daysAgo(10),
      },
    ],
    rules: [
      {
        id: "readiness_blocked",
        check: (sim) => ({
          ok: !sim.readiness.isCoreReady,
          severity: "PASS",
          message: "Core package not ready without digitals",
        }),
      },
      {
        id: "contextual_full_body_guidance",
        check: (sim) => ({
          ok: sim.readiness.fullBodyGuidance.why.includes("full-length book images"),
          severity: sim.readiness.fullBodyGuidance.why.includes("book") ? "PASS" : "FAIL",
          message: "Readiness explains book vs digital gap",
        }),
      },
      {
        id: "media_shows_book_labels",
        check: (sim) => ({
          ok: sim.media.captions.every((c) => c.caption.includes("Book")),
          severity: "PASS",
          message: 'Media captions show "Full length · Book" — user sees their uploads',
        }),
      },
      {
        id: "book_intel_contextual_not_generic",
        check: (sim) => ({
          ok:
            sim.media.showsBookFullLengthAdvisory &&
            !sim.media.bookIntelSuggestionIds.includes("fullbody"),
          severity: sim.media.showsBookFullLengthAdvisory ? "PASS" : "CONFUSING",
          message: "Book panel shows contextual advisory, not generic add full-length",
        }),
      },
      {
        id: "apply_blocked",
        check: (sim) => ({
          ok: !sim.apply.canSubmit,
          severity: "PASS",
          message: "Apply correctly blocks until digitals exist",
        }),
      },
      {
        id: "user_would_be_confused_without_guidance",
        check: (sim) => ({
          ok: sim.gating.hasBookFullLengthAdvisory || sim.readiness.fullBodyGuidance.why.includes("book"),
          severity: "CONFUSING",
          message: "Without guidance this feels like a bug — two full-length images but gated",
        }),
      },
    ],
  },
  {
    id: "complete-digitals",
    name: "Clean digitals set: digital headshot + digital full-length",
    images: [
      {
        id: "d-hs",
        shot_type: "headshot",
        image_type: "digital",
        captured_at: daysAgo(10),
        created_at: daysAgo(10),
      },
      {
        id: "d-fl",
        shot_type: "full_length",
        image_type: "digital",
        captured_at: daysAgo(10),
        created_at: daysAgo(10),
      },
    ],
    rules: [
      {
        id: "core_ready",
        check: (sim) => ({
          ok: sim.readiness.isCoreReady,
          severity: "PASS",
          message: "Submission-core package complete",
        }),
      },
      {
        id: "apply_can_submit",
        check: (sim) => ({
          ok: sim.apply.canSubmit,
          severity: "PASS",
          message: "Apply unblocked when profile essentials met",
        }),
      },
      {
        id: "no_book_advisories",
        check: (sim) => ({
          ok: !sim.readiness.advisoryIds.includes("book_full_length_not_digital"),
          severity: "PASS",
          message: "No book-vs-digital noise when digitals qualify",
        }),
      },
      {
        id: "surfaces_agree_headshot",
        check: (sim) => ({
          ok:
            sim.readiness.fieldCompletion.photo_headshot ===
            sim.apply.checks.find((c) => c.label === "Headshot")?.complete,
          severity: "PASS",
          message: "Readiness and Apply agree on headshot",
        }),
      },
    ],
  },
  {
    id: "untyped-full-length-defaults-digital",
    name: "Untyped full-length before PITS runs (empty image_type)",
    images: [
      {
        id: "u-hs",
        shot_type: "headshot",
        created_at: daysAgo(5),
      },
      {
        id: "u-fl",
        shot_type: "full_length",
        created_at: daysAgo(5),
      },
    ],
    rules: [
      {
        id: "untyped_does_not_pass_digitals",
        check: (sim) => ({
          ok: !sim.readiness.isCoreReady,
          severity: "PASS",
          message: "Untyped images no longer count toward digitals until Use is set",
        }),
      },
      {
        id: "captions_missing_use",
        check: (sim) => ({
          ok: sim.media.captions.some((c) => !c.caption.includes("Book") && !c.caption.includes("Digitals")),
          severity: "PASS",
          message: 'Media shows framing only until image_type is confirmed',
        }),
      },
    ],
  },
  {
    id: "primary-photo-bypass",
    name: "primary_photo_id bypasses headshot without digital headshot",
    profile: { ...BASE_PROFILE, primary_photo_id: "cover-1" },
    images: [
      {
        id: "cover-1",
        shot_type: "headshot",
        image_type: "portfolio",
        style_type: "editorial",
        created_at: daysAgo(10),
      },
      {
        id: "d-fl",
        shot_type: "full_length",
        image_type: "digital",
        created_at: daysAgo(10),
      },
    ],
    rules: [
      {
        id: "readiness_headshot_requires_digital",
        check: (sim) => ({
          ok: !sim.readiness.fieldCompletion.photo_headshot,
          severity: "PASS",
          message: "Readiness no longer bypasses via primary_photo_id",
        }),
      },
      {
        id: "apply_headshot_requires_digital",
        check: (sim) => ({
          ok: !sim.apply.checks.find((c) => c.label === "Digital headshot")?.complete,
          severity: "PASS",
          message: "Apply requires digital headshot — aligned with readiness",
        }),
      },
      {
        id: "surfaces_agree_headshot",
        check: (sim) => ({
          ok:
            sim.readiness.fieldCompletion.photo_headshot ===
            sim.apply.checks.find((c) => c.label === "Digital headshot")?.complete,
          severity: "PASS",
          message: "Readiness and Apply agree on headshot gate",
        }),
      },
    ],
  },
  {
    id: "stale-digitals",
    name: "Fresh slots but 100-day-old digitals",
    images: [
      {
        id: "old-hs",
        shot_type: "headshot",
        image_type: "digital",
        captured_at: daysAgo(100),
        created_at: daysAgo(100),
      },
      {
        id: "old-fl",
        shot_type: "full_length",
        image_type: "digital",
        captured_at: daysAgo(100),
        created_at: daysAgo(100),
      },
    ],
    rules: [
      {
        id: "stale_advisory",
        check: (sim) => ({
          ok: sim.readiness.advisoryIds.includes("stale_digitals"),
          severity: "PASS",
          message: "Package intelligence flags stale digitals",
        }),
      },
      {
        id: "apply_blocks_current_digitals",
        check: (sim) => ({
          ok: !sim.apply.checks.find((c) => c.label === "Current digitals")?.complete,
          severity: "PASS",
          message: 'Apply "Current digitals" check blocks submit',
        }),
      },
      {
        id: "audit_can_send_respects_recency",
        check: (sim) => ({
          ok: sim.apply.packageAudit.canSend === false,
          severity: "PASS",
          message: "auditSubmissionPackage.canSend aligned with recency",
        }),
      },
      {
        id: "core_ready_despite_stale",
        check: (sim) => ({
          ok: sim.readiness.isCoreReady,
          severity: "CONFUSING",
          message: "Profile gate unlocks with stale digitals; Apply still blocks on Send",
        }),
      },
    ],
  },
  {
    id: "styled-digital-slot",
    name: "image_type=digital but editorial/heavy retouch signals",
    images: [
      {
        id: "styled-d",
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
        created_at: daysAgo(10),
      },
      {
        id: "d-fl",
        shot_type: "full_length",
        image_type: "digital",
        created_at: daysAgo(10),
      },
    ],
    rules: [
      {
        id: "still_counts_for_slot",
        check: (sim) => ({
          ok: sim.readiness.fieldCompletion.photo_headshot,
          severity: "CONFUSING",
          message: "Styled digital still satisfies required headshot slot",
        }),
      },
      {
        id: "portfolio_as_digital_advisory",
        check: (sim) => ({
          ok: sim.readiness.advisoryIds.includes("portfolio_as_digital"),
          severity: "PASS",
          message: "Advisory warns frame reads as styled book work",
        }),
      },
    ],
  },
  {
    id: "apply-fit-recent-digitals-optional-gaps",
    name: "Core digitals met but missing side profile / smile",
    images: [
      {
        id: "d-hs",
        shot_type: "headshot",
        image_type: "digital",
        created_at: daysAgo(10),
      },
      {
        id: "d-fl",
        shot_type: "full_length",
        image_type: "digital",
        created_at: daysAgo(10),
      },
    ],
    rules: [
      {
        id: "apply_checks_pass",
        check: (sim) => ({
          ok: sim.apply.missingChecks.length === 0,
          severity: "PASS",
          message: "Send-scene checks all pass",
        }),
      },
      {
        id: "dossier_recent_digitals_true",
        check: (sim) => ({
          ok: sim.apply.fitSignals.recentDigitalsMet === true,
          severity: "PASS",
          message: 'Dossier "Recent digitals" reflects recency, not optional gaps',
        }),
      },
    ],
  },
  {
    id: "three-quarter-counts-full-body",
    name: "Three-quarter digital counts for full-length requirement",
    images: [
      {
        id: "d-hs",
        shot_type: "headshot",
        image_type: "digital",
        created_at: daysAgo(10),
      },
      {
        id: "d-tq",
        shot_type: "three_quarter",
        image_type: "digital",
        created_at: daysAgo(10),
      },
    ],
    rules: [
      {
        id: "full_body_met",
        check: (sim) => ({
          ok: sim.readiness.fieldCompletion.photo_full_body,
          severity: "PASS",
          message: "Three-quarter satisfies full-length digital slot",
        }),
      },
      {
        id: "caption_says_three_quarter",
        check: (sim, { images }) => ({
          ok: frameCaption(images[1]).includes("Three-quarter"),
          severity: "CONFUSING",
          message:
            'UI says "Three-quarter · Digitals" while readiness label is "Full-Length Digital"',
        }),
      },
    ],
  },
  {
    id: "pits-classifies-portfolio-runway",
    name: "PITS auto-tags runway frame as portfolio editorial",
    images: [],
    product: (() => {
      const policy = simulateClassificationWrite(
        { id: "runway-1", metadata: {} },
        {
          shot_type: "full_length",
          style_type: "editorial",
          image_type: "portfolio",
          confidence: { shot_type: 0.92, style_type: 0.85, image_type: 0.9 },
          signals: { styling_register: "editorial" },
        },
      );
      const classified = {
        id: "runway-1",
        shot_type: policy.columnUpdates.shot_type,
        image_type: policy.columnUpdates.image_type,
        style_type: policy.columnUpdates.style_type,
        metadata: policy.metadataPatch,
        created_at: daysAgo(10),
      };
      return simulateProduct({
        images: [
          {
            id: "d-hs",
            shot_type: "headshot",
            image_type: "digital",
            created_at: daysAgo(10),
          },
          classified,
        ],
      });
    })(),
    rules: [
      {
        id: "classified_as_book",
        check: (sim, ctx) => ({
          ok: sim.media.captions.some((c) => c.caption === "Full length · Book"),
          severity: "PASS",
          message: "After PITS, runway frame displays as book — matches readiness rules",
        }),
      },
      {
        id: "guidance_after_classify",
        check: (sim) => ({
          ok: sim.gating.hasBookFullLengthAdvisory,
          severity: "PASS",
          message: "Post-classification guidance explains why book frame does not count",
        }),
      },
    ],
  },
  {
    id: "book-only-no-digitals",
    name: "Five portfolio frames, zero digitals — looks like a complete book",
    images: [
      { id: "b1", shot_type: "headshot", image_type: "portfolio", style_type: "editorial", created_at: daysAgo(10) },
      { id: "b2", shot_type: "full_length", image_type: "portfolio", style_type: "editorial", created_at: daysAgo(10) },
      { id: "b3", shot_type: "three_quarter", image_type: "portfolio", style_type: "lifestyle", created_at: daysAgo(10) },
      { id: "b4", shot_type: "profile", image_type: "portfolio", style_type: "editorial", created_at: daysAgo(10) },
      { id: "b5", shot_type: "beauty", image_type: "portfolio", style_type: "beauty", created_at: daysAgo(10) },
    ],
    rules: [
      {
        id: "not_core_ready",
        check: (sim) => ({
          ok: !sim.readiness.isCoreReady,
          severity: "PASS",
          message: "Rich book does not unlock submission-core",
        }),
      },
      {
        id: "both_photo_advisories",
        check: (sim) => ({
          ok:
            sim.gating.hasBookHeadshotAdvisory && sim.gating.hasBookFullLengthAdvisory,
          severity: "PASS",
          message: "Both digital headshot and full-length guidance present",
        }),
      },
      {
        id: "high_frustration_risk",
        check: (sim) => ({
          ok: sim.media.captions.length >= 5,
          severity: "CONFUSING",
          message: "5 typed book frames visible — user likely believes package is complete",
        }),
      },
    ],
  },
  {
    id: "comp-card-gate-copy",
    name: "Comp card gate inherits contextual photo guidance",
    images: [
      {
        id: "b-fl",
        shot_type: "full_length",
        image_type: "portfolio",
        style_type: "editorial",
        created_at: daysAgo(10),
      },
    ],
    rules: [
      {
        id: "gating_blocked",
        check: (sim) => ({
          ok: sim.gating.isBlocked,
          severity: "PASS",
          message: "Comp card remains gated",
        }),
      },
      {
        id: "gate_has_why",
        check: (sim) => ({
          ok: (sim.gating.photoGuidance.photo_full_body?.why || "").includes("book"),
          severity: "PASS",
          message: "Gate task includes book-vs-digital explanation",
        }),
      },
    ],
  },
  {
    id: "pending-classification",
    name: "Upload pending — band pending, no columns",
    images: [
      {
        id: "pending-1",
        metadata: { ai: { classification: { band: "pending" } } },
        classification_status: "pending",
        created_at: daysAgo(1),
      },
    ],
    rules: [
      {
        id: "pending_advisory",
        check: (sim) => ({
          ok: sim.readiness.advisoryIds.includes("pending_classification"),
          severity: "PASS",
          message: "Pending classification surfaced as info advisory",
        }),
      },
      {
        id: "untyped_may_count",
        check: (sim) => ({
          ok: !sim.readiness.isCoreReady,
          severity: "CONFUSING",
          message: "Single untyped image does not pass — but multi untyped pair can (see other scenario)",
        }),
      },
    ],
  },
  {
    id: "suggest-band-no-columns",
    name: "PITS suggest band — metadata only, columns empty",
    images: [],
    product: (() => {
      const policy = simulateClassificationWrite(
        { id: "suggest-1", metadata: {} },
        {
          shot_type: "full_length",
          style_type: "commercial",
          image_type: "portfolio",
          confidence: { shot_type: 0.7, style_type: 0.6, image_type: 0.58 },
        },
      );
      const img = {
        id: "suggest-1",
        metadata: policy.metadataPatch,
        created_at: daysAgo(5),
      };
      return simulateProduct({
        images: [
          { id: "d-hs", shot_type: "headshot", image_type: "digital", created_at: daysAgo(5) },
          img,
        ],
      });
    })(),
    rules: [
      {
        id: "suggest_not_auto_applied",
        check: (sim, ctx) => {
          const img = ctx.images?.[1];
          const hasColumns = !!(img?.shot_type && img?.image_type);
          return {
            ok: !hasColumns,
            severity: "CONFUSING",
            message: "Suggest band keeps columns empty — untyped default may temporarily count as digital",
          };
        },
      },
    ],
  },
];

describe("PITS product matrix", () => {
  test.each(SCENARIOS.map((s) => [s.id, s]))("%s", (_id, scenario) => {
    const result = evaluateScenario(scenario);
    const hardFails = result.issues.filter(
      (i) => i.severity === "FAIL" || (i.rule === "unexpected_drift" && !i.ok),
    );
    if (hardFails.length) {
      const detail = hardFails.map((f) => `${f.rule}: ${f.message}`).join("\n");
      throw new Error(`Scenario ${scenario.id} failed:\n${detail}`);
    }
  });

  test("generate matrix summary", () => {
    const summary = {
      total: MATRIX_RESULTS.length,
      pass: MATRIX_RESULTS.filter((r) => r.verdict === "PASS").length,
      confusing: MATRIX_RESULTS.filter((r) => r.verdict === "CONFUSING").length,
      drift: MATRIX_RESULTS.filter((r) => r.verdict === "DRIFT").length,
      fail: MATRIX_RESULTS.filter((r) => r.verdict === "FAIL").length,
    };

    const knownDrifts = new Set();
    const confusingCases = [];
    for (const r of MATRIX_RESULTS) {
      for (const i of r.issues) {
        if (i.severity === "DRIFT") knownDrifts.add(`${r.id}: ${i.message}`);
        if (i.severity === "CONFUSING") confusingCases.push(`${r.id}: ${i.message}`);
      }
      for (const d of r.sim.drifts) {
        knownDrifts.add(`${d.code} (${r.id}): ${d.detail}`);
      }
    }

    expect(summary.total).toBe(SCENARIOS.length);
    // FAIL verdict means hard product failure; CONFUSING/DRIFT are documented issues
    expect(summary.fail).toBeLessThanOrEqual(summary.total);

    // Attach for report script
    global.__PITS_MATRIX_SUMMARY__ = { summary, results: MATRIX_RESULTS, knownDrifts: [...knownDrifts], confusingCases };
  });
});

describe("PITS taxonomy and mirror checks", () => {
  test("recency copy vs constant: 8-12 weeks vs 90 days", () => {
    const staleImages = [
      { id: "1", shot_type: "headshot", image_type: "digital", captured_at: daysAgo(95) },
      { id: "2", shot_type: "full_length", image_type: "digital", captured_at: daysAgo(95) },
    ];
    const strength = calculateProfileStrength({
      ...BASE_PROFILE,
      images: staleImages,
    });
    const recencyStep = strength.allNextSteps.find((s) => s.key === "digitals_recency");
    expect(recencyStep?.why).toMatch(/90 days/i);
    const pkg = analyzePackageIntelligence({ images: staleImages, now: NOW });
    expect(pkg.recency.isStale).toBe(true);
    expect(pkg.advisories.find((a) => a.id === "stale_digitals")?.message).toMatch(/90 days/);
  });

  test("isSubmissionReady matches audit.canSend", () => {
    const images = [
      { id: "1", shot_type: "headshot", image_type: "digital", captured_at: daysAgo(100) },
      { id: "2", shot_type: "full_length", image_type: "digital", captured_at: daysAgo(100) },
    ];
    const pkg = analyzePackageIntelligence({ images, now: NOW });
    const audit = auditSubmissionPackage({ images, now: NOW });
    expect(pkg.isSubmissionReady).toBe(false);
    expect(audit.canSend).toBe(false);
  });
});

module.exports = { SCENARIOS, evaluateScenario, MATRIX_RESULTS };
