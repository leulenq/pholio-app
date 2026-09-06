"use strict";

/**
 * The digitals sheet (industry alignment audit §2.3, path B).
 *
 * Two failures met on this route. It built its measurement list by hand —
 * `isMale` guessed from `gender`, bust/waist/hips pushed with no age check, a
 * man's suit size read out of the `dress_size` column — so it printed a
 * MINOR's body measurements, the one thing a kids card must never carry. And
 * it was mounted with no authentication at all, gated only on guardian
 * consent, which a consented minor passes: anyone who could guess
 * `firstname-lastname` could read it.
 *
 * A comp card is a leave-behind and stays public. A digitals sheet is what an
 * agency asks for by name, so it now requires the talent, an agency session,
 * or a live share token.
 */

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");
const { acceptedLegal } = require("../setup/legal-fixture");

const DB_FILE = useIsolatedDatabase("digitals-sheet");

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const config = require("../../src/config");
const { mintRenderToken } = require("../../src/domains/pdf/render-token");

const ADULT_SLUG = "nadia-adult";
const MINOR_SLUG = "remy-minor";

const ADULT = { userId: uuidv4(), profileId: uuidv4() };
const MINOR = { userId: uuidv4(), profileId: uuidv4() };
const AGENCY_USER_ID = uuidv4();
const LIVE_TOKEN = "live-share-token-adult";
const REVOKED_TOKEN = "revoked-share-token-adult";

/** A date of birth `years` ago, so age-dependent cases stay true over time. */
function dobYearsAgo(years) {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), Math.min(now.getUTCDate(), 28)),
  )
    .toISOString()
    .slice(0, 10);
}

async function seedTalent({ userId, profileId, slug, email, extra }) {
  await knex("users").insert({
    id: userId,
    email,
    role: "TALENT",
    email_verified: true,
    // Signed-in talent pass a legal-acceptance gate before any "/" route.
    ...acceptedLegal(),
  });
  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug,
    first_name: "Test",
    last_name: "Talent",
    city: "New York",
    bio_raw: "x",
    bio_curated: "x",
    is_public: true,
    // Signed-in talent hitting any "/" route passes through
    // requireOnboardingComplete first; an unfinished profile is redirected.
    onboarding_completed_at: new Date().toISOString(),
    height_cm: 175,
    bust_cm: 84,
    waist_cm: 61,
    hips_cm: 89,
    shoe_size: "9",
    hair_color: "brown",
    eye_color: "green",
    ...extra,
  });
  await knex("images").insert({
    id: uuidv4(),
    profile_id: profileId,
    path: `uploads/${slug}-digital.jpg`,
    image_type: "digital",
    shot_type: "full_length",
    sort: 1,
  });
}

async function sessionCookie(sess) {
  const sid = uuidv4();
  await knex("sessions").insert({
    sid,
    sess: JSON.stringify({
      cookie: { originalMaxAge: null, expires: null, secure: false, httpOnly: true, path: "/" },
      ...sess,
    }),
    expired: new Date(Date.now() + 86400000).toISOString(),
  });
  return `connect.sid=${encodeURIComponent(`s:${cookieSig.sign(sid, config.sessionSecret)}`)}`;
}

let ownerCookie;
let agencyCookie;
let strangerCookie;

