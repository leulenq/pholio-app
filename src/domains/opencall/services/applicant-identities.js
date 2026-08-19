"use strict";

/**
 * `applicant_identities` — "this human, as asserted by an application"
 * (`docs/open-call-applicant-flow-design-2026-08.md` §3.2, §3.3).
 *
 * State 2 of the identity ladder — *submitted, unclaimed* — needs a key that a
 * pre-account application can carry. That key is a normalized email address and
 * nothing else. Everything in this module exists to make that key deterministic,
 * race-safe and honest about what it does and does not prove:
 *
 *  - An identity is an **assertion**, not a verified account. Anyone can type
 *    anyone's address into an open-call form, which is exactly why §5.5's
 *    disown flow is a requirement rather than a nicety.
 *  - `email_normalized` is the only UNIQUE. `phone_normalized` is a duplicate
 *    *signal* surfaced to the organizer as plain text (§5.6) and is never used
 *    to match, merge or dedupe — the FWBK response sheet has "I don't have a
 *    phone num" sitting in a phone column, and a key a typo can collide is
 *    worse than no key at all.
 *
 * Nothing here writes to `users` or `profiles`. That only happens at claim
 * (see ./claim.js), and only because someone clicked a link in their own inbox.
 */

const { v4: uuidv4 } = require("uuid");

const IDENTITIES_TABLE = "applicant_identities";

/** RFC-ish shape check only. Deliverability is proven by the claim click. */
const EMAIL_SHAPE = /^[^\s@,;:<>"()[\]\\]+@[^\s@.,;:<>"()[\]\\]+(\.[^\s@.,;:<>"()[\]\\]+)+$/;
const EMAIL_MAX_LENGTH = 254; // matches the column width

/**
 * Lowercase, trim, and strip a `+tag` suffix from the local part.
 *
 * THE PLUS-STRIPPING IS AN IDENTITY-COLLAPSING CHOICE, made deliberately per
 * design §3.3 ("lowercased, plus-stripped; the identity key"). `a+queens@x.com`
 * and `a+brooklyn@x.com` become one identity, which is the point: §3.2's
 * cross-edition dedup is the thing Forms + Sheets structurally cannot do, and a
 * plus-tag is the single most common way one person's two applications look
 * like two people. The cost is real and bounded: a mail provider where `+` is a
 * *significant* character in the local part (RFC 5321 permits it) would have
 * two distinct humans collapsed into one identity — and because a claim link is
 * delivered to the address as typed on the form, that claim would still only
 * ever reach a mailbox the applicant controls. We take the dedup.
 *
 * @param {unknown} email
 * @returns {string|null} normalized address, or null if the shape is not an email.
 */
function normalizeIdentityEmail(email) {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || trimmed.length > EMAIL_MAX_LENGTH) return null;
  if (!EMAIL_SHAPE.test(trimmed)) return null;

  const at = trimmed.lastIndexOf("@");
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const plus = local.indexOf("+");
  const bareLocal = plus === -1 ? local : local.slice(0, plus);
  if (!bareLocal) return null;

  return `${bareLocal}@${domain}`;
}

/**
 * The address exactly as typed, lowercased — no plus-stripping.
 *
 * Needed because `users.email` holds what the person registered with, which may
 * well carry a plus tag. Matching an identity against existing accounts has to
 * try both forms or an existing Pholio user who signed up as `a+pholio@x.com`
 * would silently get a second account at claim.
 *
 * @param {unknown} email
 * @returns {string|null}
 */
function normalizeEmailAsTyped(email) {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || trimmed.length > EMAIL_MAX_LENGTH) return null;
  return EMAIL_SHAPE.test(trimmed) ? trimmed : null;
}

/**
 * Best-effort E.164. A SIGNAL ONLY, NEVER A KEY — design §5.6: a phone match
 * is surfaced to the organizer as plain inline text ("possible duplicate of an
 * earlier submission") and never triggers an automatic merge, because merging
 * two humans because a phone number matched leaks one person's data to another.
 *
 * Unparseable input returns null rather than a mangled string: a stored value
 * that is not a phone number is a false duplicate signal, which is worse for
 * the organizer than no signal.
 *
 * @param {unknown} phone
 * @returns {string|null} `+` followed by 8–15 digits, or null.
 */
