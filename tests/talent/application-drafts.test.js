/**
 * Server-backed application drafts: normalization, resume, and concurrency.
 */

process.env.MINOR_SUBMISSION_ENFORCE = "1";

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { recordLegalAcceptance } = require("../../src/shared/lib/legal-acceptance");
const {
  recordSubmissionProgramAcknowledgment,
} = require("../../src/shared/lib/submission-program");
const {
  DRAFT_SCHEMA_VERSION,
  runDraftLifecycleCleanup,
} = require("../../src/domains/talent/services/application-drafts");
const {
  buildSubmissionPackageFingerprint,
} = require("../../src/domains/talent/services/submission-disclosure-consent");

const SESSION_SECRET = require("../../src/config").sessionSecret;

function bindAdultSubmissionConsent(payload) {
  const submissionPackage = payload.submissionPackage || {};
  return {
    ...payload,
    submissionPackage: {
      ...submissionPackage,
      schemaVersion:
        submissionPackage.schemaVersion || DRAFT_SCHEMA_VERSION,
      accuracyConfirmed: true,
      adultAuthorityConfirmed: true,
      consentPackageFingerprint: buildSubmissionPackageFingerprint({
        agencyId: payload.agencyId,
        boards: submissionPackage.boards,
        mediaSetId: submissionPackage.mediaSetId,
        digitalSlotPicks: submissionPackage.digitalSlotPicks,
        compCardPresetId: submissionPackage.compCardPresetId,
        imageIds: submissionPackage.imageIds,
        note: payload.note,
      }),
    },
  };
}

