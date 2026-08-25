"use strict";

/**
 * The credential-free sign-in paths must fail CLOSED.
 *
 * Two gates mint a session without a password: `isDevSeedAuthEnabled`
 * (dev-seed-session.js, behind the devAutoAuth middleware) and
 * `isDevLoginEnabled` (POST /api/dev/login). Both were written as
 * `NODE_ENV !== "production" && AUTH_PASSTHROUGH_ENABLED === "1"`.
 *
 * That reads as "off in production", but the dangerous state is the DEFAULT
 * one: an unset NODE_ENV, a capitalised "Production", a renamed "staging", a
 * typo — every one of them satisfies `!== "production"` and opens the door. A
 * serverless cold start that drops the environment is enough.
 *
 * These tests assert the inverted rule: the bypass is available ONLY when the
 * runtime explicitly says development or test.
 */

const {
  isDevelopmentRuntime,
  isDeployedRuntime,
} = require("../../src/shared/lib/runtime-environment");

describe("isDevelopmentRuntime — only an explicit dev/test runtime", () => {
  test.each([["development"], ["test"], ["DEVELOPMENT"], ["  test  "]])(
    "%p unlocks development behaviour",
    (value) => {
      expect(isDevelopmentRuntime({ NODE_ENV: value })).toBe(true);
      expect(isDeployedRuntime({ NODE_ENV: value })).toBe(false);
    },
  );

  // Each of these previously satisfied `!== "production"` and would have made a
  // credential-free sign-in reachable.
  test.each([
    ["production"],
    ["Production"],
    ["prod"],
    ["staging"],
    ["preview"],
    [""],
    ["   "],
    [undefined],
  ])("%p is treated as a deployment", (value) => {
    const env = value === undefined ? {} : { NODE_ENV: value };
    expect(isDevelopmentRuntime(env)).toBe(false);
    expect(isDeployedRuntime(env)).toBe(true);
  });

  test("an entirely empty environment is a deployment, not a dev box", () => {
    expect(isDevelopmentRuntime({})).toBe(false);
  });
});

describe("the credential-free gates honour it", () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
    jest.resetModules();
  });

  function loadGates(env) {
    jest.resetModules();
    process.env = { ...ORIGINAL, ...env };
    // Both modules read process.env at call time, but re-require to be certain
    // no module-level caching of the flag creeps in later.
    const {
      isDevSeedAuthEnabled,
    } = require("../../src/shared/lib/dev-seed-session");
    return { isDevSeedAuthEnabled };
  }

  test("dev seed auth is OFF when NODE_ENV is unset, even with the flag set", () => {
    const { isDevSeedAuthEnabled } = loadGates({
      NODE_ENV: undefined,
      AUTH_PASSTHROUGH_ENABLED: "1",
    });
    delete process.env.NODE_ENV;
    expect(isDevSeedAuthEnabled()).toBe(false);
  });

  test.each([["production"], ["staging"], ["Production"]])(
    "dev seed auth is OFF in %p even with the flag set",
    (nodeEnv) => {
      const { isDevSeedAuthEnabled } = loadGates({
        NODE_ENV: nodeEnv,
        AUTH_PASSTHROUGH_ENABLED: "1",
      });
      expect(isDevSeedAuthEnabled()).toBe(false);
    },
  );

  test("dev seed auth is ON in development with the flag set", () => {
    const { isDevSeedAuthEnabled } = loadGates({
      NODE_ENV: "development",
      AUTH_PASSTHROUGH_ENABLED: "1",
    });
    expect(isDevSeedAuthEnabled()).toBe(true);
  });

  test("the flag alone is not enough — development without it stays off", () => {
    const { isDevSeedAuthEnabled } = loadGates({
      NODE_ENV: "development",
      AUTH_PASSTHROUGH_ENABLED: undefined,
    });
    delete process.env.AUTH_PASSTHROUGH_ENABLED;
    expect(isDevSeedAuthEnabled()).toBe(false);
  });
});

describe("the mock social verifier is gated the same way", () => {
  /* It fabricates handles and follower/engagement metrics, and
     `is_oauth_connected` is the only column that can set `verified = true`. A
     fail-open gate here means fake verified reach shown to agencies, so it
     belongs to the same class as the credential-free sign-in gates. */
  const ORIGINAL = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL };
    jest.resetModules();
  });

  function mountedRoutes(nodeEnv) {
    jest.resetModules();
    process.env = {
      ...ORIGINAL,
      NODE_ENV: nodeEnv,
      // config.js refuses to boot under production without this — a fail-closed
      // guard in its own right, and one the fixture has to satisfy to get far
      // enough to inspect the router.
      SESSION_SECRET: ORIGINAL.SESSION_SECRET || "test-secret-for-mount-check",
    };
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    const router = require("../../src/domains/talent/routes/index");
    return router.stack
      .map((layer) => (layer.regexp ? layer.regexp.source : ""))
      .join("|");
  }

  const MOCK_VERIFIER = "socials";

  test.each([["production"], ["Production"], ["staging"], [undefined]])(
    "%p does not mount the mock verifier",
    (nodeEnv) => {
      const mounted = mountedRoutes(nodeEnv);
      // The Phyllo router also matches "socials", so the mock is identified by
      // the oauth segment specifically.
      expect(mounted).not.toContain("oauth");
      expect(mounted).toContain(MOCK_VERIFIER);
    },
  );

  test("development does mount it", () => {
    expect(mountedRoutes("development")).toContain("oauth");
  });
});
