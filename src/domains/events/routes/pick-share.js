"use strict";

/**
 * Designer pick-list share surface (design §(d) and §(f)).
 *
 * Three public, token-authenticated endpoints and nothing else:
 *
 *   GET  /api/picks/:token                              read the list
 *   PUT  /api/picks/:token/selections/:applicationId    mark / note / clear
 *   POST /api/picks/:token/submit                       "I'm done"
 *
 * There is no login, no session, and no way to become one — a designer is a
 * guest of the organizer, not a Pholio user (ruling R3). Everything about the
 * shape of this file follows from that:
 *
 *  - **One 404 for every failure to resolve a token.** Unknown, malformed,
 *    draft, revoked and expired all take the same branch with the same body.
 *    `validatePickToken` is built to refuse to tell us which it was, so this
 *    route has nothing it could accidentally leak.
 *  - **The frozen snapshot is the only source of applicant data.** Rendering
 *    from live `profiles` would mean a talent editing their profile silently
 *    rewrites what a designer was shown, and would reach columns
 *    `AUDIENCE.EVENT_DESIGNER` does not allow. `loadApplicationSubmissionPackages`
 *    plus `buildEventDesignerDTO` is the whole read path.
 *  - **Minors never appear.** Event calls are 18+ (R8), so
 *    `applyMinorSubmissionFilter` runs with `force: true` — a designer can
 *    never hold the guardian authorization that would make an exception valid,
 *    so there is no configuration under which the filter should be skipped.
 *  - **Writes never touch application status.** A designer's mark is one of N
 *    private opinions; only the organizer's explicit offer moves an
 *    application (design §(c)).
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;
const { v4: uuidv4 } = require("uuid");

const knex = require("../../../shared/db/knex");
const config = require("../../../config");
const {
  PICK_MARK_VALUES,
} = require("../../../shared/constants/event-casting");
const {
  buildEventDesignerDTO,
} = require("../../../shared/lib/audience-dto");
const {
  applyMinorSubmissionFilter,
} = require("../../agency/services/minor-submission-access");
const {
  loadApplicationSubmissionPackages,
} = require("../../agency/services/application-submission-package");
const { hashArrivalIp } = require("../../talent/services/open-call-claims");
const {
  isPickListWritable,
  recordPickListOpen,
  validatePickToken,
} = require("../services/pick-list-tokens");

const router = express.Router();

const NOTE_MAX_LENGTH = 300;
const USER_AGENT_MAX_LENGTH = 512;

/**
 * Ruling R7 sizes a pick list at ≤120 applicants, so a designer working
 * through one issues on the order of a hundred marks in a sitting. The
 * `authLimiter` ceiling (10–15/min) would 429 them mid-list; this is the same
 * idiom at the intake ceiling instead — high enough for a human going fast,
 * low enough that a forwarded link cannot be used to enumerate.
 */
const pickShareLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.isServerless ? 120 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    ipKeyGenerator(
      req.clientIp ||
        req.ip ||
        req.socket?.remoteAddress ||
        "127.0.0.1",
    ),
  validate: { ip: false },
});

/**
 * The one response an unresolvable token ever produces. Deliberately identical
 * for revoked, expired, draft and never-existed so the page cannot be used as
 * an oracle for "was this list real".
 */
function sendNotFound(res) {
  return res.status(404).json({
    success: false,
    error: {
      code: "PICK_LIST_NOT_AVAILABLE",
      message: "This link is no longer available.",
    },
  });
}

async function loadPickContext(req, res, next) {
  try {
    const context = await validatePickToken(req.params.token);
    if (!context) return sendNotFound(res);
    req.pickContext = context;
    return next();
  } catch (error) {
    console.error("[PickShare] Token validation error:", error);
    return res
      .status(500)
      .json({ success: false, error: { code: "PICK_LIST_UNAVAILABLE" } });
  }
}

/** Writes are refused on a list the organizer has closed. */
function requireWritablePickList(req, res, next) {
  if (!isPickListWritable(req.pickContext)) {
    return res.status(409).json({
      success: false,
      error: {
        code: "PICK_LIST_CLOSED",
        message: "This list is closed. Your existing picks were kept.",
      },
    });
  }
  return next();
}

