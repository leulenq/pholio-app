// src/domains/agency/routes/activity.js
"use strict";

const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { getSessionAgencyId } = require("../services/context");
const { mountAgencyApiGuard } = require("./agency-api-guard");

mountAgencyApiGuard(router);

router.get("/api/agency/activity", requireRole("AGENCY"), async (req, res) => {
  try {
    const agencyId = getSessionAgencyId(req.session);
    if (!agencyId)
      return res.status(401).json({ success: false, error: "Unauthorized" });

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const type = req.query.type || null;

    let query = knex("application_activities as aa")
      .join("applications as a", "aa.application_id", "a.id")
      .join("profiles as p", "a.profile_id", "p.id")
      .leftJoin("board_applications as ba", "ba.application_id", "a.id")
      .leftJoin("boards as b", "ba.board_id", "b.id")
      .leftJoin("images as img", function () {
        this.on("img.profile_id", "p.id").andOn(
          "img.is_primary",
          "=",
          knex.raw("true"),
        );
      })
      .where("aa.agency_id", agencyId)
      .select(
        "aa.id",
        "aa.created_at",
        "aa.activity_type",
        "aa.description",
        "aa.metadata",
        "aa.application_id",
        knex.raw("(p.first_name || ' ' || p.last_name) as \"talentName\""),
        knex.raw('COALESCE(img.public_url, img.path) as "talentImage"'),
        "b.name as board_name",
        "ba.board_id",
      )
      .orderBy("aa.created_at", "desc")
      .limit(limit)
      .offset(offset);

    if (type) query = query.where("aa.activity_type", type);

    let countQuery = knex("application_activities as aa")
      .join("applications as a", "aa.application_id", "a.id")
      .where("aa.agency_id", agencyId)
      .count("aa.id as total");
    if (type) countQuery = countQuery.where("aa.activity_type", type);

    const [rows, [{ total }]] = await Promise.all([query, countQuery]);

    const data = rows.map((row) => {
      let metadata = {};
      try {
        metadata = row.metadata ? JSON.parse(row.metadata) : {};
      } catch (_) {}
      return {
        id: row.id,
        created_at: row.created_at,
        activity_type: row.activity_type,
        talentName: row.talentName,
        talentImage: row.talentImage || null,
        description: row.description,
        application_label: row.board_id
          ? row.board_name
          : "General Application",
        application_id: row.application_id,
        metadata,
      };
    });

    return res.json({
      success: true,
      data,
      pagination: { limit, offset, total: Number(total) },
    });
  } catch (err) {
    console.error("[AgencyActivity] Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

module.exports = router;
