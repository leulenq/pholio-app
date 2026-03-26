const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const { recalculateBoardScores } = require("./recalculate-board-scores");
const {
  CASTING_PIPELINE_STAGES,
  mapApplicationStatusToCastingStage,
  formatCastingMeasurements,
} = require("./casting-stage-helpers");

const router = express.Router();
mountAgencyApiGuard(router);

// POST /api/agency/boards/:boardId/calculate-scores - Recalculate all match scores for a board
router.post(
  "/api/agency/boards/:boardId/calculate-scores",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { boardId } = req.params;
      const agencyId = req.session.userId;

      // Verify board belongs to agency
      const board = await knex("boards")
        .where({ id: boardId, agency_id: agencyId })
        .first();

      if (!board) {
        return res.status(404).json({ error: "Board not found" });
      }

      await recalculateBoardScores(boardId, agencyId);

      return res.json({ success: true });
    } catch (error) {
      console.error("[Boards API] Error calculating scores:", error);
      return res.status(500).json({ error: "Failed to calculate scores" });
    }
  },
);

// POST /api/agency/applications/:applicationId/assign-board - Assign application to board
router.post(
  "/api/agency/applications/:applicationId/assign-board",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const { board_id } = req.body;
      const agencyId = req.session.userId;

      // Verify application belongs to agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      // Verify board belongs to agency
      if (board_id) {
        const board = await knex("boards")
          .where({ id: board_id, agency_id: agencyId })
          .first();

        if (!board) {
          return res.status(404).json({ error: "Board not found" });
        }
      }

      // Remove from all boards first
      await knex("board_applications")
        .where({ application_id: applicationId })
        .delete();

      // Assign to new board if provided
      if (board_id) {
        // Check if already exists
        const existing = await knex("board_applications")
          .where({ board_id, application_id: applicationId })
          .first();

        if (!existing) {
          // Get board requirements and weights
          const board = await knex("boards")
            .where({ id: board_id, agency_id: agencyId })
            .first();

          const requirements = await knex("board_requirements")
            .where({ board_id })
            .first();

          const scoring_weights = await knex("board_scoring_weights")
            .where({ board_id })
            .first();

          // Get profile
          const profile = await knex("profiles")
            .where({ id: application.profile_id })
            .first();

          let matchScore = 0;
          let matchDetails = null;

          // Calculate match score if requirements and weights exist
          if (requirements && scoring_weights && profile) {
            const {
              calculateMatchScore,
            } = require("../services/match-scoring");

            const parsedRequirements = {
              ...requirements,
              genders: requirements.genders
                ? JSON.parse(requirements.genders)
                : null,
              body_types: requirements.body_types
                ? JSON.parse(requirements.body_types)
                : null,
              comfort_levels: requirements.comfort_levels
                ? JSON.parse(requirements.comfort_levels)
                : null,
              experience_levels: requirements.experience_levels
                ? JSON.parse(requirements.experience_levels)
                : null,
              skills: requirements.skills
                ? JSON.parse(requirements.skills)
                : null,
              locations: requirements.locations
                ? JSON.parse(requirements.locations)
                : null,
            };

            const matchResult = calculateMatchScore(profile, {
              requirements: parsedRequirements,
              scoring_weights,
            });

            matchScore = matchResult.score;
            matchDetails = JSON.stringify(matchResult.details);
          }

          // Create board_applications entry
          await knex("board_applications").insert({
            id: require("crypto").randomUUID(),
            board_id,
            application_id: applicationId,
            match_score: matchScore,
            match_details: matchDetails,
            created_at: knex.fn.now(),
            updated_at: knex.fn.now(),
          });
        }
      }

      return res.json({ success: true });
    } catch (error) {
      console.error(
        "[Boards API] Error assigning application to board:",
        error,
      );
      return res
        .status(500)
        .json({ error: "Failed to assign application to board" });
    }
  },
);