beforeAll(async () => {
  await migrate(knex);

  await seedTalent({
    ...ADULT,
    slug: ADULT_SLUG,
    email: "nadia@example.com",
    extra: { date_of_birth: dobYearsAgo(26), gender: "Female", dress_size: "4" },
  });

  await seedTalent({
    ...MINOR,
    slug: MINOR_SLUG,
    email: "remy@example.com",
    extra: {
      date_of_birth: dobYearsAgo(11),
      gender: "Female",
      dress_size: "8",
      guardian_consent_at: new Date().toISOString(),
    },
  });

  await knex("users").insert({
    id: AGENCY_USER_ID,
    email: "agency@example.com",
    role: "AGENCY",
    email_verified: true,
    ...acceptedLegal(),
  });

  await knex("share_tokens").insert([
    { id: uuidv4(), profile_id: ADULT.profileId, token: LIVE_TOKEN, kind: "portfolio" },
    {
      id: uuidv4(),
      profile_id: ADULT.profileId,
      token: REVOKED_TOKEN,
      kind: "portfolio",
      revoked_at: new Date().toISOString(),
    },
  ]);

  ownerCookie = await sessionCookie({ userId: ADULT.userId, role: "TALENT" });
  agencyCookie = await sessionCookie({ userId: AGENCY_USER_ID, role: "AGENCY" });
  strangerCookie = await sessionCookie({ userId: MINOR.userId, role: "TALENT" });
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

describe("who may read a digitals sheet", () => {
  test("a stranger with no session is refused the PDF", async () => {
    const res = await request(app).get(`/pdf/digitals/${ADULT_SLUG}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("DIGITALS_ACCESS_REQUIRED");
  });

  test("a stranger with no session is refused the printable HTML", async () => {
    const res = await request(app).get(`/pdf/digitals/view/${ADULT_SLUG}`);
    expect(res.status).toBe(403);
    expect(res.text).not.toMatch(/WAIST|Waist/);
  });

  test("another signed-in talent is not an audience for someone else's digitals", async () => {
    const res = await request(app)
      .get(`/pdf/digitals/${ADULT_SLUG}`)
      .set("Cookie", strangerCookie);
    expect(res.status).toBe(403);
  });

  test("the talent themselves can still download their own", async () => {
    const res = await request(app)
      .get(`/pdf/digitals/${ADULT_SLUG}?download=1`)
      .set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
  });

  test("an agency session can read the sheet it asked for", async () => {
    const res = await request(app)
      .get(`/pdf/digitals/view/${ADULT_SLUG}`)
      .set("Cookie", agencyCookie);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/WAIST/i);
  });

  test("a live share token opens it; a revoked one does not", async () => {
    const live = await request(app).get(
      `/pdf/digitals/view/${ADULT_SLUG}?st=${LIVE_TOKEN}`,
    );
    expect(live.status).toBe(200);

    const revoked = await request(app).get(
      `/pdf/digitals/view/${ADULT_SLUG}?st=${REVOKED_TOKEN}`,
    );
    expect(revoked.status).toBe(403);
  });

  test("a share token for another profile is not a key to this one", async () => {
    const res = await request(app).get(
      `/pdf/digitals/view/${MINOR_SLUG}?st=${LIVE_TOKEN}`,
    );
    expect(res.status).toBe(403);
  });

  test("the renderer's signed token opens the page it was minted for, and nothing else", async () => {
    const token = mintRenderToken("digitals", ADULT_SLUG);
    const own = await request(app).get(
      `/pdf/digitals/view/${ADULT_SLUG}?rt=${encodeURIComponent(token)}`,
    );
    expect(own.status).toBe(200);

    const other = await request(app).get(
      `/pdf/digitals/view/${MINOR_SLUG}?rt=${encodeURIComponent(token)}`,
    );
    expect(other.status).toBe(403);

    const expired = mintRenderToken("digitals", ADULT_SLUG, { ttlMs: -1000 });
    const stale = await request(app).get(
      `/pdf/digitals/view/${ADULT_SLUG}?rt=${encodeURIComponent(expired)}`,
    );
    expect(stale.status).toBe(403);

    const forged = await request(app).get(
      `/pdf/digitals/view/${ADULT_SLUG}?rt=${Date.now() + 60000}.${"a".repeat(64)}`,
    );
    expect(forged.status).toBe(403);
  });
});

describe("a minor's digitals sheet carries no body measurements", () => {
  test("a consented minor's sheet still refuses bust/waist/hips", async () => {
    const res = await request(app)
      .get(`/pdf/digitals/view/${MINOR_SLUG}`)
      .set("Cookie", agencyCookie);
    expect(res.status).toBe(200);

    // The sheet renders — height, clothing size, shoes, hair, eyes — but the
    // measurements a kids card never carries are absent, label and value.
    expect(res.text).toMatch(/HEIGHT/i);
    expect(res.text).not.toMatch(/\bBUST\b/i);
    expect(res.text).not.toMatch(/\bWAIST\b/i);
    expect(res.text).not.toMatch(/\bHIPS\b/i);
    expect(res.text).not.toContain("61 cm");
    expect(res.text).not.toContain("89 cm");
  });

  test("an adult's sheet still carries the measurements agencies request", async () => {
    const res = await request(app)
      .get(`/pdf/digitals/view/${ADULT_SLUG}`)
      .set("Cookie", agencyCookie);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/BUST/i);
    expect(res.text).toMatch(/WAIST/i);
    expect(res.text).toMatch(/HIPS/i);
  });
});
