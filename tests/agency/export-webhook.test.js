"use strict";

/**
 * The export webhook fetches a URL an agency typed into a settings field, from
 * Pholio's server. That is an SSRF primitive unless it is constrained, so most
 * of what is tested here is the constraint rather than the feature.
 */

const {
  WebhookRejected,
  assertDeliverableUrl,
  deliver,
  isBlockedAddress,
  signPayload,
} = require("../../src/domains/agency/services/export-webhook");

const resolvesTo = (...addresses) => async () =>
  addresses.map((address) => ({ address }));

describe("addresses that must never be fetched", () => {
  test.each([
    ["127.0.0.1", "loopback"],
    ["10.0.0.5", "private class A"],
    ["172.16.4.1", "private class B"],
    ["192.168.1.1", "private class C"],
    ["169.254.169.254", "cloud metadata"],
    ["0.0.0.0", "this network"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["224.0.0.1", "multicast"],
    ["::1", "IPv6 loopback"],
    ["fe80::1", "IPv6 link-local"],
    ["fd00::1", "IPv6 unique local"],
    ["::ffff:10.0.0.1", "IPv4-mapped private"],
  ])("%s (%s) is blocked", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  test.each([["8.8.8.8"], ["1.1.1.1"], ["93.184.216.34"], ["2606:4700::1111"]])(
    "%s is allowed",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );

  test("anything unparseable is blocked rather than guessed at", () => {
    expect(isBlockedAddress("not-an-address")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
  });
});

describe("URL validation", () => {
  const ok = resolvesTo("93.184.216.34");

  test("https to a public host is accepted", async () => {
    const url = await assertDeliverableUrl("https://hooks.example.com/pholio", {
      resolver: ok,
    });
    expect(url.hostname).toBe("hooks.example.com");
  });

  test("http is refused — the payload carries contact details", async () => {
    await expect(
      assertDeliverableUrl("http://hooks.example.com/x", { resolver: ok }),
    ).rejects.toMatchObject({ code: "https_required" });
  });

  test("credentials in the URL are refused", async () => {
    await expect(
      assertDeliverableUrl("https://user:pass@hooks.example.com/x", {
        resolver: ok,
      }),
    ).rejects.toMatchObject({ code: "credentials_not_allowed" });
  });

  test("a literal private IP is refused without a lookup", async () => {
    await expect(
      assertDeliverableUrl("https://169.254.169.254/latest/meta-data/"),
    ).rejects.toMatchObject({ code: "private_address" });
  });

  test("a public hostname resolving to a private address is refused", async () => {
    // The case that makes string validation worthless on its own.
    await expect(
      assertDeliverableUrl("https://totally-legit.example.com/hook", {
        resolver: resolvesTo("10.1.2.3"),
      }),
    ).rejects.toMatchObject({ code: "private_address" });
  });

  test("ONE private answer among several is enough to refuse", async () => {
    // DNS rebinding: picking the public answer would be a race lost at
    // delivery time.
    await expect(
      assertDeliverableUrl("https://rebind.example.com/hook", {
        resolver: resolvesTo("93.184.216.34", "127.0.0.1"),
      }),
    ).rejects.toMatchObject({ code: "private_address" });
  });

  test("an unresolvable host is refused", async () => {
    await expect(
      assertDeliverableUrl("https://nope.example.com/x", {
        resolver: async () => {
          throw new Error("ENOTFOUND");
        },
      }),
    ).rejects.toMatchObject({ code: "unresolvable" });
  });

  test("garbage is refused as invalid rather than fetched", async () => {
    await expect(assertDeliverableUrl("not a url")).rejects.toBeInstanceOf(
      WebhookRejected,
    );
  });
});

describe("signing", () => {
  test("the timestamp is inside the signed material", () => {
    const body = JSON.stringify({ event: "submission" });
    expect(signPayload(body, "s3cret", 1000)).not.toBe(
      signPayload(body, "s3cret", 1001),
    );
  });

  test("a different secret produces a different signature", () => {
    const body = "{}";
    expect(signPayload(body, "a", 1)).not.toBe(signPayload(body, "b", 1));
  });

  test("it is stable for the same inputs", () => {
    expect(signPayload("{}", "k", 7)).toBe(signPayload("{}", "k", 7));
  });
});

describe("delivery", () => {
  const publicResolver = resolvesTo("93.184.216.34");

  test("signs the request when a secret is configured", async () => {
    let seen = null;
    const fetchImpl = async (_url, init) => {
      seen = init;
      return { status: 200, text: async () => "" };
    };

    const result = await deliver(
      { url: "https://hooks.example.com/h", secret: "shh" },
      { event: "submission", applicationId: "a1" },
      { fetchImpl, resolver: publicResolver, now: () => 1_700_000_000_000 },
    );

    expect(result.ok).toBe(true);
    expect(seen.headers["x-pholio-signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(seen.headers["x-pholio-timestamp"]).toBe("1700000000");
    // A redirect must not be followed — it would defeat the address check.
    expect(seen.redirect).toBe("manual");
  });

  test("omits the signature when no secret is set, and still delivers", async () => {
    let seen = null;
    const fetchImpl = async (_url, init) => {
      seen = init;
      return { status: 204, text: async () => "" };
    };
    const result = await deliver(
      { url: "https://hooks.example.com/h", secret: null },
      { event: "submission" },
      { fetchImpl, resolver: publicResolver },
    );
    expect(result.ok).toBe(true);
    expect(seen.headers["x-pholio-signature"]).toBeUndefined();
  });

  test("a redirect is a failure, not a hop to follow", async () => {
    const fetchImpl = async () => ({ status: 302, text: async () => "" });
    const result = await deliver(
      { url: "https://hooks.example.com/h" },
      {},
      { fetchImpl, resolver: publicResolver },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/redirect/i);
  });

  test("a rejected URL never reaches fetch at all", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return { status: 200, text: async () => "" };
    };
    const result = await deliver(
      { url: "https://internal.example.com/h" },
      {},
      { fetchImpl, resolver: resolvesTo("192.168.0.9") },
    );
    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/private address/i);
  });

  test("a broken endpoint resolves to a failure rather than throwing", async () => {
    // A talent's submission must not fail because an agency's endpoint is down.
    const fetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(
      deliver(
        { url: "https://hooks.example.com/h" },
        {},
        { fetchImpl, resolver: publicResolver },
      ),
    ).resolves.toMatchObject({ ok: false, error: "ECONNREFUSED" });
  });

  test("a 500 is reported with the endpoint's own words, truncated", async () => {
    const fetchImpl = async () => ({
      status: 500,
      text: async () => "x".repeat(9999),
    });
    const result = await deliver(
      { url: "https://hooks.example.com/h" },
      {},
      { fetchImpl, resolver: publicResolver },
    );
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.error.length).toBeLessThanOrEqual(2048);
  });
});
