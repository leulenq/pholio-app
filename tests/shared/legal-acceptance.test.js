const {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
  requireLegalAcceptance,
} = require("../../src/shared/lib/legal-acceptance");

describe("legal-acceptance", () => {
  it("requireLegalAcceptance passes when terms and privacy are recorded", () => {
    expect(
      requireLegalAcceptance({
        terms_accepted_at: "2026-06-25T00:00:00.000Z",
        terms_accepted_version: CURRENT_TERMS_VERSION,
        privacy_accepted_at: "2026-06-25T00:00:00.000Z",
        privacy_accepted_version: CURRENT_PRIVACY_VERSION,
      }),
    ).toBe(true);
  });

  it("requireLegalAcceptance fails closed when acceptance is missing", () => {
    expect(
      requireLegalAcceptance(
        { terms_accepted_at: "2026-06-25T00:00:00.000Z" },
        { throwOnMissing: false },
      ),
    ).toBe(false);
  });

  it("requireLegalAcceptance re-prompts when a stale version was accepted", () => {
    expect(
      requireLegalAcceptance(
        {
          terms_accepted_at: "2025-01-01T00:00:00.000Z",
          terms_accepted_version: "2025-01-01",
          privacy_accepted_at: "2025-01-01T00:00:00.000Z",
          privacy_accepted_version: "2025-01-01",
        },
        { throwOnMissing: false },
      ),
    ).toBe(false);
  });
});
