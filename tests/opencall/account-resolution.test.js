"use strict";

/**
 * WHICH EXISTING ACCOUNT AN ANONYMOUS APPLICATION RESOLVES TO — and when it must
 * refuse to resolve at all (`docs/open-call-applicant-flow-design-2026-08.md`
 * §5.2, §5.3, §9 Q1).
 *
 * Two failures live at the same junction, and both are silent:
 *
 *  1. **A minor's profile must not acquire an agency application.** The
 *     account-backed submit refuses a minor without a guardian's per-agency
 *     authorization (GUARDIAN_AGENCY_CONSENT_REQUIRED,
 *     `src/domains/talent/routes/applications.js`). The anonymous path has no
 *     grant to check, so it must not attach — and it must refuse INVISIBLY,
 *     because §5.3 forbids any response that branches on account existence. The
 *     assertions here are therefore "the row points nowhere" AND "the response
 *     is byte-identical to an unknown address"; either alone would pass while
 *     the product was wrong. Real minor intake is design §9 Q1, owned by the
 *     separate minors/age-policy workstream; this is containment until it lands.
 *
 *  2. **A plus-tagged registration is the same human.** `applicant_identities.
 *     email_normalized` is plus-stripped and `users.email` is not, so the
 *     identity `a@x.com` and the account `a+pholio@x.com` never matched by
 *     equality. The consequence was not a missing feature but a duplicate
 *     account: the applicant was offered a claim, and claiming would have built a
 *     second profile beside the one the lookup could not see.
 *
 * Isolated database, real schema, real routes — the submit path is exercised
 * through HTTP because `resolveDestination` is only reachable that way and the
 * response shape is half of what is being asserted.
 */

const request = require("supertest");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("opencall-account-resolution");

// The receipt is fire-and-forget; the spy is how the test reads which of §5.3's
// two emails was composed, and how it gets the raw claim token.
jest.mock("../../src/domains/opencall/services/emails", () => ({
  sendOpenCallReceiptEmail: jest.fn(async () => ({ messageId: "test" })),
  sendOpenCallReceiptEmailQuietly: jest.fn(async () => ({ sent: true })),
}));

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const config = require("../../src/config");
const {
  sendOpenCallReceiptEmailQuietly,
} = require("../../src/domains/opencall/services/emails");
const {
  resetApplicantIdentitySchemaCache,
} = require("../../src/domains/opencall/services/schema");
const {
  findClaimedProfileForEmail,
  findUserForIdentityEmail,
} = require("../../src/domains/opencall/services/applicant-identities");
const { claimIdentity } = require("../../src/domains/opencall/services/claim");

const AGENCY_ID = uuidv4();

const LINKS = {
  minor: { id: uuidv4(), code: "resolveminor" },
  stranger: { id: uuidv4(), code: "resolvestrng" },
  plustag: { id: uuidv4(), code: "resolveplus1" },
};

/** A minor by the platform's own rule — `isMinorProfile` reads only the DOB. */
const MINOR = {
  userId: uuidv4(),
  profileId: uuidv4(),
  email: "juno.minor@example.com",
  dateOfBirth: "2012-05-01",
};
/** An adult who registered WITH a plus tag. The identity key strips it. */
const PLUS = {
  userId: uuidv4(),
  profileId: uuidv4(),
  registered: "ari+pholio@example.com",
  identityKey: "ari@example.com",
};
/** A second plus-tagged account, for the claim path. */
const CLAIMER = {
  userId: uuidv4(),
  profileId: uuidv4(),
  registered: "bex+inbox@example.com",
  identityKey: "bex@example.com",
};
/**
 * LIKE-wildcard bait. `%` and `_` are legal in a local part and are wildcards
 * inside a LIKE pattern, so an unescaped `od%d_ity+%@example.com` matches the
 * DECOY too — a different human entirely.
 */
const WILDCARD = {
  userId: uuidv4(),
  profileId: uuidv4(),
  registered: "od%d_ity+tag@example.com",
  identityKey: "od%d_ity@example.com",
};
const DECOY = {
  userId: uuidv4(),
  profileId: uuidv4(),
  registered: "odZZZdXity+tag@example.com",
};

