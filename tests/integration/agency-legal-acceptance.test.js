"use strict";

process.env.DATABASE_URL = "sqlite://./test-agency-legal-acceptance.sqlite3";
process.env.DB_CLIENT = "sqlite3";
process.env.AGENCY_RBAC_ENFORCE = "true";
process.env.AGENCY_LEGAL_ENFORCE = "1";

const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const legalRouter = require("../../src/domains/agency/routes/legal");
const {
  AGENCY_POLICY_MANIFEST,
  AGENCY_POLICY_MANIFEST_VERSION,
  AGENCY_POLICY_VERSIONS,
} = require("../../src/domains/agency/services/legal-acceptance");

const TEST_DB_PATH = path.resolve(
  __dirname,
  "../../test-agency-legal-acceptance.sqlite3",
);
const AGENCY_ID = uuidv4();
const MEMBER_A_ID = uuidv4();
const MEMBER_B_ID = uuidv4();
const MEMBERSHIP_A_ID = uuidv4();
const MEMBERSHIP_B_ID = uuidv4();

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const isMemberB = req.get("x-test-member") === "b";
  req.session = {
    userId: AGENCY_ID,
    agencyId: AGENCY_ID,
    memberUserId: isMemberB ? MEMBER_B_ID : MEMBER_A_ID,
    agencyMembershipId: isMemberB ? MEMBERSHIP_B_ID : MEMBERSHIP_A_ID,
    agencyMembershipRole: "OWNER",
    role: "AGENCY",
    agencyOnboardingCompletedAt: new Date().toISOString(),
  };
  next();
});
app.use(legalRouter);
app.get("/api/agency/protected-test", (_req, res) =>
  res.json({ success: true }),
);

async function createSchema() {
  await knex.schema.createTable("agencies", (table) => {
    table.string("id", 36).primary();
    table.string("name").notNullable();
    table.string("status").notNullable();
  });
  await knex.schema.createTable("users", (table) => {
    table.string("id", 36).primary();
    table.string("email").notNullable();
    table.string("role").notNullable();
  });
  await knex.schema.createTable("agency_memberships", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("user_id", 36).notNullable();
    table.string("status").notNullable();
  });
  await knex.schema.createTable("agency_member_legal_acceptances", (table) => {
    table.string("id", 36).primary();
    table.string("acceptance_batch_id", 36).notNullable();
    table.string("agency_id", 36).notNullable();
    table.string("member_user_id", 36).notNullable();
    table.string("membership_id", 36).notNullable();
    table.string("policy_key", 48).notNullable();
    table.string("policy_version", 32).notNullable();
    table.text("policy_url").notNullable();
    table.string("content_digest", 71).notNullable();
    table.timestamp("accepted_at").notNullable();
    table.string("ip_address", 45).nullable();
    table.text("user_agent").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.unique(["acceptance_batch_id", "policy_key"]);
  });
}

beforeAll(async () => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  await createSchema();
  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Legal Test Agency",
    status: "ACTIVE",
  });
  await knex("users").insert([
    { id: MEMBER_A_ID, email: "a@example.test", role: "AGENCY" },
    { id: MEMBER_B_ID, email: "b@example.test", role: "AGENCY" },
  ]);
  await knex("agency_memberships").insert([
    {
      id: MEMBERSHIP_A_ID,
      agency_id: AGENCY_ID,
      user_id: MEMBER_A_ID,
      status: "ACTIVE",
    },
    {
      id: MEMBERSHIP_B_ID,
      agency_id: AGENCY_ID,
      user_id: MEMBER_B_ID,
      status: "ACTIVE",
    },
  ]);
});

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

function completeAcceptance(overrides = {}) {
  return {
    manifestVersion: AGENCY_POLICY_MANIFEST_VERSION,
    acceptances: AGENCY_POLICY_MANIFEST.map(
      ({ key, version, contentDigest }) => ({
        policyKey: key,
        version,
        contentDigest,
        accepted: true,
      }),
    ),
    ...overrides,
  };
}

