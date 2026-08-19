"use strict";

/**
 * Contract test for the anonymous open-call applicant schema
 * (`docs/open-call-applicant-flow-design-2026-08.md` §3.2–§3.4, §4).
 *
 * Every later lane in the applicant flow builds against the table and column
 * names asserted here, so this suite is the thing that has to fail first if any
 * of them move.
 *
 * It migrates a throwaway SQLite file all the way to latest rather than calling
 * `migration.up()` in isolation, for the reason
 * `tests/migrations/event-casting-schema.test.js` states: the interesting
 * failures are ordering failures — a table rebuild that drops a partial index,
 * a hardcoded column list that silently loses a late-added column — and those
 * only show up in a real migration run.
 */

const crypto = require("crypto");

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("applicant-identity-schema");
const db = require("../../src/shared/db/knex");

const {
  hasApplicantIdentitySchema,
  resetApplicantIdentitySchemaCache,
} = require("../../src/domains/opencall/services/schema");

const uuid = () => crypto.randomUUID();

const agencyId = uuid();
const profileId = uuid();
const linkOneId = uuid();
const linkTwoId = uuid();

/** Rows this suite creates, cleaned between tests in dependency order. */
const SCRATCH_TABLES = [
  "application_submission_consent_events",
  "talent_submission_packages",
  "open_call_material_requests",
  "open_call_submission_media",
  "open_call_submissions",
  "applicant_claim_tokens",
  "applications",
  "applicant_identities",
];

function futureIso(days = 14) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

async function insertIdentity(overrides = {}) {
  const row = {
    id: uuid(),
    email_normalized: `applicant-${uuid()}@example.test`,
    ...overrides,
  };
  await db("applicant_identities").insert(row);
  return row.id;
}

function submission(overrides = {}) {
  return {
    id: uuid(),
    open_call_link_id: linkOneId,
    agency_id: agencyId,
    intake_spec_version: 1,
    expires_at: futureIso(),
    ...overrides,
  };
}

function application(overrides = {}) {
  return {
    id: uuid(),
    profile_id: profileId,
    agency_id: agencyId,
    status: "pending",
    call_purpose: "representation",
    ...overrides,
  };
}

async function indexNames(table) {
  const rows = await db("sqlite_master")
    .select("name")
    .where({ type: "index", tbl_name: table });
  return rows.map((row) => row.name);
}

async function columnNames(table) {
  const info = await db.raw(`PRAGMA table_info('${table}')`);
  return info.map((column) => column.name);
}

async function notNullFlag(table, column) {
  const info = await db.raw(`PRAGMA table_info('${table}')`);
  const found = info.find((entry) => entry.name === column);
  return found ? Boolean(found.notnull) : null;
}

