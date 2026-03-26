const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { v4: uuidv4 } = require("uuid");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const logActivity = require("./agency-log-activity");

const router = express.Router();
mountAgencyApiGuard(router);

// POST /api/agency/applications/bulk-tag - Bulk add tag to applications
router.post(
  "/api/agency/applications/bulk-tag",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationIds, tag, color } = req.body;
      const agencyId = req.session.userId;

      if (
        !applicationIds ||
        !Array.isArray(applicationIds) ||
        applicationIds.length === 0
      ) {
        return res
          .status(400)
          .json({ error: "Application IDs array is required" });
      }

      if (!tag || !tag.trim()) {
        return res.status(400).json({ error: "Tag name is required" });
      }

      // Verify all applications belong to this agency
      const applications = await knex("applications")
        .whereIn("id", applicationIds)
        .where({ agency_id: agencyId });

      if (applications.length !== applicationIds.length) {
        return res.status(404).json({ error: "Some applications not found" });
      }

      // Add tag to each application (skip if already exists)
      let addedCount = 0;
      for (const app of applications) {
        // Check if tag already exists
        const existing = await knex("application_tags")
          .where({
            application_id: app.id,
            agency_id: agencyId,
            tag: tag.trim(),
          })
          .first();

        if (!existing) {
          const { v4: uuidv4 } = require("uuid");
          await knex("application_tags").insert({
            id: uuidv4(),
            application_id: app.id,
            agency_id: agencyId,
            tag: tag.trim(),
            color: color || null,
            created_at: knex.fn.now(),
          });

          await logActivity(
            knex,
            app.id,
            agencyId,
            agencyId,
            "tag_added",
            `Tag "${tag.trim()}" added (bulk)`,
            { tag_name: tag.trim(), tag_color: color, bulk_operation: true },
          );

          addedCount++;
        }
      }

      return res.json({ success: true, count: addedCount });
    } catch (error) {
      console.error("[Bulk Tag API] Error:", error);
      return res.status(500).json({ error: "Failed to add tags" });
    }
  },
);

// POST /api/agency/applications/bulk-remove-tag - Bulk remove tag from applications
router.post(
  "/api/agency/applications/bulk-remove-tag",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationIds, tag } = req.body;
      const agencyId = req.session.userId;

      if (
        !applicationIds ||
        !Array.isArray(applicationIds) ||
        applicationIds.length === 0
      ) {
        return res
          .status(400)
          .json({ error: "Application IDs array is required" });
      }

      if (!tag || !tag.trim()) {
        return res.status(400).json({ error: "Tag name is required" });
      }

      // Verify all applications belong to this agency
      const applications = await knex("applications")
        .whereIn("id", applicationIds)
        .where({ agency_id: agencyId });

      if (applications.length !== applicationIds.length) {
        return res.status(404).json({ error: "Some applications not found" });
      }

      // Remove tag from each application
      let removedCount = 0;
      for (const app of applications) {
        const deleted = await knex("application_tags")
          .where({
            application_id: app.id,
            agency_id: agencyId,
            tag: tag.trim(),
          })
          .delete();

        if (deleted > 0) {
          await logActivity(
            knex,
            app.id,
            agencyId,
            agencyId,
            "tag_removed",
            `Tag "${tag.trim()}" removed (bulk)`,
            { tag_name: tag.trim(), bulk_operation: true },
          );

          removedCount++;
        }
      }

      return res.json({
        success: true,
        count: removedCount,
        data: {
          message: `Tag removed from ${removedCount} application${removedCount !== 1 ? "s" : ""}`,
        },
      });
    } catch (error) {
      console.error("[Bulk Remove Tag API] Error:", error);
      return res.status(500).json({ error: "Failed to remove tags" });
    }
  },
);
// GET /api/agency/applications/:applicationId/tags - Get all tags for an application
router.get(
  "/api/agency/applications/:applicationId/tags",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const agencyId = req.session.userId;

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const tags = await knex("application_tags")
        .where({ application_id: applicationId, agency_id: agencyId })
        .orderBy("created_at", "desc");

      return res.json(tags);
    } catch (error) {
      console.error("[Tags API] Error:", error);
      return res.status(500).json({ error: "Failed to fetch tags" });
    }
  },
);

// POST /api/agency/applications/:applicationId/tags - Add a tag
router.post(
  "/api/agency/applications/:applicationId/tags",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const { tag, color } = req.body;
      const agencyId = req.session.userId;

      if (!tag || !tag.trim()) {
        return res.status(400).json({ error: "Tag name is required" });
      }

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      // Check if tag already exists (unique constraint)
      const existingTag = await knex("application_tags")
        .where({
          application_id: applicationId,
          agency_id: agencyId,
          tag: tag.trim(),
        })
        .first();

      if (existingTag) {
        return res.status(409).json({ error: "Tag already exists" });
      }

      const tagId = uuidv4();
      const [newTag] = await knex("application_tags")
        .insert({
          id: tagId,
          application_id: applicationId,
          agency_id: agencyId,
          tag: tag.trim(),
          color: color || null,
          created_at: knex.fn.now(),
        })
        .returning("*");

      // Log activity
      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "tag_added",
        `Tag "${tag.trim()}" added`,
        { tag_id: tagId, tag_name: tag.trim(), tag_color: color },
      );

      return res.json(newTag);
    } catch (error) {
      console.error("[Tags API] Error:", error);
      if (error.code === "23505") {
        // Unique constraint violation
        return res.status(409).json({ error: "Tag already exists" });
      }
      return res.status(500).json({ error: "Failed to create tag" });
    }
  },
);

// DELETE /api/agency/applications/:applicationId/tags/:tagId - Remove a tag
router.delete(
  "/api/agency/applications/:applicationId/tags/:tagId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId, tagId } = req.params;
      const agencyId = req.session.userId;

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      // Verify tag exists and belongs to this application and agency
      const existingTag = await knex("application_tags")
        .where({
          id: tagId,
          application_id: applicationId,
          agency_id: agencyId,
        })
        .first();

      if (!existingTag) {
        return res.status(404).json({ error: "Tag not found" });
      }

      await knex("application_tags").where({ id: tagId }).delete();

      // Log activity
      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "tag_removed",
        `Tag "${existingTag.tag}" removed`,
        { tag_id: tagId, tag_name: existingTag.tag },
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("[Tags API] Error:", error);
      return res.status(500).json({ error: "Failed to delete tag" });
    }
  },
);

// GET /api/agency/tags - Get all unique tags for this agency
router.get(
  "/api/agency/tags",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;

      // Get all unique tags with their most common color and usage count
      const tags = await knex("application_tags")
        .select("tag")
        .select(knex.raw("MAX(color) as color"))
        .select(knex.raw("COUNT(*) as usage_count"))
        .where({ agency_id: agencyId })
        .groupBy("tag")
        .orderBy("usage_count", "desc");

      return res.json(tags);
    } catch (error) {
      console.error("[Tags API] Error:", error);
      return res.status(500).json({ error: "Failed to fetch tags" });
    }
  },
);

module.exports = router;
