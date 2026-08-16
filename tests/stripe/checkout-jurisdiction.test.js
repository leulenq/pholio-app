/**
 * NY-first rollout: Studio+ paid checkout is withheld from US states whose
 * talent-services rules are still under legal review (Cal. Lab. Code
 * §1702.1 / §1701). Two properties matter more than the block itself:
 *
 *   1. It FAILS OPEN — a geolocation outage must never stop a sale.
 *   2. It is US-state scoped — `CA` is California, never Canada.
 */

const {
  evaluateCheckoutJurisdiction,
  getBlockedRegions,
  resolveRegionCode,
  isNonRoutableIp,
} = require("../../src/shared/lib/checkout-jurisdiction");

const CALIFORNIA_IP = "8.8.8.8"; // never actually contacted: lookup is injected

function geo(overrides = {}) {
  return {
    ip_address: CALIFORNIA_IP,
    country: "US",
    region: "California",
    region_code: "CA",
    city: "Los Angeles",
    ...overrides,
  };
}

describe("checkout jurisdiction gate", () => {
  const originalEnv = process.env.STUDIO_BLOCKED_REGIONS;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.STUDIO_BLOCKED_REGIONS;
    else process.env.STUDIO_BLOCKED_REGIONS = originalEnv;
  });

  describe("configuration", () => {
    it("defaults to blocking US-California", () => {
      delete process.env.STUDIO_BLOCKED_REGIONS;
      expect([...getBlockedRegions()]).toEqual(["CA"]);
    });

    it("is config-driven and case/whitespace tolerant", () => {
      process.env.STUDIO_BLOCKED_REGIONS = " ca , nj ";
      expect([...getBlockedRegions()].sort()).toEqual(["CA", "NJ"]);
    });

    it("an empty value disables the fence entirely", async () => {
      process.env.STUDIO_BLOCKED_REGIONS = "";
      expect(getBlockedRegions().size).toBe(0);

      const lookup = jest.fn();
      const decision = await evaluateCheckoutJurisdiction(CALIFORNIA_IP, { lookup });
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe("fence_disabled");
      // Not even a lookup is performed when the fence is off.
      expect(lookup).not.toHaveBeenCalled();
    });
  });

  describe("region matching", () => {
    it("blocks a California requester with an honest message", async () => {
      delete process.env.STUDIO_BLOCKED_REGIONS;
      const decision = await evaluateCheckoutJurisdiction(CALIFORNIA_IP, {
        lookup: async () => geo(),
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("region_blocked");
      expect(decision.regionCode).toBe("CA");
      expect(decision.message).toMatch(/aren't offered in California yet/i);
      expect(decision.message).toMatch(/legal review/i);
      expect(decision.message).toMatch(/free/i);
    });

    it("blocks California even when ipapi returns only the full region name", async () => {
      delete process.env.STUDIO_BLOCKED_REGIONS;
      const decision = await evaluateCheckoutJurisdiction(CALIFORNIA_IP, {
        lookup: async () => geo({ region_code: null, region: "California" }),
      });
      expect(decision.allowed).toBe(false);
      expect(decision.regionCode).toBe("CA");
    });

    it("NEVER blocks Canada — country CA is not state CA", async () => {
      delete process.env.STUDIO_BLOCKED_REGIONS;
      const decision = await evaluateCheckoutJurisdiction("24.48.0.1", {
        lookup: async () =>
          geo({ country: "CA", region: "Quebec", region_code: "QC", city: "Montreal" }),
      });
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe("non_us");
    });

    it("allows a New York requester", async () => {
      delete process.env.STUDIO_BLOCKED_REGIONS;
      const decision = await evaluateCheckoutJurisdiction("74.6.143.25", {
        lookup: async () =>
          geo({ region: "New York", region_code: "NY", city: "New York" }),
      });
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe("region_allowed");
      expect(decision.regionCode).toBe("NY");
    });

    it("resolveRegionCode prefers region_code over the long name", () => {
      expect(resolveRegionCode({ region_code: "NY", region: "New York" })).toBe("NY");
      expect(resolveRegionCode({ region: "California" })).toBe("CA");
      expect(resolveRegionCode({ region: "Bavaria" })).toBeNull();
      expect(resolveRegionCode(null)).toBeNull();
    });
  });

  describe("fails open", () => {
    it("allows checkout when the lookup returns null (timeout / API error)", async () => {
      delete process.env.STUDIO_BLOCKED_REGIONS;
      const decision = await evaluateCheckoutJurisdiction(CALIFORNIA_IP, {
        lookup: async () => null,
      });
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe("lookup_unavailable");
    });

    it("allows checkout when the lookup throws", async () => {
      delete process.env.STUDIO_BLOCKED_REGIONS;
      const decision = await evaluateCheckoutJurisdiction(CALIFORNIA_IP, {
        lookup: async () => {
          throw new Error("ETIMEDOUT");
        },
      });
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe("lookup_error");
    });

    it("allows checkout when the region is unknown", async () => {
      delete process.env.STUDIO_BLOCKED_REGIONS;
      const decision = await evaluateCheckoutJurisdiction(CALIFORNIA_IP, {
        lookup: async () => geo({ region: null, region_code: null }),
      });
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe("unknown_region");
    });

    it("allows checkout with no IP, and never calls out to the network", async () => {
      delete process.env.STUDIO_BLOCKED_REGIONS;
      const lookup = jest.fn();
      for (const ip of [null, "", "127.0.0.1", "::1", "10.0.0.4", "192.168.1.9", "172.16.4.4"]) {
        const decision = await evaluateCheckoutJurisdiction(ip, { lookup });
        expect(decision.allowed).toBe(true);
        expect(decision.reason).toBe("no_ip");
      }
      expect(lookup).not.toHaveBeenCalled();
    });

    it("treats loopback and private ranges as non-routable, public IPs as routable", () => {
      expect(isNonRoutableIp("127.0.0.1")).toBe(true);
      expect(isNonRoutableIp("::ffff:127.0.0.1")).toBe(true);
      expect(isNonRoutableIp("169.254.1.1")).toBe(true);
      expect(isNonRoutableIp("8.8.8.8")).toBe(false);
      expect(isNonRoutableIp("172.32.0.1")).toBe(false); // just outside 172.16/12
    });
  });
});
