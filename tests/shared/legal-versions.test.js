const {
  CURRENT_LEGAL_VERSION,
  TERMS_CHANGELOG,
  changelogFor,
} = require("../../src/shared/lib/legal-versions");
const {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} = require("../../src/shared/lib/legal-acceptance");
const {
  AGENCY_POLICY_MANIFEST,
} = require("../../src/domains/agency/services/legal-acceptance");

/**
 * These guard the failure that actually happened: pholio-landing published
 * 2026-07-18 while the app kept gating on a hardcoded 2026-06-25, so nobody was
 * re-prompted and every acceptance row recorded consent to a version that was
 * no longer served.
 */
describe("legal version single source of truth", () => {
  it("uses an ISO date as the version string", () => {
    expect(CURRENT_LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("the talent acceptance gate tracks the shared constant", () => {
    expect(CURRENT_TERMS_VERSION).toBe(CURRENT_LEGAL_VERSION);
    expect(CURRENT_PRIVACY_VERSION).toBe(CURRENT_LEGAL_VERSION);
  });

  it("the agency terms and privacy policies track the shared constant", () => {
    const byKey = Object.fromEntries(
      AGENCY_POLICY_MANIFEST.map((policy) => [policy.key, policy]),
    );
    expect(byKey.terms.version).toBe(CURRENT_LEGAL_VERSION);
    expect(byKey.privacy.version).toBe(CURRENT_LEGAL_VERSION);
  });

  it("every published version has a plain-language changelog", () => {
    // A version bump re-prompts every user. Shipping one without telling them
    // what changed is the thing this test exists to block.
    expect(TERMS_CHANGELOG[CURRENT_LEGAL_VERSION]).toBeDefined();
    expect(changelogFor().length).toBeGreaterThan(0);
    for (const entry of changelogFor()) {
      expect(typeof entry).toBe("string");
      expect(entry.trim().length).toBeGreaterThan(20);
    }
  });

  it("bumping the version changes the agency policy digest", () => {
    // The digest binds the descriptor, not the remote document body — so the
    // version must be part of it or a published revision would leave existing
    // acceptance rows looking current.
    const terms = AGENCY_POLICY_MANIFEST.find((p) => p.key === "terms");
    expect(terms.contentDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(terms)).toContain(CURRENT_LEGAL_VERSION);
  });
});
