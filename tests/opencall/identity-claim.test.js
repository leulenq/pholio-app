"use strict";

/**
 * The identity layer of the anonymous open-call applicant flow
 * (`docs/open-call-applicant-flow-design-2026-08.md` §3.2, §3.3, §5.2, §5.5).
 *
 * What is actually load-bearing here, and therefore what these tests pin:
 *
 *  - The identity KEY. If normalization is not deterministic, cross-edition
 *    dedup (§3.2, "the bigger FWB prize") silently stops working and one human
 *    becomes two rows.
 *  - The TOKEN boundary. These links open sessions on new accounts. Single use,
 *    fail-closed expiry, purpose isolation, and no oracle in the null answers.
 *  - The CLAIM transaction. It touches six tables at once, and a partial claim
 *    leaves an application the organizer can see attached to a profile that
 *    does not exist yet — which is the failure §4's resolver cannot paper over.
 *  - IDEMPOTENCE. A magic link is clicked twice by mail clients as a matter of
 *    course. A double claim must not error, and a claimed identity must not be
 *    disownable by a forwarded link.
 *
 * Isolated database, schema only — every fixture is inserted directly so the
 * assertions are about the claim and not about the seed data.
 */

const request = require("supertest");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("opencall-identity-claim");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");

const {
  ensureIdentityForEmail,
  findClaimedProfileForEmail,
  findIdentityByEmail,
  normalizeIdentityEmail,
  normalizePhone,
} = require("../../src/domains/opencall/services/applicant-identities");
const {
  CLAIM_TOKEN_PURPOSES,
  CLAIM_TOKEN_TTL_DAYS,
  consumeClaimToken,
  hashToken,
  mintClaimToken,
  validateClaimToken,
} = require("../../src/domains/opencall/services/claim-tokens");
const {
  claimIdentity,
  disownIdentity,
  mergeAnswers,
  projectProfileFields,
  splitLegalName,
} = require("../../src/domains/opencall/services/claim");
const {
  resetApplicantIdentitySchemaCache,
} = require("../../src/domains/opencall/services/schema");

const AGENCY_ID = uuidv4();
/** Two editions of one organizer's call — Brooklyn and Queens (§3.2's dedup). */
const LINK_ID = uuidv4();
const BROOKLYN_LINK_ID = uuidv4();

/**
 * A distinct client IP per request.
 *
 * `authLimiter` is mounted on `/api/public/opencall` in src/app.js and is left
 * ON in these tests — the anonymous submit/claim surface is exactly where a
 * per-IP ceiling matters (§7's abuse controls), and a suite that only passes
 * because the limiter was stubbed out would not be testing the shipped route.
 * Each fixture applicant is a different person on a different phone, so each
 * gets its own forwarded address rather than sharing one 10-per-minute bucket.
 */
let ipCounter = 0;
function fromNewClient(agent) {
  ipCounter += 1;
  const octet = 1 + (ipCounter % 250);
  return agent.set("X-Forwarded-For", `203.0.113.${octet}`);
}

/** A submitted submission with answers and (optionally) media, inserted raw. */
async function insertSubmission({
  identityId,
  answers,
  submittedAt,
  media = [],
  linkId = LINK_ID,
}) {
  const id = uuidv4();
  await knex("open_call_submissions").insert({
    id,
    open_call_link_id: linkId,
    agency_id: AGENCY_ID,
    applicant_identity_id: identityId,
    answers: JSON.stringify(answers),
    custom_answers: "{}",
    intake_spec_version: 1,
    status: "submitted",
    submitted_at: submittedAt,
    expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
    created_at: submittedAt,
    updated_at: submittedAt,
  });

  for (const item of media) {
    await knex("open_call_submission_media").insert({
      id: uuidv4(),
      submission_id: id,
      field_key: item.fieldKey,
      storage_key: item.storageKey,
      content_type: "image/webp",
      bytes: 1024,
      moderation_state: item.moderationState || "pending",
      created_at: submittedAt,
    });
  }

  return id;
}