describe("application drafts", () => {
  const userId = uuidv4();
  const profileId = uuidv4();
  const agencyId = uuidv4();
  const expiryAgencyId = uuidv4();
  const consentAgencyId = uuidv4();
  const minorAgencyId = uuidv4();
  const editorialBoardId = uuidv4();
  const imageId = uuidv4();
  const fullLengthImageId = uuidv4();
  const heldBackImageId = uuidv4();
  const imageSetId = uuidv4();
  const presetId = uuidv4();
  const sessionIds = [];

  beforeAll(async () => {
    await knex.migrate.latest();
    await knex("users").insert({
      id: userId,
      email: `application-draft-${userId}@example.com`,
      password_hash: "x",
      role: "TALENT",
    });
    await knex("users").insert({
      id: agencyId,
      email: `application-draft-agency-${agencyId}@example.com`,
      password_hash: "x",
      role: "AGENCY",
    });
    await knex("users").insert({
      id: minorAgencyId,
      email: `application-draft-agency-${minorAgencyId}@example.com`,
      password_hash: "x",
      role: "AGENCY",
    });
    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `draft-${profileId}`,
      first_name: "Draft",
      last_name: "Tester",
      city: "Test",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 170,
      bust_cm: 86,
      waist_cm: 61,
      hips_cm: 90,
      phone: "555-0100",
      nationality: "Canadian",
      languages: JSON.stringify(["English", "French"]),
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: new Date().toISOString(),
    });
    await recordLegalAcceptance(knex, userId, { terms: true, privacy: true });
    await knex("agencies").insert([
      {
        id: agencyId,
        name: "Draft House",
        slug: `draft-house-${agencyId}`,
        status: "ACTIVE",
        open_boards: JSON.stringify(["editorial", "commercial"]),
      },
      {
        id: expiryAgencyId,
        name: "Expiry House",
        slug: `expiry-house-${expiryAgencyId}`,
        status: "ACTIVE",
        open_boards: JSON.stringify(["editorial"]),
      },
      {
        id: consentAgencyId,
        name: "Consent House",
        slug: `consent-house-${consentAgencyId}`,
        status: "ACTIVE",
        open_boards: JSON.stringify(["editorial"]),
      },
      {
        id: minorAgencyId,
        name: "Minor Consent House",
        slug: `minor-consent-house-${minorAgencyId}`,
        status: "ACTIVE",
        open_boards: JSON.stringify(["editorial"]),
      },
    ]);
    await knex("boards").insert({
      id: editorialBoardId,
      agency_id: agencyId,
      name: "Editorial",
      is_active: true,
      sort_order: 0,
    });
    await knex("image_sets").insert({
      id: imageSetId,
      profile_id: profileId,
      kind: "portfolio_test",
      name: "Draft set",
      is_current: true,
    });
    await knex("images").insert({
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
    });
    await knex("images").insert({
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
    });
    await knex("images").insert({
      id: heldBackImageId,
      profile_id: profileId,
      path: `/uploads/${heldBackImageId}.jpg`,
      public_url: `/uploads/${heldBackImageId}.jpg`,
      set_id: imageSetId,
      image_type: "portfolio",
      shot_type: "editorial",
      status: "active",
      captured_at: new Date().toISOString(),
      sort: 2,
    });
    await knex("image_rights").insert([
      {
        id: uuidv4(),
        image_id: imageId,
        rights_status: "cleared",
        license_type: "owned",
        copyright_owner: "Draft",
      },
      {
        id: uuidv4(),
        image_id: fullLengthImageId,
        rights_status: "cleared",
        license_type: "owned",
        copyright_owner: "Draft",
      },
    ]);
    await knex("image_model_releases").insert([
      {
        id: uuidv4(),
        image_id: imageId,
        release_ref: "guardian-release-headshot.pdf",
        signer_name: "Draft Guardian",
        signer_role: "guardian",
        signed_at: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        image_id: fullLengthImageId,
        release_ref: "guardian-release-full-length.pdf",
        signer_name: "Draft Guardian",
        signer_role: "guardian",
        signed_at: new Date().toISOString(),
      },
    ]);
    await knex("comp_card_presets").insert({
      id: presetId,
      profile_id: profileId,
      name: "Agency edit",
      seed: "draft-seed",
      layout_family: "editorial-grid",
      style_variant: "quiet-luxury",
      lock_hero_id: imageId,
      lock_grid_ids: JSON.stringify([fullLengthImageId]),
    });
  });

  afterAll(async () => {
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex("application_drafts").where({ profile_id: profileId }).delete();
    await knex("applications").where({ profile_id: profileId }).delete();
    await knex("boards").where({ agency_id: agencyId }).delete();
    await knex("minor_agency_consents").where({ profile_id: profileId }).delete();
    await knex("guardian_consent_requests").where({ profile_id: profileId }).delete();
    await knex("comp_card_presets").where({ profile_id: profileId }).delete();
    await knex("image_rights")
      .whereIn("image_id", [imageId, fullLengthImageId, heldBackImageId])
      .delete();
    await knex("image_model_releases")
      .whereIn("image_id", [imageId, fullLengthImageId, heldBackImageId])
      .delete();
    await knex("images").where({ profile_id: profileId }).delete();
    await knex("image_sets").where({ profile_id: profileId }).delete();
    await knex("agencies")
      .whereIn("id", [agencyId, expiryAgencyId, consentAgencyId, minorAgencyId])
      .delete();
    await knex("profiles").where({ id: profileId }).delete();
    await knex("users").whereIn("id", [userId, agencyId, minorAgencyId]).delete();
    await knex.destroy();
  });

  async function withSession() {
    const sid = uuidv4();
    sessionIds.push(sid);
    await knex("sessions").insert({
      sid,
      sess: {
        cookie: { path: "/" },
        userId,
        role: "TALENT",
        email: `application-draft-${userId}@example.com`,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) => req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
  }

  async function withAgencySession(sessionAgencyId = agencyId) {
    const sid = uuidv4();
    sessionIds.push(sid);
    await knex("sessions").insert({
      sid,
      sess: {
        cookie: { path: "/" },
        userId: sessionAgencyId,
        role: "AGENCY",
        agencyMembershipRole: "OWNER",
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) => req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
  }

  it("normalizes owned references and restores the latest draft", async () => {
    const auth = await withSession();
    const invalidImageId = uuidv4();
    const res = await auth(
      request(app)
        .put(`/api/talent/applications/drafts/${agencyId}`)
        .set("Accept", "application/json")
        .send({
          expectedVersion: 0,
          expectedGeneration: 0,
          currentStepId: "message",
          clientId: "browser:test-client",
          clientUpdatedAt: new Date().toISOString(),
          payload: {
            boards: ["editorial", "not-open"],
            mediaSetId: imageSetId,
            excludedImageIds: [imageId, invalidImageId],
            digitalSlotPicks: {
              headshot: imageId,
              back: invalidImageId,
              invented: imageId,
            },
            compCardPresetId: presetId,
            note: "x".repeat(1300),
            consent: true,
            accuracyConfirmed: true,
            adultAuthorityConfirmed: true,
          },
        }),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("draft");
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.generation).toBe(1);
    expect(res.body.data.lifecycleState).toBe("active");
    expect(res.body.data.currentStepId).toBe("message");
    expect(
      Math.abs(Date.parse(res.body.data.updatedAt) - Date.now()),
    ).toBeLessThan(60_000);
    expect(res.body.data.payload.boards).toEqual(["editorial"]);
    expect(res.body.data.payload.mediaSetId).toBe(imageSetId);
    expect(res.body.data.payload.excludedImageIds).toEqual([imageId]);
    expect(res.body.data.payload.digitalSlotPicks).toEqual({ headshot: imageId });
    expect(res.body.data.payload.compCardPreset).toEqual({
      id: presetId,
      name: "Agency edit",
      seed: "draft-seed",
    });
    expect(res.body.data.payload.note).toHaveLength(1200);
    expect(res.body.data.payload.consent).toBe(true);
    expect(res.headers["cache-control"]).toContain("private");
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.body.data.repairWarnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "boards_changed",
        "images_unavailable",
        "digital_slots_repaired",
        "note_truncated",
      ]),
    );
    const latest = await auth(
      request(app)
        .get("/api/talent/applications/drafts/latest")
        .set("Accept", "application/json"),
    );
    expect(latest.status).toBe(200);
    expect(latest.body.data.agencyId).toBe(agencyId);
    expect(latest.body.data.currentStepId).toBe("message");
  });

  it("rejects stale writes and returns the latest server version", async () => {
    const auth = await withSession();
    const updated = await auth(
      request(app)
        .put(`/api/talent/applications/drafts/${agencyId}`)
        .set("Accept", "application/json")
        .send({
          expectedVersion: 1,
          expectedGeneration: 1,
          currentStepId: "review",
          clientId: "browser:newer-client",
          payload: {
            boards: ["editorial"],
            mediaSetId: imageSetId,
            digitalSlotPicks: {
              headshot: imageId,
              full_length: fullLengthImageId,
            },
            compCardPresetId: presetId,
            note: "newer server copy",
            consent: true,
            accuracyConfirmed: true,
            adultAuthorityConfirmed: true,
          },
        }),
    );
    expect(updated.status).toBe(200);
    expect(updated.body.data.version).toBe(2);

    const stale = await auth(
      request(app)
        .put(`/api/talent/applications/drafts/${agencyId}`)
        .set("Accept", "application/json")
        .send({
          expectedVersion: 1,
          expectedGeneration: 1,
          currentStepId: "book",
          clientId: "browser:stale-client",
          payload: { note: "stale overwrite" },
        }),
    );
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("draft_conflict");
    expect(stale.body.latest).toMatchObject({
      lifecycleState: "active",
      canResume: true,
      version: 2,
      generation: 1,
      currentStepId: "review",
      payload: expect.objectContaining({ note: "newer server copy" }),
    });
  });

  it("soft-deletes with a precondition and recovers as a new generation", async () => {
    const auth = await withSession();
    const staleDelete = await auth(
      request(app)
        .delete(`/api/talent/applications/drafts/${agencyId}`)
        .set("Accept", "application/json")
        .send({ expectedVersion: 1, expectedGeneration: 1 }),
    );
    expect(staleDelete.status).toBe(409);
    expect(staleDelete.body.error).toBe("draft_conflict");

    const deleted = await auth(
      request(app)
        .delete(`/api/talent/applications/drafts/${agencyId}`)
        .set("Accept", "application/json")
        .send({ expectedVersion: 2, expectedGeneration: 1 }),
    );
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.lifecycleState).toBe("deleted");
    expect(deleted.body.data.version).toBe(3);
    expect(deleted.body.data.generation).toBe(1);
    expect(deleted.body.data.isRecoverable).toBe(true);

    const blockedSave = await auth(
      request(app)
        .put(`/api/talent/applications/drafts/${agencyId}`)
        .set("Accept", "application/json")
        .send({
          expectedVersion: 3,
          expectedGeneration: 1,
          payload: { note: "must not resurrect" },
        }),
    );
    expect(blockedSave.status).toBe(409);
    expect(blockedSave.body.error).toBe("draft_deleted");
    expect(blockedSave.body.latest).toMatchObject({
      lifecycleState: "deleted",
      isRecoverable: true,
      version: 3,
      generation: 1,
    });

    const recovered = await auth(
      request(app)
        .post(`/api/talent/applications/drafts/${agencyId}/recover`)
        .set("Accept", "application/json")
        .send({ expectedGeneration: 1 }),
    );
    expect(recovered.status).toBe(200);
    expect(recovered.body.data.lifecycleState).toBe("active");
    expect(recovered.body.data.version).toBe(1);
    expect(recovered.body.data.generation).toBe(2);
    expect(recovered.body.data.recoverableUntil).toBeNull();

    const saved = await auth(
      request(app)
        .put(`/api/talent/applications/drafts/${agencyId}`)
        .set("Accept", "application/json")
        .send({
          expectedVersion: 1,
          expectedGeneration: 2,
          currentStepId: "review",
          clientId: "browser:recovered",
          payload: {
            boards: ["editorial"],
            mediaSetId: imageSetId,
            digitalSlotPicks: {
              headshot: imageId,
              full_length: fullLengthImageId,
            },
            compCardPresetId: presetId,
            note: "ready after recovery",
            consent: true,
            accuracyConfirmed: true,
            adultAuthorityConfirmed: true,
          },
        }),
    );
    expect(saved.status).toBe(200);
    expect(saved.body.data.version).toBe(2);
    expect(saved.body.data.generation).toBe(2);

    const list = await auth(
      request(app)
        .get("/api/talent/applications/drafts")
        .set("Accept", "application/json"),
    );
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({
        agencyId,
        lifecycleState: "active",
        canResume: true,
        unavailableReason: null,
        agency: expect.objectContaining({ id: agencyId, name: "Draft House" }),
      }),
    ]);
  });

  it("expires inactive drafts, permits recovery for seven days, then purges", async () => {
    const auth = await withSession();
    const created = await auth(
      request(app)
        .put(`/api/talent/applications/drafts/${expiryAgencyId}`)
        .set("Accept", "application/json")
        .send({
          expectedVersion: 0,
          expectedGeneration: 0,
          currentStepId: "book",
          clientId: "browser:expiry-test",
          payload: { note: "recoverable expiry", consent: false },
        }),
    );
    expect(created.status).toBe(200);

    await knex("application_drafts")
      .where({ id: created.body.data.id })
      .update({ expires_at: "2026-01-01T00:00:00.000Z" });

    const list = await auth(
      request(app)
        .get("/api/talent/applications/drafts")
        .set("Accept", "application/json"),
    );
    const expired = list.body.data.find(
      (draft) => draft.agencyId === expiryAgencyId,
    );
    expect(expired).toMatchObject({
      lifecycleState: "expired",
      version: 2,
      generation: 1,
      isRecoverable: true,
    });

    const discardedExpired = await auth(
      request(app)
        .delete(`/api/talent/applications/drafts/${expiryAgencyId}`)
        .set("Accept", "application/json")
        .send({ expectedVersion: 2, expectedGeneration: 1 }),
    );
    expect(discardedExpired.status).toBe(200);
    expect(discardedExpired.body.data).toMatchObject({
      lifecycleState: "deleted",
      version: 3,
      generation: 1,
      isRecoverable: true,
    });

    const recovered = await auth(
      request(app)
        .post(`/api/talent/applications/drafts/${expiryAgencyId}/recover`)
        .set("Accept", "application/json")
        .send({ expectedGeneration: 1 }),
    );
    expect(recovered.status).toBe(200);
    expect(recovered.body.data).toMatchObject({
      lifecycleState: "active",
      version: 1,
      generation: 2,
    });

    // Simulate recovery winning immediately before cleanup. Even if a stale
    // recovery deadline remains visible to the cleanup statement, lifecycle
    // state must be reasserted by the DELETE itself.
    await knex("application_drafts")
      .where({ id: created.body.data.id })
      .update({ recoverable_until: "2026-01-08T00:00:00.000Z" });
    const recoveryWonCleanup = await runDraftLifecycleCleanup(knex, {
      now: new Date("2026-01-09T00:00:00.000Z"),
    });
    expect(recoveryWonCleanup.purged).toBe(0);
    expect(
      await knex("application_drafts")
        .where({ id: created.body.data.id })
        .first(),
    ).toMatchObject({ lifecycle_state: "active", generation: 2 });

    await knex("application_drafts")
      .where({ id: created.body.data.id })
      .update({
        lifecycle_state: "expired",
        expired_at: "2026-01-01T00:00:00.000Z",
        recoverable_until: "2026-01-08T00:00:00.000Z",
      });
    const cleanup = await runDraftLifecycleCleanup(knex, {
      now: new Date("2026-01-09T00:00:00.000Z"),
    });
    expect(cleanup.purged).toBe(1);
    expect(
      await knex("application_drafts")
        .where({ id: created.body.data.id })
        .first(),
    ).toBeUndefined();

    const staleCache = await auth(
      request(app)
        .put(`/api/talent/applications/drafts/${expiryAgencyId}`)
        .set("Accept", "application/json")
        .send({
          expectedVersion: 1,
          expectedGeneration: 2,
          payload: { note: "old cache must not resurrect" },
        }),
    );
    expect(staleCache.status).toBe(409);
    expect(staleCache.body.error).toBe("draft_conflict");

    const deliberateNewDraft = await auth(
      request(app)
        .put(`/api/talent/applications/drafts/${expiryAgencyId}`)
        .set("Accept", "application/json")
        .send({
          expectedVersion: 0,
          expectedGeneration: 0,
          payload: { note: "deliberate new draft" },
        }),
    );
    expect(deliberateNewDraft.status).toBe(200);
    expect(deliberateNewDraft.body.data).toMatchObject({
      version: 1,
      generation: 1,
      lifecycleState: "active",
    });

    const futureSchema = await auth(
      request(app)
        .put(`/api/talent/applications/drafts/${expiryAgencyId}`)
        .set("Accept", "application/json")
        .send({
          expectedVersion: 1,
          expectedGeneration: 1,
          payload: { schemaVersion: 999, note: "future format" },
        }),
    );
    expect(futureSchema.status).toBe(422);
    expect(futureSchema.body).toMatchObject({
      error: "unsupported_draft_schema",
      supportedSchemaVersion: 1,
    });

    await knex("agencies")
      .where({ id: expiryAgencyId })
      .update({ status: "INACTIVE" });
    const unavailableSave = await auth(
      request(app)
        .put(`/api/talent/applications/drafts/${expiryAgencyId}`)
        .set("Accept", "application/json")
        .send({
          expectedVersion: 1,
          expectedGeneration: 1,
          payload: { note: "must not save to unavailable agency" },
        }),
    );
    expect(unavailableSave.status).toBe(409);
    expect(unavailableSave.body.error).toBe("agency_unavailable");

    const unavailableList = await auth(
      request(app)
        .get("/api/talent/applications/drafts")
        .set("Accept", "application/json"),
    );
    expect(
      unavailableList.body.data.find(
        (draft) => draft.agencyId === expiryAgencyId,
      ),
    ).toMatchObject({
      lifecycleState: "active",
      canResume: false,
      unavailableReason: "agency_unavailable",
      agency: expect.objectContaining({ status: "INACTIVE" }),
    });

    const latest = await auth(
      request(app)
        .get("/api/talent/applications/drafts/latest")
        .set("Accept", "application/json"),
    );
    expect(latest.status).toBe(200);
    expect(latest.body.data.agencyId).toBe(agencyId);

    await knex("agencies")
      .where({ id: expiryAgencyId })
      .update({ status: "ACTIVE" });
    await knex("talent_user_settings").insert({
      id: uuidv4(),
      user_id: userId,
      privacy_preferences: JSON.stringify({
        blockedAgencies: ["Expiry House"],
      }),
    });
    const blockedList = await auth(
      request(app)
        .get("/api/talent/applications/drafts")
        .set("Accept", "application/json"),
    );
    expect(
      blockedList.body.data.find(
        (draft) => draft.agencyId === expiryAgencyId,
      ),
    ).toMatchObject({
      canResume: false,
      unavailableReason: "blocked",
      agency: expect.objectContaining({
        status: "ACTIVE",
        isBlocked: true,
      }),
    });
    const latestWithoutBlocked = await auth(
      request(app)
        .get("/api/talent/applications/drafts/latest")
        .set("Accept", "application/json"),
    );
    expect(latestWithoutBlocked.body.data.agencyId).toBe(agencyId);

    const agencyDiscovery = await auth(
      request(app)
        .get("/api/talent/agencies")
        .set("Accept", "application/json"),
    );
    expect(agencyDiscovery.status).toBe(200);
    expect(
      agencyDiscovery.body.data.some((agency) => agency.id === expiryAgencyId),
    ).toBe(false);
    expect(
      agencyDiscovery.body.data.some((agency) => agency.id === agencyId),
    ).toBe(true);
  });

  it("returns agencies in a stable directory order without fabricated match data", async () => {
    const auth = await withSession();
    const orderedAgencyIds = [
      "00000000-0000-4000-8000-0000000000a1",
      "00000000-0000-4000-8000-0000000000a2",
      "00000000-0000-4000-8000-0000000000b1",
    ];

    await knex("agencies").insert([
      {
        id: orderedAgencyIds[2],
        name: "C3 Zeta House",
        slug: `c3-zeta-house-${profileId}`,
        status: "ACTIVE",
        open_boards: JSON.stringify(["Commercial"]),
      },
      {
        id: orderedAgencyIds[1],
        name: "C3 Alpha House",
        slug: `c3-alpha-house-two-${profileId}`,
        status: "ACTIVE",
        open_boards: JSON.stringify(["Editorial"]),
      },
      {
        id: orderedAgencyIds[0],
        name: "C3 Alpha House",
        slug: `c3-alpha-house-one-${profileId}`,
        status: "ACTIVE",
        open_boards: JSON.stringify(["New Faces"]),
      },
    ]);
    await knex("profiles").where({ id: profileId }).update({ is_pro: true });

    try {
      const first = await auth(
        request(app)
          .get("/api/talent/agencies")
          .set("Accept", "application/json"),
      );
      const second = await auth(
        request(app)
          .get("/api/talent/agencies")
          .set("Accept", "application/json"),
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.data).toEqual(first.body.data);

      const orderedFixtures = first.body.data.filter((agency) =>
        orderedAgencyIds.includes(agency.id),
      );
      expect(orderedFixtures.map((agency) => agency.id)).toEqual(
        orderedAgencyIds,
      );
      expect(orderedFixtures.map((agency) => agency.open_boards)).toEqual([
        ["New Faces"],
        ["Editorial"],
        ["Commercial"],
      ]);
      for (const agency of first.body.data) {
        expect(agency).not.toHaveProperty("matchScore");
        expect(agency).not.toHaveProperty("matchBreakdown");
      }

      await knex("profiles").where({ id: profileId }).update({ is_pro: false });
      const free = await auth(
        request(app)
          .get("/api/talent/agencies")
          .set("Accept", "application/json"),
      );
      expect(free.status).toBe(200);
      expect(free.body.data.length).toBeLessThanOrEqual(20);
      for (const agency of free.body.data) {
        expect(agency).not.toHaveProperty("matchScore");
        expect(agency).not.toHaveProperty("matchBreakdown");
      }
    } finally {
      await knex("profiles").where({ id: profileId }).update({ is_pro: false });
      await knex("agencies").whereIn("id", orderedAgencyIds).delete();
    }
  });

  it("checks the draft version and retires it inside final submission", async () => {
    await recordSubmissionProgramAcknowledgment(knex, userId);
    const auth = await withSession();
    const payload = bindAdultSubmissionConsent({
      agencyId,
      note: "A final application note.",
      submissionPackage: {
        boards: ["editorial", "commercial"],
        mediaSetId: imageSetId,
        compCardPresetId: presetId,
        digitalSlotPicks: {
          headshot: imageId,
          full_length: fullLengthImageId,
        },
        imageIds: [imageId, fullLengthImageId],
        consentConfirmed: true,
      },
      draftGeneration: 2,
      idempotencyKey: `submit:${agencyId}`,
    });

    const changedAfterConsent = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({
          ...payload,
          note: "A changed application note.",
          draftVersion: 2,
          idempotencyKey: `changed-consent:${agencyId}`,
        }),
    );
    expect(changedAfterConsent.status).toBe(409);
    expect(changedAfterConsent.body.error).toBe("consent_package_changed");
    expect(changedAfterConsent.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "consent_package_changed" }),
      ]),
    );

    const staleSubmit = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({ ...payload, draftVersion: 1 }),
    );
    expect(staleSubmit.status).toBe(409);
    expect(staleSubmit.body.error).toBe("draft_conflict");
    expect(staleSubmit.body.latest).toMatchObject({
      lifecycleState: "active",
      canResume: true,
      version: 2,
      generation: 2,
    });
    expect(
      await knex("applications").where({ profile_id: profileId, agency_id: agencyId }).first(),
    ).toBeUndefined();
    expect(
      await knex("application_drafts").where({ profile_id: profileId, agency_id: agencyId }).first(),
    ).toBeTruthy();

    const submitted = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({ ...payload, draftVersion: 2 }),
    );
    expect(submitted.status).toBe(200);
    expect(submitted.body.id).toBeTruthy();
    expect(
      await knex("application_drafts").where({ profile_id: profileId, agency_id: agencyId }).first(),
    ).toBeUndefined();
    expect(
      await knex("applications").where({ profile_id: profileId, agency_id: agencyId }).first(),
    ).toBeTruthy();
    const consentEvent = await knex("application_submission_consent_events")
      .where({ application_id: submitted.body.id })
      .orderBy("created_at", "desc")
      .first();
    expect(consentEvent).toMatchObject({
      user_id: userId,
      profile_id: profileId,
      agency_id: agencyId,
      package_fingerprint:
        payload.submissionPackage.consentPackageFingerprint,
      guardian_consent_request_id: null,
    });
    expect(consentEvent.package_fingerprint).toHaveLength(64);
    expect(consentEvent.consent_text_version).toBeTruthy();
    expect(consentEvent.acknowledgement_version).toBeTruthy();
    const disclosureSnapshot =
      typeof consentEvent.disclosure_snapshot === "string"
        ? JSON.parse(consentEvent.disclosure_snapshot)
        : consentEvent.disclosure_snapshot;
    expect(disclosureSnapshot.handling).toContain("Draft House");
    expect(disclosureSnapshot.consentMethod).toBe("talent_checkbox");
    expect(disclosureSnapshot.attestations).toEqual({
      packageAccuracy: true,
      adultAuthority: true,
      disclosureConsent: true,
    });
    const packageRow = await knex("talent_submission_packages")
      .where({ application_id: submitted.body.id })
      .orderBy("created_at", "desc")
      .first();
    const packagePayload =
      typeof packageRow.payload === "string"
        ? JSON.parse(packageRow.payload)
        : packageRow.payload;
    expect(packageRow.redacted_at).toBeNull();
    expect(packageRow.retention_expires_at).toBeTruthy();
    expect(new Date(packageRow.retention_expires_at).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(packagePayload.imageIds).toEqual([imageId, fullLengthImageId]);
    expect(packagePayload.packageSchemaVersion).toBe(2);
    expect(packagePayload.mediaSetName).toBe("Draft set");
    expect(packagePayload.images.map((image) => image.id)).toEqual([
      imageId,
      fullLengthImageId,
    ]);
    expect(packagePayload.contact).toEqual({
      email: `application-draft-${userId}@example.com`,
      phone: "555-0100",
    });
    expect(packagePayload.accuracyConfirmed).toBe(true);
    expect(packagePayload.adultAuthorityConfirmed).toBe(true);
    expect(packagePayload.profile).toMatchObject({
      city: "Test",
      nationality: "Canadian",
      languages: ["English", "French"],
    });
    expect(packagePayload.profile).not.toHaveProperty("date_of_birth");
    expect(packagePayload.compCard).toMatchObject({
      id: presetId,
      name: "Agency edit",
      seed: "draft-seed",
      layoutFamily: "editorial-grid",
      styleVariant: "quiet-luxury",
      lockHeroId: imageId,
      lockGridIds: [fullLengthImageId, null, null, null],
    });
    expect(
      await knex("application_submission_boards")
        .where({ application_id: submitted.body.id })
        .orderBy("board_name")
        .pluck("board_name"),
    ).toEqual(["commercial", "editorial"]);
    const relationalBoards = await knex("board_applications as ba")
      .join("boards as b", "b.id", "ba.board_id")
      .where({
        "ba.application_id": submitted.body.id,
        "b.agency_id": agencyId,
        "b.is_active": true,
      })
      .orderBy("b.name")
      .select("b.name", "ba.application_id");
    expect(relationalBoards).toEqual([
      { name: "Editorial", application_id: submitted.body.id },
      { name: "commercial", application_id: submitted.body.id },
    ]);
    expect(
      await knex("board_applications")
        .where({
          board_id: editorialBoardId,
          application_id: submitted.body.id,
        })
        .first(),
    ).toBeTruthy();

    await knex("profiles").where({ id: profileId }).update({
      city: "Changed live city",
      nationality: "Changed live nationality",
      languages: JSON.stringify(["Changed live language"]),
    });
    const agencyAuth = await withAgencySession();
    const agencyBoards = await agencyAuth(
      request(app)
        .get("/api/agency/boards")
        .set("Accept", "application/json"),
    );
    expect(agencyBoards.status).toBe(200);
    expect(
      agencyBoards.body
        .filter((board) => ["commercial", "Editorial"].includes(board.name))
        .map((board) => ({
          name: board.name,
          applicationCount: board.application_count,
          submittedCount: board.submitted_count,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    ).toEqual([
      { name: "commercial", applicationCount: 1, submittedCount: 1 },
      { name: "Editorial", applicationCount: 1, submittedCount: 1 },
    ]);
    const agencyList = await agencyAuth(
      request(app)
        .get("/api/agency/applications")
        .set("Accept", "application/json"),
    );
    expect(agencyList.status).toBe(200);
    const listedProfile = agencyList.body.profiles.find(
      (candidate) => candidate.application_id === submitted.body.id,
    );
    expect(listedProfile.images.map((image) => image.id)).toEqual([
      imageId,
      fullLengthImageId,
    ]);
    expect(
      listedProfile.images.some((image) => image.id === heldBackImageId),
    ).toBe(false);
    expect(listedProfile).toMatchObject({
      city: "Test",
      nationality: "Canadian",
      languages: ["English", "French"],
    });
    expect(listedProfile).not.toHaveProperty("date_of_birth");
    expect(listedProfile).not.toHaveProperty("guardian_email");

    const agencyDetail = await agencyAuth(
      request(app)
        .get(`/api/agency/applications/${submitted.body.id}/details`)
        .set("Accept", "application/json"),
    );
    expect(agencyDetail.status).toBe(200);
    expect(agencyDetail.body.profile.images.map((image) => image.id)).toEqual([
      imageId,
      fullLengthImageId,
    ]);
    expect(agencyDetail.body.profile).toMatchObject({
      city: "Test",
      nationality: "Canadian",
      languages: ["English", "French"],
    });
    expect(agencyDetail.body.profile).not.toHaveProperty("date_of_birth");
    expect(agencyDetail.body.profile).not.toHaveProperty("guardian_email");
    expect(agencyDetail.body.submissionPackage).toMatchObject({
      boards: ["editorial", "commercial"],
      mediaSet: {
        id: imageSetId,
        name: "Draft set",
      },
      contact: {
        email: `application-draft-${userId}@example.com`,
        phone: "555-0100",
      },
      profile: {
        city: "Test",
        nationality: "Canadian",
        languages: ["English", "French"],
      },
      compCard: {
        id: presetId,
        name: "Agency edit",
        seed: "draft-seed",
      },
    });
    expect(agencyDetail.body.submissionPackage.compCard.viewUrl).toContain(
      "seed=draft-seed",
    );
    await knex("profiles").where({ id: profileId }).update({
      city: "Test",
      nationality: "Canadian",
      languages: JSON.stringify(["English", "French"]),
    });
    expect(agencyDetail.body.submissionPackage.compCard.viewUrl).toContain(
      "layoutFamily=editorial-grid",
    );
    expect(agencyDetail.body.submissionPackage.compCard.viewUrl).toContain(
      `lockHeroId=${imageId}`,
    );

    const retry = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({ ...payload, draftVersion: 2 }),
    );
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({
      success: true,
      id: submitted.body.id,
      idempotent: true,
    });
    const quotaAfterRetry = await auth(
      request(app)
        .get("/api/talent/applications/quota")
        .set("Accept", "application/json"),
    );
    expect(quotaAfterRetry.status).toBe(200);
    expect(quotaAfterRetry.body.data).toMatchObject({
      used: 1,
      limit: 5,
      remaining: 4,
      unlimited: false,
    });

    const reusedKey = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({
          ...payload,
          note: "Different submission under the same key.",
          draftVersion: 2,
        }),
    );
    expect(reusedKey.status).toBe(409);
    expect(reusedKey.body.error).toBe("idempotency_conflict");

    const withdrawn = await auth(
      request(app)
        .post(`/api/talent/applications/${submitted.body.id}/withdraw`)
        .set("Accept", "application/json"),
    );
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.disclosure).toMatchObject({
      packageRedacted: true,
      platformMessagesDeleted: true,
    });
    const redactedPackage = await knex("talent_submission_packages")
      .where({ application_id: submitted.body.id })
      .orderBy("created_at", "desc")
      .first();
    const redactedPayload =
      typeof redactedPackage.payload === "string"
        ? JSON.parse(redactedPackage.payload)
        : redactedPackage.payload;
    expect(redactedPackage.revoked_at).toBeTruthy();
    expect(redactedPackage.redacted_at).toBeTruthy();
    expect(redactedPackage.redaction_reason).toBe("talent_withdrawal");
    expect(redactedPayload).toMatchObject({
      applicationId: submitted.body.id,
      disclosureRedacted: true,
      redactionReason: "talent_withdrawal",
    });
    expect(redactedPayload).not.toHaveProperty("images");
    expect(redactedPayload).not.toHaveProperty("contact");
    expect(
      await knex("messages")
        .where({ application_id: submitted.body.id })
        .count({ count: "*" })
        .first(),
    ).toMatchObject({ count: 0 });

    const revokedDetail = await agencyAuth(
      request(app)
        .get(`/api/agency/applications/${submitted.body.id}/details`)
        .set("Accept", "application/json"),
    );
    expect(revokedDetail.status).toBe(410);
    expect(revokedDetail.body.error).toBe("application_withdrawn");

    const agencyListAfterWithdrawal = await agencyAuth(
      request(app)
        .get("/api/agency/applications")
        .set("Accept", "application/json"),
    );
    expect(
      agencyListAfterWithdrawal.body.profiles.some(
        (candidate) => candidate.application_id === submitted.body.id,
      ),
    ).toBe(false);

    const reappliedPayload = bindAdultSubmissionConsent({
      ...payload,
      note: "A new submission after withdrawal.",
      draftVersion: 0,
      draftGeneration: 0,
      idempotencyKey: `reapply:${agencyId}`,
    });
    const reapplied = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send(reappliedPayload),
    );
    expect(reapplied.status).toBe(200);
    expect(reapplied.body.id).toBe(submitted.body.id);
    expect(
      await knex("application_submission_requests")
        .where({
          profile_id: profileId,
          application_id: submitted.body.id,
          status: "completed",
        })
        .count({ count: "*" })
        .first(),
    ).toMatchObject({ count: 2 });

    const quotaAfterReapply = await auth(
      request(app)
        .get("/api/talent/applications/quota")
        .set("Accept", "application/json"),
    );
    expect(quotaAfterReapply.status).toBe(200);
    expect(quotaAfterReapply.body.data).toMatchObject({
      used: 2,
      limit: 5,
      remaining: 3,
      unlimited: false,
    });
  });

  it("enforces the event-based monthly quota before another submission", async () => {
    await recordSubmissionProgramAcknowledgment(knex, userId);
    const auth = await withSession();
    const seededRequestIds = [
      uuidv4(),
      uuidv4(),
      uuidv4(),
      uuidv4(),
      uuidv4(),
    ];
    await knex("application_submission_requests").insert(
      seededRequestIds.map((id, index) => ({
        id,
        profile_id: profileId,
        agency_id: consentAgencyId,
        idempotency_key: `quota-fixture:${index}:${id}`,
        request_hash: "a".repeat(64),
        status: "completed",
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })),
    );

    try {
      const payload = bindAdultSubmissionConsent({
        agencyId: consentAgencyId,
        note: "",
        submissionPackage: {
          schemaVersion: DRAFT_SCHEMA_VERSION,
          boards: ["editorial"],
          mediaSetId: imageSetId,
          digitalSlotPicks: {
            headshot: imageId,
            full_length: fullLengthImageId,
          },
          imageIds: [imageId, fullLengthImageId],
          consentConfirmed: true,
        },
        draftVersion: 0,
        draftGeneration: 0,
        idempotencyKey: `quota-block:${consentAgencyId}`,
      });
      const blocked = await auth(
        request(app)
          .post("/api/talent/applications")
          .set("Accept", "application/json")
          .set("Origin", "http://localhost:3000")
          .set("X-Pholio-Request", "same-origin")
          .send(payload),
      );
      expect(blocked.status).toBe(403);
      expect(blocked.body).toMatchObject({
        error: "Monthly application limit reached",
        limit: 5,
        upgradeRequired: true,
      });
      expect(blocked.body.current).toBeGreaterThanOrEqual(5);
      expect(
        await knex("applications")
          .where({ profile_id: profileId, agency_id: consentAgencyId })
          .first(),
      ).toBeUndefined();
    } finally {
      await knex("application_submission_requests")
        .whereIn("id", seededRequestIds)
        .delete();
    }
  });

  it("requires explicit no-draft preconditions, idempotency, and consent", async () => {
    await recordSubmissionProgramAcknowledgment(knex, userId);
    const auth = await withSession();
    const base = {
      agencyId: consentAgencyId,
      note: "",
      submissionPackage: {
        schemaVersion: DRAFT_SCHEMA_VERSION,
        boards: ["editorial"],
        mediaSetId: imageSetId,
        digitalSlotPicks: {
          headshot: imageId,
          full_length: fullLengthImageId,
        },
        imageIds: [imageId, fullLengthImageId],
        consentConfirmed: false,
      },
    };
    const { schemaVersion: _schemaVersion, ...packageWithoutSchema } =
      base.submissionPackage;
    const missingSchema = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({
          ...base,
          submissionPackage: packageWithoutSchema,
          draftVersion: 0,
          draftGeneration: 0,
          idempotencyKey: `missing-schema:${consentAgencyId}`,
        }),
    );
    expect(missingSchema.status).toBe(400);
    expect(missingSchema.body).toMatchObject({
      error: "invalid_draft_schema",
      supportedSchemaVersion: DRAFT_SCHEMA_VERSION,
    });

    const invalidSchema = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({
          ...base,
          submissionPackage: {
            ...base.submissionPackage,
            schemaVersion: "1",
          },
          draftVersion: 0,
          draftGeneration: 0,
          idempotencyKey: `invalid-schema:${consentAgencyId}`,
        }),
    );
    expect(invalidSchema.status).toBe(400);
    expect(invalidSchema.body.error).toBe("invalid_draft_schema");

    const futureSchema = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({
          ...base,
          submissionPackage: {
            ...base.submissionPackage,
            schemaVersion: DRAFT_SCHEMA_VERSION + 1,
          },
          draftVersion: 0,
          draftGeneration: 0,
          idempotencyKey: `future-schema:${consentAgencyId}`,
        }),
    );
    expect(futureSchema.status).toBe(422);
    expect(futureSchema.body).toMatchObject({
      error: "unsupported_draft_schema",
      supportedSchemaVersion: DRAFT_SCHEMA_VERSION,
    });

    const missingPreconditions = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({ ...base, idempotencyKey: `consent:${consentAgencyId}` }),
    );
    expect(missingPreconditions.status).toBe(428);
    expect(missingPreconditions.body.error).toBe(
      "draft_precondition_required",
    );

    const missingIdempotency = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({ ...base, draftVersion: 0, draftGeneration: 0 }),
    );
    expect(missingIdempotency.status).toBe(400);
    expect(missingIdempotency.body.error).toBe("invalid_idempotency_key");

    const missingConsent = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({
          ...base,
          draftVersion: 0,
          draftGeneration: 0,
          idempotencyKey: `consent:${consentAgencyId}`,
        }),
    );
    expect(missingConsent.status).toBe(400);
    expect(missingConsent.body.error).toBe("submission_consent_required");
    expect(
      await knex("applications")
        .where({ profile_id: profileId, agency_id: consentAgencyId })
        .first(),
    ).toBeUndefined();

    const missingAccuracy = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({
          ...base,
          draftVersion: 0,
          draftGeneration: 0,
          idempotencyKey: `accuracy:${consentAgencyId}`,
          submissionPackage: {
            ...base.submissionPackage,
            consentConfirmed: true,
            adultAuthorityConfirmed: true,
          },
        }),
    );
    expect(missingAccuracy.status).toBe(400);
    expect(missingAccuracy.body.error).toBe(
      "submission_accuracy_attestation_required",
    );

    const missingAuthority = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({
          ...base,
          draftVersion: 0,
          draftGeneration: 0,
          idempotencyKey: `authority:${consentAgencyId}`,
          submissionPackage: {
            ...base.submissionPackage,
            consentConfirmed: true,
            accuracyConfirmed: true,
          },
        }),
    );
    expect(missingAuthority.status).toBe(400);
    expect(missingAuthority.body.error).toBe(
      "submission_adult_authority_required",
    );

    await knex("agencies")
      .where({ id: consentAgencyId })
      .update({ status: "INACTIVE" });
    const unavailableAgency = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({
          ...base,
          draftVersion: 0,
          draftGeneration: 0,
          idempotencyKey: `inactive:${consentAgencyId}`,
          submissionPackage: {
            ...base.submissionPackage,
            consentConfirmed: true,
            accuracyConfirmed: true,
            adultAuthorityConfirmed: true,
          },
        }),
    );
    expect(unavailableAgency.status).toBe(409);
    expect(unavailableAgency.body.error).toBe("agency_unavailable");
  });

  it("rejects a minor submission without verified account guardian consent", async () => {
    await recordSubmissionProgramAcknowledgment(knex, userId);
    await knex("profiles").where({ id: profileId }).update({
      date_of_birth: "2012-01-01",
      guardian_consent_at: null,
      guardian_email: "minor-guardian@example.com",
      work_permit_on_file: true,
    });
    const auth = await withSession();
    const payload = {
      agencyId: minorAgencyId,
      note: "",
      submissionPackage: {
        schemaVersion: DRAFT_SCHEMA_VERSION,
        boards: ["editorial"],
        mediaSetId: imageSetId,
        digitalSlotPicks: {
          headshot: imageId,
          full_length: fullLengthImageId,
        },
        imageIds: [imageId, fullLengthImageId],
        consentConfirmed: true,
      },
      draftVersion: 0,
      draftGeneration: 0,
      idempotencyKey: `minor-no-account-consent:${minorAgencyId}`,
    };

    try {
      const blocked = await auth(
        request(app)
          .post("/api/talent/applications")
          .set("Accept", "application/json")
          .set("Origin", "http://localhost:3000")
          .set("X-Pholio-Request", "same-origin")
          .send(payload),
      );
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toBe("minor_guardian_consent_required");
      expect(
        await knex("applications")
          .where({ profile_id: profileId, agency_id: minorAgencyId })
          .first(),
      ).toBeUndefined();
    } finally {
      await knex("profiles").where({ id: profileId }).update({
        date_of_birth: "1998-01-01",
        guardian_consent_at: null,
        guardian_email: null,
        work_permit_on_file: false,
      });
    }
  });

  it("rejects a minor's direct submission until the guardian authorizes that agency", async () => {
    await recordSubmissionProgramAcknowledgment(knex, userId);
    await knex("profiles").where({ id: profileId }).update({
      date_of_birth: "2012-01-01",
      guardian_consent_at: new Date().toISOString(),
      guardian_email: "minor-guardian@example.com",
      work_permit_on_file: true,
    });
    const auth = await withSession();
    const payload = {
      agencyId: minorAgencyId,
      note: "Private minor note that must not be disclosed.",
      submissionPackage: {
        schemaVersion: DRAFT_SCHEMA_VERSION,
        boards: ["editorial"],
        mediaSetId: imageSetId,
        digitalSlotPicks: {
          headshot: imageId,
          full_length: fullLengthImageId,
        },
        imageIds: [imageId, fullLengthImageId],
        consentConfirmed: true,
      },
      draftVersion: 0,
      draftGeneration: 0,
      idempotencyKey: `minor:${minorAgencyId}`,
    };

    try {
      const blocked = await auth(
        request(app)
          .post("/api/talent/applications")
          .set("Accept", "application/json")
          .set("Origin", "http://localhost:3000")
          .set("X-Pholio-Request", "same-origin")
          .send(payload),
      );
      expect(blocked.status).toBe(400);
      expect(blocked.body.error).toBe("submission_package_incomplete");
      expect(blocked.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "guardian_agency_consent_required",
          }),
        ]),
      );
      expect(
        await knex("applications")
          .where({ profile_id: profileId, agency_id: minorAgencyId })
          .first(),
      ).toBeUndefined();

      const consentRequestId = uuidv4();
      await knex("guardian_consent_requests").insert({
        id: consentRequestId,
        profile_id: profileId,
        agency_id: minorAgencyId,
        guardian_email: "minor-guardian@example.com",
        token_hash: `test-${uuidv4()}`,
        status: "verified",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        verified_at: new Date().toISOString(),
      });
      await knex("minor_agency_consents").insert({
        id: uuidv4(),
        profile_id: profileId,
        agency_id: minorAgencyId,
        consent_request_id: consentRequestId,
        guardian_email: "minor-guardian@example.com",
        verified_at: new Date().toISOString(),
        authorization_expires_at: new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

      const submitted = await auth(
        request(app)
          .post("/api/talent/applications")
          .set("Accept", "application/json")
          .set("Origin", "http://localhost:3000")
          .set("X-Pholio-Request", "same-origin")
          .send(payload),
      );
      expect(submitted.status).toBe(200);
      expect(submitted.body.success).toBe(true);
      expect(
        await knex("application_submission_consent_events")
          .where({ application_id: submitted.body.id })
          .first("guardian_consent_request_id"),
      ).toMatchObject({
        guardian_consent_request_id: consentRequestId,
      });
      const minorPackage = await knex("talent_submission_packages")
        .where({ application_id: submitted.body.id })
        .first();
      const minorPayload =
        typeof minorPackage.payload === "string"
          ? JSON.parse(minorPackage.payload)
          : minorPackage.payload;
      expect(minorPayload.contact).toBeNull();
      expect(minorPayload.minorDataMinimized).toBe(true);
      expect(minorPayload.profile.is_minor).toBe(true);
      expect(minorPayload.profile.age_band).toBe("under_18");
      expect(minorPayload.profile).not.toHaveProperty("date_of_birth");
      expect(minorPayload.profile).not.toHaveProperty("guardian_email");
      expect(
        await knex("messages")
          .where({ application_id: submitted.body.id })
          .count({ count: "*" })
          .first(),
      ).toMatchObject({ count: 0 });

      const minorAgencyAuth = await withAgencySession(minorAgencyId);
      const minorDetail = await minorAgencyAuth(
        request(app)
          .get(`/api/agency/applications/${submitted.body.id}/details`)
          .set("Accept", "application/json"),
      );
      expect(minorDetail.status).toBe(200);
      expect(minorDetail.body.submissionPackage.contact).toBeNull();
      expect(minorDetail.body.profile.user_email).toBeNull();
      expect(minorDetail.body.profile).not.toHaveProperty("date_of_birth");
      expect(minorDetail.body.profile).not.toHaveProperty("guardian_email");
      expect(minorDetail.body.profile).not.toHaveProperty(
        "emergency_contact_phone",
      );
    } finally {
      await knex("profiles").where({ id: profileId }).update({
        date_of_birth: "1998-01-01",
        guardian_consent_at: null,
        guardian_email: null,
        work_permit_on_file: false,
      });
    }
  });

  it("records draft telemetry without payload text or image references", async () => {
    const events = await knex("application_draft_events")
      .where({ profile_id: profileId })
      .orderBy("created_at", "asc");
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain("newer server copy");
      expect(serialized).not.toContain(imageId);
      expect(serialized).not.toContain(fullLengthImageId);
      expect(event).not.toHaveProperty("payload");
    }
  });
});