function parsePayload(value) {
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
 * Availability and the walk-video URL are frozen into the submission package
 * alongside everything else at submit time (design §(f): drafts and submit
 * gain `openCallLinkId, availability, walkVideoUrl`), but
 * `loadApplicationSubmissionPackages` shapes a fixed set of keys and drops
 * them. Rather than reach for a live application row — which would break the
 * "frozen snapshot only" rule this whole surface rests on — read them back off
 * the SAME package row the loader resolved.
 *
 * See the deviation note in the lane report: once
 * `application-submission-package.js` carries these two through, this function
 * collapses into reading `pkg.availability` / `pkg.walkVideoUrl`.
 */
async function loadEventExtrasByPackageId(db, packageIds) {
  const extras = new Map();
  const ids = [...new Set(packageIds.filter(Boolean))];
  if (ids.length === 0) return extras;

  const rows = await db("talent_submission_packages")
    .whereIn("id", ids)
    .select("id", "payload");

  for (const row of rows) {
    const payload = parsePayload(row.payload);
    const eventContext =
      payload.eventContext && typeof payload.eventContext === "object"
        ? payload.eventContext
        : {};
    const availability = payload.availability || eventContext.availability;
    const walkVideoUrl = payload.walkVideoUrl || eventContext.walkVideoUrl;
    extras.set(row.id, {
      availability:
        availability && typeof availability === "object" ? availability : null,
      walkVideoUrl: typeof walkVideoUrl === "string" ? walkVideoUrl : null,
    });
  }
  return extras;
}

/**
 * `event_starts_on` / `event_ends_on` are DATE columns: SQLite hands back
 * "YYYY-MM-DD", PostgreSQL hands back a Date at LOCAL midnight. Reading the
 * local parts rather than `toISOString()` is what stops a server east of UTC
 * from reporting the day before the show (the same off-by-one that already
 * bites `date_of_birth` — see CLAUDE.md).
 */
function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

/**
 * The organizer masthead. Everything here is authored by the organizer about
 * their own event — no applicant data crosses into it.
 */
function buildEventMasthead(link) {
  if (!link) return null;
  return {
    organizerName: link.agency_name || "The organizer",
    name: link.event_name || link.label || null,
    startsOn: dateOnly(link.event_starts_on),
    endsOn: dateOnly(link.event_ends_on),
    location: link.event_location || null,
    compensation: link.compensation_type
      ? {
          type: link.compensation_type,
          details: link.compensation_details || null,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// GET /api/picks/:token — the designer's whole world
// ---------------------------------------------------------------------------
router.get(
  "/api/picks/:token",
  pickShareLimiter,
  loadPickContext,
  async (req, res) => {
    try {
      const { pickListId, openCallLinkId, status } = req.pickContext;

      const [pickList, link] = await Promise.all([
        knex("event_pick_lists")
          .where({ id: pickListId })
          .first(
            "id",
            "designer_name",
            "label",
            "organizer_note",
            "slots_requested",
            "status",
            "expires_at",
            "submitted_at",
          ),
        knex("agency_open_call_links as l")
          .leftJoin("agencies as a", "a.id", "l.agency_id")
          .where("l.id", openCallLinkId)
          .first(
            "l.label",
            "l.event_name",
            "l.event_starts_on",
            "l.event_ends_on",
            "l.event_location",
            "l.compensation_type",
            "l.compensation_details",
            "a.name as agency_name",
          ),
      ]);

      if (!pickList) return sendNotFound(res);

      // The slice the organizer handed over, minus anyone the minor filter
      // refuses. Ordered by the organizer's own arrangement.
      const items = await applyMinorSubmissionFilter(
        knex("event_pick_list_items as i")
          .join("applications as a", "a.id", "i.application_id")
          .where("i.pick_list_id", pickListId),
        { alias: "a", allowMinor: false, force: true },
      )
        .orderBy("i.sort", "asc")
        .orderBy("i.created_at", "asc")
        .select("a.id", "a.profile_id", "i.sort");

      const packages = await loadApplicationSubmissionPackages(knex, items);
      const extras = await loadEventExtrasByPackageId(
        knex,
        [...packages.values()].map((pkg) => pkg?.id),
      );

      const selections = await knex("event_pick_selections")
        .where({ pick_list_id: pickListId })
        .select("application_id", "mark", "note", "marked_at");
      const selectionByApplication = new Map(
        selections.map((row) => [row.application_id, row]),
      );

      const applicants = [];
      for (const item of items) {
        const pkg = packages.get(item.id);
        // No package, or a package redacted by a guardian revocation / retention
        // sweep, means there is nothing the applicant consented to show.
        if (!pkg || pkg.redacted || pkg.revoked || !pkg.profile) continue;

        const extra = extras.get(pkg.id) || {};
        const dto = buildEventDesignerDTO(pkg.profile, {
          images: pkg.images,
          availability: extra.availability,
          walkVideoUrl: extra.walkVideoUrl,
          // DEVIATION (see lane report): no full-vs-first-initial setting
          // exists on the link or the list yet, so the design's default —
          // full name — is what ships. Wiring the setting is a one-line
          // change here once the column lands.
          nameDisplay: undefined,
        });

        const selection = selectionByApplication.get(item.id) || null;
        applicants.push({
          applicationId: item.id,
          ...dto,
          selection: selection
            ? {
                mark: selection.mark,
                note: selection.note || null,
                markedAt: selection.marked_at || null,
              }
            : null,
        });
      }

      // Telemetry is not allowed to cost the designer their page.
      await recordPickListOpen(pickListId);

      return res.json({
        success: true,
        data: {
          event: buildEventMasthead(link),
          list: {
            designerName: pickList.designer_name,
            label: pickList.label || null,
            organizerNote: pickList.organizer_note || null,
            slotsRequested: pickList.slots_requested ?? null,
            status,
            readOnly: !isPickListWritable(req.pickContext),
            expiresAt: pickList.expires_at,
            submittedAt: pickList.submitted_at || null,
          },
          applicants,
        },
      });
    } catch (error) {
      console.error("[PickShare] GET list error:", error);
      return res.status(500).json({
        success: false,
        error: { code: "PICK_LIST_LOAD_FAILED", message: "Could not load this list." },
      });
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /api/picks/:token/selections/:applicationId — mark, note, or clear
// ---------------------------------------------------------------------------
router.put(
  "/api/picks/:token/selections/:applicationId",
  pickShareLimiter,
  loadPickContext,
  requireWritablePickList,
  async (req, res) => {
    try {
      const { pickListId } = req.pickContext;
      const { applicationId } = req.params;
      const body = req.body || {};

      // An application the organizer did not put in THIS list is, from the
      // designer's side, indistinguishable from one that does not exist.
      const item = await knex("event_pick_list_items")
        .where({ pick_list_id: pickListId, application_id: applicationId })
        .first("id");
      if (!item) return sendNotFound(res);

      const rawMark = body.mark;
      const clearing =
        rawMark === null || rawMark === undefined || rawMark === "";

      if (clearing) {
        await knex("event_pick_selections")
          .where({ pick_list_id: pickListId, application_id: applicationId })
          .del();
        return res.json({ success: true, data: { applicationId, selection: null } });
      }

      const mark = String(rawMark);
      if (!PICK_MARK_VALUES.includes(mark)) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_PICK_MARK",
            message: `Mark must be one of: ${PICK_MARK_VALUES.join(", ")}.`,
          },
        });
      }

      const rawNote = body.note;
      if (rawNote != null && typeof rawNote !== "string") {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_PICK_NOTE", message: "Note must be text." },
        });
      }
      const note = typeof rawNote === "string" ? rawNote.trim() : "";
      // Reject rather than truncate: silently dropping the end of a designer's
      // fitting note is worse than telling them it is too long.
      if (note.length > NOTE_MAX_LENGTH) {
        return res.status(400).json({
          success: false,
          error: {
            code: "PICK_NOTE_TOO_LONG",
            message: `Notes are limited to ${NOTE_MAX_LENGTH} characters.`,
          },
        });
      }

      const userAgent = req.get("user-agent");
      const patch = {
        mark,
        note: note || null,
        marked_at: knex.fn.now(),
        ip_hash: hashArrivalIp(req.clientIp || req.ip || null),
        user_agent: userAgent
          ? String(userAgent).slice(0, USER_AGENT_MAX_LENGTH)
          : null,
      };

      // UNIQUE(pick_list_id, application_id) makes this a real upsert on both
      // dialects without depending on driver-specific conflict syntax.
      const updated = await knex("event_pick_selections")
        .where({ pick_list_id: pickListId, application_id: applicationId })
        .update(patch);

      if (updated === 0) {
        await knex("event_pick_selections").insert({
          id: uuidv4(),
          pick_list_id: pickListId,
          application_id: applicationId,
          ...patch,
        });
      }

      return res.json({
        success: true,
        data: {
          applicationId,
          selection: { mark, note: note || null },
        },
      });
    } catch (error) {
      console.error("[PickShare] PUT selection error:", error);
      return res.status(500).json({
        success: false,
        error: { code: "PICK_SAVE_FAILED", message: "Could not save that pick." },
      });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/picks/:token/submit — the designer says they are done
// ---------------------------------------------------------------------------
router.post(
  "/api/picks/:token/submit",
  pickShareLimiter,
  loadPickContext,
  requireWritablePickList,
  async (req, res) => {
    try {
      const { pickListId } = req.pickContext;
      const submittedAt = new Date().toISOString();

      // Submitting does not close the list. Closing is the organizer's call
      // (Lane C) — a designer who spots a mistake ten minutes later should be
      // able to fix it rather than email about it.
      await knex("event_pick_lists").where({ id: pickListId }).update({
        submitted_at: submittedAt,
        updated_at: knex.fn.now(),
      });

      const counts = await knex("event_pick_selections")
        .where({ pick_list_id: pickListId })
        .groupBy("mark")
        .select("mark")
        .count({ total: "*" });

      return res.json({
        success: true,
        data: {
          submittedAt,
          counts: counts.reduce((acc, row) => {
            acc[row.mark] = Number(row.total) || 0;
            return acc;
          }, {}),
        },
      });
    } catch (error) {
      console.error("[PickShare] POST submit error:", error);
      return res.status(500).json({
        success: false,
        error: { code: "PICK_SUBMIT_FAILED", message: "Could not send your list." },
      });
    }
  },
);

module.exports = router;
