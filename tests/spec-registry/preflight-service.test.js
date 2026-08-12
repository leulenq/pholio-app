"use strict";

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const knexFactory = require("knex");
const request = require("supertest");

const persistenceMigration = require("../../migrations/20260810120000_create_spec_registry_persistence");
const deliveryMigration = require("../../migrations/20260810121000_spec_registry_delivery_metadata");
const agencyAuthoredMigration = require("../../migrations/20260811090000_agency_authored_spec_registry");
const { validateRegistry } = require("../../scripts/validate-spec-registry");
const { publishRegistry } = require("../../src/domains/spec-registry/store/publisher");
const {
  countSummary,
  findingDto,
  preflightRegistry,
} = require("../../src/domains/spec-registry/preflight-service");
const specRegistryRouter = require("../../src/domains/talent/routes/spec-registry");

const registryRoot = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "spec-registry",
  "v1",
);

const TALENT_USER_ID = "90000000-0000-4000-8000-000000000001";
const TALENT_PROFILE_ID = "90000000-0000-4000-8000-000000000002";
const OTHER_USER_ID = "90000000-0000-4000-8000-000000000003";
const OTHER_PROFILE_ID = "90000000-0000-4000-8000-000000000004";
const ELIGIBLE_IMAGE_ID = "90000000-0000-4000-8000-000000000005";
const INELIGIBLE_IMAGE_ID = "90000000-0000-4000-8000-000000000006";
const OTHER_IMAGE_ID = "90000000-0000-4000-8000-000000000007";

function uuid() {
  return crypto.randomUUID();
}

async function createRuntimeSchema(db) {
  await db.raw("PRAGMA foreign_keys = ON");
  await db.schema.createTable("agencies", (table) => {
    table.uuid("id").primary();
    table.string("name").notNullable();
  });
  await db.schema.createTable("applications", (table) => {
    table.uuid("id").primary();
  });
  await db.schema.createTable("users", (table) => {
    table.uuid("id").primary();
    table.string("email").notNullable();
  });
  await db.schema.createTable("profiles", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable().references("id").inTable("users");
    table.string("first_name");
    table.string("last_name");
    table.string("city");
    table.date("date_of_birth");
    table.integer("height_cm");
    table.string("gender");
    table.string("work_eligibility");
  });
  await db.schema.createTable("images", (table) => {
    table.uuid("id").primary();
    table.uuid("profile_id").notNullable().references("id").inTable("profiles");
    table.string("status");
    table.boolean("exclude_from_agency").defaultTo(false);
    table.string("asset_kind");
    table.timestamp("retired_at");
    table.string("shot_type");
    table.timestamp("retouched_at");
    table.text("metadata");
  });
  await persistenceMigration.up(db);
  await deliveryMigration.up(db);
    await agencyAuthoredMigration.up(db);
}

async function insertMatcherFixtures(db) {
  await db("users").insert([
    { id: TALENT_USER_ID, email: "talent@example.test" },
    { id: OTHER_USER_ID, email: "other@example.test" },
  ]);
  await db("profiles").insert([
    {
      id: TALENT_PROFILE_ID,
      user_id: TALENT_USER_ID,
      first_name: "Mia",
      last_name: "Voss",
      city: "New York",
      date_of_birth: "2000-06-15",
      height_cm: 178,
      gender: "female",
      work_eligibility: "yes",
    },
    {
      id: OTHER_PROFILE_ID,
      user_id: OTHER_USER_ID,
      first_name: "Other",
      last_name: "Talent",
      city: "London",
      date_of_birth: "2000-06-15",
      height_cm: 178,
      gender: "female",
      work_eligibility: "yes",
    },
  ]);
  await db("images").insert([
    {
      id: ELIGIBLE_IMAGE_ID,
      profile_id: TALENT_PROFILE_ID,
      status: "active",
      asset_kind: "image",
      shot_type: "headshot",
      metadata: JSON.stringify({ ai: { classification: { source: "ai", confirmed: false } } }),
    },
    {
      id: INELIGIBLE_IMAGE_ID,
      profile_id: TALENT_PROFILE_ID,
      status: "inactive",
      asset_kind: "image",
    },
    {
      id: OTHER_IMAGE_ID,
      profile_id: OTHER_PROFILE_ID,
      status: "active",
      asset_kind: "image",
    },
  ]);
}

