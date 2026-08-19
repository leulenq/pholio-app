"use strict";

/**
 * THE CANDIDATE FETCH BEHIND `GET /api/agency/applications`, AT THE CAP.
 *
 * A filter that names a `profiles` column cannot be evaluated in SQL for an
 * identity-backed application — its name, city and height live inside a frozen
 * JSON payload — so those rows are kept in the candidate set and re-filtered in
 * JS. Doing that inside ONE query means every profile-scoped predicate carries
 * `OR applications.profile_id IS NULL`, and at the cap that is a silent bug:
 * identity rows sort first (their `profiles.last_name` is NULL) and occupy the
 * LIMIT whether or not they will survive the JS pass, so account-backed rows
 * that DO match the organizer's filter fall past the ceiling and disappear from
 * the inbox with no error and no warning. Silent omission is the failure this
 * whole lane exists to prevent; the OR only moved it from small pools to large
 * ones.
 *
 * `SUBMISSIONS_HARD_CAP` is 2,000 and no suite can honestly seed past it, so the
 * fetch is exercised directly through `inbox.js`'s `__testables` with a small
 * injected cap. That is the seam where "a matching account-backed row beyond the
 * naive combined LIMIT is still returned" can be asserted at all.
 */

const { v4: uuidv4 } = require("uuid");

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("agency-inbox-candidate-split");

const knex = require("../../src/shared/db/knex");
const {
  fetchSubmissionCandidates,
  SUBMISSIONS_HARD_CAP,
} = require("../../src/domains/agency/routes/inbox").__testables;

const AGENCY_ID = uuidv4();

/**
 * The account-backed applicant the filter matches — and the one the naive
 * combined query loses. Her last name sorts LAST, which is the point: SQL orders
 * by `profiles.last_name` and the identity rows' NULL sorts first.
 */
const ZOE = { userId: uuidv4(), profileId: uuidv4(), applicationId: uuidv4() };
/** Account-backed and BELOW the height filter — must never come back. */
const ABE = { userId: uuidv4(), profileId: uuidv4(), applicationId: uuidv4() };
/** Identity-backed, three of them: no profile row, so SQL cannot judge them. */
const ANONS = [uuidv4(), uuidv4(), uuidv4()].map((id) => ({
  identityId: id,
  applicationId: uuidv4(),
}));

async function insertTalentApplication({ userId, profileId, applicationId }, { lastName, heightCm }) {
  await knex("users").insert({
    id: userId,
    email: `${lastName.toLowerCase()}@talent.test`,
    role: "TALENT",
    email_verified: true,
    created_at: knex.fn.now(),
  });
  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `${lastName.toLowerCase()}-${profileId.slice(0, 6)}`,
    first_name: lastName,
    last_name: lastName,
    city: "Brooklyn",
    height_cm: heightCm,
    bio_raw: "Runway.",
    // The inbox gates the account-backed half on this being present.
    bio_curated: "Runway and editorial.",
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  await knex("applications").insert({
    id: applicationId,
    profile_id: profileId,
    applicant_identity_id: null,
    agency_id: AGENCY_ID,
    status: "pending",
    minor_at_submission: false,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
}

async function insertIdentityApplication({ identityId, applicationId }, index) {
  await knex("applicant_identities").insert({
    id: identityId,
    email_normalized: `anon${index}@applicant.test`,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  await knex("applications").insert({
    id: applicationId,
    profile_id: null,
    applicant_identity_id: identityId,
    agency_id: AGENCY_ID,
    status: "pending",
    minor_at_submission: false,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
}

/** The organizer's filter for every test below: "at least 175cm". */
const FILTERED = Object.freeze({
  agencyId: AGENCY_ID,
  identitySupported: true,
  emailVerifiedColumn: true,
  minHeight: 175,
});

beforeAll(async () => {
  await migrate(knex);
  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Fashion Week Brooklyn",
    status: "ACTIVE",
  });
  await insertTalentApplication(ZOE, { lastName: "Zulu", heightCm: 182 });
  await insertTalentApplication(ABE, { lastName: "Abbot", heightCm: 160 });
  for (const [index, anon] of ANONS.entries()) {
    await insertIdentityApplication(anon, index);
  }
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

describe("fetchSubmissionCandidates under the hard cap", () => {
  test("the identity rows really do sort ahead of the match — the setup the bug needed", async () => {
    // No profile-scoped filter: one query, cap 2. The rows that come back are
    // the identity-backed ones, because their NULL last_name sorts first. This
    // is exactly why an `OR profile_id IS NULL` predicate under one LIMIT could
    // push a matching account-backed row out of the result.
    const { rows } = await fetchSubmissionCandidates(knex, {
      agencyId: AGENCY_ID,
      identitySupported: true,
      emailVerifiedColumn: true,
      cap: 2,
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => !row.application_profile_id)).toBe(true);
  });

  test("a matching account-backed row survives a cap the identity rows fill", async () => {
    const { rows, capped } = await fetchSubmissionCandidates(knex, {
      ...FILTERED,
      cap: 2,
    });

    const ids = rows.map((row) => row.application_id);
    // THE assertion: three identity rows would have filled a combined LIMIT of
    // 2 twice over, and Zoe — who matches the filter — comes back anyway.
    expect(ids).toContain(ZOE.applicationId);
    // Below 175: SQL can judge her, and does.
    expect(ids).not.toContain(ABE.applicationId);
    // The identity half gets its own slice and is bounded by it; the caller's
    // JS pass is what decides which of those survive.
    expect(rows.filter((row) => !row.application_profile_id)).toHaveLength(2);
    // Truncation is still reported when a half hits its ceiling.
    expect(capped).toBe(true);
  });

  test("with room to spare, both halves come back whole and nothing is capped", async () => {
    const { rows, capped } = await fetchSubmissionCandidates(knex, {
      ...FILTERED,
      cap: 50,
    });
    const ids = rows.map((row) => row.application_id);
    expect(ids).toContain(ZOE.applicationId);
    expect(ids).not.toContain(ABE.applicationId);
    for (const anon of ANONS) expect(ids).toContain(anon.applicationId);
    expect(capped).toBe(false);
  });

  test("an `applications` filter needs no split — SQL can judge every row", async () => {
    // Status is a column on `applications`, so identity-backed rows are filtered
    // in SQL like any other and the single query still runs.
    await knex("applications")
      .where({ id: ANONS[0].applicationId })
      .update({ status: "shortlisted" });

    const { rows } = await fetchSubmissionCandidates(knex, {
      agencyId: AGENCY_ID,
      identitySupported: true,
      emailVerifiedColumn: true,
      status: "shortlisted",
      cap: 50,
    });
    expect(rows.map((row) => row.application_id)).toEqual([
      ANONS[0].applicationId,
    ]);

    await knex("applications")
      .where({ id: ANONS[0].applicationId })
      .update({ status: "pending" });
  });

  test("a deployment without identity support keeps the single query", async () => {
    const { rows } = await fetchSubmissionCandidates(knex, {
      agencyId: AGENCY_ID,
      identitySupported: false,
      emailVerifiedColumn: true,
      minHeight: 175,
      cap: 50,
    });
    // Pre-identity behaviour exactly: account-backed rows only, filtered in SQL.
    expect(rows.map((row) => row.application_id)).toEqual([ZOE.applicationId]);
  });

  test("the shipped ceiling is still the documented one", () => {
    expect(SUBMISSIONS_HARD_CAP).toBe(2000);
  });
});