let ipCounter = 0;
function hit(agent) {
  ipCounter += 1;
  const octet = 1 + (ipCounter % 250);
  const block = 30 + Math.floor(ipCounter / 250);
  return agent.set("X-Forwarded-For", `198.51.${block}.${octet}`);
}

async function testImage() {
  const sharp = require("sharp");
  return sharp({
    create: {
      width: 400,
      height: 600,
      channels: 3,
      background: { r: 120, g: 128, b: 136 },
    },
  })
    .png()
    .toBuffer();
}

const TYPED_ANSWERS = Object.freeze({
  legal_name: "Nia Okonkwo",
  gender: "female",
  city: "Brooklyn",
  height: 178,
  adult_attestation: true,
});

async function insertLink({ id, code }) {
  await knex("agency_open_call_links").insert({
    id,
    agency_id: AGENCY_ID,
    code,
    label: "FWBK",
    status: "active",
    call_kind: "event_casting",
    identity_policy: "account_optional",
    intake_spec: null,
    intake_spec_version: 1,
    event_name: "Fashion Week Brooklyn",
    event_starts_on: "2026-10-04",
    event_ends_on: "2026-10-10",
    event_location: "Brooklyn, NY",
    compensation_type: "unpaid",
    compensation_details: "Unpaid. Travel is not reimbursed.",
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
}

async function insertTalent({ userId, profileId, email, dateOfBirth = null }) {
  await knex("users").insert({
    id: userId,
    email,
    role: "TALENT",
    first_name: "Existing",
    last_name: "Talent",
    email_verified: true,
    created_at: knex.fn.now(),
  });
  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `talent-${profileId.slice(0, 8)}`,
    first_name: "Existing",
    last_name: "Talent",
    city: "Brooklyn",
    height_cm: 176,
    date_of_birth: dateOfBirth,
    bio_raw: "",
    bio_curated: "",
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
}

/** The whole apply stage, up to but not including submit. */
async function fillDraft(agent, code, email) {
  await hit(agent.post(`/api/public/opencall/call/${code}/draft`))
    .send({ answers: TYPED_ANSWERS })
    .expect(200);
  // Phone is a REQUIRED apply-stage field on the default event spec, and the
  // email step is where it is collected.
  await hit(agent.post(`/api/public/opencall/call/${code}/draft/email`))
    .send({ email, phone: "(347) 555-0134" })
    .expect(200);

  const image = await testImage();
  for (const fieldKey of ["digital_headshot", "digital_full_length"]) {
    await hit(agent.post(`/api/public/opencall/call/${code}/draft/media/${fieldKey}`))
      .attach("media", image, { filename: `${fieldKey}.png`, contentType: "image/png" })
      .expect(200);
  }
}

/** Fill in and send, returning the raw submit response. */
async function submitTo(code, email) {
  const agent = request.agent(app);
  await fillDraft(agent, code, email);
  const state = await hit(
    agent.get(`/api/public/opencall/call/${code}/draft`),
  ).expect(200);
  return hit(agent.post(`/api/public/opencall/call/${code}/submit`))
    .send({
      consent: {
        confirmed: true,
        accuracyConfirmed: true,
        adultAuthorityConfirmed: true,
        packageFingerprint: state.body.data.packageFingerprint,
      },
    })
    .expect(200);
}

function lastReceipt() {
  const calls = sendOpenCallReceiptEmailQuietly.mock.calls;
  return calls.length ? calls[calls.length - 1][0] : null;
}

let uploadsBefore = new Set();

beforeAll(async () => {
  await migrate(knex);
  resetApplicantIdentitySchemaCache();

  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Fashion Week Brooklyn",
    status: "ACTIVE",
  });
  for (const link of Object.values(LINKS)) await insertLink(link);

  await insertTalent({ ...MINOR, dateOfBirth: MINOR.dateOfBirth });
  await insertTalent({ ...PLUS, email: PLUS.registered });
  await insertTalent({ ...CLAIMER, email: CLAIMER.registered });
  await insertTalent({ ...WILDCARD, email: WILDCARD.registered });
  await insertTalent({ ...DECOY, email: DECOY.registered });

  try {
    uploadsBefore = new Set(fs.readdirSync(config.uploadsDir));
  } catch {
    uploadsBefore = new Set();
  }
}, 180000);