describe("Spec Registry preflight service", () => {
  let db;
  let registry;

  beforeAll(() => {
    registry = validateRegistry({
      registryRoot,
      asOf: new Date("2026-08-10T12:00:00.000Z"),
    });
  });

  beforeEach(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await createRuntimeSchema(db);
    await insertMatcherFixtures(db);
    await publishRegistry(db, registry);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("evaluates every current series as advisory-only without scores or a blocking decision", async () => {
    const result = await preflightRegistry(
      db,
      { profileId: TALENT_PROFILE_ID, imageIds: [ELIGIBLE_IMAGE_ID] },
      { referenceDate: "2026-08-10" },
    );

    expect(result).toMatchObject({
      available: true,
      resolution: "all",
      selectedImageIds: [ELIGIBLE_IMAGE_ID],
      submission: { canProceed: true, advisoryOnly: true, blockingEligible: false },
    });
    expect(result.results).toHaveLength(registry.manifest.records.length);
    expect(result.results.every((item) => item.submission.canProceed)).toBe(true);
    expect(result.results.every((item) => item.submission.blockingEligible === false)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/"score"\s*:/i);
    expect(JSON.stringify(result)).not.toMatch(/"(?:block|allow|decision)"\s*:/i);
  });

  test("uses explicit agency-to-series links only, never the agency name", async () => {
    const agencyId = uuid();
    await db("agencies").insert({ id: agencyId, name: "Elite Model Management" });

    const unmapped = await preflightRegistry(
      db,
      { profileId: TALENT_PROFILE_ID, agencyId },
      { referenceDate: "2026-08-10" },
    );
    expect(unmapped).toEqual(expect.objectContaining({
      available: false,
      resolution: "unmapped",
      results: [],
      submission: { canProceed: true, advisoryOnly: true, blockingEligible: false },
    }));

    await db("spec_registry_agency_routes").insert({
      agency_id: agencyId,
      series_id: "models1-uk:online",
      priority: 10,
    });
    const mapped = await preflightRegistry(
      db,
      { profileId: TALENT_PROFILE_ID, agencyId },
      { referenceDate: "2026-08-10" },
    );

    expect(mapped).toMatchObject({ available: true, resolution: "resolved" });
    expect(mapped.results).toHaveLength(1);
    expect(mapped.results[0].seriesId).toBe("models1-uk:online");
    expect(mapped.results[0].organization.name).toBe("Models1");
  });

  test("surfaces source unknowns and unconfirmed image facts as manual confirmation, while still allowing submission", async () => {
    const result = await preflightRegistry(
      db,
      {
        profileId: TALENT_PROFILE_ID,
        seriesId: "elite-model-management-global:online",
        imageIds: [ELIGIBLE_IMAGE_ID],
      },
      { referenceDate: "2026-08-10" },
    );

    const findings = result.results[0].findings;
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceUnknown: true,
        outcome: "unknown",
        matchability: "manual_confirmation",
        field: "scope.receiving_office",
      }),
    ]));
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        outcome: "unknown",
        field: "shot.frame",
        unknownCandidateImageIds: [ELIGIBLE_IMAGE_ID],
      }),
    ]));
    expect(result.submission).toEqual({
      canProceed: true,
      advisoryOnly: true,
      blockingEligible: false,
    });
  });

  test("rejects an unowned or ineligible explicitly selected image", async () => {
    for (const imageId of [OTHER_IMAGE_ID, INELIGIBLE_IMAGE_ID]) {
      await expect(
        preflightRegistry(
          db,
          {
            profileId: TALENT_PROFILE_ID,
            seriesId: "models1-uk:online",
            imageIds: [imageId],
          },
          { referenceDate: "2026-08-10" },
        ),
      ).rejects.toMatchObject({
        name: "SpecRegistryServiceError",
        code: "SELECTED_IMAGES_UNAVAILABLE",
        status: 422,
        details: { rejectedCount: 1 },
      });
    }
  });

  test("returns a revision-change service error rather than silently evaluating a stale revision", async () => {
    await expect(
      preflightRegistry(
        db,
        {
          profileId: TALENT_PROFILE_ID,
          seriesId: "models1-uk:online",
          expectedRevisionId: "models1-uk:online@999",
        },
        { referenceDate: "2026-08-10" },
      ),
    ).rejects.toEqual(expect.objectContaining({
      name: "SpecRegistryServiceError",
      code: "SPEC_REGISTRY_REVISION_CHANGED",
      status: 409,
      details: { currentRevisionId: "models1-uk:online@1" },
    }));
  });
});

