"use strict";

/**
 * The rights/consent ledger (§9.6 #7, plan C6).
 *
 * C6 requires three consents that must be SEPARATE, never bundled. This covers
 * two of them — Pholio-initiated marketing use, and AI-generated or enhanced
 * likeness — and what is being protected in these tests is not the storage but
 * the rules: independence, the Fashion Workers Act's four required terms, the
 * append-only history, and the fact that absence means no.
 */

const {
  DISCLOSURE_VERSION,
  EVENT,
  LikenessConsentError,
  PURPOSES,
  TABLE,
  consentHistory,
  consentState,
  grantConsent,
  isConsented,
  resetLikenessSchemaCache,
  withdrawConsent,
} = require("../../src/domains/talent/services/likeness-consent");

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("likeness-consent");
const knex = require("../../src/shared/db/knex");
const { v4: uuidv4 } = require("uuid");

const USER_ID = uuidv4();
const PROFILE_ID = uuidv4();

/* A currently-open window. The first draft used a start date a week in the
   future and the suite correctly refused it — the not-yet-started check doing
   its job on my own fixture. */
const replicaTerms = {
  scope: "One campaign image, Pholio social only",
  usePurpose: "Launch announcement",
  compensation: "USD 500 flat",
  startsOn: "2026-01-01",
  endsOn: "2027-12-31",
};

beforeAll(async () => {
  await migrate(knex);
  await knex("users").insert({
    id: USER_ID,
    email: `talent-${USER_ID.slice(0, 8)}@example.com`,
    role: "TALENT",
  });
  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: USER_ID,
    slug: `ada-${PROFILE_ID.slice(0, 8)}`,
    first_name: "Ada",
    city: "New York",
    height_cm: 178,
    bio_raw: "x",
    bio_curated: "x",
  });
}, 60000);

afterEach(async () => {
  await knex(TABLE).del();
});

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

describe("absence is a denial, never an unknown", () => {
  test("a talent who has agreed to nothing has consented to nothing", async () => {
    expect(await isConsented(knex, PROFILE_ID, PURPOSES.MARKETING)).toBe(false);
    expect(await isConsented(knex, PROFILE_ID, PURPOSES.AI_REPLICA)).toBe(false);
  });

  test("an unknown profile is a denial rather than an error", async () => {
    expect(await isConsented(knex, uuidv4(), PURPOSES.MARKETING)).toBe(false);
    expect(await isConsented(knex, null, PURPOSES.MARKETING)).toBe(false);
  });
});

describe("the two purposes are independent", () => {
  test("granting marketing use grants nothing about AI likeness", async () => {
    await grantConsent(knex, { profileId: PROFILE_ID, purpose: PURPOSES.MARKETING });

    expect(await isConsented(knex, PROFILE_ID, PURPOSES.MARKETING)).toBe(true);
    // C6: the three consents "must be separate, not bundled".
    expect(await isConsented(knex, PROFILE_ID, PURPOSES.AI_REPLICA)).toBe(false);
  });

  test("granting AI likeness grants nothing about marketing", async () => {
    await grantConsent(knex, {
      profileId: PROFILE_ID,
      purpose: PURPOSES.AI_REPLICA,
      ...replicaTerms,
    });

    expect(await isConsented(knex, PROFILE_ID, PURPOSES.AI_REPLICA)).toBe(true);
    expect(await isConsented(knex, PROFILE_ID, PURPOSES.MARKETING)).toBe(false);
  });

  test("withdrawing one leaves the other exactly as it was", async () => {
    await grantConsent(knex, { profileId: PROFILE_ID, purpose: PURPOSES.MARKETING });
    await grantConsent(knex, {
      profileId: PROFILE_ID,
      purpose: PURPOSES.AI_REPLICA,
      ...replicaTerms,
    });

    await withdrawConsent(knex, { profileId: PROFILE_ID, purpose: PURPOSES.AI_REPLICA });

    expect(await isConsented(knex, PROFILE_ID, PURPOSES.MARKETING)).toBe(true);
    expect(await isConsented(knex, PROFILE_ID, PURPOSES.AI_REPLICA)).toBe(false);
  });
});