describe("applicant identity schema", () => {
  beforeAll(async () => {
    await migrate(db);

    await db("agencies").insert({ id: agencyId, name: "Fashion Week Brooklyn" });
    const userId = uuid();
    await db("users").insert({ id: userId, email: "claimed@example.test", role: "TALENT" });
    await db("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: "claimed-talent",
      first_name: "Claimed",
      city: "New York",
      height_cm: 178,
      bio_raw: "",
      bio_curated: "",
    });
    await db("agency_open_call_links").insert([
      { id: linkOneId, agency_id: agencyId, code: "fwb-brooklyn-2", label: "Brooklyn" },
      { id: linkTwoId, agency_id: agencyId, code: "fwb-queens-2", label: "Queens" },
    ]);
  }, 120000);

  afterEach(async () => {
    for (const table of SCRATCH_TABLES) await db(table).del();
  });

  describe("the five new tables", () => {
    test.each([
      ["applicant_identities", ["email_normalized", "phone_normalized", "profile_id", "claimed_at", "disowned_at"]],
      [
        "open_call_submissions",
        [
          "open_call_link_id",
          "agency_id",
          "applicant_identity_id",
          "draft_token_hash",
          "answers",
          "custom_answers",
          "intake_spec_version",
          "status",
          "submitted_at",
          "expires_at",
          "ip_hash",
          "user_agent",
        ],
      ],
      [
        "open_call_submission_media",
        ["submission_id", "field_key", "storage_key", "content_type", "bytes", "moderation_state", "promoted_image_id"],
      ],
      ["applicant_claim_tokens", ["applicant_identity_id", "token_hash", "purpose", "expires_at", "consumed_at"]],
      [
        "open_call_material_requests",
        ["application_id", "requested_keys", "due_at", "requested_by_user_id", "fulfilled_at"],
      ],
    ])("%s exists with its key columns", async (table, columns) => {
      expect(`${table}:${await db.schema.hasTable(table)}`).toBe(`${table}:true`);
      expect(await columnNames(table)).toEqual(expect.arrayContaining(columns));
    });

    test("email_normalized is the identity key and is unique", async () => {
      const email = "duplicate@example.test";
      await insertIdentity({ email_normalized: email });
      await expect(insertIdentity({ email_normalized: email })).rejects.toThrow(
        /UNIQUE constraint failed/i,
      );
    });

    test("phone_normalized is a signal, not a key", async () => {
      await insertIdentity({ phone_normalized: "+15551234567" });
      await expect(
        insertIdentity({ phone_normalized: "+15551234567" }),
      ).resolves.toBeDefined();
    });

    test("a submission defaults to an empty draft", async () => {
      const id = uuid();
      await db("open_call_submissions").insert(submission({ id }));
      const row = await db("open_call_submissions").where({ id }).first();
      expect(row.status).toBe("draft");
      expect(row.applicant_identity_id).toBeNull();
      expect(JSON.parse(row.answers)).toEqual({});
      expect(JSON.parse(row.custom_answers)).toEqual({});
    });

    test("one media row per (submission, field key)", async () => {
      const submissionId = uuid();
      await db("open_call_submissions").insert(submission({ id: submissionId }));
      const media = (overrides) => ({
        id: uuid(),
        submission_id: submissionId,
        field_key: "digital_headshot",
        storage_key: `uploads/${uuid()}.jpg`,
        ...overrides,
      });
      await db("open_call_submission_media").insert(media());
      await expect(
        db("open_call_submission_media").insert(media()),
      ).rejects.toThrow(/UNIQUE constraint failed/i);
      await expect(
        db("open_call_submission_media").insert(
          media({ field_key: "digital_full_length" }),
        ),
      ).resolves.toBeDefined();
    });

    test("one live material request per application", async () => {
      const applicationId = uuid();
      await db("applications").insert(application({ id: applicationId }));
      const request = () => ({
        id: uuid(),
        application_id: applicationId,
        requested_keys: JSON.stringify(["walk_video_url"]),
      });
      await db("open_call_material_requests").insert(request());
      await expect(
        db("open_call_material_requests").insert(request()),
      ).rejects.toThrow(/UNIQUE constraint failed/i);
    });

    test("a claim token hash is globally unique", async () => {
      const identityId = await insertIdentity();
      const token = (overrides) => ({
        id: uuid(),
        applicant_identity_id: identityId,
        token_hash: "a".repeat(64),
        purpose: "claim",
        expires_at: futureIso(1),
        ...overrides,
      });
      await db("applicant_claim_tokens").insert(token());
      await expect(db("applicant_claim_tokens").insert(token())).rejects.toThrow(
        /UNIQUE constraint failed/i,
      );
      await expect(
        db("applicant_claim_tokens").insert(
          token({ token_hash: "b".repeat(64), purpose: "materials" }),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe("the link declares what it asks, and of whom", () => {
    test("all three new columns exist", async () => {
      for (const column of ["intake_spec", "intake_spec_version", "identity_policy"]) {
        expect(
          `${column}:${await db.schema.hasColumn("agency_open_call_links", column)}`,
        ).toBe(`${column}:true`);
      }
    });

    test("an existing link keeps today's behaviour by default", async () => {
      const link = await db("agency_open_call_links").where({ id: linkOneId }).first();
      // NULL intake_spec means "the platform default for this call kind" — the
      // default lives in code, not baked into rows (see the migration header).
      expect(link.intake_spec).toBeNull();
      expect(link.intake_spec_version).toBe(1);
      expect(link.identity_policy).toBe("account_required");
    });
  });

  describe("applications with no profile", () => {
    test("profile_id is nullable when an identity is present", async () => {
      expect(await notNullFlag("applications", "profile_id")).toBe(false);
      const id = uuid();
      await db("applications").insert(
        application({
          id,
          profile_id: null,
          applicant_identity_id: await insertIdentity(),
        }),
      );
      const row = await db("applications").where({ id }).first();
      expect(row.profile_id).toBeNull();
      expect(row.applicant_identity_id).not.toBeNull();
    });

    test("an application with neither identity pointer is rejected", async () => {
      await expect(
        db("applications").insert(
          application({ profile_id: null, applicant_identity_id: null }),
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    });

    test("a profile-backed application still needs no identity", async () => {
      await expect(db("applications").insert(application())).resolves.toBeDefined();
    });

    test("all four partial uniques survive the rebuild", async () => {
      // The profile-keyed pair comes from `20260815091000` and is replayed out
      // of sqlite_master by the rebuild; losing it here is the regression this
      // assertion exists for.
      expect(await indexNames("applications")).toEqual(
        expect.arrayContaining([
          "uq_applications_profile_agency_repr",
          "uq_applications_profile_event_call",
          "uq_applications_identity_agency_repr",
          "uq_applications_identity_event_call",
        ]),
      );
    });

    test("the rebuild kept every column and every other index", async () => {
      expect(await columnNames("applications")).toEqual(
        expect.arrayContaining([
          "id",
          "profile_id",
          "agency_id",
          "status",
          "board_id",
          "match_score",
          "minor_at_submission",
          "guardian_consent_grant_id",
          "minor_access_revocation_reason",
          "status_changed_at",
          "auto_closed_at",
          "open_call_link_id",
          "call_purpose",
          "applicant_identity_id",
        ]),
      );
      expect(await indexNames("applications")).toEqual(
        expect.arrayContaining([
          "applications_agency_id_index",
          "applications_profile_id_index",
          "applications_status_index",
          "applications_board_id_index",
          "applications_match_score_index",
          "idx_applications_open_status_changed",
          "idx_applications_minor_access",
          "idx_applications_open_call_link_status",
          "idx_applications_agency_purpose_status",
          "idx_applications_identity_status",
        ]),
      );
    });

    test("the status CHECK still rejects an unknown status", async () => {
      // The rebuild carried the status CHECK forward rather than dropping it.
      await expect(
        db("applications").insert(application({ status: "definitely_not_a_status" })),
      ).rejects.toThrow(/CHECK constraint failed/i);
    });

    test("one identity may not apply twice to one agency for representation", async () => {
      const identityId = await insertIdentity();
      const anonymous = () =>
        application({ profile_id: null, applicant_identity_id: identityId });
      await db("applications").insert(anonymous());
      await expect(db("applications").insert(anonymous())).rejects.toThrow(
        /UNIQUE constraint failed/i,
      );
    });

    test("one identity may apply to two editions of one organizer", async () => {
      const identityId = await insertIdentity();
      const anonymous = (linkId) =>
        application({
          profile_id: null,
          applicant_identity_id: identityId,
          call_purpose: "event_casting",
          open_call_link_id: linkId,
        });
      await db("applications").insert(anonymous(linkOneId));
      await expect(db("applications").insert(anonymous(linkTwoId))).resolves.toBeDefined();
      await expect(db("applications").insert(anonymous(linkOneId))).rejects.toThrow(
        /UNIQUE constraint failed/i,
      );
    });

    test("the identity uniques ignore profile-backed applications", async () => {
      // Two account-backed applications to different agencies both carry a NULL
      // identity; a non-partial index would collide them.
      const otherAgencyId = uuid();
      await db("agencies").insert({ id: otherAgencyId, name: "Second Organizer" });
      await db("applications").insert(application());
      await expect(
        db("applications").insert(application({ agency_id: otherAgencyId })),
      ).resolves.toBeDefined();
    });
  });

  describe("one submitted application per (edition, human)", () => {
    test("a second submitted submission for the same identity is rejected", async () => {
      const identityId = await insertIdentity();
      const submitted = () =>
        submission({
          applicant_identity_id: identityId,
          status: "submitted",
          submitted_at: new Date().toISOString(),
        });
      await db("open_call_submissions").insert(submitted());
      await expect(db("open_call_submissions").insert(submitted())).rejects.toThrow(
        /UNIQUE constraint failed/i,
      );
    });

    test("two drafts for the same identity are allowed", async () => {
      const identityId = await insertIdentity();
      const draft = () => submission({ applicant_identity_id: identityId });
      await db("open_call_submissions").insert(draft());
      await expect(db("open_call_submissions").insert(draft())).resolves.toBeDefined();
    });

    test("a draft may coexist with the submission it will replace", async () => {
      const identityId = await insertIdentity();
      await db("open_call_submissions").insert(
        submission({ applicant_identity_id: identityId, status: "submitted" }),
      );
      await expect(
        db("open_call_submissions").insert(
          submission({ applicant_identity_id: identityId }),
        ),
      ).resolves.toBeDefined();
    });

    test("the same identity may submit to a second edition", async () => {
      const identityId = await insertIdentity();
      await db("open_call_submissions").insert(
        submission({ applicant_identity_id: identityId, status: "submitted" }),
      );
      await expect(
        db("open_call_submissions").insert(
          submission({
            open_call_link_id: linkTwoId,
            applicant_identity_id: identityId,
            status: "submitted",
          }),
        ),
      ).resolves.toBeDefined();
    });

    test("the submitted unique exists as a partial index", async () => {
      const rows = await db("sqlite_master")
        .select("sql")
        .where({ type: "index", name: "uq_open_call_submissions_link_identity_submitted" });
      expect(rows).toHaveLength(1);
      expect(rows[0].sql).toMatch(/WHERE status = 'submitted'/i);
    });
  });

  describe("snapshot and consent rows without an account", () => {
    test("both tables carry an applicant identity pointer and an index", async () => {
      for (const [table, index] of [
        ["talent_submission_packages", "idx_submission_packages_applicant_identity"],
        [
          "application_submission_consent_events",
          "idx_submission_consent_applicant_identity",
        ],
      ]) {
        expect(
          `${table}:${await db.schema.hasColumn(table, "applicant_identity_id")}`,
        ).toBe(`${table}:true`);
        expect(await indexNames(table)).toContain(index);
      }
    });

    test("a package may belong to an applicant rather than a user", async () => {
      expect(await notNullFlag("talent_submission_packages", "user_id")).toBe(false);
      expect(await notNullFlag("talent_submission_packages", "profile_id")).toBe(false);

      const id = uuid();
      await db("talent_submission_packages").insert({
        id,
        user_id: null,
        profile_id: null,
        applicant_identity_id: await insertIdentity(),
        payload: JSON.stringify({ identity: { displayName: "Anonymous Applicant" } }),
      });
      const row = await db("talent_submission_packages").where({ id }).first();
      expect(row.user_id).toBeNull();
      expect(row.profile_id).toBeNull();
      expect(row.applicant_identity_id).not.toBeNull();
    });

    test("a consent event may belong to an applicant rather than a user", async () => {
      expect(await notNullFlag("application_submission_consent_events", "user_id")).toBe(
        false,
      );
      expect(
        await notNullFlag("application_submission_consent_events", "profile_id"),
      ).toBe(false);

      const identityId = await insertIdentity();
      const applicationId = uuid();
      await db("applications").insert(
        application({
          id: applicationId,
          profile_id: null,
          applicant_identity_id: identityId,
        }),
      );

      const id = uuid();
      await db("application_submission_consent_events").insert({
        id,
        application_id: applicationId,
        user_id: null,
        profile_id: null,
        applicant_identity_id: identityId,
        agency_id: agencyId,
        package_fingerprint: "f".repeat(64),
        consent_text_version: "2026-08",
        acknowledgement_version: "2026-08",
        disclosure_snapshot: JSON.stringify({ compensation: "unpaid" }),
      });
      const row = await db("application_submission_consent_events")
        .where({ id })
        .first();
      expect(row.user_id).toBeNull();
      expect(row.applicant_identity_id).toBe(identityId);
      // Carried over by the rebuild rather than restated by it.
      expect(row.purpose).toBe("representation");
    });

    test("columns added after these tables were created survived the rebuild", async () => {
      // `talent_submission_packages` gained retention/redaction/guardian
      // columns long after `20260326140000`; a hardcoded column list in the
      // rebuild would have dropped them silently.
      const packageColumns = await columnNames("talent_submission_packages");
      expect(packageColumns).toEqual(
        expect.arrayContaining([
          "payload",
          "application_id",
          "retention_expires_at",
          "revoked_at",
          "redacted_at",
          "redaction_reason",
          "guardian_consent_grant_id",
          "guardian_consent_expires_at",
        ]),
      );
      expect(await indexNames("talent_submission_packages")).toEqual(
        expect.arrayContaining([
          "talent_submission_packages_user_id_created_at_index",
          "talent_submission_packages_profile_id_created_at_index",
          "talent_submission_packages_application_id_index",
          "talent_submission_packages_retention_expires_at_index",
          "idx_submission_packages_guardian_grant",
        ]),
      );

      const consentColumns = await columnNames("application_submission_consent_events");
      expect(consentColumns).toEqual(
        expect.arrayContaining([
          "package_fingerprint",
          "guardian_consent_request_id",
          "guardian_consent_grant_id",
          "purpose",
          "open_call_link_id",
          "compensation_disclosure",
        ]),
      );
      expect(await indexNames("application_submission_consent_events")).toEqual(
        expect.arrayContaining([
          "idx_submission_consent_application_created",
          "idx_submission_consent_profile_created",
          "idx_submission_consent_agency_created",
          "idx_submission_consent_purpose_created",
        ]),
      );
    });
  });

  describe("the deploy-before-migrate guard", () => {
    test("reports the schema present once both migrations have run", async () => {
      resetApplicantIdentitySchemaCache();
      await expect(hasApplicantIdentitySchema(db)).resolves.toBe(true);
      // Cached: the second call must not re-probe, and must not disagree.
      await expect(hasApplicantIdentitySchema(db)).resolves.toBe(true);
    });
  });

  describe("re-running migrations", () => {
    test("migrate.latest is a no-op the second time", async () => {
      const [, log] = await db.migrate.latest();
      expect(log).toEqual([]);
    });
  });
});

/**
 * Runs last: it takes the schema down and back up, so nothing may depend on it
 * having finished in the state it started.
 */
describe("rolling the applicant-identity migrations back", () => {
  /**
   * How many steps down it takes to unwind them. Derived from the ledger, not
   * hardcoded, so later lanes stacking migrations on top do not make this test
   * roll back *their* work instead.
   */
  let steps = 0;

  test("down refuses while an anonymous application exists", async () => {
    const identityId = await insertIdentity();
    const orphanId = uuid();
    await db("applications").insert(
      application({ id: orphanId, profile_id: null, applicant_identity_id: identityId }),
    );

    const applied = (await db("knex_migrations").orderBy("id", "asc")).map(
      (row) => row.name,
    );
    const first = applied.findIndex((name) =>
      name.startsWith("20260819110000_create_applicant_identity_tables"),
    );
    expect(first).toBeGreaterThan(-1);
    steps = applied.length - first;
    expect(steps).toBeGreaterThanOrEqual(3);

    // `20260819130000` unwinds cleanly (nothing account-less in those tables),
    // then `20260819120000` hits the row above and must refuse rather than
    // delete an organizer's applicant.
    await expect(
      (async () => {
        for (let step = 0; step < steps; step += 1) await db.migrate.down();
      })(),
    ).rejects.toThrow(/Refusing to roll back/i);

    expect(await db("applications").where({ id: orphanId }).first()).toBeDefined();
  }, 120000);

  test("and unwinds once those rows are gone", async () => {
    for (const table of SCRATCH_TABLES) await db(table).del();

    let remaining = (await db("knex_migrations")).length;
    const applied = (await db("knex_migrations").orderBy("id", "asc")).map(
      (row) => row.name,
    );
    const first = applied.findIndex((name) =>
      name.startsWith("20260819110000_create_applicant_identity_tables"),
    );
    for (let step = 0; step < applied.length - first; step += 1) await db.migrate.down();
    expect((await db("knex_migrations")).length).toBeLessThan(remaining);

    expect(await db.schema.hasTable("applicant_identities")).toBe(false);
    expect(await db.schema.hasTable("open_call_submissions")).toBe(false);
    expect(await db.schema.hasColumn("applications", "applicant_identity_id")).toBe(false);
    expect(await db.schema.hasColumn("agency_open_call_links", "identity_policy")).toBe(
      false,
    );
    expect(await notNullFlag("applications", "profile_id")).toBe(true);
    for (const table of [
      "talent_submission_packages",
      "application_submission_consent_events",
    ]) {
      expect(`${table}:${await notNullFlag(table, "user_id")}`).toBe(`${table}:true`);
      expect(`${table}:${await notNullFlag(table, "profile_id")}`).toBe(`${table}:true`);
      expect(
        `${table}:${await db.schema.hasColumn(table, "applicant_identity_id")}`,
      ).toBe(`${table}:false`);
    }
    // The profile-keyed uniques belong to an earlier migration and must be
    // exactly where the rollback found them.
    expect(await indexNames("applications")).toEqual(
      expect.arrayContaining([
        "uq_applications_profile_agency_repr",
        "uq_applications_profile_event_call",
      ]),
    );
  }, 120000);

  test("and re-applies cleanly", async () => {
    const [, log] = await db.migrate.latest();
    expect(log).toHaveLength(steps);

    expect(await db.schema.hasTable("applicant_identities")).toBe(true);
    expect(await notNullFlag("applications", "profile_id")).toBe(false);
    expect(await indexNames("applications")).toEqual(
      expect.arrayContaining([
        "uq_applications_profile_agency_repr",
        "uq_applications_identity_event_call",
      ]),
    );
  }, 120000);
});

afterAll(async () => {
  await db.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});
