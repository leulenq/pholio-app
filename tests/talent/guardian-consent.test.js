/**
 * tests/talent/guardian-consent.test.js
 *
 * Guardian consent verification flow (legal audit Phase 1).
 *
 * Exercises the service layer against a real (migrated) database and a couple of
 * route-level guards. Fixtures are namespaced and cleaned up so the suite is
 * non-destructive to the surrounding dev database.
 */

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const emailModule = require("../../src/shared/lib/email");
const {
  hashToken,
  createConsentRequest,
  verifyConsentToken,
  getConsentStatus,
  getAgencyConsentStatus,
  hasAgencyConsent,
  persistProfileDateOfBirthIfNeeded,
  GuardianConsentEmailError,
} = require("../../src/domains/talent/services/guardian-consent");

const MINOR_DOB = "2012-03-15"; // clearly under 18
const GUARDIAN_EMAIL = "guardian.test@example.com";

let originalSendGuardianConsentEmail;

beforeAll(() => {
  originalSendGuardianConsentEmail = emailModule.sendGuardianConsentEmail;
  emailModule.sendGuardianConsentEmail = jest.fn().mockResolvedValue({
    messageId: "test-message-id",
  });
});

afterAll(async () => {
  if (originalSendGuardianConsentEmail) {
    emailModule.sendGuardianConsentEmail = originalSendGuardianConsentEmail;
  }
  await knex.destroy();
});

async function makeProfile({ dob = MINOR_DOB } = {}) {
  const userId = uuidv4();
  const profileId = uuidv4();

  await knex("users").insert({
    id: userId,
    email: `gc-${userId}@example.com`,
    password_hash: "x",
    role: "TALENT",
  });

  const profileRow = {
    id: profileId,
    user_id: userId,
    slug: `gc-${profileId}`,
    first_name: "Minor",
    last_name: "Tester",
    city: "Test City",
    height_cm: 170,
    bio_raw: "",
    bio_curated: "",
    onboarding_completed_at: knex.fn.now(),
  };
  if (dob != null) {
    profileRow.date_of_birth = dob;
  }

  await knex("profiles").insert(profileRow);

  return { userId, profileId };
}

async function cleanupProfile({ userId, profileId }) {
  await knex("minor_agency_consents").where({ profile_id: profileId }).del();
  await knex("guardian_consent_requests").where({ profile_id: profileId }).del();
  await knex("profiles").where({ id: profileId }).del();
  await knex("users").where({ id: userId }).del();
}