afterAll(async () => {
  try {
    for (const name of fs.readdirSync(config.uploadsDir)) {
      if (!uploadsBefore.has(name)) fs.unlinkSync(path.join(config.uploadsDir, name));
    }
  } catch {
    /* nothing to clean */
  }
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

/* ------------------------------------------------------- the minor's address */

describe("an address that belongs to a minor's profile", () => {
  let minorSubmitBody = null;
  let strangerSubmitBody = null;
  let claimUrl = null;

  test("takes the application identity-only — the profile never acquires it", async () => {
    sendOpenCallReceiptEmailQuietly.mockClear();
    const res = await submitTo(LINKS.minor.code, MINOR.email);
    minorSubmitBody = res.body;

    const application = await knex("applications")
      .where({ open_call_link_id: LINKS.minor.id })
      .first();
    // THE assertion: the guardian gate the account-backed path enforces is not
    // walked around here. Nothing points at the minor's profile.
    expect(application.profile_id).toBeNull();
    expect(application.applicant_identity_id).toBeTruthy();

    const pkg = await knex("talent_submission_packages")
      .where({ application_id: application.id })
      .first();
    expect(pkg.profile_id).toBeNull();
    expect(pkg.user_id).toBeNull();

    // …and the consent audit row records no adult account either.
    const consent = await knex("application_submission_consent_events")
      .where({ application_id: application.id })
      .first();
    expect(consent.profile_id).toBeNull();
    expect(consent.user_id).toBeNull();

    // The receipt is the ordinary claim receipt — `alreadyHadAccount` false, so
    // no email ever says the application was "attached to your Pholio profile",
    // which here would be false.
    const receipt = lastReceipt();
    expect(receipt.alreadyHadAccount).toBe(false);
    expect(receipt.claimUrl).toContain("/opencall/claim/");
    claimUrl = receipt.claimUrl;
  }, 120000);

  test("answers byte-identically to an address nobody has ever seen (§5.3)", async () => {
    const res = await submitTo(LINKS.stranger.code, "nobody.at.all@example.com");
    strangerSubmitBody = res.body;
    // No oracle: a refusal, a different code, or any extra field here would
    // confirm to an anonymous visitor that the other address has an account.
    expect(minorSubmitBody).toEqual(strangerSubmitBody);
    expect(minorSubmitBody).toEqual({
      success: true,
      data: { submitted: true, receiptEmailQueued: true },
    });
  }, 120000);

  test("refuses the claim without creating anything", async () => {
    const identity = await knex("applicant_identities")
      .where({ email_normalized: MINOR.email })
      .first();
    expect(identity.claimed_at).toBeNull();

    const usersBefore = await knex("users").count({ n: "*" }).first();
    const profilesBefore = await knex("profiles").count({ n: "*" }).first();

    await expect(
      claimIdentity(knex, { identityId: identity.id, termsAccepted: true }),
    ).rejects.toMatchObject({ code: "IDENTITY_EMAIL_IS_MINOR" });

    // Nothing was created, nothing was re-pointed, nothing was claimed.
    expect(await knex("users").count({ n: "*" }).first()).toEqual(usersBefore);
    expect(await knex("profiles").count({ n: "*" }).first()).toEqual(profilesBefore);
    const after = await knex("applicant_identities").where({ id: identity.id }).first();
    expect(after.claimed_at).toBeNull();
    expect(after.profile_id).toBeNull();
    const application = await knex("applications")
      .where({ applicant_identity_id: identity.id })
      .first();
    expect(application.profile_id).toBeNull();
  });

  test("the claim link lands on the friendly existing-account answer, unspent", async () => {
    const rawToken = String(claimUrl).split("/opencall/claim/")[1];
    const res = await hit(
      request(app).post(`/api/public/opencall/claim/${rawToken}`),
    )
      .send({ termsAccepted: true })
      .expect(409);

    expect(res.body.error).toBe("IDENTITY_EMAIL_IS_MINOR");
    // The message never names age: it is true of any existing account, which is
    // what keeps it from being an oracle about whose account it is.
    expect(res.body.message).toMatch(/already has a Pholio account/i);
    expect(res.body.message).not.toMatch(/\b(minor|age|guardian|birth)\b/i);

    // A refused claim does not spend the link.
    const {
      hashToken,
    } = require("../../src/domains/opencall/services/claim-tokens");
    const token = await knex("applicant_claim_tokens")
      .where({ token_hash: hashToken(rawToken) })
      .first();
    expect(token.consumed_at).toBeFalsy();
  });
});

/* ------------------------------------------------- the plus-tagged account */

describe("an account registered with a plus tag", () => {
  test("is found by the plus-stripped identity key", async () => {
    // The identity key is `ari@example.com`; the account is `ari+pholio@…`.
    const found = await findClaimedProfileForEmail(knex, PLUS.identityKey);
    expect(found).toMatchObject({
      userId: PLUS.userId,
      profileId: PLUS.profileId,
      role: "TALENT",
      source: "user",
    });
  });

  test("still matches the address exactly as typed — the regression", async () => {
    const res = await submitTo(LINKS.plustag.code, PLUS.registered);
    expect(res.body.data.submitted).toBe(true);

    const application = await knex("applications")
      .where({ open_call_link_id: LINKS.plustag.id })
      .first();
    expect(application.profile_id).toBe(PLUS.profileId);
    // The identity is still keyed by the plus-stripped address.
    const identity = await knex("applicant_identities")
      .where({ id: application.applicant_identity_id })
      .first();
    expect(identity.email_normalized).toBe(PLUS.identityKey);
  }, 120000);

  test("is claimed onto rather than duplicated", async () => {
    const identityId = uuidv4();
    await knex("applicant_identities").insert({
      id: identityId,
      email_normalized: CLAIMER.identityKey,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

    const usersBefore = Number(
      (await knex("users").count({ n: "*" }).first()).n,
    );
    const result = await claimIdentity(knex, { identityId, termsAccepted: true });

    expect(result).toMatchObject({
      userId: CLAIMER.userId,
      profileId: CLAIMER.profileId,
      created: false,
      profileCreated: false,
      alreadyHadAccount: true,
    });
    // The whole point: no second account for a human who already had one.
    expect(Number((await knex("users").count({ n: "*" }).first()).n)).toBe(
      usersBefore,
    );
    const identity = await knex("applicant_identities").where({ id: identityId }).first();
    expect(identity.profile_id).toBe(CLAIMER.profileId);
    expect(identity.claimed_at).toBeTruthy();
  });

  test("LIKE wildcards in the local part match literally, never as patterns", async () => {
    // `od%d_ity@example.com` must find `od%d_ity+tag@…` and MUST NOT find
    // `odZZZdXity+tag@…`, which an unescaped `%`/`_` would sweep up.
    const found = await findClaimedProfileForEmail(knex, WILDCARD.identityKey);
    expect(found).toMatchObject({
      userId: WILDCARD.userId,
      profileId: WILDCARD.profileId,
    });

    // And with the literal account removed, the decoy is not a fallback: the
    // answer is "no account", not "some account whose address looks similar".
    await knex("users").where({ id: WILDCARD.userId }).update({
      email: "moved.away@example.com",
    });
    expect(await findClaimedProfileForEmail(knex, WILDCARD.identityKey)).toBeNull();
    expect(await findUserForIdentityEmail(knex, WILDCARD.identityKey)).toBeNull();
    await knex("users").where({ id: WILDCARD.userId }).update({
      email: WILDCARD.registered,
    });
  });

  test("picks deterministically when several accounts collapse onto one identity", async () => {
    const bareUserId = uuidv4();
    const bareProfileId = uuidv4();
    // The account that literally owns the address, created LATER than the
    // plus-tagged one — so "exact match wins" is what is being read, not "oldest".
    await insertTalent({
      userId: bareUserId,
      profileId: bareProfileId,
      email: PLUS.identityKey,
    });

    const found = await findClaimedProfileForEmail(knex, PLUS.identityKey);
    expect(found.userId).toBe(bareUserId);
    // Stable across calls — never a database-order `.first()`.
    expect((await findClaimedProfileForEmail(knex, PLUS.identityKey)).userId).toBe(
      bareUserId,
    );

    await knex("profiles").where({ id: bareProfileId }).del();
    await knex("users").where({ id: bareUserId }).del();
  });
});
