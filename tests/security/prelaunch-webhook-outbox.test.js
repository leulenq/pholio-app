"use strict";

const knexFactory = require("knex");
const outboxMigration = require("../../migrations/20260909030000_submission_webhook_outbox");
const {
  enqueueSubmission,
  replaySubmissionWebhooks,
} = require("../../src/domains/agency/services/submission-webhook-outbox");
const {
  resetWebhookSchemaCache,
} = require("../../src/domains/agency/services/export-webhook-dispatch");

const NOW = new Date("2026-09-09T12:00:00.000Z");
const isoAfter = (milliseconds) => new Date(NOW.getTime() + milliseconds).toISOString();

describe("durable submission webhook outbox", () => {
  let db;

  beforeEach(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.raw("PRAGMA foreign_keys = ON");
    await db.schema.createTable("users", (table) => {
      table.string("id").primary();
      table.string("account_status").notNullable();
    });
    await db.schema.createTable("agencies", (table) => {
      table.string("id").primary();
      table.string("name");
      table.string("slug");
      table.string("status").notNullable();
    });
    await db.schema.createTable("profiles", (table) => {
      table.string("id").primary();
      table.string("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
      table.string("date_of_birth");
    });
    await db.schema.createTable("talent_user_settings", (table) => {
      table.string("user_id").primary().references("id").inTable("users").onDelete("CASCADE");
      table.json("privacy_preferences");
    });
    await db.schema.createTable("applications", (table) => {
      table.string("id").primary();
      table.string("profile_id").references("id").inTable("profiles").onDelete("CASCADE");
      table.string("agency_id").notNullable().references("id").inTable("agencies").onDelete("CASCADE");
      table.string("status").notNullable();
      table.boolean("minor_at_submission").defaultTo(false);
      table.timestamp("minor_access_revoked_at");
      table.timestamp("withdrawn_at");
      table.timestamp("created_at");
      table.string("call_purpose");
      table.string("open_call_link_id");
    });
    await db.schema.createTable("talent_submission_packages", (table) => {
      table.string("id").primary();
      table.string("application_id");
      table.string("profile_id").references("id").inTable("profiles").onDelete("CASCADE");
      table.json("payload").notNullable();
      table.timestamp("retention_expires_at");
      table.timestamp("redacted_at");
      table.timestamp("revoked_at");
    });
    await db.schema.createTable("agency_export_webhooks", (table) => {
      table.string("id").primary();
      table.string("agency_id").notNullable().references("id").inTable("agencies").onDelete("CASCADE");
      table.string("url").notNullable();
      table.string("secret");
      table.boolean("active").notNullable().defaultTo(true);
      table.integer("consecutive_failures").notNullable().defaultTo(0);
      table.integer("last_status_code");
      table.string("last_error");
      table.timestamp("last_delivered_at");
      table.timestamp("disabled_at");
      table.timestamp("updated_at");
    });
    await outboxMigration.up(db);
    await db("users").insert({ id: "user-1", account_status: "active" });
    await db("agencies").insert({ id: "agency-1", name: "Agency", slug: "agency", status: "ACTIVE" });
    await db("profiles").insert({ id: "profile-1", user_id: "user-1", date_of_birth: "1990-01-01" });
    await db("applications").insert({
      id: "application-1",
      profile_id: "profile-1",
      agency_id: "agency-1",
      status: "pending",
      minor_at_submission: false,
      created_at: NOW.toISOString(),
    });
    await db("talent_submission_packages").insert({
      id: "package-1",
      application_id: "application-1",
      profile_id: "profile-1",
      retention_expires_at: isoAfter(86_400_000),
      payload: JSON.stringify({
        consentConfirmed: true,
        profile: { first_name: "Frozen", last_name: "Applicant", city: "Toronto", height_cm: 177 },
        contact: { email: "frozen@example.test", phone: "+15555550100" },
      }),
    });
    await db("agency_export_webhooks").insert({
      id: "webhook-1",
      agency_id: "agency-1",
      url: "https://hooks.example.test/submissions",
      secret: "secret",
      active: true,
      updated_at: NOW.toISOString(),
    });
    resetWebhookSchemaCache();
  });

  afterEach(async () => {
    resetWebhookSchemaCache();
    await db.destroy();
  });

  const enqueue = () => enqueueSubmission(db, {
    agencyId: "agency-1",
    applicationId: "application-1",
    packageId: "package-1",
    now: NOW,
  });
  const replay = (overrides = {}) => replaySubmissionWebhooks(db, {
    now: NOW,
    clock: () => NOW,
    ...overrides,
  });

  test("deduplicates by frozen package and stores references rather than copied PII", async () => {
    const firstId = await enqueue();
    const duplicateId = await enqueue();
    const rows = await db("submission_webhook_deliveries");
    const columns = await db("submission_webhook_deliveries").columnInfo();

    expect(duplicateId).toBe(firstId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      application_id: "application-1",
      package_id: "package-1",
      webhook_id: "webhook-1",
      state: "pending",
    });
    expect(columns).not.toHaveProperty("payload");
  });

  test("retries with ISO backoff, then completes with a stable delivery id", async () => {
    const id = await enqueue();
    const failedDelivery = jest.fn().mockResolvedValue({ ok: false, statusCode: 503, error: "receiver failed" });
    expect(await replay({ deliverImpl: failedDelivery })).toEqual({
      examined: 1, delivered: 0, cancelled: 0, failed: 1,
    });
    let row = await db("submission_webhook_deliveries").where({ id }).first();
    expect(row).toMatchObject({ state: "pending", attempts: 1, lease_token: null });
    expect(row.next_attempt_at).toBe(isoAfter(60_000));

    expect(await replay({
      now: new Date(isoAfter(30_000)),
      clock: () => new Date(isoAfter(30_000)),
      deliverImpl: failedDelivery,
    })).toMatchObject({ examined: 0 });

    const recovered = jest.fn().mockResolvedValue({ ok: true, statusCode: 204, error: null });
    expect(await replay({
      now: new Date(isoAfter(61_000)),
      clock: () => new Date(isoAfter(61_000)),
      deliverImpl: recovered,
    })).toEqual({ examined: 1, delivered: 1, cancelled: 0, failed: 0 });
    row = await db("submission_webhook_deliveries").where({ id }).first();
    expect(row).toMatchObject({ state: "completed", attempts: 2 });
    expect(recovered.mock.calls[0][1]).toMatchObject({
      deliveryId: id,
      applicant: { name: "Frozen Applicant", email: "frozen@example.test" },
    });
  });

  test("honors an active lease and recovers it only after expiry", async () => {
    const id = await enqueue();
    await db("submission_webhook_deliveries").where({ id }).update({
      lease_token: "other-worker",
      lease_expires_at: isoAfter(60_000),
    });
    const deliverImpl = jest.fn().mockResolvedValue({ ok: true, statusCode: 204, error: null });
    expect(await replay({ deliverImpl })).toMatchObject({ examined: 0 });
    expect(deliverImpl).not.toHaveBeenCalled();

    expect(await replay({
      now: new Date(isoAfter(61_000)),
      clock: () => new Date(isoAfter(61_000)),
      deliverImpl,
    })).toMatchObject({ delivered: 1 });
  });

  test.each([
    ["withdrawal", async (database) => database("applications").where({ id: "application-1" }).update({ status: "withdrawn" })],
    ["account suspension", async (database) => database("users").where({ id: "user-1" }).update({ account_status: "suspended" })],
    ["unknown current age", async (database) => database("profiles").where({ id: "profile-1" }).update({ date_of_birth: null })],
    ["package revocation", async (database) => database("talent_submission_packages").where({ id: "package-1" }).update({ revoked_at: NOW.toISOString() })],
    ["invalid package expiry", async (database) => database("talent_submission_packages").where({ id: "package-1" }).update({ retention_expires_at: "not-a-date" })],
    ["expired package", async (database) => database("talent_submission_packages").where({ id: "package-1" }).update({ retention_expires_at: isoAfter(-1) })],
    ["talent agency block", async (database) => database("talent_user_settings").insert({ user_id: "user-1", privacy_preferences: JSON.stringify({ blockedAgencies: ["agency-1"] }) })],
    ["minor-minimized snapshot", async (database) => database("talent_submission_packages").where({ id: "package-1" }).update({ payload: JSON.stringify({ consentConfirmed: true, minorDataMinimized: true, profile: { first_name: "Do not send" } }) })],
  ])("cancels without delivery after %s", async (_label, mutate) => {
    const id = await enqueue();
    await mutate(db);
    const deliverImpl = jest.fn();
    expect(await replay({ deliverImpl })).toEqual({
      examined: 1, delivered: 0, cancelled: 1, failed: 0,
    });
    expect(deliverImpl).not.toHaveBeenCalled();
    expect(await db("submission_webhook_deliveries").where({ id }).first()).toMatchObject({ state: "cancelled" });
  });

  test("package erasure cascades to the reference-only delivery row", async () => {
    await enqueue();
    await db("talent_submission_packages").where({ id: "package-1" }).delete();
    expect(await db("submission_webhook_deliveries")).toHaveLength(0);
  });
});
