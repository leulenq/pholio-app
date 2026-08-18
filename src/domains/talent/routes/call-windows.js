// Curated recurring open-call windows ("Muse: Thursdays 3–4 PM ET"), served to
// every talent for free. Data comes from the hand-curated trust-registry pack —
// see docs/talent-trust-loop-design-2026-08.md. Namespaced "call windows" to avoid
// colliding with the agency open-call-link feature.
const express = require("express");
const asyncHandler = require("express-async-handler");

const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");

const router = express.Router();

/**
 * GET /api/talent/call-windows
 *
 * Every live window, ordered the way a week reads. Small, ungated and
 * unpaginated on purpose: this is a hand-curated list measured in tens of rows,
 * and it feeds the Overview card, which must not have to drag the whole
 * preflight payload in to render three lines (design §c).
 *
 * `display_name` is denormalised onto the row, so a window whose organisation
 * is not in the spec pack and is not a Pholio agency still renders. Times are
 * wall-clock minutes plus an IANA zone, handed over unconverted — the client
 * formats them in the window's own timezone, because "Thursdays at 3pm their
 * time" is the fact, and it does not move when daylight saving does.
 */
router.get(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const rows = await knex("agency_call_windows")
      .where({ active: true })
      .orderBy([
        { column: "weekday", order: "asc" },
        { column: "start_minute", order: "asc" },
        { column: "display_name", order: "asc" },
      ])
      .select(
        "id",
        "organization_id",
        "agency_id",
        "display_name",
        "label",
        "weekday",
        "start_minute",
        "end_minute",
        "timezone",
        "location",
        "instructions",
        "source_url",
        "verified_on",
      );

    res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id || null,
        agencyId: row.agency_id || null,
        displayName: row.display_name,
        label: row.label,
        weekday: Number(row.weekday),
        startMinute: row.start_minute === null ? null : Number(row.start_minute),
        endMinute: row.end_minute === null ? null : Number(row.end_minute),
        timezone: row.timezone,
        location: row.location || null,
        instructions: row.instructions || null,
        sourceUrl: row.source_url || null,
        verifiedOn:
          row.verified_on instanceof Date
            ? row.verified_on.toISOString().slice(0, 10)
            : row.verified_on
              ? String(row.verified_on).slice(0, 10)
              : null,
      })),
    });
  }),
);

module.exports = router;
