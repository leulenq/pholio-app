"use strict";

/**
 * Public claim / disown endpoints for the anonymous open-call applicant
 * (`docs/open-call-applicant-flow-design-2026-08.md` §5.2, §5.5).
 *
 * Mounted at `/api/public/opencall`. Every caller here is anonymous by
 * definition — the credential is the raw token in the URL, delivered to a
 * mailbox — so four postures apply throughout:
 *
 * 1. **No oracles.** Unknown, expired, consumed and wrong-purpose tokens are
 *    answered identically, in the `{success:true, data:{valid:false}}` shape the
 *    existing `/api/public/open-call/:code` handlers use. A 404 for one and a
 *    200 for another is itself an answer.
 * 2. **No dead ends.** A magic link gets clicked twice — by the human, by a mail
 *    client's link previewer, by a corporate scanner. A second click on a spent
 *    claim link says "you're already set up, sign in", never "invalid link".
 * 3. **Deploy-before-migrate.** Every handler is guarded by
 *    `hasApplicantIdentitySchema`, mirroring `hasOpenCallSchema` in
 *    `src/routes/api/public.js`: no schema, no-op JSON, never a 500.
 * 4. **No same-origin requirement.** These endpoints are deliberately NOT added
 *    to `PROTECTED_API_PREFIXES` in
 *    `src/shared/middleware/same-origin-mutation.js`, matching the posture of
 *    `POST /api/public/open-call/:code/arrival` today. The request originates
 *    from a click in a mail client, which sends no useful Origin and cannot set
 *    a custom header; requiring one would make every emailed link inert. What
 *    stands in for CSRF protection is that the mutation is authorized by an
 *    unguessable single-use token in the path, not by the caller's cookie —
 *    there is no ambient authority for a third-party page to borrow. `POST
 *    /claim/:token` does open a session, and it is rate-limited via `authLimiter`
 *    on this prefix in `src/app.js` alongside `/api/public/open-call`.
 */

const express = require("express");

const knex = require("../../../shared/db/knex");
const {
  hasApplicantIdentitySchema,
} = require("../services/schema");
const {
  CLAIM_TOKEN_PURPOSES,
  findClaimTokenByRawToken,
  isExpired,
  validateClaimToken,
} = require("../services/claim-tokens");
const { claimIdentity, disownIdentity } = require("../services/claim");
const { splitLegalName } = require("../services/claim");
const {
  FUNNEL_EVENT_TYPES,
} = require("../../../shared/constants/event-casting");
const {
  anonIdFromRequest,
  recordEventFunnelEvent,
} = require("../../../shared/services/event-funnel");
const { stampSessionDevice } = require("../../../shared/lib/session-device");
const { registerSession } = require("../../../shared/lib/session-registry");

const router = express.Router();

/** The one shape an unusable token ever produces. */
const INVALID = { success: true, data: { valid: false } };

/**
 * Where a freshly claimed applicant lands.
 *
 * `/onboarding` and not `/dashboard/talent`: `onboarding_completed_at` is
 * deliberately still NULL after a claim (§5.2 — the event spec collects no date
 * of birth), so the dashboard gate would bounce them anyway. Sending them
 * straight to the shortened, prefilled remainder is the honest destination.
 */
const CLAIMED_REDIRECT = "/onboarding";