describe("a replica grant must state what the statute names", () => {
  test.each([
    ["scope", { ...replicaTerms, scope: "" }],
    ["purpose", { ...replicaTerms, usePurpose: null }],
    ["compensation", { ...replicaTerms, compensation: "  " }],
    ["duration", { ...replicaTerms, endsOn: null }],
  ])("refuses a grant missing %s", async (_label, terms) => {
    await expect(
      grantConsent(knex, {
        profileId: PROFILE_ID,
        purpose: PURPOSES.AI_REPLICA,
        ...terms,
      }),
    ).rejects.toMatchObject({ code: "replica_terms_required" });

    // Nothing stored: a half-record that looks like consent is worse than none.
    expect(await knex(TABLE).count({ n: "*" }).first()).toEqual(
      expect.objectContaining({ n: 0 }),
    );
  });

  test("the refusal explains why, not just that", async () => {
    let thrown;
    try {
      await grantConsent(knex, {
        profileId: PROFILE_ID,
        purpose: PURPOSES.AI_REPLICA,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(LikenessConsentError);
    expect(thrown.message).toMatch(/Fashion Workers Act/i);
  });

  test("marketing use needs no such terms — it is a different permission", async () => {
    await expect(
      grantConsent(knex, { profileId: PROFILE_ID, purpose: PURPOSES.MARKETING }),
    ).resolves.toHaveProperty("id");
  });
});

describe("the ledger is append-only", () => {
  test("a withdrawal adds a row rather than editing or deleting one", async () => {
    await grantConsent(knex, { profileId: PROFILE_ID, purpose: PURPOSES.MARKETING });
    await withdrawConsent(knex, { profileId: PROFILE_ID, purpose: PURPOSES.MARKETING });

    const rows = await knex(TABLE).where({ profile_id: PROFILE_ID }).orderBy("occurred_at");
    expect(rows).toHaveLength(2);
    expect(rows[0].event_type).toBe(EVENT.GRANTED);
    expect(rows[1].event_type).toBe(EVENT.WITHDRAWN);
    // The withdrawal names what it superseded, so the chain is readable.
    expect(rows[1].supersedes_id).toBe(rows[0].id);
  });

  test("re-granting after a withdrawal keeps the whole history", async () => {
    await grantConsent(knex, { profileId: PROFILE_ID, purpose: PURPOSES.MARKETING });
    await withdrawConsent(knex, { profileId: PROFILE_ID, purpose: PURPOSES.MARKETING });
    await grantConsent(knex, { profileId: PROFILE_ID, purpose: PURPOSES.MARKETING });

    expect(await isConsented(knex, PROFILE_ID, PURPOSES.MARKETING)).toBe(true);
    const history = await consentHistory(knex, PROFILE_ID);
    expect(history).toHaveLength(3);
  });

  test("every row records the exact disclosure the talent was shown", async () => {
    await grantConsent(knex, { profileId: PROFILE_ID, purpose: PURPOSES.MARKETING });
    const row = await knex(TABLE).where({ profile_id: PROFILE_ID }).first();

    expect(row.disclosure_version).toBe(DISCLOSURE_VERSION);
    // A dispute should be about a fixed text, not about what the page said that
    // month.
    expect(row.disclosure_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("a guardian acting for a minor is distinguishable forever", async () => {
    await grantConsent(knex, {
      profileId: PROFILE_ID,
      purpose: PURPOSES.MARKETING,
      actorType: "guardian",
      actorUserId: USER_ID,
    });
    const row = await knex(TABLE).where({ profile_id: PROFILE_ID }).first();
    expect(row.actor_type).toBe("guardian");
  });
});

describe("a grant expires with its stated duration", () => {
  test("a replica grant whose end date has passed no longer permits anything", async () => {
    await grantConsent(knex, {
      profileId: PROFILE_ID,
      purpose: PURPOSES.AI_REPLICA,
      ...replicaTerms,
      startsOn: "2026-01-01",
      endsOn: "2026-02-01",
    });

    // Relying on a lapsed grant is the exact harm the FWA's duration
    // requirement exists to prevent.
    expect(
      await isConsented(knex, PROFILE_ID, PURPOSES.AI_REPLICA, new Date("2026-08-25")),
    ).toBe(false);
    expect(
      await isConsented(knex, PROFILE_ID, PURPOSES.AI_REPLICA, new Date("2026-01-15")),
    ).toBe(true);
  });

  test("a grant that has not started yet does not permit anything either", async () => {
    await grantConsent(knex, {
      profileId: PROFILE_ID,
      purpose: PURPOSES.AI_REPLICA,
      ...replicaTerms,
      startsOn: "2027-01-01",
      endsOn: "2027-06-01",
    });
    expect(
      await isConsented(knex, PROFILE_ID, PURPOSES.AI_REPLICA, new Date("2026-08-25")),
    ).toBe(false);
  });
});

describe("an unmigrated database denies rather than throws", () => {
  const absent = () => {
    const db = () => { throw new Error("must not query an absent table"); };
    db.schema = { hasTable: async () => false };
    db.fn = { now: () => new Date().toISOString() };
    return db;
  };

  beforeEach(() => resetLikenessSchemaCache());
  afterEach(() => resetLikenessSchemaCache());

  test("a caller gating a marketing post gets false, never an exception to swallow", async () => {
    expect(await isConsented(absent(), PROFILE_ID, PURPOSES.MARKETING)).toBe(false);
    expect(await consentHistory(absent(), PROFILE_ID)).toEqual([]);
  });

  test("but recording refuses loudly — a lost consent record is not acceptable", async () => {
    await expect(
      grantConsent(absent(), { profileId: PROFILE_ID, purpose: PURPOSES.MARKETING }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("state for a settings screen", () => {
  test("reports both purposes and the disclosures actually shown", async () => {
    await grantConsent(knex, { profileId: PROFILE_ID, purpose: PURPOSES.MARKETING });
    const state = await consentState(knex, PROFILE_ID);

    expect(state[PURPOSES.MARKETING]).toBe(true);
    expect(state[PURPOSES.AI_REPLICA]).toBe(false);
    expect(state.disclosures[PURPOSES.AI_REPLICA]).toMatch(/colour correction/i);
  });
});
