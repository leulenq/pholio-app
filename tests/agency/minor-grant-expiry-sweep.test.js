"use strict";

const { v4: uuidv4 } = require("uuid");
const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const dbFile = useIsolatedDatabase("minor-grant-expiry-sweep");
const knex = require("../../src/shared/db/knex");
const {
  expireMinorSubmissionAccessForAgency,
} = require("../../src/domains/agency/services/minor-submission-access");

/**
 * The expiry sweep is destructive: when it decides a guardian grant has
 * lapsed it purges the submission's disclosure package, deletes its notes,
 * messages, tags, reminders and roster membership, and marks the application
 * withdrawn. None of that is reversible, so "is this grant expired?" has to be
 * right on every database the app runs on.
 *
 * It was not. `guardian_consent_expires_at` is TEXT under SQLite, and the
 * sweep compared it against a JS Date, which node-sqlite3 stringifies as
 * "Fri Jul 31 2026 …". Lexicographically every ISO timestamp sorts below "F",
 * so a grant with a year left read as expired and the sweep purged live minor
 * submissions on sight — in dev, and in any test standing in for production.
 *
 * These two cases pin both directions.
 */
describe("minor guardian-grant expiry sweep", () => {
  const agencyId = uuidv4();
  const profileId = uuidv4();

  const userId = uuidv4();

  beforeAll(async () => {
    await migrate(knex);

    await knex("agencies").insert({ id: agencyId, name: "Sweep House" });
    await knex("users").insert({
      id: userId,
      email: `sweep-${userId}@example.com`,
      password_hash: "x",
      role: "TALENT",
    });
    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `sweep-${profileId}`,
      first_name: "Mina",
      last_name: "Sweep",
      city: "Paris",
      height_cm: 172,
      bio_raw: "",
      bio_curated: "",
      date_of_birth: "2012-01-01",
    });
  }, 60000);

  afterAll(async () => {
    await knex.destroy();
    dropIsolatedDatabase(dbFile);
  });

  afterEach(async () => {
    await knex("applications").where({ agency_id: agencyId }).delete();
    await knex("minor_agency_consents").where({ agency_id: agencyId }).delete();
    await knex("guardian_consent_requests").where({ agency_id: agencyId }).delete();
  });

  /** Grant + minor application, expiring `days` from now (negative = past). */
  async function seedMinorSubmission(days) {
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

    const consentRequestId = uuidv4();
    await knex("guardian_consent_requests").insert({
      id: consentRequestId,
      profile_id: profileId,
      agency_id: agencyId,
      guardian_email: "guardian@example.com",
      token_hash: `test-${uuidv4()}`,
      status: "verified",
      expires_at: expiresAt,
      verified_at: new Date().toISOString(),
    });

    const grantId = uuidv4();
    await knex("minor_agency_consents").insert({
      id: grantId,
      profile_id: profileId,
      agency_id: agencyId,
      consent_request_id: consentRequestId,
      guardian_email: "guardian@example.com",
      verified_at: new Date().toISOString(),
      authorization_expires_at: expiresAt,
    });

    const applicationId = uuidv4();
    await knex("applications").insert({
      id: applicationId,
      profile_id: profileId,
      agency_id: agencyId,
      status: "pending",
      minor_at_submission: true,
      guardian_consent_grant_id: grantId,
      guardian_consent_expires_at: expiresAt,
    });

    return applicationId;
  }

  it("leaves a live grant alone", async () => {
    const applicationId = await seedMinorSubmission(365);

    const expired = await expireMinorSubmissionAccessForAgency(knex, agencyId);
    expect(expired).toEqual([]);

    const application = await knex("applications")
      .where({ id: applicationId })
      .first();
    expect(application.status).toBe("pending");
    expect(application.minor_access_revoked_at).toBeFalsy();
    expect(application.minor_access_revocation_reason).toBeFalsy();
  });

  it("purges a grant that has actually lapsed", async () => {
    const applicationId = await seedMinorSubmission(-1);

    const expired = await expireMinorSubmissionAccessForAgency(knex, agencyId);
    expect(expired).toEqual([applicationId]);

    const application = await knex("applications")
      .where({ id: applicationId })
      .first();
    expect(application.status).toBe("withdrawn");
    expect(application.minor_access_revoked_at).toBeTruthy();
    expect(application.minor_access_revocation_reason).toBe(
      "guardian_grant_expired",
    );
  });
});
