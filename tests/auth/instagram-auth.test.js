const express = require("express");
const session = require("express-session");
const request = require("supertest");

jest.mock("../../src/domains/onboarding/services/providers/instagram", () => ({
  isInstagramConfigured: jest.fn(() => true),
  buildInstagramAuthorizeUrl: jest.fn(
    (state) => `https://instagram.example/oauth?state=${state}`,
  ),
  verifyInstagramCode: jest.fn(async () => ({
    instagram_id: "17841400000000000",
    handle: "@pholio.test",
    picture: "https://images.example/pholio-test.jpg",
  })),
}));

jest.mock("../../src/domains/auth/services/firebase-admin", () => ({
  createCustomToken: jest.fn(async () => "firebase-custom-token"),
}));

const router = require("../../src/domains/auth/routes/instagram-auth");
const {
  createCustomToken,
} = require("../../src/domains/auth/services/firebase-admin");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "instagram-auth-test",
      resave: false,
      saveUninitialized: false,
    }),
  );
  app.use(router);
  return app;
}

describe("Instagram professional-account auth", () => {
  beforeEach(() => {
    createCustomToken.mockClear();
  });

  test("rejects signup before writing OAuth state when adult DOB evidence is invalid", async () => {
    const response = await request(createApp())
      .post("/api/auth/instagram/start?flow=signup")
      .send({ date_of_birth: "2010-01-01" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("ADULT_ELIGIBILITY_REQUIRED");
  });

  test("retains adult DOB through the signup authorization callback and consumes it once", async () => {
    const agent = request.agent(createApp());
    const start = await agent
      .post("/api/auth/instagram/start?flow=signup&next=/dashboard/talent")
      .set("X-Pholio-Request", "same-origin")
      .send({ date_of_birth: "1990-07-18" });

    expect(start.status).toBe(200);
    const state = new URL(start.body.authorize_url).searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await agent.get(
      `/api/auth/instagram/callback?code=authorization-code&state=${state}`,
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain("/auth/instagram/callback?flow=signup");
    expect(createCustomToken).toHaveBeenCalledWith(
      "instagram:17841400000000000",
      expect.objectContaining({
        provider: "instagram",
        instagram_handle: "@pholio.test",
      }),
    );

    const complete = await agent.get("/api/auth/instagram/complete");
    expect(complete.status).toBe(200);
    expect(complete.body).toEqual({
      success: true,
      custom_token: "firebase-custom-token",
      flow: "signup",
      next: "/dashboard/talent",
      date_of_birth: "1990-07-18",
    });

    const replay = await agent.get("/api/auth/instagram/complete");
    expect(replay.status).toBe(404);
  });
});
