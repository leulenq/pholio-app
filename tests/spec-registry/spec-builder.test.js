"use strict";

const crypto = require("crypto");
const path = require("path");
const knexFactory = require("knex");

const persistenceMigration = require("../../migrations/20260810120000_create_spec_registry_persistence");
const deliveryMigration = require("../../migrations/20260810121000_spec_registry_delivery_metadata");
const agencyAuthoredMigration = require("../../migrations/20260811090000_agency_authored_spec_registry");
const { validateRegistry } = require("../../scripts/validate-spec-registry");
const { publishRegistry } = require("../../src/domains/spec-registry/store/publisher");
const {
  getCurrentRevision,
  listCurrentRoutes,
  saveApplicationSnapshot,
} = require("../../src/domains/spec-registry/store");
const { sha256Canonical } = require("../../src/domains/spec-registry/store/canonical-json");
const {
  SpecAuthoringError,
  checkDraft,
  draftFromRevision,
  loadBuilderState,
  publishDraft,
  saveDraft,
  seriesIdFor,
} = require("../../src/domains/spec-registry/authoring/spec-builder-service");
const {
  refusalReason,
  canScopeBy,
  authorableTaxonomy,
} = require("../../src/domains/spec-registry/authoring/authorable-fields");

const registryRoot = path.join(__dirname, "..", "..", "data", "spec-registry", "v1");

const AGENCY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const LINK_ID = "33333333-3333-4333-8333-333333333333";

function baseDraft() {
  return {
    version: 1,
    office: { id: "london", name: "London" },
    market: { kind: "city", code: "london-uk", countryCodes: ["GB"], city: "London" },
    shots: {
      allowImageReuseAcrossSlots: false,
      slots: [
        {
          label: "Close-up, hair back",
          field: "shot.frame",
          value: "close_up",
          minimum: 1,
          maximum: 1,
          modality: "required",
        },
        {
          label: "Full length",
          field: "shot.frame",
          value: "full_length",
          minimum: 1,
          maximum: 1,
          modality: "required",
        },
      ],
    },
    presentation: [
      {
        label: "No makeup",
        field: "appearance.makeup_level",
        operator: "not_equals",
        value: "none",
        modality: "prohibited",
      },
    ],
    files: [
      {
        label: "Up to 5MB each",
        field: "file.size_bytes",
        operator: "lte",
        value: 5000000,
        unit: "byte",
        scope: "per_file",
        sourceValue: { value: 5, unit: "MB", normalization: "decimal_conservative" },
      },
    ],
    eligibility: [
      {
        label: "Women's board, 175cm and over",
        field: "applicant.height_cm",
        operator: "gte",
        value: 175,
        unit: "cm",
        modality: "required",
        appliesWhen: { field: "applicant.gender", operator: "equals", value: "female" },
      },
    ],
    notes: "Digitals for the women's board, London.",
  };
}

