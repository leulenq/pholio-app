const {
  CONSENT_COOKIE,
  CONSENT_VERSION,
  parseConsent,
  serializeConsent,
  consentCookieOptions,
  analyticsAllowed,
} = require("../../src/shared/lib/consent");

function reqWith(cookieValue) {
  return { cookies: cookieValue === undefined ? {} : { [CONSENT_COOKIE]: cookieValue } };
}

describe("shared consent cookie", () => {
  it("round-trips a granted choice", () => {
    const parsed = parseConsent(serializeConsent({ analytics: true }));
    expect(parsed).toEqual(
      expect.objectContaining({ necessary: true, analytics: true }),
    );
  });

  it("round-trips a declined choice", () => {
    const parsed = parseConsent(serializeConsent({ analytics: false }));
    expect(parsed.analytics).toBe(false);
    // Strictly-necessary storage is never optional.
    expect(parsed.necessary).toBe(true);
  });

  it("decodes a URL-encoded value written by client JS", () => {
    const raw = encodeURIComponent(serializeConsent({ analytics: true }));
    expect(parseConsent(raw).analytics).toBe(true);
  });

  it("rejects a payload from a different consent version", () => {
    const stale = JSON.stringify({
      v: CONSENT_VERSION + 1,
      necessary: true,
      analytics: true,
    });
    expect(parseConsent(stale)).toBeNull();
  });

  it.each([undefined, "", "not-json", "{}", '{"v":1,"necessary":"yes"}'])(
    "returns null for malformed input %p",
    (raw) => {
      expect(parseConsent(raw)).toBeNull();
    },
  );

  describe("analyticsAllowed", () => {
    it("fails closed when no choice has been recorded", () => {
      // This is the whole point of the gate: before it existed, public
      // portfolio views set a persistent identifier regardless of consent.
      expect(analyticsAllowed(reqWith(undefined))).toBe(false);
    });

    it("is false when analytics was declined", () => {
      expect(analyticsAllowed(reqWith(serializeConsent({ analytics: false })))).toBe(
        false,
      );
    });

    it("is true only on an affirmative grant", () => {
      expect(analyticsAllowed(reqWith(serializeConsent({ analytics: true })))).toBe(
        true,
      );
    });

    it("fails closed on a garbled cookie", () => {
      expect(analyticsAllowed(reqWith("%%%"))).toBe(false);
    });

    it("tolerates a request with no cookies at all", () => {
      expect(analyticsAllowed({})).toBe(false);
    });
  });

  describe("cookie attributes", () => {
    const options = consentCookieOptions();

    it("is readable by client JS on both surfaces", () => {
      // Not httpOnly: the marketing site and the SPA both read and write it.
      expect(options.httpOnly).toBe(false);
    });

    it("is scoped so one choice covers www and app", () => {
      expect(options.path).toBe("/");
      expect(options.sameSite).toBe("lax");
      expect(options).toHaveProperty("domain");
    });

    it("persists long enough to avoid re-prompting on every visit", () => {
      expect(options.maxAge).toBeGreaterThan(180 * 24 * 60 * 60 * 1000);
    });
  });
});