/** An application + its frozen snapshot + its consent audit row, identity-only. */
async function insertIdentityApplication(identityId) {
  const applicationId = uuidv4();
  await knex("applications").insert({
    id: applicationId,
    profile_id: null,
    applicant_identity_id: identityId,
    agency_id: AGENCY_ID,
    open_call_link_id: LINK_ID,
    call_purpose: "event_casting",
    status: "pending",
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  await knex("talent_submission_packages").insert({
    id: uuidv4(),
    application_id: applicationId,
    applicant_identity_id: identityId,
    user_id: null,
    profile_id: null,
    label: "Open call submission",
    payload: JSON.stringify({ identity: { displayName: "Nia Okonkwo" } }),
    created_at: knex.fn.now(),
  });
  await knex("application_submission_consent_events").insert({
    id: uuidv4(),
    application_id: applicationId,
    applicant_identity_id: identityId,
    user_id: null,
    profile_id: null,
    agency_id: AGENCY_ID,
    open_call_link_id: LINK_ID,
    purpose: "event_casting",
    package_fingerprint: crypto.randomBytes(8).toString("hex"),
    consent_text_version: "v1",
    acknowledgement_version: "v1",
    disclosure_snapshot: JSON.stringify({ compensation: "unpaid" }),
    created_at: knex.fn.now(),
  });
  return applicationId;
}

beforeAll(async () => {
  await migrate(knex);
  resetApplicantIdentitySchemaCache();

  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Fashion Week Brooklyn",
    status: "ACTIVE",
  });
  for (const [id, label] of [
    [LINK_ID, "FWBK Queens"],
    [BROOKLYN_LINK_ID, "FWBK Brooklyn"],
  ]) {
    await knex("agency_open_call_links").insert({
      id,
      agency_id: AGENCY_ID,
      code: crypto.randomBytes(12).toString("base64url"),
      label,
      status: "active",
      call_kind: "event_casting",
      identity_policy: "account_optional",
      intake_spec_version: 1,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
  }
}, 180000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

/* ------------------------------------------------------------ normalization */

describe("identity normalization", () => {
  test("lowercases, trims and strips a plus tag — the identity-collapsing choice", () => {
    expect(normalizeIdentityEmail("  Nia.Okonkwo@Example.COM ")).toBe(
      "nia.okonkwo@example.com",
    );
    // Two editions, two plus tags, one human — this is §3.2's cross-edition
    // dedup and the reason plus-stripping is deliberate.
    expect(normalizeIdentityEmail("nia+brooklyn@example.com")).toBe(
      "nia@example.com",
    );
    expect(normalizeIdentityEmail("nia+queens@example.com")).toBe(
      "nia@example.com",
    );
  });

  test("refuses anything that is not shaped like an address", () => {
    for (const bad of [
      null,
      undefined,
      42,
      "",
      "   ",
      "nia",
      "nia@",
      "@example.com",
      "nia@example",
      "nia okonkwo@example.com",
      "+tag@example.com", // nothing left of the local part after stripping
      `${"a".repeat(250)}@example.com`,
    ]) {
      expect(normalizeIdentityEmail(bad)).toBeNull();
    }
  });

  test("phone is a best-effort signal and refuses to invent a number", () => {
    expect(normalizePhone("(347) 555-0134")).toBe("+13475550134");
    expect(normalizePhone("1-347-555-0134")).toBe("+13475550134");
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
    expect(normalizePhone("00447700900123")).toBe("+447700900123");
    // The literal row from the FWBK response sheet that made phone a signal
    // rather than a key.
    expect(normalizePhone("I don't have a phone num")).toBeNull();
    expect(normalizePhone("555-0134")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  test("legal_name splits on the last token and survives one-word names", () => {
    expect(splitLegalName("Nia Okonkwo")).toEqual({
      firstName: "Nia",
      lastName: "Okonkwo",
    });
    expect(splitLegalName("  Mary  Jane   Watson ")).toEqual({
      firstName: "Mary Jane",
      lastName: "Watson",
    });
    expect(splitLegalName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
    expect(splitLegalName("")).toEqual({ firstName: "", lastName: "" });
  });

  test("answers merge newest-first, per field, non-empty wins", () => {
    const merged = mergeAnswers([
      { answers: JSON.stringify({ city: "Queens", instagram: "" }) },
      { answers: JSON.stringify({ city: "Brooklyn", instagram: "@nia" }) },
    ]);
    expect(merged.city).toBe("Queens");
    // The older application keeps the field the newer one left blank.
    expect(merged.instagram).toBe("@nia");
  });

  test("projection maps the closed vocabulary only", () => {
    const projected = projectProfileFields({
      legal_name: "Nia Okonkwo",
      city: "Queens",
      gender: "female",
      height: "178",
      phone: "(347) 555-0134",
      instagram: "@nia",
      favourite_colour: "gold", // not in the vocabulary
    });
    expect(projected.firstName).toBe("Nia");
    expect(projected.heightCm).toBe(178);
    expect(projected.city).toBe("Queens");
    expect(projected.dateOfBirth).toBeNull();
    expect(projected.favourite_colour).toBeUndefined();
  });
});

/* ------------------------------------------------------- ensureIdentity race */

describe("ensureIdentityForEmail", () => {
  test("creates once, then returns the same row for every plus-tag variant", async () => {
    const first = await ensureIdentityForEmail(knex, {
      email: "Race@Example.com",
      phone: "(347) 555-0100",
    });
    expect(first.created).toBe(true);
    expect(first.identity.email_normalized).toBe("race@example.com");
    expect(first.identity.phone_normalized).toBe("+13475550100");

    const second = await ensureIdentityForEmail(knex, {
      email: "race+queens@example.com",
    });
    expect(second.created).toBe(false);
    expect(second.identity.id).toBe(first.identity.id);
  });

  test("concurrent first submissions of the same address settle on one identity", async () => {
    const email = `concurrent-${uuidv4()}@example.com`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => ensureIdentityForEmail(knex, { email })),
    );
    const ids = new Set(results.map((r) => r.identity.id));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.created).length).toBeGreaterThanOrEqual(1);
    const rows = await knex("applicant_identities").where({
      email_normalized: email,
    });
    expect(rows).toHaveLength(1);
  });

  test("backfills a phone that was previously unparseable, never overwrites one", async () => {
    const email = `phone-${uuidv4()}@example.com`;
    await ensureIdentityForEmail(knex, { email, phone: "no phone" });
    const backfilled = await ensureIdentityForEmail(knex, {
      email,
      phone: "347-555-0177",
    });
    expect(backfilled.identity.phone_normalized).toBe("+13475550177");

    const later = await ensureIdentityForEmail(knex, {
      email,
      phone: "+447700900999",
    });
    expect(later.identity.phone_normalized).toBe("+13475550177");
  });

  test("never un-disowns; the flag is reported so the caller decides", async () => {
    const email = `disowned-${uuidv4()}@example.com`;
    const { identity } = await ensureIdentityForEmail(knex, { email });
    await disownIdentity(knex, { identityId: identity.id });

    const again = await ensureIdentityForEmail(knex, { email });
    expect(again.disowned).toBe(true);
    expect(again.identity.disowned_at).toBeTruthy();
  });

  test("an invalid address is a coded refusal, not a row", async () => {
    await expect(
      ensureIdentityForEmail(knex, { email: "not-an-email" }),
    ).rejects.toMatchObject({ code: "IDENTITY_EMAIL_INVALID" });
  });

  test("findIdentityByEmail normalizes its own input", async () => {
    const email = `lookup-${uuidv4()}@example.com`;
    const { identity } = await ensureIdentityForEmail(knex, { email });
    const found = await findIdentityByEmail(knex, email.toUpperCase());
    expect(found.id).toBe(identity.id);
    expect(await findIdentityByEmail(knex, "nope")).toBeNull();
  });
});

/* -------------------------------------------------------------- claim tokens */

describe("claim tokens", () => {
  let identityId;

  beforeAll(async () => {
    const { identity } = await ensureIdentityForEmail(knex, {
      email: `tokens-${uuidv4()}@example.com`,
    });
    identityId = identity.id;
  });

  test("only the hash is persisted, and the URL carries the raw value", async () => {
    const minted = await mintClaimToken(knex, {
      identityId,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });
    expect(minted.url).toContain(`/opencall/claim/${minted.rawToken}`);
    expect(minted.tokenHash).toBe(hashToken(minted.rawToken));

    const row = await knex("applicant_claim_tokens")
      .where({ id: minted.tokenId })
      .first();
    expect(row.token_hash).toBe(minted.tokenHash);
    // The raw token appears in no column.
    expect(Object.values(row).join("|")).not.toContain(minted.rawToken);
  });

  test("purposes route to their own paths and their own TTLs", async () => {
    const disown = await mintClaimToken(knex, {
      identityId,
      purpose: CLAIM_TOKEN_PURPOSES.DISOWN,
    });
    const materials = await mintClaimToken(knex, {
      identityId,
      purpose: CLAIM_TOKEN_PURPOSES.MATERIALS,
    });
    expect(disown.url).toContain("/opencall/disown/");
    expect(materials.url).toContain("/opencall/materials/");
    expect(CLAIM_TOKEN_TTL_DAYS.claim).toBe(30);
    expect(CLAIM_TOKEN_TTL_DAYS.disown).toBe(30);
    expect(CLAIM_TOKEN_TTL_DAYS.materials).toBe(14);
  });

  test("an unknown purpose is refused at mint", async () => {
    await expect(
      mintClaimToken(knex, { identityId, purpose: "session" }),
    ).rejects.toMatchObject({ code: "CLAIM_TOKEN_PURPOSE_INVALID" });
  });

  test("purposes are isolated — a disown token is not a claim token", async () => {
    const disown = await mintClaimToken(knex, {
      identityId,
      purpose: CLAIM_TOKEN_PURPOSES.DISOWN,
    });
    expect(
      await validateClaimToken(knex, disown.rawToken, CLAIM_TOKEN_PURPOSES.CLAIM),
    ).toBeNull();
    expect(
      await validateClaimToken(knex, disown.rawToken, CLAIM_TOKEN_PURPOSES.DISOWN),
    ).not.toBeNull();
  });

  test("single use is enforced at consume, and a second consume is a coded conflict", async () => {
    const minted = await mintClaimToken(knex, {
      identityId,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });
    await knex.transaction((trx) => consumeClaimToken(trx, minted.tokenId));
    expect(
      await validateClaimToken(knex, minted.rawToken, CLAIM_TOKEN_PURPOSES.CLAIM),
    ).toBeNull();

    await expect(
      knex.transaction((trx) => consumeClaimToken(trx, minted.tokenId)),
    ).rejects.toMatchObject({ code: "CLAIM_TOKEN_CONFLICT" });
  });

  test("re-minting revokes nothing — several links may be live at once", async () => {
    const a = await mintClaimToken(knex, {
      identityId,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });
    const b = await mintClaimToken(knex, {
      identityId,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });
    expect(
      await validateClaimToken(knex, a.rawToken, CLAIM_TOKEN_PURPOSES.CLAIM),
    ).not.toBeNull();
    expect(
      await validateClaimToken(knex, b.rawToken, CLAIM_TOKEN_PURPOSES.CLAIM),
    ).not.toBeNull();
  });

  test("expiry fails closed, including on an unparsable timestamp", async () => {
    const expired = await mintClaimToken(knex, {
      identityId,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });
    await knex("applicant_claim_tokens")
      .where({ id: expired.tokenId })
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect(
      await validateClaimToken(knex, expired.rawToken, CLAIM_TOKEN_PURPOSES.CLAIM),
    ).toBeNull();

    const garbage = await mintClaimToken(knex, {
      identityId,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });
    await knex("applicant_claim_tokens")
      .where({ id: garbage.tokenId })
      .update({ expires_at: "not a date" });
    // An unparsable expiry must not be read as "no expiry".
    expect(
      await validateClaimToken(knex, garbage.rawToken, CLAIM_TOKEN_PURPOSES.CLAIM),
    ).toBeNull();
  });

  test("unknown, malformed and empty tokens all answer identically: null", async () => {
    for (const bad of [
      null,
      undefined,
      "",
      "   ",
      crypto.randomBytes(32).toString("base64url"),
      "../../etc/passwd",
    ]) {
      expect(
        await validateClaimToken(knex, bad, CLAIM_TOKEN_PURPOSES.CLAIM),
      ).toBeNull();
    }
  });
});

/* --------------------------------------------------------- the claim, in full */

describe("claimIdentity — the receipt becomes an account", () => {
  let identityId;
  let applicationId;
  let email;
  let result;

  beforeAll(async () => {
    email = `claim-${uuidv4()}@example.com`;
    const { identity } = await ensureIdentityForEmail(knex, {
      email,
      phone: "347-555-0161",
    });
    identityId = identity.id;

    // Two editions under one identity — two links, because the partial unique
    // is (link, identity) and applying to Brooklyn is not applying to Queens.
    // Brooklyn first, Queens second: the newest non-empty answer wins per
    // field, so Queens' city and height win and Brooklyn's Instagram survives.
    await insertSubmission({
      identityId,
      linkId: BROOKLYN_LINK_ID,
      submittedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
      answers: {
        legal_name: "Nia Okonkwo",
        email,
        city: "Brooklyn",
        gender: "female",
        height: "176",
        instagram: "@niaokonkwo",
        adult_attestation: true,
      },
      media: [
        { fieldKey: "digital_headshot", storageKey: "opencall/brooklyn-head.webp" },
      ],
    });
    await insertSubmission({
      identityId,
      submittedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      answers: {
        legal_name: "Nia Okonkwo",
        email,
        city: "Queens",
        gender: "female",
        height: "178",
        phone: "347-555-0161",
        instagram: "",
        adult_attestation: true,
      },
      media: [
        {
          fieldKey: "digital_full_length",
          storageKey: "opencall/queens-full.webp",
          moderationState: "approved",
        },
      ],
    });

    applicationId = await insertIdentityApplication(identityId);

    result = await claimIdentity(knex, { identityId, termsAccepted: true });
  }, 60000);

  test("creates a talent user with a verified email and no credential", async () => {
    expect(result.created).toBe(true);
    const user = await knex("users").where({ id: result.userId }).first();
    expect(user.role).toBe("TALENT");
    expect(user.email).toBe(email);
    // Ruling Q4: the click IS the verification.
    expect(Boolean(user.email_verified)).toBe(true);
    // The credential is the last thing asked for, not the first (§5.2).
    expect(user.password_hash).toBeFalsy();
    expect(user.firebase_uid).toBeFalsy();
    expect(user.terms_accepted_at).toBeTruthy();
  });

  test("projects the merged answers onto the profile, with a slug", async () => {
    const profile = await knex("profiles").where({ id: result.profileId }).first();
    expect(profile.first_name).toBe("Nia");
    expect(profile.last_name).toBe("Okonkwo");
    // Newest submission wins per field.
    expect(profile.city).toBe("Queens");
    expect(profile.height_cm).toBe(178);
    expect(profile.gender).toBeTruthy();
    expect(profile.phone).toBe("347-555-0161");
    expect(profile.slug).toMatch(/^nia-okonkwo/);
    // The event spec collects no DOB, so onboarding is deliberately unfinished.
    expect(profile.date_of_birth).toBeFalsy();
    expect(profile.onboarding_completed_at).toBeFalsy();
    expect(profile.visibility_mode).toBe("private_intake");
    expect(Boolean(profile.services_locked)).toBe(true);
  });

  test("the casting machine advances only as far as the data honestly reaches", async () => {
    const profile = await knex("profiles").where({ id: result.profileId }).first();
    const state = JSON.parse(profile.onboarding_state_json);
    expect(state.completed_steps).toContain("entry");
    // No date of birth was ever collected, so `birthdate` is where they resume
    // and nothing past it may be marked complete.
    expect(state.current_step).toBe("birthdate");
    expect(state.completed_steps).not.toContain("measurements");
  });

  test("promotes the submission media into images and records the linkage", async () => {
    expect(result.promotedImageCount).toBe(2);
    const images = await knex("images")
      .where({ profile_id: result.profileId })
      .orderBy("sort", "asc");
    expect(images).toHaveLength(2);
    expect(images.map((i) => i.shot_type).sort()).toEqual([
      "full_length",
      "headshot",
    ]);
    expect(images.every((i) => i.image_type === "digital")).toBe(true);
    expect(images.every((i) => i.path)).toBe(true);
    // The moderation state carries over rather than being laundered by the act
    // of claiming.
    const byShot = Object.fromEntries(images.map((i) => [i.shot_type, i]));
    expect(byShot.headshot.moderation_status).toBe("pending");
    expect(byShot.full_length.moderation_status).toBe("approved");

    const media = await knex("open_call_submission_media").select(
      "field_key",
      "promoted_image_id",
    );
    const promoted = media.filter((m) => m.promoted_image_id);
    expect(promoted).toHaveLength(2);
  });

  test("re-points the application, the frozen snapshot and the consent audit row", async () => {
    const application = await knex("applications").where({ id: applicationId }).first();
    expect(application.profile_id).toBe(result.profileId);
    // Provenance is kept: §5.5's dispute surface reads it.
    expect(application.applicant_identity_id).toBe(identityId);

    const pkg = await knex("talent_submission_packages")
      .where({ application_id: applicationId })
      .first();
    expect(pkg.profile_id).toBe(result.profileId);
    expect(pkg.user_id).toBe(result.userId);

    const consent = await knex("application_submission_consent_events")
      .where({ application_id: applicationId })
      .first();
    expect(consent.profile_id).toBe(result.profileId);
    expect(consent.user_id).toBe(result.userId);
  });

  test("stamps the identity as claimed and points it at the profile", async () => {
    const identity = await knex("applicant_identities").where({ id: identityId }).first();
    expect(identity.claimed_at).toBeTruthy();
    expect(identity.profile_id).toBe(result.profileId);
  });

  test("a second claim is idempotent, not an error, and promotes nothing twice", async () => {
    const again = await claimIdentity(knex, { identityId, termsAccepted: true });
    expect(again.alreadyClaimed).toBe(true);
    expect(again.userId).toBe(result.userId);
    expect(again.profileId).toBe(result.profileId);

    const images = await knex("images").where({ profile_id: result.profileId });
    expect(images).toHaveLength(2);
    const users = await knex("users").whereRaw("LOWER(email) = ?", [email]);
    expect(users).toHaveLength(1);
  });

  test("a claimed identity can no longer be disowned by a link", async () => {
    await expect(disownIdentity(knex, { identityId })).rejects.toMatchObject({
      code: "IDENTITY_ALREADY_CLAIMED",
    });
  });

  test("findClaimedProfileForEmail now answers for this address", async () => {
    const found = await findClaimedProfileForEmail(knex, email.toUpperCase());
    expect(found).toMatchObject({
      userId: result.userId,
      profileId: result.profileId,
      role: "TALENT",
    });
  });
});

describe("claimIdentity — refusals and existing accounts", () => {
  test("terms are required before a users row is written", async () => {
    const { identity } = await ensureIdentityForEmail(knex, {
      email: `terms-${uuidv4()}@example.com`,
    });
    await expect(
      claimIdentity(knex, { identityId: identity.id, termsAccepted: false }),
    ).rejects.toMatchObject({ code: "TERMS_REQUIRED" });
    const users = await knex("users").whereRaw("LOWER(email) = ?", [
      identity.email_normalized,
    ]);
    expect(users).toHaveLength(0);
  });

  test("a disowned identity refuses to be claimed", async () => {
    const { identity } = await ensureIdentityForEmail(knex, {
      email: `refuse-${uuidv4()}@example.com`,
    });
    await disownIdentity(knex, { identityId: identity.id });
    await expect(
      claimIdentity(knex, { identityId: identity.id, termsAccepted: true }),
    ).rejects.toMatchObject({ code: "IDENTITY_DISOWNED" });
  });

  test("an existing TALENT profile is attached to, never overwritten or duplicated", async () => {
    const email = `existing-${uuidv4()}@example.com`;
    const userId = uuidv4();
    const profileId = uuidv4();
    await knex("users").insert({
      id: userId,
      email,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
      first_name: "Ada",
      last_name: "Nwosu",
    });
    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `existing-${profileId}`,
      first_name: "Ada",
      last_name: "Nwosu",
      city: "Lagos",
      height_cm: 180,
      bio_raw: "",
      bio_curated: "",
    });

    const { identity } = await ensureIdentityForEmail(knex, { email });
    await insertSubmission({
      identityId: identity.id,
      submittedAt: new Date().toISOString(),
      answers: { legal_name: "Ada Nwosu", email, city: "Queens", height: "175" },
      media: [{ fieldKey: "digital_headshot", storageKey: "opencall/ada.webp" }],
    });
    const applicationId = await insertIdentityApplication(identity.id);

    const attached = await claimIdentity(knex, {
      identityId: identity.id,
      termsAccepted: true,
    });
    expect(attached.alreadyHadAccount).toBe(true);
    expect(attached.created).toBe(false);
    expect(attached.profileCreated).toBe(false);
    expect(attached.userId).toBe(userId);
    expect(attached.profileId).toBe(profileId);

    // The live profile is untouched: no answer typed on a form overwrites a
    // field its owner maintains, and no camera-roll upload is pushed into a
    // curated portfolio (§5.3 row 1 — the organizer reads the frozen snapshot).
    const profile = await knex("profiles").where({ id: profileId }).first();
    expect(profile.city).toBe("Lagos");
    expect(profile.height_cm).toBe(180);
    expect(await knex("images").where({ profile_id: profileId })).toHaveLength(0);

    // But the application is attached, so the organizer's surfaces resolve it.
    const application = await knex("applications").where({ id: applicationId }).first();
    expect(application.profile_id).toBe(profileId);
    const users = await knex("users").whereRaw("LOWER(email) = ?", [email]);
    expect(users).toHaveLength(1);
  });

  test("an AGENCY-role address refuses rather than silently becoming talent", async () => {
    const email = `agency-op-${uuidv4()}@example.com`;
    await knex("users").insert({
      id: uuidv4(),
      email,
      password_hash: "x",
      role: "AGENCY",
      email_verified: true,
    });
    const { identity } = await ensureIdentityForEmail(knex, { email });
    await expect(
      claimIdentity(knex, { identityId: identity.id, termsAccepted: true }),
    ).rejects.toMatchObject({ code: "IDENTITY_EMAIL_IS_AGENCY" });
    const identityAfter = await knex("applicant_identities")
      .where({ id: identity.id })
      .first();
    expect(identityAfter.claimed_at).toBeFalsy();
  });

  test("blocked media is not promoted", async () => {
    const email = `blocked-${uuidv4()}@example.com`;
    const { identity } = await ensureIdentityForEmail(knex, { email });
    await insertSubmission({
      identityId: identity.id,
      submittedAt: new Date().toISOString(),
      answers: { legal_name: "Kofi Mensah", email, city: "Accra", height: "185" },
      media: [
        {
          fieldKey: "digital_headshot",
          storageKey: "opencall/rejected.webp",
          moderationState: "rejected",
        },
      ],
    });
    const claimed = await claimIdentity(knex, {
      identityId: identity.id,
      termsAccepted: true,
    });
    expect(claimed.promotedImageCount).toBe(0);
    expect(await knex("images").where({ profile_id: claimed.profileId })).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------- the disown */

describe("disownIdentity", () => {
  test("sets disowned_at, keeps every foreign key, and is idempotent", async () => {
    const { identity } = await ensureIdentityForEmail(knex, {
      email: `wasnt-me-${uuidv4()}@example.com`,
    });
    const applicationId = await insertIdentityApplication(identity.id);

    const first = await disownIdentity(knex, { identityId: identity.id });
    expect(first.disowned).toBe(true);
    expect(first.alreadyDisowned).toBe(false);

    const second = await disownIdentity(knex, { identityId: identity.id });
    expect(second.alreadyDisowned).toBe(true);

    // The organizer's application does not vanish; §5.5 is explicit that they
    // decide what to do with it, and the CHECK requires a pointer to survive.
    const application = await knex("applications").where({ id: applicationId }).first();
    expect(application.applicant_identity_id).toBe(identity.id);
    expect(application.profile_id).toBeNull();
  });
});

/* ----------------------------------------------------------------- the routes */

describe("routes — /api/public/opencall", () => {
  test("GET /claim/:token previews a first name and counts, and nothing else", async () => {
    const email = `preview-${uuidv4()}@example.com`;
    const { identity } = await ensureIdentityForEmail(knex, { email });
    await insertSubmission({
      identityId: identity.id,
      submittedAt: new Date().toISOString(),
      answers: { legal_name: "Imani Cole", email, city: "Queens", height: "177" },
    });
    const token = await mintClaimToken(knex, {
      identityId: identity.id,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });

    const res = await fromNewClient(
      request(app).get(`/api/public/opencall/claim/${token.rawToken}`),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      valid: true,
      alreadyClaimed: false,
      firstName: "Imani",
      submissionsCount: 1,
    });
    expect(res.body.data.agencyNames).toEqual(["Fashion Week Brooklyn"]);
    // No PII beyond the first name.
    expect(JSON.stringify(res.body)).not.toContain(email);
  });

  test("GET /claim/:token answers unknown, expired and wrong-purpose identically", async () => {
    const unknown = crypto.randomBytes(32).toString("base64url");
    const unknownRes = await fromNewClient(
      request(app).get(`/api/public/opencall/claim/${unknown}`),
    );
    expect(unknownRes.body).toEqual({ success: true, data: { valid: false } });

    const { identity } = await ensureIdentityForEmail(knex, {
      email: `oracle-${uuidv4()}@example.com`,
    });
    const expired = await mintClaimToken(knex, {
      identityId: identity.id,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });
    await knex("applicant_claim_tokens")
      .where({ id: expired.tokenId })
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() });
    const expiredRes = await fromNewClient(
      request(app).get(`/api/public/opencall/claim/${expired.rawToken}`),
    );
    expect(expiredRes.body).toEqual({ success: true, data: { valid: false } });

    const disown = await mintClaimToken(knex, {
      identityId: identity.id,
      purpose: CLAIM_TOKEN_PURPOSES.DISOWN,
    });
    const wrongPurpose = await fromNewClient(
      request(app).get(`/api/public/opencall/claim/${disown.rawToken}`),
    );
    expect(wrongPurpose.body).toEqual({ success: true, data: { valid: false } });
  });

  test("POST /claim/:token claims, opens a session and consumes the token", async () => {
    const email = `route-claim-${uuidv4()}@example.com`;
    const { identity } = await ensureIdentityForEmail(knex, { email });
    await insertSubmission({
      identityId: identity.id,
      submittedAt: new Date().toISOString(),
      answers: {
        legal_name: "Zoë Adeyemi",
        email,
        city: "Queens",
        gender: "female",
        height: "179",
      },
      media: [{ fieldKey: "digital_headshot", storageKey: "opencall/zoe.webp" }],
    });
    const applicationId = await insertIdentityApplication(identity.id);
    const token = await mintClaimToken(knex, {
      identityId: identity.id,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });

    const res = await fromNewClient(
      request(app).post(`/api/public/opencall/claim/${token.rawToken}`),
    ).send({ termsAccepted: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { redirect: "/onboarding", alreadyHadAccount: false },
    });
    // A session cookie was issued — the claim opens a session the way login does.
    expect(String(res.headers["set-cookie"] || "")).toMatch(/connect\.sid|pholio/i);

    const consumed = await knex("applicant_claim_tokens")
      .where({ id: token.tokenId })
      .first();
    expect(consumed.consumed_at).toBeTruthy();

    const application = await knex("applications").where({ id: applicationId }).first();
    expect(application.profile_id).toBeTruthy();

    // Design §8 item 7 / critique C2: the funnel has to instrument the steps
    // that happen AFTER submit, or the next revision of the design is written
    // from guesses again. The write is fire-and-forget, hence the short wait.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const funnel = await knex("event_casting_funnel_events")
      .where({ event_type: "claimed", open_call_link_id: LINK_ID })
      .first();
    expect(funnel).toBeTruthy();
    expect(funnel.agency_id).toBe(AGENCY_ID);
  });

  test("POST /claim/:token without terms is a coded 400 and writes nothing", async () => {
    const email = `route-terms-${uuidv4()}@example.com`;
    const { identity } = await ensureIdentityForEmail(knex, { email });
    const token = await mintClaimToken(knex, {
      identityId: identity.id,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });
    const res = await fromNewClient(
      request(app).post(`/api/public/opencall/claim/${token.rawToken}`),
    ).send({ termsAccepted: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("TERMS_REQUIRED");
    const still = await knex("applicant_claim_tokens")
      .where({ id: token.tokenId })
      .first();
    expect(still.consumed_at).toBeFalsy();
  });

  test("a second click on a spent claim link sends them to sign in, not a dead end", async () => {
    const email = `double-click-${uuidv4()}@example.com`;
    const { identity } = await ensureIdentityForEmail(knex, { email });
    await insertSubmission({
      identityId: identity.id,
      submittedAt: new Date().toISOString(),
      answers: { legal_name: "Ravi Patel", email, city: "Queens", height: "183" },
    });
    const token = await mintClaimToken(knex, {
      identityId: identity.id,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });

    const first = await fromNewClient(
      request(app).post(`/api/public/opencall/claim/${token.rawToken}`),
    ).send({ termsAccepted: true });
    expect(first.body.data.redirect).toBe("/onboarding");

    const second = await fromNewClient(
      request(app).post(`/api/public/opencall/claim/${token.rawToken}`),
    ).send({ termsAccepted: true });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({
      success: true,
      data: { redirect: "/login", alreadyClaimed: true },
    });
  });

  test("a fresh claim token on an already-claimed identity previews alreadyClaimed", async () => {
    const email = `re-mint-${uuidv4()}@example.com`;
    const { identity } = await ensureIdentityForEmail(knex, { email });
    await insertSubmission({
      identityId: identity.id,
      submittedAt: new Date().toISOString(),
      answers: { legal_name: "Lena Fischer", email, city: "Queens", height: "174" },
    });
    await claimIdentity(knex, { identityId: identity.id, termsAccepted: true });

    const fresh = await mintClaimToken(knex, {
      identityId: identity.id,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });
    const preview = await fromNewClient(
      request(app).get(`/api/public/opencall/claim/${fresh.rawToken}`),
    );
    expect(preview.body.data).toMatchObject({ valid: true, alreadyClaimed: true });

    const posted = await fromNewClient(
      request(app).post(`/api/public/opencall/claim/${fresh.rawToken}`),
    ).send({ termsAccepted: true });
    expect(posted.body).toEqual({
      success: true,
      data: { redirect: "/login", alreadyClaimed: true },
    });
  });

  test("POST /disown/:token records the dispute and consumes the token", async () => {
    const email = `route-disown-${uuidv4()}@example.com`;
    const { identity } = await ensureIdentityForEmail(knex, { email });
    const applicationId = await insertIdentityApplication(identity.id);
    const token = await mintClaimToken(knex, {
      identityId: identity.id,
      purpose: CLAIM_TOKEN_PURPOSES.DISOWN,
    });

    const res = await fromNewClient(
      request(app).post(`/api/public/opencall/disown/${token.rawToken}`),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { valid: true, disowned: true },
    });

    const row = await knex("applicant_identities").where({ id: identity.id }).first();
    expect(row.disowned_at).toBeTruthy();
    const application = await knex("applications").where({ id: applicationId }).first();
    expect(application.applicant_identity_id).toBe(identity.id);

    const consumed = await knex("applicant_claim_tokens")
      .where({ id: token.tokenId })
      .first();
    expect(consumed.consumed_at).toBeTruthy();

    // A second click on the spent link is the same no-oracle shape as any other
    // unusable token.
    const again = await fromNewClient(
      request(app).post(`/api/public/opencall/disown/${token.rawToken}`),
    );
    expect(again.body).toEqual({ success: true, data: { valid: false } });
  });

  test("POST /disown/:token with a claim-purpose token is refused as invalid", async () => {
    const { identity } = await ensureIdentityForEmail(knex, {
      email: `disown-purpose-${uuidv4()}@example.com`,
    });
    const claim = await mintClaimToken(knex, {
      identityId: identity.id,
      purpose: CLAIM_TOKEN_PURPOSES.CLAIM,
    });
    const res = await fromNewClient(
      request(app).post(`/api/public/opencall/disown/${claim.rawToken}`),
    );
    expect(res.body).toEqual({ success: true, data: { valid: false } });
  });
});

/* --------------------------------------------------------- the receipt email */

describe("the receipt email — one message, two jobs (§5.2)", () => {
  const {
    OPEN_CALL_RECEIPT_SUBJECT,
    buildOpenCallReceiptHtml,
    openCallReceiptText,
  } = require("../../src/shared/lib/pholio-email/templates-opencall");

  const payload = {
    agencyName: "Fashion Week Brooklyn",
    eventName: "FWBK Queens",
    eventDatesLabel: "October 4–10",
    claimUrl: "https://app.pholio.studio/opencall/claim/RAW-CLAIM",
    disownUrl: "https://app.pholio.studio/opencall/disown/RAW-DISOWN",
    firstName: "Nia",
  };

  test("carries the confirmation, the claim CTA and the disown link together", () => {
    expect(OPEN_CALL_RECEIPT_SUBJECT).toBe("Your application is in.");
    const html = buildOpenCallReceiptHtml(payload);
    expect(html).toContain("Your application is in.");
    expect(html).toContain("Fashion Week Brooklyn has your submission");
    expect(html).toContain(payload.claimUrl);
    // §5.5 is a requirement, not a nicety: it must not be dropped to tidy the
    // layout.
    expect(html).toContain(payload.disownUrl);
    expect(html).toContain("That wasn&#39;t me");

    const text = openCallReceiptText(payload);
    expect(text).toContain(payload.claimUrl);
    expect(text).toContain(payload.disownUrl);
  });

  test("an existing account gets a sign-in CTA instead of a claim CTA (§5.3 row 1)", () => {
    const html = buildOpenCallReceiptHtml({ ...payload, alreadyHadAccount: true });
    expect(html).toContain("Sign in to see it");
    expect(html).not.toContain(payload.claimUrl);
    // The disown link survives the branch — a receipt for something you did not
    // do is exactly as possible on this path as on the other.
    expect(html).toContain(payload.disownUrl);
  });

  test("degrades cleanly when a call carries no event name or dates", () => {
    const html = buildOpenCallReceiptHtml({
      agencyName: "Storm Management",
      claimUrl: "https://app.pholio.studio/opencall/claim/X",
      disownUrl: "https://app.pholio.studio/opencall/disown/Y",
    });
    expect(html).toContain("Storm Management has your submission.");
    expect(html).not.toContain("undefined");
  });
});