function normalizePhone(phone) {
  if (typeof phone !== "string" && typeof phone !== "number") return null;
  const raw = String(phone).trim();
  if (!raw) return null;

  const hadPlus = raw.startsWith("+") || raw.startsWith("00");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (hadPlus) {
    // "00" is the ITU international prefix; treat it as "+".
    const body = raw.startsWith("00") ? digits.replace(/^00/, "") : digits;
    return body.length >= 8 && body.length <= 15 ? `+${body}` : null;
  }
  // NANP shapes, because the launch partner's pool is US. Everything else needs
  // a country code the applicant did not give us, and guessing one would invent
  // a number.
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function normalizeIdRow(row) {
  return row || null;
}

/**
 * The identity for a normalized address, or null.
 *
 * @param {import('knex')} db
 * @param {string} email raw or normalized — normalized here either way.
 */
async function findIdentityByEmail(db, email) {
  const normalized = normalizeIdentityEmail(email);
  if (!normalized) return null;
  const row = await db(IDENTITIES_TABLE)
    .where({ email_normalized: normalized })
    .first();
  return normalizeIdRow(row);
}

/**
 * Get-or-create the identity for an address.
 *
 * Race-safe on `UNIQUE(email_normalized)` the way `mintClaim` is on its own
 * partial unique (`src/domains/talent/services/open-call-claims.js`): catch the
 * driver's constraint code and re-read, because two applicants submitting the
 * same address in the same second is an ordinary event on a public link.
 *
 * NEVER UN-DISOWNS. A disowned identity (§5.5, "that wasn't me") stays
 * disowned: the person who said the address was not theirs does not get
 * overruled by the next form submission that types it again. The row is
 * returned with `disowned: true` so the caller decides — the submit path is
 * expected to take the application anyway and let the organizer's resolver
 * surface the dispute, exactly as §5.5 requires.
 *
 * @param {import('knex')} db
 * @param {{email: string, phone?: string|null}} input
 * @returns {Promise<{identity: object, created: boolean, disowned: boolean}>}
 */
async function ensureIdentityForEmail(db, { email, phone } = {}) {
  const emailNormalized = normalizeIdentityEmail(email);
  if (!emailNormalized) {
    const error = new Error("A valid email address is required");
    error.code = "IDENTITY_EMAIL_INVALID";
    throw error;
  }
  const phoneNormalized = normalizePhone(phone);

  const existing = await db(IDENTITIES_TABLE)
    .where({ email_normalized: emailNormalized })
    .first();

  if (existing) {
    // Backfill only. A phone we can now parse where we previously had none is
    // new signal; overwriting one the applicant already gave us would let the
    // most recent form submission rewrite an earlier applicant's contact
    // details, which on a *disputed* identity is precisely the wrong direction.
    if (phoneNormalized && !existing.phone_normalized) {
      await db(IDENTITIES_TABLE)
        .where({ id: existing.id })
        .update({ phone_normalized: phoneNormalized, updated_at: db.fn.now() });
      existing.phone_normalized = phoneNormalized;
    }
    return {
      identity: existing,
      created: false,
      disowned: Boolean(existing.disowned_at),
    };
  }

  const id = uuidv4();
  try {
    await db(IDENTITIES_TABLE).insert({
      id,
      email_normalized: emailNormalized,
      phone_normalized: phoneNormalized,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT" || error.code === "23505") {
      const raced = await db(IDENTITIES_TABLE)
        .where({ email_normalized: emailNormalized })
        .first();
      if (raced) {
        return {
          identity: raced,
          created: false,
          disowned: Boolean(raced.disowned_at),
        };
      }
    }
    throw error;
  }

  const identity = await db(IDENTITIES_TABLE).where({ id }).first();
  return { identity, created: true, disowned: false };
}

/**
 * Does this address already belong to a Pholio talent profile?
 *
 * This is design §5.3 row 1 — "email has a claimed Pholio account → the
 * application attaches to that identity → that profile. Not a duplicate." Two
 * ways an address can already be spoken for, and both answer in one shape:
 *
 *  1. A `users` row with that email that has a talent `profiles` row.
 *  2. An identity already claimed onto a profile.
 *
 * THE CALLER MUST NOT TELL THE APPLICANT. Answering "does this email have a
 * Pholio account?" to an anonymous visitor is an account-existence oracle
 * (§5.3): the flow never branches visibly, it branches inside the email, which
 * requires control of the mailbox.
 *
 * @param {import('knex')} db
 * @param {string} email
 * @returns {Promise<{userId: string, profileId: string|null, role: string, source: 'user'|'identity'}|null>}
 */
async function findClaimedProfileForEmail(db, email) {
  const normalized = normalizeIdentityEmail(email);
  const asTyped = normalizeEmailAsTyped(email);
  const candidates = [normalized, asTyped].filter(Boolean);
  if (!candidates.length) return null;

  const user = await db("users")
    .whereRaw(
      `LOWER(email) IN (${candidates.map(() => "?").join(", ")})`,
      candidates,
    )
    .first("id", "role", "email");

  if (user) {
    const profile = await db("profiles")
      .where({ user_id: user.id })
      .first("id");
    return {
      userId: user.id,
      profileId: profile?.id || null,
      role: String(user.role || "").toUpperCase(),
      source: "user",
    };
  }

  if (!normalized) return null;
  const identity = await db(IDENTITIES_TABLE)
    .where({ email_normalized: normalized })
    .whereNotNull("claimed_at")
    .whereNotNull("profile_id")
    .first("profile_id");
  if (!identity) return null;

  const profile = await db("profiles")
    .where({ id: identity.profile_id })
    .first("id", "user_id");
  if (!profile) return null;

  return {
    userId: profile.user_id,
    profileId: profile.id,
    role: "TALENT",
    source: "identity",
  };
}

module.exports = {
  IDENTITIES_TABLE,
  ensureIdentityForEmail,
  findClaimedProfileForEmail,
  findIdentityByEmail,
  normalizeEmailAsTyped,
  normalizeIdentityEmail,
  normalizePhone,
};
