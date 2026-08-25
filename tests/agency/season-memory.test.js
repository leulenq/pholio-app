"use strict";

/**
 * `loadSeasonMemory` (season-memory.js) and its surfacing on the talent
 * dossier — run against a REAL migrated schema, same discipline as the
 * resolver/dossier-identity suites next door, because the whole point is
 * `applications`' partial unique indexes
 * (`20260815091000_applications_event_call_link.js`) and
 * `talent_submission_packages`' nullable `profile_id`/`user_id`
 * (`20260819130000_snapshot_and_consent_identity_support.js`) — shapes a
 * hand-built fixture would not reproduce.
 *
 * THE SCHEMA FACT THIS SUITE PROVES THE LOADER HANDLES: `applications` allows
 * exactly one live `representation`-purpose row per (profile, agency), ever.
 * A talent who is declined, improves their book, and reapplies to the SAME
 * agency does not get a new `applications` row — the existing one is revived
 * in place — but DOES get a new `talent_submission_packages` row each time.
 * So "prior submission" for the single most common reapplication path is an
 * older package under the SAME application id, not a different application
 * row. Tier 1 below exercises exactly that — including the identity → claim
 * transition, which (per applicant-identity.js) also re-points the SAME row
 * rather than creating a new one, so it is a Tier 1 case too, with an older
 * package that is identity-shaped and a newer one that is profile-shaped.
 * Tier 2 exercises the genuinely separate-row case: the same anonymous
 * identity submitting to two different open-call editions of the same
 * agency, which the `event_casting` partial unique index
 * (`uq_applications_identity_event_call`) allows.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("season-memory");

const { v4: uuidv4 } = require("uuid");
const knex = require("../../src/shared/db/knex");
const { loadSeasonMemory } = require("../../src/domains/agency/services/season-memory");
const { buildTalentDossier } = require("../../src/domains/agency/services/talent-dossier");
const { CALL_KINDS } = require("../../src/shared/constants/event-casting");

const AGENCY_A = uuidv4();
const AGENCY_B = uuidv4();
const LINK_A1 = uuidv4();
const LINK_A2 = uuidv4();
const LINK_B1 = uuidv4();

function profileRow(overrides) {
  return {
    id: uuidv4(),
    slug: uuidv4(),
    first_name: "Test",
    last_name: "Talent",
    city: "Brooklyn",
    gender: "female",
    date_of_birth: "1999-01-01",
    availability_status: "available",
    discipline: "model",
    height_cm: null,
    bust_cm: null,
    chest_cm: null,
    waist_cm: null,
    hips_cm: null,
    inseam_cm: null,
    hair_color: null,
    eye_color: null,
    bio_raw: "",
    bio_curated: "",
    ...overrides,
  };
}

function packagePayload({ profile, images, submittedAt }) {
  return JSON.stringify({
    submittedAt,
    profile: profile || null,
    images: images || [],
  });
}

function identityPackagePayload({ heightCm, city, images, submittedAt }) {
  return JSON.stringify({
    submittedAt,
    identity: { heightCm, city },
    answers: { height: heightCm },
    images: images || [],
  });
}

const T1 = { profileId: uuidv4(), userId: uuidv4(), applicationId: uuidv4(), pkgOldId: uuidv4(), pkgNewId: uuidv4(), imgOldId: uuidv4(), imgNewId: uuidv4() };
const T2 = { profileId: uuidv4(), userId: uuidv4(), applicationId: uuidv4(), pkgOldId: uuidv4(), pkgNewId: uuidv4(), imgId: uuidv4() };
const T3 = { identityId: uuidv4(), profileId: uuidv4(), userId: uuidv4(), applicationId: uuidv4(), pkgOldId: uuidv4(), pkgNewId: uuidv4() };
const T4 = { profileId: uuidv4(), userId: uuidv4(), appAOldId: uuidv4(), appBId: uuidv4(), appANewId: uuidv4() };
const T5 = { profileId: uuidv4(), userId: uuidv4(), applicationId: uuidv4() };
const T6 = { profileId: uuidv4(), userId: uuidv4(), applicationId: uuidv4(), pkgOldId: uuidv4(), pkgNewId: uuidv4() };
const T7 = { identityId: uuidv4(), appOldId: uuidv4(), appNewId: uuidv4(), pkgOldId: uuidv4(), pkgNewId: uuidv4() };

async function seedFixtures() {
  await knex("agencies").insert([
    { id: AGENCY_A, name: "Agency A", org_kind: "agency" },
    { id: AGENCY_B, name: "Agency B", org_kind: "agency" },
  ]);
  await knex("agency_open_call_links").insert([
    { id: LINK_A1, agency_id: AGENCY_A, code: "a-edition-1", label: "Edition 1", call_kind: CALL_KINDS.EVENT_CASTING, identity_policy: "account_optional" },
    { id: LINK_A2, agency_id: AGENCY_A, code: "a-edition-2", label: "Edition 2", call_kind: CALL_KINDS.EVENT_CASTING, identity_policy: "account_optional" },
    { id: LINK_B1, agency_id: AGENCY_B, code: "b-edition-1", label: "B Edition", call_kind: CALL_KINDS.EVENT_CASTING, identity_policy: "account_optional" },
  ]);

  const users = [T1, T2, T3, T4, T5, T6]
    .map((t) => t.userId)
    .filter(Boolean)
    .map((id) => ({ id, email: `${id}@talent.test`, role: "TALENT", email_verified: true }));
  await knex("users").insert(users);

  await knex("profiles").insert([
    profileRow({ id: T1.profileId, user_id: T1.userId, height_cm: 174, hair_color: "brown", eye_color: "blue" }),
    profileRow({ id: T2.profileId, user_id: T2.userId, height_cm: 170, hair_color: "black", eye_color: "brown" }),
    profileRow({ id: T3.profileId, user_id: T3.userId, height_cm: 168 }),
    profileRow({ id: T4.profileId, user_id: T4.userId, height_cm: 172 }),
    profileRow({ id: T5.profileId, user_id: T5.userId, height_cm: 165 }),
    // Deliberately far from either package's declared value, so a test that
    // ever sees 999/"red" caught a live-profile fallback contaminating a
    // redacted prior submission.
    profileRow({ id: T6.profileId, user_id: T6.userId, height_cm: 999, hair_color: "red" }),
  ]);

  await knex("images").insert([
    { id: T1.imgOldId, profile_id: T1.profileId, path: "https://cdn.test/t1-old.jpg", captured_at: "2026-01-01" },
    { id: T1.imgNewId, profile_id: T1.profileId, path: "https://cdn.test/t1-new.jpg", captured_at: "2026-06-15" },
    { id: T2.imgId, profile_id: T2.profileId, path: "https://cdn.test/t2.jpg", captured_at: "2026-01-01" },
  ]);

  // ---- T1: representation reapplication WITH movement (Tier 1) ----------
  await knex("applications").insert({
    id: T1.applicationId,
    profile_id: T1.profileId,
    agency_id: AGENCY_A,
    status: "pending",
    created_at: "2026-01-05T00:00:00.000Z",
  });
  await knex("talent_submission_packages").insert([
    {
      id: T1.pkgOldId,
      application_id: T1.applicationId,
      user_id: T1.userId,
      profile_id: T1.profileId,
      created_at: "2026-01-05T00:00:00.000Z",
      payload: packagePayload({
        submittedAt: "2026-01-05T00:00:00.000Z",
        profile: profileRow({ height_cm: 172, hair_color: "brown", eye_color: "green", city: "Brooklyn" }),
        images: [{ id: T1.imgOldId, path: "https://cdn.test/t1-old.jpg", image_type: "digital", shot_type: "headshot", sort: 0 }],
      }),
    },
    {
      id: T1.pkgNewId,
      application_id: T1.applicationId,
      user_id: T1.userId,
      profile_id: T1.profileId,
      created_at: "2026-06-20T00:00:00.000Z",
      payload: packagePayload({
        submittedAt: "2026-06-20T00:00:00.000Z",
        profile: profileRow({ height_cm: 174, hair_color: "brown", eye_color: "blue", city: "Brooklyn" }),
        images: [{ id: T1.imgNewId, path: "https://cdn.test/t1-new.jpg", image_type: "digital", shot_type: "headshot", sort: 0 }],
      }),
    },
  ]);

  // ---- T2: representation reapplication with NO movement (Tier 1) -------
  await knex("applications").insert({
    id: T2.applicationId,
    profile_id: T2.profileId,
    agency_id: AGENCY_A,
    status: "pending",
    created_at: "2026-02-01T00:00:00.000Z",
  });
  const t2Snapshot = () => ({
    profile: profileRow({ height_cm: 170, hair_color: "black", eye_color: "brown", city: "Queens" }),
    images: [{ id: T2.imgId, path: "https://cdn.test/t2.jpg", image_type: "digital", shot_type: "headshot", sort: 0 }],
  });
  await knex("talent_submission_packages").insert([
    { id: T2.pkgOldId, application_id: T2.applicationId, user_id: T2.userId, profile_id: T2.profileId, created_at: "2026-02-01T00:00:00.000Z", payload: packagePayload({ submittedAt: "2026-02-01T00:00:00.000Z", ...t2Snapshot() }) },
    { id: T2.pkgNewId, application_id: T2.applicationId, user_id: T2.userId, profile_id: T2.profileId, created_at: "2026-05-01T00:00:00.000Z", payload: packagePayload({ submittedAt: "2026-05-01T00:00:00.000Z", ...t2Snapshot() }) },
  ]);

  // ---- T3: anonymous open-call submission, later claimed — SAME row
  //          (applicant-identity.js: claiming re-points profile_id on the
  //          existing application rather than creating a new one), so this
  //          is Tier 1 with an identity-shaped old package and a
  //          profile-shaped new one. -------------------------------------
  await knex("applicant_identities").insert({
    id: T3.identityId,
    email_normalized: "t3@applicant.test",
    profile_id: T3.profileId,
    claimed_at: "2026-07-01T00:00:00.000Z",
    disowned_at: null,
  });
  await knex("applications").insert({
    id: T3.applicationId,
    profile_id: T3.profileId,
    applicant_identity_id: T3.identityId,
    agency_id: AGENCY_A,
    status: "pending",
    created_at: "2026-01-10T00:00:00.000Z",
  });
  await knex("talent_submission_packages").insert([
    {
      id: T3.pkgOldId,
      application_id: T3.applicationId,
      applicant_identity_id: T3.identityId,
      user_id: null,
      profile_id: null,
      created_at: "2026-01-10T00:00:00.000Z",
      payload: identityPackagePayload({ heightCm: 165, city: "Queens", submittedAt: "2026-01-10T00:00:00.000Z" }),
    },
    {
      id: T3.pkgNewId,
      application_id: T3.applicationId,
      user_id: T3.userId,
      profile_id: T3.profileId,
      created_at: "2026-07-01T00:00:00.000Z",
      payload: packagePayload({ submittedAt: "2026-07-01T00:00:00.000Z", profile: profileRow({ height_cm: 168, city: "Queens" }) }),
    },
  ]);
  await knex("talent_representations").insert({
    id: uuidv4(),
    profile_id: T3.profileId,
    agency_id: null,
    external_agency_name: "Milan Model Co",
    external_agency_key: "milan-model-co",
    relationship_type: "mother",
    is_exclusive: false,
    disclose_agency_name: true,
    status: "active",
    started_on: "2026-06-01",
  });

  // ---- T4: cross-agency isolation (two genuinely separate rows, Tier 2) -
  await knex("applications").insert([
    { id: T4.appAOldId, profile_id: T4.profileId, agency_id: AGENCY_A, call_purpose: "event_casting", open_call_link_id: LINK_A1, status: "pending", created_at: "2026-01-01T00:00:00.000Z" },
    { id: T4.appBId, profile_id: T4.profileId, agency_id: AGENCY_B, call_purpose: "event_casting", open_call_link_id: LINK_B1, status: "pending", created_at: "2026-03-01T00:00:00.000Z" },
    { id: T4.appANewId, profile_id: T4.profileId, agency_id: AGENCY_A, call_purpose: "event_casting", open_call_link_id: LINK_A2, status: "pending", created_at: "2026-06-01T00:00:00.000Z" },
  ]);

  // ---- T5: first-time applicant — nothing to compare ---------------------
  await knex("applications").insert({
    id: T5.applicationId,
    profile_id: T5.profileId,
    agency_id: AGENCY_A,
    status: "pending",
    created_at: "2026-04-01T00:00:00.000Z",
  });

  // ---- T6: a revoked/redacted prior package must never fall back to the
  //          live profile (Tier 1) ---------------------------------------
  await knex("applications").insert({
    id: T6.applicationId,
    profile_id: T6.profileId,
    agency_id: AGENCY_A,
    status: "pending",
    created_at: "2026-01-15T00:00:00.000Z",
  });
  await knex("talent_submission_packages").insert([
    {
      id: T6.pkgOldId,
      application_id: T6.applicationId,
      user_id: T6.userId,
      profile_id: T6.profileId,
      created_at: "2026-01-15T00:00:00.000Z",
      payload: JSON.stringify({ redacted: true }),
      revoked_at: "2026-02-01T00:00:00.000Z",
      redacted_at: "2026-02-01T00:00:00.000Z",
      redaction_reason: "revoked",
    },
    {
      id: T6.pkgNewId,
      application_id: T6.applicationId,
      user_id: T6.userId,
      profile_id: T6.profileId,
      created_at: "2026-03-01T00:00:00.000Z",
      payload: packagePayload({ submittedAt: "2026-03-01T00:00:00.000Z", profile: profileRow({ height_cm: 172 }) }),
    },
  ]);

  // ---- T7: two anonymous open-call submissions, never claimed (Tier 2 +
  //          the dossier's identity branch) -------------------------------
  await knex("applicant_identities").insert({
    id: T7.identityId,
    email_normalized: "t7@applicant.test",
    profile_id: null,
    claimed_at: null,
    disowned_at: null,
  });
  await knex("applications").insert([
    // Two different open-call editions of the same agency (never claimed) —
    // the `uq_applications_identity_agency_repr` partial index forbids two
    // `representation`-purpose rows for one identity+agency, but the
    // `event_casting` index is scoped per open_call_link_id, so a repeat
    // *edition* is exactly the genuinely-separate-row case Tier 2 exists for.
    { id: T7.appOldId, profile_id: null, applicant_identity_id: T7.identityId, agency_id: AGENCY_A, call_purpose: "event_casting", open_call_link_id: LINK_A1, status: "pending", created_at: "2026-01-20T00:00:00.000Z" },
    { id: T7.appNewId, profile_id: null, applicant_identity_id: T7.identityId, agency_id: AGENCY_A, call_purpose: "event_casting", open_call_link_id: LINK_A2, status: "pending", created_at: "2026-08-01T00:00:00.000Z" },
  ]);
  await knex("talent_submission_packages").insert([
    { id: T7.pkgOldId, application_id: T7.appOldId, applicant_identity_id: T7.identityId, user_id: null, profile_id: null, created_at: "2026-01-20T00:00:00.000Z", payload: identityPackagePayload({ heightCm: 160, city: "Bronx", submittedAt: "2026-01-20T00:00:00.000Z" }) },
    { id: T7.pkgNewId, application_id: T7.appNewId, applicant_identity_id: T7.identityId, user_id: null, profile_id: null, created_at: "2026-08-01T00:00:00.000Z", payload: identityPackagePayload({ heightCm: 163, city: "Bronx", submittedAt: "2026-08-01T00:00:00.000Z" }) },
  ]);
}

beforeAll(async () => {
  await migrate(knex);
  await seedFixtures();
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

const loadApp = (id) => knex("applications").where({ id }).first();

describe("loadSeasonMemory — Tier 1: same application row, resubmission", () => {
  test("a reapplication with real movement reports measurements, declared changes, and a reshoot", async () => {
    const memory = await loadSeasonMemory(knex, { agencyId: AGENCY_A, applicationId: T1.applicationId });

    expect(memory).not.toBeNull();
    expect(memory.priorApplicationId).toBe(T1.applicationId);
    expect(memory.currentApplicationId).toBe(T1.applicationId);
    expect(memory.hasMovement).toBe(true);

    const height = memory.measurements.find((m) => m.key === "height_cm");
    expect(height).toMatchObject({ kind: "changed", before: 172, after: 174, delta: 2 });

    const eyes = memory.declared.find((d) => d.key === "eye_color");
    expect(eyes).toMatchObject({ kind: "changed", before: "green", after: "blue" });

    expect(memory.digitals.kind).toBe("reshot");

    // Same profile on both sides of a same-row resubmission: no historical
    // representation table exists, so this is correctly null, not fabricated.
    expect(memory.representation).toBeNull();
  });

  test("an identical reapplication states plainly that nothing changed", async () => {
    const memory = await loadSeasonMemory(knex, { agencyId: AGENCY_A, applicationId: T2.applicationId });

    expect(memory).not.toBeNull();
    expect(memory.hasMovement).toBe(false);
    expect(memory.measurements).toEqual([]);
    expect(memory.declared).toEqual([]);
    expect(memory.digitals.kind).toBe("same_set");
  });

  test("a revoked/redacted prior package never falls back to the live profile", async () => {
    const memory = await loadSeasonMemory(knex, { agencyId: AGENCY_A, applicationId: T6.applicationId });

    expect(memory).not.toBeNull();
    const height = memory.measurements.find((m) => m.key === "height_cm");
    // "newly_given", not "changed" — a redacted prior asserts nothing, so the
    // current value cannot be read as a movement FROM anything.
    expect(height).toMatchObject({ kind: "newly_given", before: null, after: 172 });
    // The live profile's 999 must never appear anywhere in the diff.
    expect(JSON.stringify(memory)).not.toContain("999");
    expect(JSON.stringify(memory)).not.toContain("\"red\"");
  });

  test("an identity claimed after an anonymous submission (same row, re-pointed) surfaces the signed representation", async () => {
    const memory = await loadSeasonMemory(knex, { agencyId: AGENCY_A, applicationId: T3.applicationId });

    expect(memory).not.toBeNull();
    expect(memory.priorApplicationId).toBe(T3.applicationId);
    expect(memory.hasMovement).toBe(true);

    const height = memory.measurements.find((m) => m.key === "height_cm");
    expect(height).toMatchObject({ kind: "changed", before: 165, after: 168, delta: 3 });

    // The older package's own `profile_id` was null (no profile existed yet
    // at that point) — representations query as [] then, live-for-now after.
    expect(memory.representation).toMatchObject({ kind: "signed" });
    expect(memory.representation.named).toContain("Milan Model Co");
  });
});

describe("loadSeasonMemory — Tier 2: a genuinely different application row", () => {
  test("two anonymous submissions from the same identity, to two different open-call editions, diff correctly", async () => {
    const memory = await loadSeasonMemory(knex, { agencyId: AGENCY_A, applicationId: T7.appNewId });

    expect(memory).not.toBeNull();
    expect(memory.priorApplicationId).toBe(T7.appOldId);
    const height = memory.measurements.find((m) => m.key === "height_cm");
    expect(height).toMatchObject({ kind: "changed", before: 160, after: 163, delta: 3 });
  });

  test("cross-agency: a prior submission to a different agency is never surfaced", async () => {
    const memoryForA = await loadSeasonMemory(knex, { agencyId: AGENCY_A, applicationId: T4.appANewId });
    expect(memoryForA).not.toBeNull();
    expect(memoryForA.priorApplicationId).toBe(T4.appAOldId);

    // Agency B's own application is a first submission from its own point of
    // view — Agency A's history with this profile must not leak into it.
    const memoryForB = await loadSeasonMemory(knex, { agencyId: AGENCY_B, applicationId: T4.appBId });
    expect(memoryForB).toBeNull();
  });
});

describe("loadSeasonMemory — nothing to compare", () => {
  test("a first-time applicant returns null", async () => {
    const memory = await loadSeasonMemory(knex, { agencyId: AGENCY_A, applicationId: T5.applicationId });
    expect(memory).toBeNull();
  });

  test("a missing/foreign application id returns null rather than throwing", async () => {
    await expect(
      loadSeasonMemory(knex, { agencyId: AGENCY_A, applicationId: uuidv4() }),
    ).resolves.toBeNull();
  });
});

describe("the talent dossier carries seasonMemory on both branches", () => {
  test("profile branch: buildTalentDossier surfaces the same movement the loader reports", async () => {
    const application = await loadApp(T1.applicationId);
    const dossier = await buildTalentDossier(knex, { application, agencyId: AGENCY_A });

    expect(dossier).not.toBeNull();
    expect(dossier.seasonMemory).not.toBeNull();
    expect(dossier.seasonMemory.hasMovement).toBe(true);
    expect(dossier.seasonMemory.priorApplicationId).toBe(T1.applicationId);
  });

  test("identity branch: buildTalentDossier surfaces season memory for an unclaimed applicant", async () => {
    const application = await loadApp(T7.appNewId);
    const dossier = await buildTalentDossier(knex, { application, agencyId: AGENCY_A });

    expect(dossier).not.toBeNull();
    expect(dossier.seasonMemory).not.toBeNull();
    expect(dossier.seasonMemory.priorApplicationId).toBe(T7.appOldId);
  });

  test("a first-time applicant's dossier carries a null seasonMemory, not an empty one", async () => {
    const application = await loadApp(T5.applicationId);
    const dossier = await buildTalentDossier(knex, { application, agencyId: AGENCY_A });

    expect(dossier).not.toBeNull();
    expect(dossier.seasonMemory).toBeNull();
  });
});
