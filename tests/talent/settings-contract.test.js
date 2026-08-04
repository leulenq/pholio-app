/**
 * Talent settings contract.
 *
 * Every control on the settings surface has to survive the round trip: save
 * writes to the real source of truth, a fresh read repopulates it, and the value
 * is scoped to the account that set it. This suite also pins the settings that
 * were *removed* for having no consumer, so a cosmetic control can't quietly
 * come back.
 */

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("talent-settings-contract");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const SESSION_SECRET = require("../../src/config").sessionSecret;
const {
  finishWithdrawal,
  recordAiConsentEvent,
} = require("../../src/domains/talent/routes/settings").__testables;

jest.setTimeout(60000);

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("talent settings contract", () => {
  const TALENT_ID = uuidv4();
  const PROFILE_ID = uuidv4();
  const OTHER_ID = uuidv4();
  const OTHER_PROFILE_ID = uuidv4();
  const sessionIds = [];

  beforeAll(async () => {
    await migrate(knex);

    const now = new Date().toISOString();
    // Legal acceptance is a hard gate on settings writes. Acceptance must both
    // exist and match the current version, so record the version too — otherwise
    // this suite would only be re-testing the consent gate.
    const {
      CURRENT_LEGAL_VERSION,
    } = require("../../src/shared/lib/legal-versions");
    const legal = {
      terms_accepted_at: now,
      terms_accepted_version: CURRENT_LEGAL_VERSION,
      privacy_accepted_at: now,
      privacy_accepted_version: CURRENT_LEGAL_VERSION,
    };

    await knex("users").insert([
      {
        id: TALENT_ID,
        email: `settings-${TALENT_ID}@example.com`,
        password_hash: "x",
        role: "TALENT",
        email_verified: true,
        ...legal,
      },
      {
        id: OTHER_ID,
        email: `settings-other-${OTHER_ID}@example.com`,
        password_hash: "x",
        role: "TALENT",
        email_verified: true,
        ...legal,
      },
    ]);

    await knex("profiles").insert([
      {
        id: PROFILE_ID,
        user_id: TALENT_ID,
        slug: `settings-${PROFILE_ID.slice(0, 8)}`,
        first_name: "Set",
        last_name: "Tings",
        city: "New York",
        height_cm: 178,
        date_of_birth: "1994-04-04",
        bio_raw: "",
        bio_curated: "",
        onboarding_completed_at: now,
      },
      {
        id: OTHER_PROFILE_ID,
        user_id: OTHER_ID,
        slug: `settings-other-${OTHER_PROFILE_ID.slice(0, 8)}`,
        first_name: "Other",
        last_name: "Talent",
        city: "Paris",
        height_cm: 172,
        date_of_birth: "1993-03-03",
        bio_raw: "",
        bio_curated: "",
        onboarding_completed_at: now,
      },
    ]);
  });

  afterAll(async () => {
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex("talent_user_settings")
      .whereIn("user_id", [TALENT_ID, OTHER_ID])
      .delete();
    await knex("profiles").whereIn("id", [PROFILE_ID, OTHER_PROFILE_ID]).delete();
    await knex("users").whereIn("id", [TALENT_ID, OTHER_ID]).delete();
    await knex.destroy();
    dropIsolatedDatabase(TEST_DB_FILE);
  });

  async function withSession(userId = TALENT_ID, userAgent = IPHONE) {
    const sid = uuidv4();
    sessionIds.push(sid);
    await knex("sessions").insert({
      sid,
      sess: JSON.stringify({
        cookie: { path: "/", originalMaxAge: 604800000 },
        userId,
        role: "TALENT",
        device: {
          type: "phone",
          label: "Safari on iOS",
          browser: "Safari",
          os: "iOS",
          fingerprint: `fp-${sid.slice(0, 8)}`,
          signedInAt: new Date().toISOString(),
        },
      }),
      expired: new Date(Date.now() + 604800000).toISOString(),
    });
    const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    const auth = (req) =>
      req
        .set("Cookie", `connect.sid=${encodeURIComponent(signed)}`)
        .set("User-Agent", userAgent);
    auth.sid = sid;
    return auth;
  }

  const read = async (auth) => {
    const res = await auth(
      request(app).get("/api/talent/settings").set("Accept", "application/json"),
    );
    expect(res.status).toBe(200);
    return res.body.settings;
  };

  const write = async (auth, payload) => {
    const res = await auth(
      request(app)
        .put("/api/talent/settings")
        .set("Accept", "application/json")
        .send(payload),
    );
    return res;
  };

  describe("shape", () => {
    it("no longer exposes settings that had no consumer", async () => {
      const auth = await withSession();
      const settings = await read(auth);

      // Comp-card layout / cover image / watermark: nothing read them.
      expect(settings.display).toBeUndefined();
      // Nothing renders talent contact details publicly.
      expect(settings.showContact).toBeUndefined();
      // The server hardcoded an empty list, so the card could never populate.
      expect(settings.invoices).toBeUndefined();
      // Erasure runs through account deletion; the request field was inert.
      expect(settings.data.erasureRequestedAt).toBeUndefined();

      // Notification categories with no sender are gone.
      expect(Object.keys(settings.notifications).sort()).toEqual([
        "applicationUpdates",
        "profileViews",
      ]);
      // The consent contract models no marketing category.
      expect(Object.keys(settings.cookies)).toEqual(["analytics"]);
    });

    it("reports sign-in identity instead of flattening it to an email field", async () => {
      const auth = await withSession();
      const settings = await read(auth);

      expect(settings.user).toMatchObject({
        id: TALENT_ID,
        role: "TALENT",
      });
      expect(settings.user).toHaveProperty("authProvider");
      expect(settings.user).toHaveProperty("canResetPassword");
    });

    it("returns the canonical optional-processing disclosures and evidence hashes", async () => {
      const settings = await read(await withSession());

      expect(settings.ai).toMatchObject({
        imageProcessing: false,
        profileEmbedding: false,
        disclosureVersion: "2026-08-04",
        imageProcessingDisclosure: expect.any(String),
        profileEmbeddingDisclosure: expect.any(String),
        disclosureHashes: {
          imageProcessing: expect.stringMatching(/^[a-f0-9]{64}$/),
          profileEmbedding: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      });
    });

    it("marks a Google account as Google and withholds password reset", async () => {
      await knex("users").where({ id: TALENT_ID }).update({ auth_provider: "google" });
      const auth = await withSession();
      const settings = await read(auth);

      expect(settings.user.authProvider).toBe("google");
      // A Google account has no Pholio password, so offering a reset would lie.
      expect(settings.user.canResetPassword).toBe(false);

      await knex("users").where({ id: TALENT_ID }).update({ auth_provider: "password" });
      const after = await read(await withSession());
      expect(after.user.authProvider).toBe("password");
      expect(after.user.canResetPassword).toBe(true);
    });
  });

  describe("persistence", () => {
    it("persists notification opt-outs and repopulates them on a fresh read", async () => {
      const auth = await withSession();

      const saved = await write(auth, {
        notifications: { profileViews: false, applicationUpdates: true },
      });
      expect(saved.status).toBe(200);
      expect(saved.body.settings.notifications.profileViews).toBe(false);

      // A brand-new request, not the response echo — this is the "does it come
      // back after refresh" check.
      const reread = await read(await withSession());
      expect(reread.notifications.profileViews).toBe(false);
      expect(reread.notifications.applicationUpdates).toBe(true);
    });

    it("writes the notification opt-out where the notification service reads it", async () => {
      const auth = await withSession();
      await write(auth, { notifications: { profileViews: false } });

      // Same table and column `shared/services/notifications.js` consults, so a
      // saved preference actually suppresses the notification.
      const row = await knex("talent_user_settings")
        .where({ user_id: TALENT_ID })
        .first();
      const prefs =
        typeof row.notification_preferences === "string"
          ? JSON.parse(row.notification_preferences)
          : row.notification_preferences;
      expect(prefs.profileViews).toBe(false);
    });

    it("persists blocked agencies and dedupes them", async () => {
      const auth = await withSession();

      await write(auth, { blockedAgencies: ["Elite", "elite", "Ford"] });

      const reread = await read(await withSession());
      expect(reread.blockedAgencies).toEqual(["Elite", "Ford"]);
    });

    it("persists visibility to the profile row that gates the public page", async () => {
      const auth = await withSession();

      await write(auth, { isPublic: false, isDiscoverable: true });

      const profile = await knex("profiles").where({ id: PROFILE_ID }).first();
      expect(!!profile.is_public).toBe(false);
      expect(!!profile.is_discoverable).toBe(true);

      const reread = await read(await withSession());
      expect(reread.isPublic).toBe(false);
      expect(reread.isDiscoverable).toBe(true);
    });

    it("persists analytics consent", async () => {
      const auth = await withSession();

      await write(auth, { cookies: { analytics: true } });
      expect((await read(await withSession())).cookies.analytics).toBe(true);

      await write(await withSession(), { cookies: { analytics: false } });
      expect((await read(await withSession())).cookies.analytics).toBe(false);
    });

    it("requires the current disclosure for grants and records withdrawal before a complete purge", async () => {
      const auth = await withSession();
      const initial = await read(auth);

      const missingDisclosure = await write(auth, {
        aiProcessingConsent: true,
      });
      expect(missingDisclosure.status).toBe(409);

      const staleDisclosure = await write(auth, {
        embeddingProcessingConsent: true,
        aiConsentDisclosureVersion: "stale-version",
      });
      expect(staleDisclosure.status).toBe(409);

      const granted = await write(auth, {
        aiProcessingConsent: true,
        embeddingProcessingConsent: true,
        aiConsentDisclosureVersion: initial.ai.disclosureVersion,
      });
      expect(granted.status).toBe(200);
      expect(granted.body.settings.ai).toMatchObject({
        imageProcessing: true,
        profileEmbedding: true,
      });

      const userImageId = uuidv4();
      const autoImageId = uuidv4();
      await knex("profiles").where({ id: PROFILE_ID }).update({
        archetype: "Provider archetype",
        fit_score_editorial: 97,
      });
      await knex("images").insert([
        {
          id: userImageId,
          profile_id: PROFILE_ID,
          path: `/tmp/${userImageId}.jpg`,
          shot_type: "headshot",
          style_type: "editorial",
          image_type: "portfolio",
          metadata: JSON.stringify({
            matte: { mask: "keep" },
            ai: {
              classification: {
                source: "user",
                confirmed: true,
                model: "provider-model",
                signals: { expression: "neutral" },
              },
            },
          }),
        },
        {
          id: autoImageId,
          profile_id: PROFILE_ID,
          path: `/tmp/${autoImageId}.jpg`,
          shot_type: "full_length",
          style_type: "commercial",
          image_type: "digital",
          metadata: JSON.stringify({
            matte: { mask: "keep-auto" },
            ai: { classification: { source: "auto", model: "provider-model" } },
          }),
        },
      ]);
      await knex("talent_embedding_cache").insert({
        profile_id: PROFILE_ID,
        source: "full_profile",
        embedding_json: JSON.stringify([0.1, 0.2]),
        source_text: "provider derivative",
      });

      // No disclosure version is required to withdraw. The preferences and a
      // pending event commit before derivative deletion starts.
      const withdrawn = await write(auth, {
        aiProcessingConsent: false,
        embeddingProcessingConsent: false,
      });
      expect(withdrawn.status).toBe(200);
      expect(withdrawn.body.settings.ai).toMatchObject({
        imageProcessing: false,
        profileEmbedding: false,
        imageProcessingDeletionState: "complete",
        profileEmbeddingDeletionState: "complete",
      });

      const profile = await knex("profiles").where({ id: PROFILE_ID }).first();
      expect(Boolean(profile.ai_processing_consent)).toBe(false);
      expect(Boolean(profile.embedding_processing_consent)).toBe(false);
      expect(profile.archetype).toBeNull();
      expect(profile.fit_score_editorial).toBeNull();
      expect(
        await knex("talent_embedding_cache").where({ profile_id: PROFILE_ID }),
      ).toHaveLength(0);

      const userImage = await knex("images").where({ id: userImageId }).first();
      const userMetadata = JSON.parse(userImage.metadata);
      expect(userMetadata.matte).toEqual({ mask: "keep" });
      expect(userMetadata.ai.classification).toMatchObject({
        source: "user",
        shot_type: { value: "headshot", source: "user" },
      });
      expect(userMetadata.ai.classification.model).toBeUndefined();
      expect(userImage.shot_type).toBe("headshot");

      const autoImage = await knex("images").where({ id: autoImageId }).first();
      expect(JSON.parse(autoImage.metadata)).toEqual({
        matte: { mask: "keep-auto" },
      });
      expect(autoImage.shot_type).toBeNull();
      expect(autoImage.style_type).toBeNull();
      expect(autoImage.image_type).toBeNull();

      const events = await knex("ai_processing_consent_events")
        .where({ profile_id: PROFILE_ID })
        .orderBy("sequence");
      expect(events.map((event) => event.event_type)).toEqual([
        "granted",
        "granted",
        "withdrawn",
        "withdrawn",
        "deletion_complete",
        "deletion_complete",
      ]);
      expect(events.filter((event) => event.event_type === "withdrawn"))
        .toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              deletion_state: "pending",
              actor_user_id: TALENT_ID,
              actor_type: "talent",
              user_agent: IPHONE,
            }),
          ]),
        );
      expect(events[0].disclosure_hash).toBe(
        initial.ai.disclosureHashes.imageProcessing,
      );
      await expect(
        knex("ai_processing_consent_events")
          .where({ id: events[0].id })
          .update({ deletion_state: "failed" }),
      ).rejects.toThrow(/immutable/);

      await knex("images").whereIn("id", [userImageId, autoImageId]).delete();
    });

    it("appends failed deletion evidence without undoing a withdrawal", async () => {
      const evidence = {
        actorUserId: TALENT_ID,
        actorType: "talent",
        requestIp: "127.0.0.1",
        userAgent: IPHONE,
      };
      const eventId = await recordAiConsentEvent(knex, {
        ...evidence,
        profileId: PROFILE_ID,
        purpose: "image_analysis",
        granted: false,
        eventType: "withdrawn",
        deletionState: "pending",
      });

      const state = await finishWithdrawal(
        knex,
        {
          profileId: PROFILE_ID,
          purpose: "image_analysis",
          eventId,
          evidence,
        },
        async () => {
          const error = new Error("simulated local purge failure");
          error.code = "SIMULATED_PURGE_FAILURE";
          throw error;
        },
      );

      expect(state).toBe("failed");
      const events = await knex("ai_processing_consent_events")
        .where({ related_event_id: eventId });
      expect(events).toEqual([
        expect.objectContaining({
          event_type: "deletion_failed",
          granted: 0,
          deletion_state: "failed",
          deletion_error: "SIMULATED_PURGE_FAILURE",
        }),
      ]);
      const settings = await read(await withSession());
      expect(settings.ai.imageProcessing).toBe(false);
      expect(settings.ai.imageProcessingDeletionState).toBe("failed");
    });

    it("scopes every preference to the account that set it", async () => {
      const mine = await withSession(TALENT_ID);
      const theirs = await withSession(OTHER_ID);

      await write(mine, {
        blockedAgencies: ["MineOnly"],
        notifications: { profileViews: false },
      });

      const other = await read(theirs);
      expect(other.blockedAgencies).toEqual([]);
      expect(other.notifications.profileViews).toBe(true);
    });

    it("rejects unknown keys silently rather than storing them", async () => {
      const auth = await withSession();

      await write(auth, {
        notifications: { profileViews: true, cardLayout: "classic", newMessages: false },
      });

      const reread = await read(await withSession());
      expect(reread.notifications).toEqual({
        profileViews: true,
        applicationUpdates: expect.any(Boolean),
      });
    });
  });

  describe("devices", () => {
    it("describes the session's real device instead of a hardcoded label", async () => {
      const auth = await withSession();
      const settings = await read(auth);

      const current = settings.devices.find((d) => d.id === auth.sid);
      expect(current).toBeDefined();
      expect(current.isCurrent).toBe(true);
      expect(current.type).toBe("phone");
      expect(current.label).toBe("Safari on iOS");
      // The old payload shipped these literals for every row.
      expect(current.device).toBeUndefined();
      expect(current.location).toBeUndefined();
    });

    it("refuses to end the session making the request", async () => {
      const auth = await withSession();

      const res = await auth(
        request(app)
          .delete(`/api/talent/settings/sessions/${auth.sid}`)
          .set("Accept", "application/json"),
      );

      expect(res.status).toBe(400);
      expect(await knex("sessions").where({ sid: auth.sid }).first()).toBeTruthy();
    });

    it("cannot end another account's session", async () => {
      const mine = await withSession(TALENT_ID);
      const theirs = await withSession(OTHER_ID);

      const res = await mine(
        request(app)
          .delete(`/api/talent/settings/sessions/${theirs.sid}`)
          .set("Accept", "application/json"),
      );

      expect(res.status).toBe(404);
      expect(await knex("sessions").where({ sid: theirs.sid }).first()).toBeTruthy();
    });

    it("signs out every other device but keeps the caller signed in", async () => {
      const current = await withSession(TALENT_ID);
      const otherA = await withSession(TALENT_ID);
      const otherB = await withSession(TALENT_ID);
      const foreign = await withSession(OTHER_ID);

      const res = await current(
        request(app)
          .delete("/api/talent/settings/sessions")
          .set("Accept", "application/json"),
      );

      expect(res.status).toBe(200);
      expect(await knex("sessions").where({ sid: current.sid }).first()).toBeTruthy();
      expect(await knex("sessions").where({ sid: otherA.sid }).first()).toBeUndefined();
      expect(await knex("sessions").where({ sid: otherB.sid }).first()).toBeUndefined();
      // Never reaches across accounts.
      expect(await knex("sessions").where({ sid: foreign.sid }).first()).toBeTruthy();
    });
  });
});
