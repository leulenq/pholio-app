const express = require("express");
const request = require("supertest");

const {
  TALENT_AI_WRITER_POST_PATHS,
  createTalentAiWriterRateLimit,
  isTalentAiWriterPost,
  talentAiWriterKeyGenerator,
} = require("../../src/shared/middleware/ai-writer-rate-limit");

function buildApp({ max = 2 } = {}) {
  const app = express();

  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    const sessionId = req.get("x-test-session");
    req.session = userId ? { userId } : {};
    req.sessionID = sessionId || undefined;
    next();
  });
  app.use(createTalentAiWriterRateLimit({ max, windowMs: 60_000 }));
  app.use((_req, res) => res.status(200).json({ ok: true }));

  return app;
}

describe("talent AI writer rate limit", () => {
  test("covers every current AI-writing POST endpoint exactly", () => {
    expect([...TALENT_AI_WRITER_POST_PATHS].sort()).toEqual(
      [
        "/api/talent/bio/generate",
        "/api/talent/bio/refine",
        "/api/talent/message-polish/polish",
        "/api/talent/submission-note/draft",
        "/api/talent/submission-note/sharpen",
        "/api/talent/submission-note/shorten",
        "/api/talent/training-summary/expand",
        "/api/talent/training-summary/format",
        "/api/talent/training-summary/summarize",
      ].sort(),
    );

    for (const path of TALENT_AI_WRITER_POST_PATHS) {
      expect(
        isTalentAiWriterPost({
          method: "POST",
          originalUrl: `${path}?source=test`,
        }),
      ).toBe(true);
    }
  });

  test("does not match GETs or unrelated talent POST routes", () => {
    expect(
      isTalentAiWriterPost({
        method: "GET",
        originalUrl: "/api/talent/bio/generate",
      }),
    ).toBe(false);
    expect(
      isTalentAiWriterPost({
        method: "POST",
        originalUrl: "/api/talent/profile",
      }),
    ).toBe(false);
    expect(
      isTalentAiWriterPost({
        method: "POST",
        originalUrl: "/api/talent/submission-note",
      }),
    ).toBe(false);
  });

  test("shares the quota across sessions belonging to one user", async () => {
    const app = buildApp();
    const path = "/api/talent/submission-note/draft";

    await request(app)
      .post(path)
      .set("x-test-user", "talent-1")
      .set("x-test-session", "session-a")
      .expect(200);
    await request(app)
      .post(path)
      .set("x-test-user", "talent-1")
      .set("x-test-session", "session-b")
      .expect(200);

    const limited = await request(app)
      .post(path)
      .set("x-test-user", "talent-1")
      .set("x-test-session", "session-c")
      .expect(429);

    expect(limited.body).toEqual({
      error: "AI_WRITER_RATE_LIMITED",
      message:
        "Too many AI writing requests. Please wait a minute and try again.",
    });
    expect(limited.headers["retry-after"]).toBeDefined();

    await request(app)
      .post(path)
      .set("x-test-user", "talent-2")
      .set("x-test-session", "session-d")
      .expect(200);
  });

  test("GET and non-AI POST traffic do not consume the AI quota", async () => {
    const app = buildApp({ max: 1 });
    const headers = {
      "x-test-user": "talent-1",
      "x-test-session": "session-a",
    };

    for (let index = 0; index < 3; index += 1) {
      await request(app)
        .get("/api/talent/bio/generate")
        .set(headers)
        .expect(200);
      await request(app).post("/api/talent/profile").set(headers).expect(200);
    }

    await request(app)
      .post("/api/talent/bio/generate")
      .set(headers)
      .expect(200);
    await request(app)
      .post("/api/talent/bio/generate")
      .set(headers)
      .expect(429);
  });

  test("falls back from user to session identity", () => {
    expect(
      talentAiWriterKeyGenerator({
        session: { userId: "talent-1" },
        sessionID: "session-a",
      }),
    ).toBe("user:talent-1");
    expect(
      talentAiWriterKeyGenerator({
        session: {},
        sessionID: "session-a",
      }),
    ).toBe("session:session-a");
  });
});
