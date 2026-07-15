const fs = require("fs");
const path = require("path");

const TEST_DB_PATH = path.resolve(__dirname, "../../test-same-origin-app.sqlite3");
process.env.DB_CLIENT = "sqlite3";
process.env.DATABASE_URL = `sqlite://${TEST_DB_PATH}`;
if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

const previousCsrfEnforce = process.env.CSRF_ENFORCE;
process.env.CSRF_ENFORCE = "1";

const request = require("supertest");
const app = require("../../src/app");
const knex = require("../../src/shared/db/knex");
const {
  REQUEST_HEADER,
  REQUEST_HEADER_VALUE,
} = require("../../src/shared/middleware/same-origin-mutation");

beforeAll(async () => {
  await knex.migrate.latest();
});

afterAll(async () => {
  if (previousCsrfEnforce === undefined) {
    delete process.env.CSRF_ENFORCE;
  } else {
    process.env.CSRF_ENFORCE = previousCsrfEnforce;
  }
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe("same-origin guard in the full application", () => {
  test("blocks a representative agency mutation before authentication", async () => {
    const response = await request(app)
      .post("/api/agency/team")
      .set("Origin", "http://localhost:3000")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error).toEqual(
      expect.objectContaining({
        code: "SAME_ORIGIN_REQUIRED",
        reason: "missing_request_header",
      }),
    );
  });

  test("a verified agency mutation reaches the existing auth boundary", async () => {
    const response = await request(app)
      .post("/api/agency/team")
      .set(REQUEST_HEADER, REQUEST_HEADER_VALUE)
      .set("Origin", "http://localhost:3000")
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error?.code).not.toBe("SAME_ORIGIN_REQUIRED");
  });

  test("blocks a headerless magic-link session bootstrap", async () => {
    const response = await request(app)
      .post("/api/reply/not-a-token/session")
      .set("Origin", "http://localhost:3000")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("SAME_ORIGIN_REQUIRED");
  });
});
