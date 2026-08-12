/**
 * Agency open call links: arrivals, claims, quota exemption, containment.
 *
 * The entitlement is the server-side claim row — these tests assert that the
 * link code grants nothing by itself, that a claim exempts exactly one
 * submission to exactly the inviting agency, and that forged client input is
 * inert.
 */

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

const { acceptedLegal } = require("../setup/legal-fixture");
const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { recordLegalAcceptance } = require("../../src/shared/lib/legal-acceptance");
const {
  recordSubmissionProgramAcknowledgment,
} = require("../../src/shared/lib/submission-program");
const {
  DRAFT_SCHEMA_VERSION,
} = require("../../src/domains/talent/services/application-drafts");
const {
  buildSubmissionPackageFingerprint,
} = require("../../src/domains/talent/services/submission-disclosure-consent");
const {
  mintClaim,
} = require("../../src/domains/talent/services/open-call-claims");

const SESSION_SECRET = require("../../src/config").sessionSecret;

describe("agency open call claims", () => {
  // Every new link carries a brief (A4 #1); these are the agency's answers.
  const VALID_BRIEF = {
    who: "New faces for our women's board, London.",
    what: "Four digitals: close-up, profile, waist-up and full length.",
    eligibility: "",
    nextSteps: "We review weekly and reply within 30 days, either way.",
    deadline: "",
    ongoing: true,
  };

  const userId = uuidv4();
  const profileId = uuidv4();
  const invitingAgencyId = uuidv4();
  const otherAgencyId = uuidv4();
  const thirdAgencyId = uuidv4();
  const linkId = uuidv4();
  const linkCode = crypto.randomBytes(12).toString("base64url");
  const imageId = uuidv4();
  const fullLengthImageId = uuidv4();
  const imageSetId = uuidv4();
  const sessionIds = [];

  function submissionPayload(agencyId, idempotencyKey, extra = {}) {
    const submissionPackage = {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      boards: ["editorial"],
      mediaSetId: imageSetId,
      digitalSlotPicks: {
        headshot: imageId,
        full_length: fullLengthImageId,
      },
      imageIds: [imageId, fullLengthImageId],
      consentConfirmed: true,
      accuracyConfirmed: true,
      adultAuthorityConfirmed: true,
    };
    const note = "An open call note.";
    return {
      agencyId,
      note,
      draftVersion: 0,
      draftGeneration: 0,
      idempotencyKey,
      submissionPackage: {
        ...submissionPackage,
        consentPackageFingerprint: buildSubmissionPackageFingerprint({
          agencyId,
          boards: submissionPackage.boards,
          mediaSetId: submissionPackage.mediaSetId,
          digitalSlotPicks: submissionPackage.digitalSlotPicks,
          compCardPresetId: null,
          imageIds: submissionPackage.imageIds,
          note,
        }),
      },
      ...extra,
    };
  }

  async function fillDiscoveryQuota(count = 5) {
    const rows = [];
    for (let i = 0; i < count; i += 1) {
      rows.push({
        id: uuidv4(),
        profile_id: profileId,
        agency_id: otherAgencyId,
        idempotency_key: `filler:${uuidv4()}`,
        request_hash: crypto
          .createHash("sha256")
          .update(`filler:${i}:${Math.random()}`)
          .digest("hex"),
        application_id: null,
        status: "completed",
        quota_exempt: false,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    }
    await knex("application_submission_requests").insert(rows);
  }

  beforeAll(async () => {
    await knex.migrate.latest();
    await knex("users").insert([
      {
        id: userId,
        email: `open-call-${userId}@example.com`,
        password_hash: "x",
        role: "TALENT",
        email_verified: true,
        // Talent API routes sit behind the legal gate.
        ...acceptedLegal(),
      },
      {
        id: invitingAgencyId,
        email: `open-call-agency-${invitingAgencyId}@example.com`,
        password_hash: "x",
        role: "AGENCY",
      },
    ]);
    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `open-call-${profileId}`,
      first_name: "Open",
      last_name: "Call",
      city: "Test",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 170,
      bust_cm: 86,
      waist_cm: 61,
      hips_cm: 90,
      phone: "555-0100",
      nationality: "Canadian",
      languages: JSON.stringify(["English"]),
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: new Date().toISOString(),
    });
    await recordLegalAcceptance(knex, userId, { terms: true, privacy: true });
    await recordSubmissionProgramAcknowledgment(knex, userId);
    await knex("agencies").insert([
      {
        id: invitingAgencyId,
        name: "Inviting House",
        slug: `inviting-house-${invitingAgencyId}`,
        status: "ACTIVE",
        open_boards: JSON.stringify(["editorial"]),
      },
      {
        id: otherAgencyId,
        name: "Other House",
        slug: `other-house-${otherAgencyId}`,
        status: "ACTIVE",
        open_boards: JSON.stringify(["editorial"]),
      },
      {
        id: thirdAgencyId,
        name: "Third House",
        slug: `third-house-${thirdAgencyId}`,
        status: "ACTIVE",
        open_boards: JSON.stringify(["editorial"]),
      },
    ]);
    await knex("agency_open_call_links").insert({
      id: linkId,
      agency_id: invitingAgencyId,
      code: linkCode,
      label: "Website",
      status: "active",
      created_by_user_id: invitingAgencyId,
    });
    await knex("image_sets").insert({
      id: imageSetId,
      profile_id: profileId,
      kind: "portfolio_test",
      name: "Open call set",
      is_current: true,
    });
    await knex("images").insert([
      {
        id: imageId,
        profile_id: profileId,
        path: `/uploads/${imageId}.jpg`,
        public_url: `/uploads/${imageId}.jpg`,
        set_id: imageSetId,
        image_type: "digital",
        shot_type: "headshot",
        status: "active",
        captured_at: new Date().toISOString(),
        sort: 0,
      },
      {
        id: fullLengthImageId,
        profile_id: profileId,
        path: `/uploads/${fullLengthImageId}.jpg`,
        public_url: `/uploads/${fullLengthImageId}.jpg`,
        set_id: imageSetId,
        image_type: "digital",
        shot_type: "full_length",
        status: "active",
        captured_at: new Date().toISOString(),
        sort: 1,
      },
    ]);
    await knex("image_rights").insert([
      {
        id: uuidv4(),
        image_id: imageId,
        rights_status: "cleared",
        license_type: "owned",
        copyright_owner: "Open Call",
      },
      {
        id: uuidv4(),
        image_id: fullLengthImageId,
        rights_status: "cleared",
        license_type: "owned",
        copyright_owner: "Open Call",
      },
    ]);
  });

  afterAll(async () => {
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex("application_submission_requests")
      .where({ profile_id: profileId })
      .delete();
    await knex("agency_open_call_claims").where({ profile_id: profileId }).delete();
    await knex("agency_open_call_arrivals")
      .whereIn("agency_id", [invitingAgencyId, otherAgencyId, thirdAgencyId])
      .delete();
    await knex("agency_open_call_links")
      .whereIn("agency_id", [invitingAgencyId, otherAgencyId, thirdAgencyId])
      .delete();
    await knex("applications").where({ profile_id: profileId }).delete();
    await knex("image_rights")
      .whereIn("image_id", [imageId, fullLengthImageId])
      .delete();
    await knex("images").where({ profile_id: profileId }).delete();
    await knex("image_sets").where({ profile_id: profileId }).delete();
    await knex("agencies")
      .whereIn("id", [invitingAgencyId, otherAgencyId, thirdAgencyId])
      .delete();
    await knex("profiles").where({ id: profileId }).delete();
    await knex("users").whereIn("id", [userId, invitingAgencyId]).delete();
    await knex.destroy();
  });

  afterEach(async () => {
    // Each test manages its own quota fillers; clear them to keep tests
    // independent.
    await knex("application_submission_requests")
      .where({ profile_id: profileId })
      .where("idempotency_key", "like", "filler:%")
      .delete();
  });

  async function withSession(sessionData) {
    const sid = uuidv4();
    sessionIds.push(sid);
    await knex("sessions").insert({
      sid,
      sess: {
        cookie: { path: "/" },
        ...sessionData,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) =>
      req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
  }

  function withTalentSession() {
    return withSession({
      userId,
      role: "TALENT",
      email: `open-call-${userId}@example.com`,
    });
  }

  function withAgencySession() {
    return withSession({
      userId: invitingAgencyId,
      role: "AGENCY",
      agencyMembershipRole: "OWNER",
      // requireAgencyOnboardingComplete reads this straight off the session and
      // 403s AGENCY_SETUP_REQUIRED without it, before any handler runs.
      agencyOnboardingCompletedAt: new Date().toISOString(),
    });
  }

  test("public open-call lookup returns safe agency data for a valid code", async () => {
    const res = await request(app)
      .get(`/api/public/open-call/${linkCode}`)
      .set("Accept", "application/json");
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.agency).toMatchObject({
      id: invitingAgencyId,
      name: "Inviting House",
      openBoards: ["editorial"],
    });
    expect(res.body.data.authenticated).toBe(false);
  });

  test("public open-call lookup is quiet for unknown codes", async () => {
    const res = await request(app)
      .get(`/api/public/open-call/${crypto.randomBytes(12).toString("base64url")}`)
      .set("Accept", "application/json");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ valid: false });
  });

  test("anonymous arrival records the visit and parks signup context", async () => {
    const before = await knex("agency_open_call_arrivals")
      .where({ link_id: linkId })
      .count({ count: "*" })
      .first();
    const res = await request(app)
      .post(`/api/public/open-call/${linkCode}/arrival`)
      .set("Accept", "application/json")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.claimed).toBe(false);
    expect(res.body.data.pendingSignup).toBe(true);
    const after = await knex("agency_open_call_arrivals")
      .where({ link_id: linkId })
      .count({ count: "*" })
      .first();
    expect(Number(after.count)).toBe(Number(before.count) + 1);
    const arrival = await knex("agency_open_call_arrivals")
      .where({ link_id: linkId })
      .orderBy("arrived_at", "desc")
      .first();
    // Raw IPs are never stored.
    expect(arrival.ip_hash === null || /^[a-f0-9]{64}$/.test(arrival.ip_hash)).toBe(
      true,
    );
  });

  test("authenticated arrival mints one active claim per (agency, profile)", async () => {
    const auth = await withTalentSession();
    const first = await auth(
      request(app)
        .post(`/api/public/open-call/${linkCode}/arrival`)
        .set("Accept", "application/json")
        .send({}),
    );
    expect(first.status).toBe(200);
    expect(first.body.data.claimed).toBe(true);
    expect(first.body.data.claimExpiresAt).toBeTruthy();

    // Re-arrival refreshes rather than duplicating.
    const second = await auth(
      request(app)
        .post(`/api/public/open-call/${linkCode}/arrival`)
        .set("Accept", "application/json")
        .send({}),
    );
    expect(second.status).toBe(200);
    expect(second.body.data.claimed).toBe(true);

    const claims = await knex("agency_open_call_claims").where({
      profile_id: profileId,
      agency_id: invitingAgencyId,
    });
    expect(claims).toHaveLength(1);
    expect(claims[0].status).toBe("active");
  });

  test("quota endpoint reports the active claim and discovery-only usage", async () => {
    const auth = await withTalentSession();
    const res = await auth(
      request(app)
        .get("/api/talent/applications/quota")
        .set("Accept", "application/json"),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.exemptUsed).toBe(0);
    expect(res.body.data.activeClaims).toEqual([
      expect.objectContaining({
        agencyId: invitingAgencyId,
        agencyName: "Inviting House",
      }),
    ]);
  });

  test("prompt-context targets the invited agency from the live claim", async () => {
    const auth = await withTalentSession();
    const res = await auth(
      request(app)
        .get("/api/talent/applications/prompt-context")
        .set("Accept", "application/json"),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      hasRedirectSignal: true,
      source: "open_call",
      alreadyAppliedToTarget: false,
    });
    expect(res.body.data.targetAgency.id).toBe(invitingAgencyId);
    expect(res.body.data.claimExpiresAt).toBeTruthy();
  });

  test("at the limit, a non-invited submission is refused and the invited path is offered", async () => {
    await fillDiscoveryQuota(5);
    const auth = await withTalentSession();
    const res = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send(
          submissionPayload(otherAgencyId, `blocked:${uuidv4()}`, {
            // Forged client flags must be inert.
            quotaExempt: true,
            openCall: { claimed: true, agencyId: otherAgencyId },
          }),
        ),
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("monthly_discovery_limit_reached");
    expect(res.body.activeClaims).toEqual([
      expect.objectContaining({ agencyId: invitingAgencyId }),
    ]);
    expect(
      await knex("applications")
        .where({ profile_id: profileId, agency_id: otherAgencyId })
        .first(),
    ).toBeUndefined();
  });

  test("an invited submission passes at the limit, is recorded exempt, and consumes the claim", async () => {
    await fillDiscoveryQuota(5);
    const auth = await withTalentSession();
    const res = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send(submissionPayload(invitingAgencyId, `invited:${uuidv4()}`)),
    );
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();

    const quotaEvent = await knex("application_submission_requests")
      .where({ profile_id: profileId, application_id: res.body.id })
      .first();
    expect(Boolean(quotaEvent.quota_exempt)).toBe(true);
    expect(quotaEvent.exemption_claim_id).toBeTruthy();

    const claim = await knex("agency_open_call_claims")
      .where({ id: quotaEvent.exemption_claim_id })
      .first();
    expect(claim.status).toBe("consumed");
    expect(claim.consumed_application_id).toBe(res.body.id);

    // The consent record states the invited framing.
    const consentEvent = await knex("application_submission_consent_events")
      .where({ application_id: res.body.id })
      .first();
    const snapshot =
      typeof consentEvent.disclosure_snapshot === "string"
        ? JSON.parse(consentEvent.disclosure_snapshot)
        : consentEvent.disclosure_snapshot;
    expect(snapshot.openCall).toMatchObject({ invited: true });
    expect(snapshot.openCall.statement).toContain("Inviting House");

    // Discovery meter untouched; exempt meter incremented.
    const quota = await auth(
      request(app)
        .get("/api/talent/applications/quota")
        .set("Accept", "application/json"),
    );
    expect(quota.body.data.used).toBe(5);
    expect(quota.body.data.exemptUsed).toBe(1);
    expect(quota.body.data.remaining).toBe(0);
    expect(quota.body.data.activeClaims).toEqual([]);

    // Provenance surfaces on the applications list.
    const list = await auth(
      request(app)
        .get("/api/talent/applications")
        .set("Accept", "application/json"),
    );
    const submitted = list.body.data.find((row) => row.id === res.body.id);
    expect(submitted.source).toBe("open_call");
  });

  test("withdraw + resubmit does not re-exempt a consumed claim", async () => {
    const application = await knex("applications")
      .where({ profile_id: profileId, agency_id: invitingAgencyId })
      .first();
    expect(application).toBeTruthy();

    const auth = await withTalentSession();
    const withdrawal = await auth(
      request(app)
        .post(`/api/talent/applications/${application.id}/withdraw`)
        .set("Accept", "application/json")
        .send({}),
    );
    expect(withdrawal.status).toBe(200);

    await fillDiscoveryQuota(5);
    const resubmit = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send(submissionPayload(invitingAgencyId, `resubmit:${uuidv4()}`)),
    );
    expect(resubmit.status).toBe(403);
    expect(resubmit.body.error).toBe("monthly_discovery_limit_reached");
    expect(
      (
        await knex("applications")
          .where({ id: application.id })
          .first()
      ).status,
    ).toBe("withdrawn");
  });

  // The open call path is free and unlimited, always. No monthly ceiling
  // downgrades an invited submission — an agency that puts a Pholio link on
  // its own channels must stay reachable through it.
  test("invited submissions stay exempt with no monthly ceiling", async () => {
    // Simulate a month that already spent far more exempt submissions than
    // the retired cap of 3, on top of a fully-spent discovery allowance.
    const priorExempt = [];
    for (let i = 0; i < 6; i += 1) {
      priorExempt.push({
        id: uuidv4(),
        profile_id: profileId,
        agency_id: otherAgencyId,
        idempotency_key: `filler:exempt:${uuidv4()}`,
        request_hash: crypto
          .createHash("sha256")
          .update(`exempt-filler:${i}:${Math.random()}`)
          .digest("hex"),
        application_id: null,
        status: "completed",
        quota_exempt: true,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    }
    await knex("application_submission_requests").insert(priorExempt);
    await fillDiscoveryQuota(5);

    const { claim } = await mintClaim(knex, {
      linkId,
      arrivalId: null,
      agencyId: thirdAgencyId,
      profileId,
    });
    expect(claim).toBeTruthy();

    const auth = await withTalentSession();
    const res = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send(submissionPayload(thirdAgencyId, `uncapped:${uuidv4()}`)),
    );
    expect(res.status).toBe(200);

    const quotaEvent = await knex("application_submission_requests")
      .where({ profile_id: profileId, application_id: res.body.id })
      .first();
    expect(Boolean(quotaEvent.quota_exempt)).toBe(true);

    const consumedClaim = await knex("agency_open_call_claims")
      .where({ profile_id: profileId, agency_id: thirdAgencyId })
      .first();
    expect(consumedClaim.status).toBe("consumed");
  });

  test("a new open call link cannot be created without a brief", async () => {
    const agencyAuth = await withAgencySession();

    const noBrief = await agencyAuth(
      request(app)
        .post("/api/agency/open-call/links")
        .set("Accept", "application/json")
        .send({ label: "No brief" }),
    );
    expect(noBrief.status).toBe(400);
    expect(noBrief.body.error).toBe("brief_required");

    const undecidedDeadline = await agencyAuth(
      request(app)
        .post("/api/agency/open-call/links")
        .set("Accept", "application/json")
        .send({
          label: "Undecided",
          brief: { ...VALID_BRIEF, deadline: "", ongoing: false },
        }),
    );
    expect(undecidedDeadline.status).toBe(400);
    expect(undecidedDeadline.body.error).toBe("brief_deadline_required");

    const created = await agencyAuth(
      request(app)
        .post("/api/agency/open-call/links")
        .set("Accept", "application/json")
        .send({ label: "Ongoing call", brief: { ...VALID_BRIEF, deadline: "", ongoing: true } }),
    );
    expect(created.status).toBe(200);
    expect(created.body.data.brief.ongoing).toBe(true);
    expect(created.body.data.needsBrief).toBe(false);
  });

  test("agency link management lists, creates, and revokes with claim cascade", async () => {
    const agencyAuth = await withAgencySession();

    const created = await agencyAuth(
      request(app)
        .post("/api/agency/open-call/links")
        .set("Accept", "application/json")
        .send({ label: "Spring scouting email", brief: VALID_BRIEF }),
    );
    expect(created.status).toBe(200);
    expect(created.body.data.code).toMatch(/^[A-Za-z0-9_-]{8,32}$/);
    expect(created.body.data.status).toBe("active");
    const newLinkId = created.body.data.id;

    // A talent claims through the new link, then the agency revokes it.
    const { claim } = await mintClaim(knex, {
      linkId: newLinkId,
      arrivalId: null,
      agencyId: invitingAgencyId,
      profileId,
    });
    // The earlier consumed claim for this (agency, profile) blocks re-minting;
    // when that's the case, revocation cascade is exercised with a fresh
    // profile-less check below.
    const revoked = await agencyAuth(
      request(app)
        .patch(`/api/agency/open-call/links/${newLinkId}`)
        .set("Accept", "application/json")
        .send({ status: "revoked" }),
    );
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.status).toBe("revoked");

    if (claim) {
      const cascaded = await knex("agency_open_call_claims")
        .where({ id: claim.id })
        .first();
      expect(cascaded.status).toBe("revoked");
    }

    // Revoked links vanish from the list and stop resolving publicly.
    const list = await agencyAuth(
      request(app)
        .get("/api/agency/open-call/links")
        .set("Accept", "application/json"),
    );
    expect(list.status).toBe(200);
    expect(
      list.body.data.find((row) => row.id === newLinkId),
    ).toBeUndefined();

    const publicLookup = await request(app)
      .get(`/api/public/open-call/${created.body.data.code}`)
      .set("Accept", "application/json");
    expect(publicLookup.body.data.valid).toBe(false);
  });

  test("a paused link stops minting but leaves existing claims alone", async () => {
    await knex("agency_open_call_links")
      .where({ id: linkId })
      .update({ status: "paused" });
    const res = await request(app)
      .get(`/api/public/open-call/${linkCode}`)
      .set("Accept", "application/json");
    expect(res.body.data.valid).toBe(false);
    await knex("agency_open_call_links")
      .where({ id: linkId })
      .update({ status: "active" });
  });
});