describe("Spec Registry presentation finding severity", () => {
  test("keeps factual outcomes while limiting attention to hard modality failures", () => {
    const findings = [
      findingDto("setWide", { id: "required", modality: "required", outcome: "violates" }),
      findingDto("setWide", { id: "requested", modality: "requested", outcome: "missing" }),
      findingDto("setWide", { id: "prohibited", modality: "prohibited", outcome: "violates" }),
      findingDto("setWide", { id: "preferred", modality: "preferred", outcome: "violates" }),
      findingDto("setWide", { id: "encouraged", modality: "encouraged", outcome: "missing" }),
      findingDto("setWide", { id: "allowed", modality: "allowed", outcome: "violates" }),
      findingDto("setWide", { id: "not-required", modality: "not_required", outcome: "missing" }),
    ];

    expect(findings.slice(0, 3)).toEqual(expect.arrayContaining([
      expect.objectContaining({ outcome: "violates", severity: "attention", requiresAttention: true }),
      expect.objectContaining({ outcome: "missing", severity: "attention", requiresAttention: true }),
    ]));
    expect(findings.slice(3)).toEqual(expect.arrayContaining([
      expect.objectContaining({ modality: "preferred", outcome: "violates", severity: "informational", requiresAttention: false }),
      expect.objectContaining({ modality: "encouraged", outcome: "missing", severity: "informational", requiresAttention: false }),
      expect.objectContaining({ modality: "allowed", outcome: "violates", severity: "informational", requiresAttention: false }),
      expect.objectContaining({ modality: "not_required", outcome: "missing", severity: "informational", requiresAttention: false }),
    ]));
    expect(countSummary(findings)).toMatchObject({
      missing: 3,
      violates: 4,
      needsAttention: 3,
      informational: 4,
    });
    expect(findings[3].guidance).toMatch(/guidance/i);
    expect(findings[3].guidance).not.toMatch(/conflict/i);
    expect(findings[5].guidance).toMatch(/optional information/i);
    expect(findings[5].guidance).not.toMatch(/conflict/i);
  });
});

describe("Spec Registry API role gate", () => {
  function apiFor(role) {
    const app = express();
    app.use((req, _res, next) => {
      req.session = { userId: uuid(), role };
      next();
    });
    app.use(express.json());
    app.use("/api/talent/spec-registry", specRegistryRouter);
    return app;
  }

  test("does not expose registry routes to an agency session", async () => {
    const response = await request(apiFor("AGENCY"))
      .get("/api/talent/spec-registry/routes")
      .set("Accept", "application/json");

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: "Forbidden",
      requiredRoles: ["TALENT"],
      role: "AGENCY",
    });
  });

  test("does not expose registry routes without a talent session", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/talent/spec-registry", specRegistryRouter);

    const response = await request(app)
      .get("/api/talent/spec-registry/routes")
      .set("Accept", "application/json");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required");
  });
});