describe("Spec Builder — agency-authored registry routes", () => {
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
    await db.raw("PRAGMA foreign_keys = ON");
    await db.schema.createTable("users", (table) => {
      table.uuid("id").primary();
    });
    await db.schema.createTable("agencies", (table) => {
      table.uuid("id").primary();
      table.string("name").notNullable();
      table.string("slug");
      table.string("website");
    });
    await db.schema.createTable("applications", (table) => {
      table.uuid("id").primary();
    });
    await db.schema.createTable("application_submission_requests", (table) => {
      table.uuid("id").primary();
      table
        .uuid("application_id")
        .nullable()
        .references("id")
        .inTable("applications")
        .onDelete("SET NULL");
    });
    await db.schema.createTable("images", (table) => {
      table.uuid("id").primary();
    });
    await db.schema.createTable("agency_open_call_links", (table) => {
      table.uuid("id").primary();
      table.uuid("agency_id").notNullable();
      table.string("code");
      table.string("status");
      table.timestamp("created_at").defaultTo(db.fn.now());
    });

    await persistenceMigration.up(db);
    await deliveryMigration.up(db);
    await agencyAuthoredMigration.up(db);
    await publishRegistry(db, registry);

    await db("users").insert({ id: USER_ID });
    await db("agencies").insert({
      id: AGENCY_ID,
      name: "Northlight Management",
      slug: "northlight-management",
      website: "https://northlight.example.com",
    });
    await db("agency_open_call_links").insert({
      id: LINK_ID,
      agency_id: AGENCY_ID,
      code: "ABC123",
      status: "active",
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("what an agency may assert", () => {
    test("refuses personal-characteristic fields in every rule group", () => {
      for (const field of [
        "applicant.nationality",
        "appearance.hair_color",
        "appearance.natural_hair_color",
        "appearance.eye_color",
        "appearance.natural_eye_color",
      ]) {
        expect(refusalReason("eligibility", field)).toEqual(expect.any(String));
        expect(refusalReason("presentation", field)).toEqual(expect.any(String));
        expect(canScopeBy(field)).toBe(false);
      }
    });

    test("eligibility is allowlisted, not denylisted", () => {
      expect(refusalReason("eligibility", "applicant.height_cm")).toBeNull();
      expect(refusalReason("eligibility", "applicant.age_years")).toBeNull();
      // Present in the taxonomy, deliberately absent from the allowlist.
      expect(refusalReason("eligibility", "applicant.story")).toEqual(expect.any(String));
    });

    test("gender scopes a requirement but cannot be one", () => {
      expect(canScopeBy("applicant.gender")).toBe(true);
      expect(refusalReason("eligibility", "applicant.gender")).toMatch(/cannot be a requirement/);
    });

    test("presentation rules describe the photograph, not the person", () => {
      expect(refusalReason("presentation", "appearance.makeup_level")).toBeNull();
      expect(refusalReason("presentation", "capture.background")).toBeNull();
      expect(refusalReason("presentation", "applicant.height_cm")).toEqual(expect.any(String));
    });

    test("the published vocabulary names refused fields with a reason", () => {
      const vocabulary = authorableTaxonomy(registry.taxonomy);
      expect(vocabulary.groups.shots.length).toBeGreaterThan(0);
      expect(vocabulary.groups.eligibility.map((field) => field.id)).not.toContain(
        "applicant.nationality",
      );
      expect(vocabulary.refused.map((entry) => entry.id)).toContain("applicant.nationality");
      for (const entry of vocabulary.refused) {
        expect(entry.reason).toEqual(expect.any(String));
      }
    });

    test("a refused field is rejected when composed, not silently dropped", async () => {
      const draft = baseDraft();
      draft.eligibility.push({
        label: "Natural blondes",
        field: "appearance.natural_hair_color",
        operator: "equals",
        value: "blonde",
        modality: "required",
      });
      await expect(checkDraft(db, AGENCY_ID, draft)).rejects.toEqual(
        expect.objectContaining({ code: "FIELD_NOT_AUTHORABLE" }),
      );
    });
  });

  describe("publish lifecycle", () => {
    test("composes a revision that passes the editorial validator", async () => {
      const { errors, spec } = await checkDraft(db, AGENCY_ID, baseDraft(), {
        publishedOn: "2026-08-11",
      });
      expect(errors).toEqual([]);
      expect(spec.status).toBe("verified");
      expect(spec.review.authority).toBe("agency_confirmed");
      expect(spec.review.method).toBe("agency_confirmation");
      expect(spec.scope.channel.type).toBe("pholio_open_call");
    });

    test("publishes advisory-only and never authorizes enforcement", async () => {
      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: baseDraft() });
      const result = await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });
      expect(result.published).toBe(true);

      const row = await db("spec_registry_revisions")
        .where({ revision_id: result.revisionId })
        .first();
      expect(row.evaluation_mode).toBe("advisory");
      expect(Boolean(row.enforcement_authorized)).toBe(false);
    });

    test("republishing an unchanged draft mints no new revision", async () => {
      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: baseDraft() });
      const first = await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });
      const again = await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });

      expect(first.published).toBe(true);
      expect(again).toEqual({
        published: false,
        reason: "unchanged",
        revisionId: first.revisionId,
      });
      const count = await db("spec_registry_revisions")
        .where({ series_id: seriesIdFor({ id: AGENCY_ID }) })
        .count({ n: "*" })
        .first();
      expect(Number(count.n)).toBe(1);
    });

    /*
     * SQLite hands `date` columns back as strings; Postgres hands back JS Date
     * objects. Code that normalised with `String(value).slice(0, 10)` produced
     * "Tue Aug 11" on Postgres, so the composed hash never matched what was
     * stored and every publish minted a redundant revision. Caught on a Neon
     * branch, not here — so this pins the behaviour with Postgres-shaped rows.
     */
    test("treats Date-typed columns the same as string-typed ones", async () => {
      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: baseDraft() });
      const first = await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });

      const stored = await db("spec_registry_revisions")
        .where({ revision_id: first.revisionId })
        .first("observed_on", "next_review_on");

      // Re-write the dates as Date objects, exactly as the pg driver returns them.
      const asDates = {
        ...stored,
        observed_on: new Date(`${stored.observed_on}T00:00:00.000Z`),
        next_review_on: new Date(`${stored.next_review_on}T00:00:00.000Z`),
      };
      expect(String(asDates.observed_on).slice(0, 10)).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const { dateOnly } = require("../../src/domains/spec-registry/store");
      expect(dateOnly(asDates.observed_on)).toBe(stored.observed_on);
      expect(dateOnly(asDates.next_review_on)).toBe(stored.next_review_on);

      // And the state the panel reads reports a real ISO date either way.
      const state = await loadBuilderState(db, AGENCY_ID);
      expect(state.published.publishedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(state.published.nextReviewOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(state.hasUnpublishedChanges).toBe(false);
    });

    test("a series id survives the agency changing its slug", async () => {
      const before = seriesIdFor({ id: AGENCY_ID, slug: "northlight-management" });
      const after = seriesIdFor({ id: AGENCY_ID, slug: "northlight-mgmt-london" });
      expect(after).toBe(before);
      expect(before).toContain(AGENCY_ID);
    });

    test("a change mints revision 2 and leaves revision 1 byte-identical", async () => {
      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: baseDraft() });
      const first = await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });
      const before = await db("spec_registry_revisions")
        .where({ revision_id: first.revisionId })
        .first();

      const changed = baseDraft();
      changed.shots.slots.push({
        label: "Profile",
        field: "shot.view",
        value: "profile",
        minimum: 1,
        maximum: 1,
        modality: "required",
      });
      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: changed });
      const second = await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });

      expect(second.published).toBe(true);
      expect(second.revision).toBe(2);

      const after = await db("spec_registry_revisions")
        .where({ revision_id: first.revisionId })
        .first();
      expect(after.payload_sha256).toBe(before.payload_sha256);
      expect(after.payload_json).toBe(before.payload_json);

      const series = await db("spec_registry_series")
        .where({ series_id: seriesIdFor({ id: AGENCY_ID }) })
        .first();
      expect(series.current_revision_id).toBe(second.revisionId);
      expect(series.origin).toBe("agency");
    });

    test("refuses to publish without an active open call link", async () => {
      await db("agency_open_call_links").where({ id: LINK_ID }).update({ status: "revoked" });
      await expect(
        saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: baseDraft() }).then(() =>
          publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID }),
        ),
      ).rejects.toEqual(expect.objectContaining({ code: "OPEN_CALL_LINK_REQUIRED" }));
    });

    test("refuses to publish without an agency website", async () => {
      await db("agencies").where({ id: AGENCY_ID }).update({ website: null });
      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: baseDraft() });
      await expect(publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID })).rejects.toEqual(
        expect.objectContaining({ code: "AGENCY_DOMAIN_REQUIRED" }),
      );
    });

    test("a published revision round-trips back into an editable draft", async () => {
      const draft = baseDraft();
      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft });
      const published = await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });
      const row = await db("spec_registry_revisions")
        .where({ revision_id: published.revisionId })
        .first();

      const recovered = draftFromRevision(JSON.parse(row.payload_json));
      expect(recovered.shots.slots.map((slot) => slot.field)).toEqual(
        draft.shots.slots.map((slot) => slot.field),
      );
      expect(recovered.eligibility[0].appliesWhen.field).toBe("applicant.gender");
      expect(recovered.notes).toBe(draft.notes);
    });
  });

  describe("resolution", () => {
    test("the agency's own route supersedes what Pholio observed from outside", async () => {
      const researched = "the-society-management-nyc:online";
      await db("spec_registry_agency_routes").insert({
        agency_id: AGENCY_ID,
        series_id: researched,
        priority: 10,
      });

      const before = await listCurrentRoutes(db, { agencyId: AGENCY_ID });
      expect(before.routes.map((route) => route.seriesId)).toEqual([researched]);

      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: baseDraft() });
      await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });

      const after = await listCurrentRoutes(db, { agencyId: AGENCY_ID });
      expect(after.routes.map((route) => route.seriesId)).toEqual([
        seriesIdFor({ id: AGENCY_ID }),
      ]);
      expect(after.resolution).toBe("resolved");
    });

    test("an authored route resolves with no dataset version", async () => {
      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: baseDraft() });
      const published = await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });

      const revision = await getCurrentRevision(
        db,
        seriesIdFor({ id: AGENCY_ID }),
      );
      expect(revision.revisionId).toBe(published.revisionId);
      expect(revision.datasetVersion).toBeNull();
      expect(revision.payload.evaluationMode).toBe("advisory");
    });

    test("the public directory lists editorial and authored routes together", async () => {
      const before = await listCurrentRoutes(db);
      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: baseDraft() });
      await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });

      const after = await listCurrentRoutes(db);
      expect(after.routes.length).toBe(before.routes.length + 1);
      expect(after.routes.map((route) => route.seriesId)).toContain(
        seriesIdFor({ id: AGENCY_ID }),
      );
    });
  });

  describe("submission receipts", () => {
    async function seedApplication() {
      const applicationId = crypto.randomUUID();
      const requestId = crypto.randomUUID();
      await db("applications").insert({ id: applicationId });
      await db("application_submission_requests").insert({
        id: requestId,
        application_id: applicationId,
      });
      return { applicationId, requestId };
    }

    test("stores a receipt against an authored revision with a null dataset", async () => {
      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: baseDraft() });
      const published = await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });
      const revision = await db("spec_registry_revisions")
        .where({ revision_id: published.revisionId })
        .first();
      const { applicationId, requestId } = await seedApplication();

      const evaluation = { findings: [], summary: {} };
      const saved = await saveApplicationSnapshot(db, {
        applicationId,
        submissionRequestId: requestId,
        datasetVersion: null,
        revisionId: published.revisionId,
        specPayloadSha256: revision.payload_sha256,
        evaluationEngineVersion: "1.0.0",
        inputFingerprint: sha256Canonical({ talent: {} }),
        evaluation,
        evaluatedAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      expect(saved.datasetVersion).toBeNull();
      expect(saved.revisionId).toBe(published.revisionId);
    });

    test("refuses a receipt against a revision that is no longer current", async () => {
      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: baseDraft() });
      const first = await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });
      const firstRow = await db("spec_registry_revisions")
        .where({ revision_id: first.revisionId })
        .first();

      const changed = baseDraft();
      changed.presentation = [];
      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: changed });
      await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });

      const { applicationId, requestId } = await seedApplication();
      await expect(
        saveApplicationSnapshot(db, {
          applicationId,
          submissionRequestId: requestId,
          datasetVersion: null,
          revisionId: first.revisionId,
          specPayloadSha256: firstRow.payload_sha256,
          evaluationEngineVersion: "1.0.0",
          inputFingerprint: "x".repeat(64),
          evaluation: {},
          evaluatedAt: new Date("2026-08-11T00:00:00.000Z"),
        }),
      ).rejects.toEqual(
        expect.objectContaining({ code: "SNAPSHOT_UNANCHORED_REVISION" }),
      );
    });
  });

  describe("builder state", () => {
    test("reports an unpublished draft, then a clean state after publishing", async () => {
      const fresh = await loadBuilderState(db, AGENCY_ID);
      expect(fresh.published).toBeNull();
      expect(fresh.advisoryOnly).toBe(true);
      expect(fresh.openCall.code).toBe("ABC123");

      await saveDraft(db, { agencyId: AGENCY_ID, userId: USER_ID, draft: baseDraft() });
      const dirty = await loadBuilderState(db, AGENCY_ID);
      expect(dirty.hasUnpublishedChanges).toBe(true);

      await publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID });
      const clean = await loadBuilderState(db, AGENCY_ID);
      expect(clean.hasUnpublishedChanges).toBe(false);
      expect(clean.published.revision).toBe(1);
      expect(clean.published.evaluationMode).toBe("advisory");
      expect(clean.published.nextReviewOn).toEqual(expect.any(String));
    });

    test("an agency with no draft and no publication still gets a usable vocabulary", async () => {
      const state = await loadBuilderState(db, AGENCY_ID);
      expect(state.vocabulary.groups.shots.length).toBeGreaterThan(0);
      expect(state.vocabulary.scopeFields.length).toBeGreaterThan(0);
      expect(state.draft.shots.slots).toEqual([]);
    });

    // Code reaches an environment before its migration does. Every entry point
    // must answer 503 "not released here" rather than 500 on a missing column.
    test("reports unavailable, not broken, when the migration has not run", async () => {
      const bare = knexFactory({
        client: "sqlite3",
        connection: { filename: ":memory:" },
        useNullAsDefault: true,
      });
      await bare.schema.createTable("agencies", (table) => {
        table.uuid("id").primary();
        table.string("name");
      });
      await bare.schema.createTable("applications", (table) => table.uuid("id").primary());
      await bare.schema.createTable("application_submission_requests", (table) => {
        table.uuid("id").primary();
        table.uuid("application_id");
      });
      await persistenceMigration.up(bare);
      // An agency exists, so a 503 here can only come from the schema guard and
      // never from the row simply being absent.
      await bare("agencies").insert({ id: AGENCY_ID, name: "Northlight Management" });

      // The guard caches per process, as `hasOpenCallSchema` does. Earlier tests
      // already primed it against the migrated database, so this needs its own
      // module registry to observe a genuinely unmigrated environment.
      jest.resetModules();
      const service = require("../../src/domains/spec-registry/authoring/spec-builder-service");

      for (const call of [
        () => service.loadBuilderState(bare, AGENCY_ID),
        () => service.saveDraft(bare, { agencyId: AGENCY_ID, userId: USER_ID, draft: baseDraft() }),
        () => service.publishDraft(bare, { agencyId: AGENCY_ID, userId: USER_ID }),
        () => service.checkDraft(bare, AGENCY_ID, baseDraft()),
        () => service.listBuilderRevisions(bare, AGENCY_ID),
      ]) {
        await expect(call()).rejects.toEqual(
          expect.objectContaining({ code: "SPEC_BUILDER_UNAVAILABLE", status: 503 }),
        );
      }

      await bare.destroy();
    });

    test("publishing with nothing saved is refused", async () => {
      await expect(publishDraft(db, { agencyId: AGENCY_ID, userId: USER_ID })).rejects.toEqual(
        expect.objectContaining({ code: "NO_DRAFT" }),
      );
    });
  });
});
