process.env.NODE_ENV = "test";

const crypto = require("crypto");
const request = require("supertest");
const app = require("../../src/app");
const config = require("../../src/config");
const knex = require("../../src/shared/db/knex");
const {
  buildInstagramAuthorizeUrl,
  verifyInstagramSignedRequest,
} = require("../../src/domains/onboarding/services/providers/instagram");

const TEST_SECRET = "instagram-test-secret";
const originalInstagramConfig = { ...config.instagram };

function signedRequest(payload) {
  const encodedPayload = Buffer.from(
    JSON.stringify({ algorithm: "HMAC-SHA256", ...payload }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", TEST_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  return `${signature}.${encodedPayload}`;
}

beforeAll(async () => {
  Object.assign(config.instagram, {
    appId: "1058009693761008",
    appSecret: TEST_SECRET,
    redirectUri: "https://app.pholio.studio/api/auth/instagram/callback",
    scope: "instagram_business_basic",
  });
  await knex.migrate.latest();
});

afterAll(async () => {
  Object.assign(config.instagram, originalInstagramConfig);
  await knex.destroy();
});

describe("Instagram Login provider", () => {
  test("builds Meta's current business-login authorization URL", () => {
    const url = new URL(buildInstagramAuthorizeUrl("state-value"));

    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("1058009693761008");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("force_reauth")).toBe("true");
  });

  test("accepts an authentic Meta signed request", () => {
    expect(
      verifyInstagramSignedRequest(signedRequest({ user_id: "ig-user-1" })),
    ).toEqual(
      expect.objectContaining({
        algorithm: "HMAC-SHA256",
        user_id: "ig-user-1",
      }),
    );
  });

  test("rejects a tampered Meta signed request", () => {
    const valid = signedRequest({ user_id: "ig-user-1" });
    const [signature, payload] = valid.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "attacker" }),
    ).toString("base64url");

    expect(() =>
      verifyInstagramSignedRequest(`${signature}.${tamperedPayload || payload}`),
    ).toThrow("Invalid Instagram signed request signature");
  });
});

describe("Instagram lifecycle callbacks", () => {
  test("rejects unsigned data-deletion requests", async () => {
    const response = await request(app)
      .post("/api/auth/instagram/data-deletion")
      .type("form")
      .send({ signed_request: "invalid" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_SIGNED_REQUEST");
  });

  test("returns Meta's required deletion receipt for an unknown identity", async () => {
    const response = await request(app)
      .post("/api/auth/instagram/data-deletion")
      .type("form")
      .send({ signed_request: signedRequest({ user_id: "not-in-pholio" }) });

    expect(response.status).toBe(200);
    expect(response.body.confirmation_code).toMatch(/^[a-f0-9]{32}$/);
    expect(response.body.url).toContain(
      "/api/auth/instagram/data-deletion/status",
    );
  });

  test("acknowledges deauthorization idempotently for an unknown identity", async () => {
    const response = await request(app)
      .post("/api/auth/instagram/deauthorize")
      .type("form")
      .send({ signed_request: signedRequest({ user_id: "not-in-pholio" }) });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
  });
});