// GET /api/agency/boards/:boardId/candidates - Get casting pipeline candidates for a board
router.get(
  "/api/agency/boards/:boardId/candidates",
  requireRole("AGENCY"),
  async (req, res) => {
    try {
      const { boardId } = req.params;
      const agencyId = req.session.userId;

      const board = await knex("boards")
        .where({ id: boardId, agency_id: agencyId })
        .first();

      if (!board) {
        return res.status(404).json({ error: "Board not found" });
      }

      const applicationRows = await knex("board_applications as ba")
        .join("applications as a", "a.id", "ba.application_id")
        .join("profiles as p", "p.id", "a.profile_id")
        .where({
          "ba.board_id": boardId,
          "a.agency_id": agencyId,
        })
        .select(
          "ba.id as board_application_id",
          "ba.match_score",
          "a.id as application_id",
          "a.status as application_status",
          "a.created_at as application_created_at",
          "p.id as profile_id",
          "p.first_name",
          "p.last_name",
          "p.city",
          "p.country",
          "p.height_cm",
          "p.bust_cm",
          "p.waist_cm",
          "p.hips_cm",
          "p.bust",
          "p.waist",
          "p.hips",
          "p.hero_image_path",
          "p.archetype",
        )
        .orderBy([
          { column: "ba.match_score", order: "desc", nulls: "last" },
          { column: "a.created_at", order: "desc" },
        ]);

      const profileIds = applicationRows.map((row) => row.profile_id);
      const images = profileIds.length
        ? await knex("images")
            .whereIn("profile_id", profileIds)
            .where(function agencyShareableImages() {
              this.whereNull("status").orWhere("status", "active");
            })
            .where(function notExcludedFromAgency() {
              this.whereNull("exclude_from_agency").orWhere(
                "exclude_from_agency",
                false,
              );
            })
            .orderBy([
              { column: "is_primary", order: "desc" },
              { column: "sort", order: "asc" },
              { column: "created_at", order: "asc" },
            ])
        : [];

      const imagesByProfile = new Map();
      for (const image of images) {
        if (!imagesByProfile.has(image.profile_id)) {
          imagesByProfile.set(image.profile_id, []);
        }
        imagesByProfile.get(image.profile_id).push(image);
      }

      const candidates = applicationRows.map((row) => {
        const profileImages = imagesByProfile.get(row.profile_id) || [];
        const primaryImage =
          profileImages.find((image) => image.is_primary) ||
          profileImages[0] ||
          null;
        const location =
          [row.city, row.country].filter(Boolean).join(", ") || null;

        return {
          id: row.application_id,
          applicationId: row.application_id,
          profileId: row.profile_id,
          name:
            [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
            "Unknown Talent",
          archetype: row.archetype || "editorial",
          score:
            row.match_score !== null && row.match_score !== undefined
              ? Number(row.match_score)
              : null,
          avatar: primaryImage?.path || null,
          stage: mapApplicationStatusToCastingStage(row.application_status),
          backendStatus: row.application_status || "submitted",
          height: row.height_cm ? `${row.height_cm} cm` : null,
          location,
          measurements: formatCastingMeasurements(row),
          portfolio: profileImages.map((image) => ({
            id: image.id,
            url: image.path,
          })),
          created_at: row.application_created_at,
        };
      });

      const counts = candidates.reduce((accumulator, candidate) => {
        accumulator[candidate.stage] = (accumulator[candidate.stage] || 0) + 1;
        return accumulator;
      }, {});

      return res.json({
        board: {
          ...board,
          application_count: candidates.length,
          submitted_count: counts.Applied || 0,
          booked_count: counts.Booked || 0,
        },
        stages: CASTING_PIPELINE_STAGES,
        candidates,
      });
    } catch (error) {
      console.error("[Casting API] Error fetching board candidates:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch casting candidates" });
    }
  },
);

module.exports = router;