function parseJsonColumn(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Open a talent session, with exactly the fields `POST /login` sets
 * (`src/domains/auth/routes/auth.js`): regenerate first to close the
 * session-fixation gap (SEC-0.7 — `regenerate()` replaces `req.session`, so
 * identity fields must be assigned after it), then the talent field pair, then
 * clear the agency-context fields so a recycled session cannot carry an agency
 * principal into a talent session.
 */
async function openTalentSession(req, userId) {
  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.userId = userId;
  req.session.role = "TALENT";
  delete req.session.memberUserId;
  delete req.session.agencyId;
  delete req.session.agencyMembershipId;
  delete req.session.agencyMembershipRole;
  delete req.session.agencyOnboardingCompletedAt;

  const deviceStamp = stampSessionDevice(req);

  await new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  await registerSession(knex, {
    userId,
    sid: req.sessionID,
    fingerprint: deviceStamp?.fingerprint,
  });
}

/** Fire-and-forget funnel write. Observability never changes behaviour. */
function recordClaimed(req, funnelContext, profileId) {
  if (!funnelContext?.openCallLinkId) return;
  recordEventFunnelEvent({
    openCallLinkId: funnelContext.openCallLinkId,
    agencyId: funnelContext.agencyId || null,
    profileId: profileId || null,
    anonId: anonIdFromRequest(req),
    eventType: FUNNEL_EVENT_TYPES.CLAIMED,
  }).catch(() => {});
}

/**
 * What the claim landing page may show: a first name and counts. No email, no
 * phone, no answers — the page is reachable by anyone holding a forwarded link,
 * and a forwarded link must not become a readable copy of someone's application.
 */
async function buildClaimPreview(identity) {
  const submissions = await knex("open_call_submissions")
    .where({ applicant_identity_id: identity.id, status: "submitted" })
    .orderBy([
      { column: "submitted_at", order: "desc" },
      { column: "created_at", order: "desc" },
    ])
    .select("id", "agency_id", "answers");

  let firstName = "";
  for (const submission of submissions) {
    const answers = parseJsonColumn(submission.answers);
    if (answers.legal_name) {
      firstName = splitLegalName(answers.legal_name).firstName;
      if (firstName) break;
    }
  }

  if (!firstName && identity.profile_id) {
    const profile = await knex("profiles")
      .where({ id: identity.profile_id })
      .first("first_name");
    firstName = profile?.first_name || "";
  }

  const agencyIds = [...new Set(submissions.map((row) => row.agency_id).filter(Boolean))];
  const agencies = agencyIds.length
    ? await knex("agencies").whereIn("id", agencyIds).select("id", "name")
    : [];

  return {
    firstName,
    submissionsCount: submissions.length,
    agencyNames: agencies.map((row) => row.name).filter(Boolean),
  };
}

/**
 * GET /api/public/opencall/claim/:token — the claim landing page's data.
 */
router.get("/claim/:token", async (req, res) => {
  try {
    if (!(await hasApplicantIdentitySchema(knex))) return res.json(INVALID);

    const found = await findClaimTokenByRawToken(
      knex,
      req.params.token,
      CLAIM_TOKEN_PURPOSES.CLAIM,
    );
    if (!found) return res.json(INVALID);

    const alreadyClaimed = Boolean(found.identity.claimed_at);
    const usable =
      !found.token.consumed_at && !isExpired(found.token.expires_at);

    if (!usable) {
      // A spent link on a claimed identity is the double-click case, and the
      // page needs to be able to say "you're already set up" rather than
      // "invalid link". A spent link on an *unclaimed* identity is
      // indistinguishable from a link that never existed.
      return res.json({
        success: true,
        data: alreadyClaimed
          ? { valid: false, alreadyClaimed: true }
          : { valid: false },
      });
    }

    if (found.identity.disowned_at) {
      // Reported as not this person's address. The link stops working, and it
      // says nothing about what the application contained.
      return res.json(INVALID);
    }

    const preview = await buildClaimPreview(found.identity);
    return res.json({
      success: true,
      data: { valid: true, alreadyClaimed, ...preview },
    });
  } catch (error) {
    console.error("[OpenCall] GET /claim/:token failed:", error.message);
    return res
      .status(500)
      .json({ success: false, error: "Failed to load this link" });
  }
});

/**
 * POST /api/public/opencall/claim/:token — the claim itself (§5.2).
 * Body: { termsAccepted: boolean }
 */
router.post("/claim/:token", async (req, res) => {
  try {
    if (!(await hasApplicantIdentitySchema(knex))) return res.json(INVALID);

    const valid = await validateClaimToken(
      knex,
      req.params.token,
      CLAIM_TOKEN_PURPOSES.CLAIM,
    );

    if (!valid) {
      // Second click on a spent link whose identity is already claimed: send
      // them to sign in rather than to a dead end.
      const found = await findClaimTokenByRawToken(
        knex,
        req.params.token,
        CLAIM_TOKEN_PURPOSES.CLAIM,
      );
      if (found?.identity?.claimed_at) {
        return res.json({
          success: true,
          data: { redirect: "/login", alreadyClaimed: true },
        });
      }
      return res.json(INVALID);
    }

    const result = await claimIdentity(knex, {
      identityId: valid.identity.id,
      termsAccepted: req.body?.termsAccepted === true,
      tokenId: valid.token.id,
      req,
    });

    if (result.alreadyClaimed) {
      return res.json({
        success: true,
        data: { redirect: "/login", alreadyClaimed: true },
      });
    }

    recordClaimed(req, result.funnelContext, result.profileId);

    if (result.userId) {
      await openTalentSession(req, result.userId);
    }

    return res.json({
      success: true,
      data: {
        redirect: CLAIMED_REDIRECT,
        alreadyHadAccount: result.alreadyHadAccount,
      },
    });
  } catch (error) {
    switch (error.code) {
      case "TERMS_REQUIRED":
        return res.status(400).json({
          success: false,
          error: "TERMS_REQUIRED",
          message: "You must accept the Terms of Service to keep this profile.",
        });
      case "IDENTITY_DISOWNED":
        // The person who owns the mailbox said this was not them. Do not
        // explain further and do not offer a way around it.
        return res.json(INVALID);
      case "IDENTITY_EMAIL_IS_AGENCY":
        return res.status(409).json({
          success: false,
          error: "IDENTITY_EMAIL_IS_AGENCY",
          message:
            "This address belongs to an agency workspace. Contact support@pholio.studio and we'll sort it out.",
        });
      case "CLAIM_TOKEN_CONFLICT":
        return res.json({
          success: true,
          data: { redirect: "/login", alreadyClaimed: true },
        });
      case "IDENTITY_NOT_FOUND":
        return res.json(INVALID);
      default:
        console.error("[OpenCall] POST /claim/:token failed:", error.message);
        return res
          .status(500)
          .json({ success: false, error: "Failed to set up your profile" });
    }
  }
});

/**
 * POST /api/public/opencall/disown/:token — "that wasn't me" (§5.5).
 *
 * Sets `disowned_at`. It never deletes the organizer's application — the
 * organizer decides what to do with it — and it reveals nothing about the
 * submission's contents beyond the call it went to.
 */
router.post("/disown/:token", async (req, res) => {
  try {
    if (!(await hasApplicantIdentitySchema(knex))) return res.json(INVALID);

    const valid = await validateClaimToken(
      knex,
      req.params.token,
      CLAIM_TOKEN_PURPOSES.DISOWN,
    );
    if (!valid) return res.json(INVALID);

    const result = await disownIdentity(knex, {
      identityId: valid.identity.id,
      tokenId: valid.token.id,
    });

    return res.json({
      success: true,
      data: { valid: true, disowned: result.disowned },
    });
  } catch (error) {
    if (error.code === "IDENTITY_ALREADY_CLAIMED") {
      // Not an oracle: the caller already holds a token minted for this
      // identity. A claimed account is un-done through support, not a link.
      return res.status(409).json({
        success: false,
        error: "IDENTITY_ALREADY_CLAIMED",
        message:
          "This profile has already been set up. Email support@pholio.studio and we'll help.",
      });
    }
    if (error.code === "IDENTITY_NOT_FOUND") return res.json(INVALID);
    console.error("[OpenCall] POST /disown/:token failed:", error.message);
    return res
      .status(500)
      .json({ success: false, error: "Failed to record that" });
  }
});

module.exports = router;
