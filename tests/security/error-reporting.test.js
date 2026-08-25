"use strict";

/**
 * Error reporting and the health endpoint.
 *
 * The production audit's finding was that nothing anywhere told a human when
 * production broke: the stack was explicitly discarded in production, there was
 * no health endpoint, and no reporting destination existed. What is tested here
 * is the part that must hold whatever destination is eventually configured —
 * that reporting cannot throw, cannot block, and cannot leak.
 */

const {
  REPORT_TIMEOUT_MS,
  buildReport,
  reportError,
  setErrorReporter,
} = require("../../src/shared/lib/error-reporting");

afterEach(() => {
  setErrorReporter(null);
  delete process.env.ERROR_WEBHOOK_URL;
});

describe("a report carries what an operator needs and nothing else", () => {
  const error = Object.assign(new Error("boom"), { code: "E_BOOM" });

  test("the stack is included — it is the whole point", () => {
    const report = buildReport(error, { path: "/api/x", method: "POST", status: 500 });
    expect(report.stack).toContain("Error: boom");
    expect(report.path).toBe("/api/x");
    expect(report.status).toBe(500);
    expect(report.code).toBe("E_BOOM");
  });

  test("a user id, never an identity", () => {
    const report = buildReport(error, {
      userId: "u-1",
      // Anything else a caller might pass must not survive into the payload.
      email: "ada@example.com",
      body: { password: "hunter2" },
      headers: { cookie: "connect.sid=abc" },
    });
    expect(report.userId).toBe("u-1");
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("ada@example.com");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("connect.sid");
  });

  test("long values are bounded so a report cannot become the problem", () => {
    const huge = Object.assign(new Error("x".repeat(9999)), {
      stack: "y".repeat(99999),
    });
    const report = buildReport(huge, {});
    expect(report.message.length).toBeLessThanOrEqual(500);
    expect(report.stack.length).toBeLessThanOrEqual(4000);
  });
});

describe("reporting never becomes the error anyone sees", () => {
  test("a reporter that throws is swallowed", () => {
    setErrorReporter(() => { throw new Error("reporter exploded"); });
    expect(() => reportError(new Error("original"))).not.toThrow();
  });

  test("a null error is ignored rather than reported", () => {
    const seen = [];
    setErrorReporter((e) => seen.push(e));
    reportError(null);
    reportError(undefined);
    expect(seen).toHaveLength(0);
  });

  test("with nothing configured it is a no-op, not a failure", () => {
    expect(() => reportError(new Error("quiet"))).not.toThrow();
  });

  test("a registered reporter receives the error and the built report", () => {
    const seen = [];
    setErrorReporter((error, report) => seen.push({ error, report }));
    reportError(new Error("boom"), { path: "/api/x" });

    expect(seen).toHaveLength(1);
    expect(seen[0].error.message).toBe("boom");
    expect(seen[0].report.path).toBe("/api/x");
  });
});

describe("the webhook is fire-and-forget", () => {
  test("reportError returns before the request settles", () => {
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/errors";
    let resolveFetch;
    const pending = new Promise((r) => { resolveFetch = r; });
    globalThis.fetch = () => pending;

    const before = Date.now();
    reportError(new Error("boom"));
    // A slow destination must not add latency to a request that is already
    // failing — and under serverless a hanging report holds the invocation.
    expect(Date.now() - before).toBeLessThan(50);

    resolveFetch({ status: 200 });
  });

  test("a webhook that rejects does not surface", async () => {
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/errors";
    globalThis.fetch = () => Promise.reject(new Error("ECONNREFUSED"));
    expect(() => reportError(new Error("boom"))).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });

  test("the timeout is short enough to not matter", () => {
    expect(REPORT_TIMEOUT_MS).toBeLessThanOrEqual(2000);
  });
});
