"use strict";

process.env.DATABASE_URL = "sqlite://./test-message-reply.sqlite3";
process.env.DB_CLIENT = "sqlite3";

const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const messageReplyRoutes = require("../../src/domains/messaging/routes/message-reply");
const {
  createOrRefreshReplyToken,
  validateReplyToken,
  buildReplyUrl,
} = require("../../src/domains/messaging/services/message-reply-tokens");

const TEST_DB_PATH = path.resolve(
  __dirname,
  "../../test-message-reply.sqlite3",
);

const AGENCY_ID = uuidv4();
const TALENT_ID = uuidv4();
const PROFILE_ID = uuidv4();
const APP_ID = uuidv4();

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }),
  );
  app.use(messageReplyRoutes);
  return app;
}

async function ensureCoreSchema() {
  await knex.migrate.latest();
}

beforeAll(async () => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  try {
    await knex.migrate.rollback({}, true);
  } catch {
    /* fresh db */
  }
  await ensureCoreSchema();
}, 120000);

beforeEach(async () => {
  await knex("message_reply_session_tokens").del();
  await knex("message_reply_tokens").del();
  await knex("messages").del();
  await knex("application_activities").del();
  await knex("applications").del();
  await knex("profiles").del();
  await knex("agencies").del();
  await knex("users").del();

  await knex("users").insert([
    {
      id: AGENCY_ID,
      email: "agency-reply-test@example.com",
      role: "AGENCY",
      password_hash: "test",
      first_name: "Elite",
      last_name: "Models",
    },
    {
      id: TALENT_ID,
      email: "talent-reply-test@example.com",
      role: "TALENT",
      password_hash: "test",
      first_name: "Nova",
      last_name: "Lane",
    },
  ]);

  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Elite Models",
  });

  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: TALENT_ID,
    first_name: "Nova",
    last_name: "Lane",
    slug: "nova-lane-reply-test",
    city: "New York, NY",
    height_cm: 175,
    bio_raw: "Test profile",
    bio_curated: "Test profile",
  });

  await knex("applications").insert({
    id: APP_ID,
    profile_id: PROFILE_ID,
    agency_id: AGENCY_ID,
    status: "pending",
  });

  await knex("messages").insert({
    id: uuidv4(),
    application_id: APP_ID,
    sender_id: AGENCY_ID,
    sender_type: "AGENCY",
    message: "Hi Nova, we'd love to chat about your submission.",
    is_read: false,
  });
});

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

describe("message reply tokens service", () => {
  test("creates and validates a reply token", async () => {
    const { token, expiresAt } = await createOrRefreshReplyToken({
      applicationId: APP_ID,
      talentUserId: TALENT_ID,
    });

    expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(expiresAt).toBeTruthy();

    const ctx = await validateReplyToken(token);
    expect(ctx.applicationId).toBe(APP_ID);
    expect(ctx.talentUserId).toBe(TALENT_ID);
    expect(ctx.agencyName).toBe("Elite Models");
  });

  test("buildReplyUrl includes token path", () => {
    const url = buildReplyUrl("abc123token");
    expect(url).toContain("/reply/abc123token");
  });
});

describe("message reply API", () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  test("GET /api/reply/:token returns thread without session", async () => {
    const { token } = await createOrRefreshReplyToken({
      applicationId: APP_ID,
      talentUserId: TALENT_ID,
    });

    const res = await request(app).get(`/api/reply/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.agencyName).toBe("Elite Models");
    expect(res.body.data.messages).toHaveLength(1);
    expect(res.body.data.messages[0].sender_type).toBe("AGENCY");
  });

  test("POST /api/reply/:token/messages sends talent reply", async () => {
    const { token } = await createOrRefreshReplyToken({
      applicationId: APP_ID,
      talentUserId: TALENT_ID,
    });

    const res = await request(app)
      .post(`/api/reply/${token}/messages`)
      .send({ message: "Thanks! I'm available this week." });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sender_type).toBe("TALENT");

    const messages = await knex("messages")
      .where({ application_id: APP_ID })
      .orderBy("created_at", "asc");
    expect(messages).toHaveLength(2);
    expect(messages[1].message).toBe("Thanks! I'm available this week.");
  });

  test("uses a fresh hashed one-time token to bootstrap a talent session", async () => {
    const { token } = await createOrRefreshReplyToken({
      applicationId: APP_ID,
      talentUserId: TALENT_ID,
    });

    const agent = request.agent(app);
    const issue = await agent.post(`/api/reply/${token}/session-token`);

    expect(issue.status).toBe(201);
    expect(issue.body.data.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);

    const stored = await knex("message_reply_session_tokens").first();
    expect(stored.token_hash).toHaveLength(64);
    expect(stored.token_hash).not.toBe(issue.body.data.token);
    expect(stored.consumed_at).toBeNull();

    // The emailed, three-day reply bearer is not valid at the higher-privilege
    // session endpoint; only the newly issued ten-minute credential is accepted.
    const replyBearerAttempt = await agent.post(
      `/api/reply/${token}/session`,
    );
    expect(replyBearerAttempt.status).toBe(410);

    const res = await agent.post(
      `/api/reply/${issue.body.data.token}/session`,
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.redirectTo).toContain("/dashboard/talent");

    const cookie = res.headers["set-cookie"];
    expect(cookie).toBeDefined();
    expect(cookie.some((c) => c.includes("connect.sid"))).toBe(true);

    const consumed = await knex("message_reply_session_tokens")
      .where({ id: stored.id })
      .first();
    expect(consumed.consumed_at).toBeTruthy();

    const replay = await agent.post(
      `/api/reply/${issue.body.data.token}/session`,
    );
    expect(replay.status).toBe(410);
    expect(replay.body.error.code).toBe(
      "REPLY_SESSION_TOKEN_INVALID_OR_USED",
    );

    const reissue = await agent.post(`/api/reply/${token}/session-token`);
    expect(reissue.status).toBe(409);
    expect(reissue.body.error.code).toBe(
      "REPLY_SESSION_TOKEN_ALREADY_ISSUED",
    );
  });

  test("rejects an expired session bootstrap token", async () => {
    const { token } = await createOrRefreshReplyToken({
      applicationId: APP_ID,
      talentUserId: TALENT_ID,
    });

    const issue = await request(app).post(
      `/api/reply/${token}/session-token`,
    );
    await knex("message_reply_session_tokens").update({
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const response = await request(app).post(
      `/api/reply/${issue.body.data.token}/session`,
    );
    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe(
      "REPLY_SESSION_TOKEN_INVALID_OR_USED",
    );
  });

  test("rejects invalid or expired tokens", async () => {
    const res = await request(app).get("/api/reply/not-a-real-token");
    expect(res.status).toBe(404);
  });
});
