"use strict";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function loadBoundaries(nodeEnv) {
  jest.resetModules();
  process.env.NODE_ENV = nodeEnv;
  return require("../../src/shared/lib/production-boundaries");
}

function responseDouble() {
  const response = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  return response;
}

function requestDouble(headers = {}, method = "POST", originalUrl = "/api/login") {
  return {
    method,
    originalUrl,
    path: originalUrl,
    get: jest.fn((name) => headers[String(name).toLowerCase()]),
  };
}

afterAll(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  jest.resetModules();
});

describe("production app-session boundaries", () => {
  test("does not credential the marketing origin or set a parent-domain session cookie", () => {
    const boundaries = loadBoundaries("production");

    expect(boundaries.credentialedCorsOrigins()).toEqual([
      "https://app.pholio.studio",
    ]);
    expect([...boundaries.sessionMutationOrigins()]).toEqual([
      "https://app.pholio.studio",
    ]);
    expect(boundaries.sessionCookieScope()).toEqual({ domain: undefined });
    expect(boundaries.legacySharedSessionCookieOptions()).toEqual(
      expect.objectContaining({ domain: ".pholio.studio", httpOnly: true }),
    );
  });

  test("rejects headerless and marketing-origin session mutations", () => {
    const boundaries = loadBoundaries("production");
    const guard = boundaries.requireSessionMutationClientIntent({ enabled: true });

    const noIntentResponse = responseDouble();
    guard(requestDouble({ origin: "https://app.pholio.studio" }), noIntentResponse, jest.fn());
    expect(noIntentResponse.status).toHaveBeenCalledWith(403);
    expect(noIntentResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ reason: "missing_request_header" }),
      }),
    );

    const marketingResponse = responseDouble();
    guard(
      requestDouble({
        origin: "https://www.pholio.studio",
        "x-pholio-request": "same-origin",
      }),
      marketingResponse,
      jest.fn(),
    );
    expect(marketingResponse.status).toHaveBeenCalledWith(403);
    expect(marketingResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ reason: "untrusted_origin" }),
      }),
    );
  });

  test("accepts an app-origin client-intent mutation", () => {
    const boundaries = loadBoundaries("production");
    const guard = boundaries.requireSessionMutationClientIntent({ enabled: true });
    const next = jest.fn();

    guard(
      requestDouble({
        origin: "https://app.pholio.studio",
        "x-pholio-request": "same-origin",
      }),
      responseDouble(),
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });
});
