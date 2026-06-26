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
});
