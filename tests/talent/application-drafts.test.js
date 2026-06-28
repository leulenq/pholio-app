/**
 * Server-backed application drafts: normalization, resume, and concurrency.
 */

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
  runDraftLifecycleCleanup,
} = require("../../src/domains/talent/services/application-drafts");

const SESSION_SECRET = process.env.SESSION_SECRET || "pholio-secret";

describe("application drafts", () => {
  const userId = uuidv4();
  const profileId = uuidv4();
  const agencyId = uuidv4();
  const expiryAgencyId = uuidv4();
  const consentAgencyId = uuidv4();
  const imageId = uuidv4();
  const fullLengthImageId = uuidv4();
  const imageSetId = uuidv4();
  const presetId = uuidv4();
  const sessionIds = [];

  beforeAll(async () => {
    await knex("users").insert({
      id: userId,
      email: `application-draft-${userId}@example.com`,
      password_hash: "x",
      role: "TALENT",
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
    ]);
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
    await knex("image_rights").insert([
      {
        id: uuidv4(),
        image_id: imageId,
        rights_status: "cleared",
      },
      {
        id: uuidv4(),
        image_id: fullLengthImageId,
        rights_status: "cleared",
      },
    ]);
    await knex("comp_card_presets").insert({
      id: presetId,
      profile_id: profileId,
      name: "Agency edit",
      seed: "draft-seed",
    });
  });

  afterAll(async () => {
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex("application_drafts").where({ profile_id: profileId }).delete();
    await knex("applications").where({ profile_id: profileId }).delete();
    await knex("comp_card_presets").where({ profile_id: profileId }).delete();
    await knex("image_rights").whereIn("image_id", [imageId, fullLengthImageId]).delete();
    await knex("images").where({ profile_id: profileId }).delete();
    await knex("image_sets").where({ profile_id: profileId }).delete();
    await knex("agencies")
      .whereIn("id", [agencyId, expiryAgencyId, consentAgencyId])
      .delete();
    await knex("profiles").where({ id: profileId }).delete();
    await knex("users").where({ id: userId }).delete();
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
    expect(stale.body.latest.version).toBe(2);
    expect(stale.body.latest.payload.note).toBe("newer server copy");
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

  it("checks the draft version and retires it inside final submission", async () => {
    await recordSubmissionProgramAcknowledgment(knex, userId);
    const auth = await withSession();
    const payload = {
      agencyId,
      note: "A final application note.",
      submissionPackage: {
        boards: ["editorial"],
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
    };

    const staleSubmit = await auth(
      request(app)
        .post("/api/talent/applications")
        .set("Accept", "application/json")
        .send({ ...payload, draftVersion: 1 }),
    );
    expect(staleSubmit.status).toBe(409);
    expect(staleSubmit.body.error).toBe("draft_conflict");
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
  });

  it("requires explicit no-draft preconditions, idempotency, and consent", async () => {
    const auth = await withSession();
    const base = {
      agencyId: consentAgencyId,
      note: "",
      submissionPackage: {
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
          },
        }),
    );
    expect(unavailableAgency.status).toBe(409);
    expect(unavailableAgency.body.error).toBe("agency_unavailable");
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
