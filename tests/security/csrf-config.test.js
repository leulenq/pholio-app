const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  CSRF_ENFORCE: process.env.CSRF_ENFORCE,
  SESSION_SECRET: process.env.SESSION_SECRET,
};

function loadConfig({ nodeEnv, csrfEnforce }) {
  jest.resetModules();
  process.env.NODE_ENV = nodeEnv;
  process.env.SESSION_SECRET = "csrf-config-test-secret";

  if (csrfEnforce === undefined) {
    delete process.env.CSRF_ENFORCE;
  } else {
    process.env.CSRF_ENFORCE = csrfEnforce;
  }

  return require("../../src/config");
}

afterAll(() => {
  Object.entries(ORIGINAL_ENV).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
  jest.resetModules();
});

describe("CSRF enforcement configuration", () => {
  test("cannot be disabled in production", () => {
    expect(
      loadConfig({ nodeEnv: "production", csrfEnforce: "0" })
        .csrfProtectionEnabled,
    ).toBe(true);
  });

  test("is enabled by default in development", () => {
    expect(
      loadConfig({ nodeEnv: "development" }).csrfProtectionEnabled,
    ).toBe(true);
  });

  test("is disabled by default in tests to preserve existing route fixtures", () => {
    expect(loadConfig({ nodeEnv: "test" }).csrfProtectionEnabled).toBe(false);
  });

  test("can be enabled explicitly for full-app security tests", () => {
    expect(
      loadConfig({ nodeEnv: "test", csrfEnforce: "1" })
        .csrfProtectionEnabled,
    ).toBe(true);
  });
});
