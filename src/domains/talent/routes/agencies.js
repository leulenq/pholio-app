const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const asyncHandler = require("express-async-handler");
const {
  getBlockedAgencyIds,
} = require("../../../shared/lib/blocked-agencies");
const {
  verificationDto,
} = require("../../spec-registry/preflight-service");
const { DEFAULT_ORG_KIND } = require("../../../shared/constants/event-casting");

// Deploy-before-migrate guard for `agencies.org_kind`, mirroring the one in
// src/domains/agency/routes/open-call.js. On an older schema every organization
// is an agency anyway, so dropping the filter is the correct fallback rather
// than 500-ing the directory for the length of a deploy.
let orgKindSchemaPromise = null;
function hasOrgKindColumn(db) {
  if (!orgKindSchemaPromise) {
    orgKindSchemaPromise = db.schema
      .hasColumn("agencies", "org_kind")
      .catch(() => {
        orgKindSchemaPromise = null;
        return false;
      });
  }
  return orgKindSchemaPromise;
}

/**
 * GET /api/talent/agencies
 * List active agencies for discovery.
 */
router.get(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    // Every vetted agency is visible to every talent, paid or not. Payment
    // may only change what the talent keeps for themselves — never who they
    // can reach.
    // 1. Fetch Agencies as organizations, not login rows
    const blockedAgencyIds = await getBlockedAgencyIds(
      knex,
      req.session.userId,
    );
    const includeBlocked = req.query.includeBlocked === "1";
    const orgKindAvailable = await hasOrgKindColumn(knex);
    // Two filters, two different mistakes they prevent.
    //
    // `status: 'ACTIVE'` keeps reference entries out. The eight real agencies
    // this database used to seed as ACTIVE are now REFERENCE rows
    // (migration 20260815103000, ruling R5): Pholio knows their published
    // requirements but cannot deliver an application to them, and this endpoint
    // feeds the chooser, where every row is a destination the talent can
    // actually pick.
    //
    // `org_kind: 'agency'` keeps event organizers out — the gap flagged in
    // migration 20260815093000. An organizer runs a casting; it does not sign
    // talent, so offering one here would invite a representation application
    // nobody on the other side can answer.
    const agenciesQuery = knex("agencies")
      .where({ status: "ACTIVE" })
      .modify((query) => {
        if (orgKindAvailable) query.where({ org_kind: DEFAULT_ORG_KIND });
      })
      .select(
        "id",
        "name",
        "location as agency_location",
        "website as agency_website",
        "description as agency_description",
        "logo_path as profile_image",
        "open_boards",
        "min_height_female",
        "max_height_female",
        "min_height_male",
        "max_height_male",
        "min_age",
        "max_age",
      )
      // Match scoring is intentionally absent until it is backed by real
      // signals. A stable directory order is more useful than fabricated
      // affinity and prevents the chooser from reshuffling between requests.
      .orderBy("name", "asc")
      .orderBy("id", "asc");
    // Settings may request the complete directory so a stored stable agency ID
    // can be named and removed. The application chooser never offers a blocked
    // organization as a new destination.
    if (!includeBlocked && blockedAgencyIds.size > 0) {
      agenciesQuery.whereNotIn("id", [...blockedAgencyIds]);
    }
    const agencies = await agenciesQuery;

    // Normalize open_boards (JSON text on SQLite, array on PG) to a string[].
    const parseOpenBoards = (value) => {
      if (Array.isArray(value)) return value.filter(Boolean);
      if (typeof value === "string" && value.trim()) {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    // One query for the whole directory, not one per agency. Positive-only
    // (ruling R3): an agency with no curated registry match carries `null`, and
    // the client renders nothing — never "unverified", which would turn the
    // youth of a 75-row register into an accusation.
    const verifications = new Map();
    if (agencies.length && (await knex.schema.hasTable("agency_verifications"))) {
      const rows = await knex("agency_verifications")
        .whereIn(
          "agency_id",
          agencies.map((agency) => agency.id),
        )
        .orderBy([
          { column: "registry_status", order: "asc" },
          { column: "expires_on", order: "desc" },
          { column: "certificate_number", order: "asc" },
        ]);
      // First row per agency wins: 'active' sorts before 'expired'/'revoked',
      // then the registration that runs longest.
      for (const row of rows) {
        if (!verifications.has(row.agency_id)) verifications.set(row.agency_id, row);
      }
    }

    const normalizedAgencies = agencies.map((agency) => ({
      ...agency,
      open_boards: parseOpenBoards(agency.open_boards),
      verification: verificationDto(verifications.get(agency.id) || null),
    }));
    res.json({ success: true, data: normalizedAgencies });
  }),
);

module.exports = router;