describe("guardian consent service", () => {
  beforeEach(() => {
    emailModule.sendGuardianConsentEmail.mockClear();
    emailModule.sendGuardianConsentEmail.mockResolvedValue({
      messageId: "test-message-id",
    });
  });

  beforeAll(async () => {
    await knex.migrate.latest();
  }, 45000);

  test("hashToken returns the sha256 hex digest", () => {
    const raw = "abc123";
    const expected = crypto.createHash("sha256").update(raw).digest("hex");
    expect(hashToken(raw)).toBe(expected);
  });

  test("createConsentRequest stores only the token hash and sets guardian_email", async () => {
    const fixture = await makeProfile();
    try {
      const { rawToken, id, expiresAt } = await createConsentRequest(
        knex,
        fixture.profileId,
        { guardianEmail: GUARDIAN_EMAIL, guardianName: "Pat Guardian" },
      );

      expect(emailModule.sendGuardianConsentEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: GUARDIAN_EMAIL,
          consentUrl: expect.stringContaining("/guardian-consent?token="),
        }),
      );

      expect(rawToken).toEqual(expect.any(String));
      expect(rawToken.length).toBeGreaterThanOrEqual(32);
      expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

      const row = await knex("guardian_consent_requests").where({ id }).first();
      expect(row).toBeTruthy();
      expect(row.status).toBe("pending");
      expect(row.guardian_email).toBe(GUARDIAN_EMAIL);
      // The raw token must never be persisted — only its hash.
      expect(row.token_hash).toBe(hashToken(rawToken));
      expect(row.token_hash).not.toBe(rawToken);

      const profile = await knex("profiles")
        .where({ id: fixture.profileId })
        .first();
      expect(profile.guardian_email).toBe(GUARDIAN_EMAIL);
      expect(profile.guardian_consent_at).toBeFalsy();
    } finally {
      await cleanupProfile(fixture);
    }
  });

  test("verifyConsentToken rejects an unknown token", async () => {
    const result = await verifyConsentToken(knex, "not-a-real-token");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid");
  });

  test("verifyConsentToken records consent and is idempotent", async () => {
    const fixture = await makeProfile();
    try {
      const { rawToken } = await createConsentRequest(knex, fixture.profileId, {
        guardianEmail: GUARDIAN_EMAIL,
      });

      const first = await verifyConsentToken(knex, rawToken);
      expect(first.ok).toBe(true);
      expect(first.profileId).toBe(fixture.profileId);

      const profile = await knex("profiles")
        .where({ id: fixture.profileId })
        .first();
      expect(profile.guardian_consent_at).toBeTruthy();

      const request = await knex("guardian_consent_requests")
        .where({ profile_id: fixture.profileId })
        .first();
      expect(request.status).toBe("verified");
      expect(request.verified_at).toBeTruthy();

      // Re-clicking the same link still resolves to success.
      const second = await verifyConsentToken(knex, rawToken);
      expect(second.ok).toBe(true);
      expect(second.reason).toBe("already_verified");
    } finally {
      await cleanupProfile(fixture);
    }
  });

  test("agency verification authorizes only the named agency", async () => {
    const fixture = await makeProfile();
    const firstAgencyId = uuidv4();
    const secondAgencyId = uuidv4();
    await knex("agencies").insert([
      {
        id: firstAgencyId,
        name: "Scoped Consent House",
        slug: `scoped-consent-${firstAgencyId}`,
        status: "ACTIVE",
      },
      {
        id: secondAgencyId,
        name: "Other Consent House",
        slug: `other-consent-${secondAgencyId}`,
        status: "ACTIVE",
      },
    ]);

    try {
      const { rawToken } = await createConsentRequest(
        knex,
        fixture.profileId,
        {
          guardianEmail: GUARDIAN_EMAIL,
          agencyId: firstAgencyId,
          agencyName: "Scoped Consent House",
        },
      );

      expect(emailModule.sendGuardianConsentEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          agencyName: "Scoped Consent House",
        }),
      );
      expect((await verifyConsentToken(knex, rawToken)).agencyId).toBe(
        firstAgencyId,
      );
      expect(
        await hasAgencyConsent(knex, fixture.profileId, firstAgencyId),
      ).toBe(true);
      expect(
        await hasAgencyConsent(knex, fixture.profileId, secondAgencyId),
      ).toBe(false);

      const profile = await knex("profiles")
        .where({ id: fixture.profileId })
        .first();
      expect(profile.guardian_consent_at).toBeFalsy();
      expect(
        (await getAgencyConsentStatus(knex, profile, firstAgencyId)).status,
      ).toBe("verified");
      expect(
        (await getAgencyConsentStatus(knex, profile, secondAgencyId)).status,
      ).toBe("none");
    } finally {
      await cleanupProfile(fixture);
      await knex("agencies")
        .whereIn("id", [firstAgencyId, secondAgencyId])
        .del();
    }
  });

  test("pending account and agency requests remain independent", async () => {
    const fixture = await makeProfile();
    const agencyId = uuidv4();
    await knex("agencies").insert({
      id: agencyId,
      name: "Independent Consent House",
      slug: `independent-consent-${agencyId}`,
      status: "ACTIVE",
    });

    try {
      const accountRequest = await createConsentRequest(
        knex,
        fixture.profileId,
        { guardianEmail: GUARDIAN_EMAIL },
      );
      const agencyRequest = await createConsentRequest(
        knex,
        fixture.profileId,
        {
          guardianEmail: GUARDIAN_EMAIL,
          agencyId,
          agencyName: "Independent Consent House",
        },
      );

      const rows = await knex("guardian_consent_requests")
        .whereIn("id", [accountRequest.id, agencyRequest.id])
        .orderBy("agency_id", "asc");
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.status === "pending")).toBe(true);
    } finally {
      await cleanupProfile(fixture);
      await knex("agencies").where({ id: agencyId }).del();
    }
  });

  test("creating a new request revokes the prior pending one", async () => {
    const fixture = await makeProfile();
    try {
      const first = await createConsentRequest(knex, fixture.profileId, {
        guardianEmail: GUARDIAN_EMAIL,
      });
      await createConsentRequest(knex, fixture.profileId, {
        guardianEmail: "second.guardian@example.com",
      });

      // The first token can no longer be used.
      const result = await verifyConsentToken(knex, first.rawToken);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("revoked");

      const pendingCount = await knex("guardian_consent_requests")
        .where({ profile_id: fixture.profileId, status: "pending" })
        .count({ c: "*" })
        .first();
      expect(Number(pendingCount.c)).toBe(1);
    } finally {
      await cleanupProfile(fixture);
    }
  });

  test("expired tokens are rejected and marked expired", async () => {
    const fixture = await makeProfile();
    try {
      const rawToken = "expired-raw-token-" + uuidv4();
      await knex("guardian_consent_requests").insert({
        id: uuidv4(),
        profile_id: fixture.profileId,
        guardian_email: GUARDIAN_EMAIL,
        token_hash: hashToken(rawToken),
        status: "pending",
        expires_at: new Date(Date.now() - 1000).toISOString(),
        created_at: new Date(Date.now() - 10000).toISOString(),
      });

      const result = await verifyConsentToken(knex, rawToken);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("expired");

      const row = await knex("guardian_consent_requests")
        .where({ token_hash: hashToken(rawToken) })
        .first();
      expect(row.status).toBe("expired");
    } finally {
      await cleanupProfile(fixture);
    }
  });

  test("getConsentStatus reflects pending then verified", async () => {
    const fixture = await makeProfile();
    try {
      let profile = await knex("profiles")
        .where({ id: fixture.profileId })
        .first();
      expect((await getConsentStatus(knex, profile)).status).toBe("none");

      const { rawToken } = await createConsentRequest(knex, fixture.profileId, {
        guardianEmail: GUARDIAN_EMAIL,
      });
      profile = await knex("profiles").where({ id: fixture.profileId }).first();
      expect((await getConsentStatus(knex, profile)).status).toBe("pending");

      await verifyConsentToken(knex, rawToken);
      profile = await knex("profiles").where({ id: fixture.profileId }).first();
      const verified = await getConsentStatus(knex, profile);
      expect(verified.status).toBe("verified");
    } finally {
      await cleanupProfile(fixture);
    }
  });

  test("persistProfileDateOfBirthIfNeeded saves DOB when missing", async () => {
    const fixture = await makeProfile({ dob: null });
    try {
      let profile = await knex("profiles")
        .where({ id: fixture.profileId })
        .first();
      profile = await persistProfileDateOfBirthIfNeeded(
        knex,
        profile,
        MINOR_DOB,
      );
      expect(profile.date_of_birth).toContain("2012-03-15");

      const row = await knex("profiles").where({ id: fixture.profileId }).first();
      expect(String(row.date_of_birth)).toContain("2012-03-15");
    } finally {
      await cleanupProfile(fixture);
    }
  });

  test("createConsentRequest revokes pending request when email delivery fails", async () => {
    const fixture = await makeProfile();
    emailModule.sendGuardianConsentEmail.mockRejectedValueOnce(
      new Error("SMTP unavailable"),
    );

    try {
      await expect(
        createConsentRequest(knex, fixture.profileId, {
          guardianEmail: GUARDIAN_EMAIL,
        }),
      ).rejects.toBeInstanceOf(GuardianConsentEmailError);

      const pending = await knex("guardian_consent_requests")
        .where({ profile_id: fixture.profileId, status: "pending" })
        .count({ c: "*" })
        .first();
      expect(Number(pending.c)).toBe(0);
    } finally {
      await cleanupProfile(fixture);
    }
  });
});

describe("guardian consent routes", () => {
  let app;

  beforeAll(async () => {
    app = require("../../src/app");
  }, 45000);

  test("POST /api/talent/guardian-consent/request requires auth", async () => {
    const request = require("supertest");
    const res = await request(app)
      .post("/api/talent/guardian-consent/request")
      .set("Accept", "application/json")
      .send({ guardian_email: GUARDIAN_EMAIL });

    expect(res.status).toBe(401);
  });

  test("GET /api/talent/guardian-consent/verify rejects an invalid token", async () => {
    const request = require("supertest");
    const res = await request(app)
      .get("/api/talent/guardian-consent/verify?token=nope")
      .set("Accept", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("GET /guardian-consent renders a failure page for a bad token", async () => {
    const request = require("supertest");
    const res = await request(app).get("/guardian-consent?token=nope");

    expect(res.status).toBe(400);
    expect(res.text).toContain("no longer valid");
  });
});