describe("agency member legal acceptance", () => {
  test("blocks operational routes but exposes the exact current manifest", async () => {
    const status = await request(app).get("/api/agency/legal-status").expect(200);
    expect(status.body.data).toMatchObject({
      needsAcceptance: true,
      acceptedAt: null,
      manifestVersion: AGENCY_POLICY_MANIFEST_VERSION,
      versions: AGENCY_POLICY_VERSIONS,
    });
    expect(status.body.data.policies).toEqual(AGENCY_POLICY_MANIFEST);

    const blocked = await request(app)
      .get("/api/agency/protected-test")
      .expect(403);
    expect(blocked.body.error).toBe("AGENCY_LEGAL_ACCEPTANCE_REQUIRED");
  });

  test("rejects a stale displayed manifest without recording evidence", async () => {
    const stale = completeAcceptance({ manifestVersion: "sha256:stale" });
    const response = await request(app)
      .post("/api/agency/legal-acceptance")
      .send(stale)
      .expect(409);

    expect(response.body.error).toBe("AGENCY_POLICY_MANIFEST_STALE");
    expect(await knex("agency_member_legal_acceptances").count("id as count").first())
      .toMatchObject({ count: 0 });
  });

  test("records immutable per-policy evidence for the active human member", async () => {
    const accepted = await request(app)
      .post("/api/agency/legal-acceptance")
      .set("User-Agent", "legal-test-agent")
      .send(completeAcceptance())
      .expect(200);

    expect(accepted.body.data.needsAcceptance).toBe(false);
    const rows = await knex("agency_member_legal_acceptances")
      .where({ member_user_id: MEMBER_A_ID })
      .orderBy("policy_key");
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((row) => row.acceptance_batch_id)).size).toBe(1);
    expect(rows.every((row) => row.membership_id === MEMBERSHIP_A_ID)).toBe(true);
    expect(rows.every((row) => row.user_agent === "legal-test-agent")).toBe(true);
    expect(rows.map((row) => row.policy_key).sort()).toEqual(
      AGENCY_POLICY_MANIFEST.map((policy) => policy.key).sort(),
    );

    await request(app)
      .get("/api/agency/protected-test")
      .expect(200);
  });

  test("keeps a new acceptance as another append-only evidence batch", async () => {
    await request(app)
      .post("/api/agency/legal-acceptance")
      .send(completeAcceptance())
      .expect(200);

    const rows = await knex("agency_member_legal_acceptances").where({
      member_user_id: MEMBER_A_ID,
    });
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((row) => row.acceptance_batch_id)).size).toBe(2);
  });

  test("acceptance is per active membership and stale evidence re-prompts", async () => {
    const batchId = uuidv4();
    await knex("agency_member_legal_acceptances").insert(
      AGENCY_POLICY_MANIFEST.map((policy) => ({
        id: uuidv4(),
        acceptance_batch_id: batchId,
        agency_id: AGENCY_ID,
        member_user_id: MEMBER_B_ID,
        membership_id: MEMBERSHIP_B_ID,
        policy_key: policy.key,
        policy_version:
          policy.key === "terms" ? "2025-01-01" : policy.version,
        policy_url: policy.url,
        content_digest: policy.contentDigest,
        accepted_at: knex.fn.now(),
      })),
    );

    const stale = await request(app)
      .get("/api/agency/legal-status")
      .set("x-test-member", "b")
      .expect(200);
    expect(stale.body.data.needsAcceptance).toBe(true);

    await knex("agency_memberships")
      .where({ id: MEMBERSHIP_B_ID })
      .update({ status: "SUSPENDED" });
    const inactive = await request(app)
      .get("/api/agency/legal-status")
      .set("x-test-member", "b")
      .expect(403);
    expect(inactive.body.error).toBe("ACTIVE_AGENCY_MEMBERSHIP_REQUIRED");
  });
});
