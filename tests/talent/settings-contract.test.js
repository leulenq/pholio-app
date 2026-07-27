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

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const SESSION_SECRET = require("../../src/config").sessionSecret;

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
    // Ensure schema + fixtures exist before inserting rows.
    // Other test suites in this repo follow the same pattern.
    await knex.migrate.latest();

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
        ...legal,
      },
      {
        id: OTHER_ID,
        email: `settings-other-${OTHER_ID}@example.com`,
        password_hash: "x",
        role: "TALENT",
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
