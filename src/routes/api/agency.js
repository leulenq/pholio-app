const express = require("express");
const router = express.Router();
const knex = require("../../db/knex");
const { z } = require("zod");
const {
  requireRole,
  requireAgencyMembershipRole,
  requireAgencyOnboardingComplete,
} = require("../../middleware/auth");
const { upload, processImage } = require("../../lib/uploader");
const { v4: uuidv4 } = require("uuid");
const { calculateMatchScore } = require("../../lib/match-scoring");
const {
  sendApplicationStatusEmail,
  sendNewMessageEmail,
} = require("../../lib/email");
const {
  getSessionActorUserId,
  getSessionAgencyId,
} = require("../../lib/agency-context");
const { embed, toVectorLiteral } = require("../../lib/ai/embeddings");

const agencyMemberCreateSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  membership_role: z.enum(["ADMIN", "MEMBER"]).optional().default("MEMBER"),
});

const agencyMemberUpdateSchema = z.object({
  membership_role: z.enum(["ADMIN", "MEMBER"]),
});

function serializeAgencyMember(row) {
  return {
    membershipId: row.membership_id,
    userId: row.user_id,
    agencyId: row.agency_id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name:
      [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email,
    membership_role: row.membership_role,
    status: row.membership_status,
    invited_at: row.invited_at,
    joined_at: row.joined_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const CASTING_PIPELINE_STAGES = [
  "Applied",
  "Shortlisted",
  "Offered",
  "Booked",
  "Passed",
];

function mapApplicationStatusToCastingStage(status) {
  switch ((status || "").toLowerCase()) {
    case "submitted":
    case "pending":
      return "Applied";
    case "shortlisted":
      return "Shortlisted";
    case "accepted":
      return "Offered";
    case "booked":
      return "Booked";
    case "passed":
    case "declined":
    case "archived":
      return "Passed";
    default:
      return "Applied";
  }
}

function mapCastingStageToApplicationStatus(stage) {
  switch ((stage || "").toLowerCase()) {
    case "applied":
      return "submitted";
    case "shortlisted":
      return "shortlisted";
    case "offered":
      return "accepted";
    case "booked":
      return "booked";
    case "passed":
      return "passed";
    default:
      return null;
  }
}

function formatCastingMeasurements(row) {
  const bust = row.bust_cm ?? row.bust ?? null;
  const waist = row.waist_cm ?? row.waist ?? null;
  const hips = row.hips_cm ?? row.hips ?? null;
  const parts = [bust, waist, hips].filter(
    (value) => value !== null && value !== undefined && value !== "",
  );
  return parts.length ? parts.join("-") : null;
}

router.use(
  "/api/agency",
  requireRole("AGENCY"),
  requireAgencyOnboardingComplete({
    allow: [
      { method: "GET", path: "/me" },
      { method: "PUT", path: "/profile" },
      { method: "POST", path: "/branding" },
      { method: "PUT", path: "/settings" },
      { method: "GET", path: "/team" },
      { method: "POST", path: "/team" },
      { method: "PATCH", pathPrefix: "/team/" },
      { method: "DELETE", pathPrefix: "/team/" },
      { method: "POST", path: "/onboarding/complete" },
    ],
  }),
);

// Helper function to recalculate match scores for all applications in a board
async function recalculateBoardScores(boardId, agencyId) {
  // Get board with requirements and weights
  const board = await knex("boards")
    .where({ id: boardId, agency_id: agencyId })
    .first();

  if (!board) return;

  const requirements = await knex("board_requirements")
    .where({ board_id: boardId })
    .first();

  const scoring_weights = await knex("board_scoring_weights")
    .where({ board_id: boardId })
    .first();

  if (!requirements || !scoring_weights) return;

  // Parse JSON fields
  const parsedRequirements = {
    ...requirements,
    genders: requirements.genders ? JSON.parse(requirements.genders) : null,
    body_types: requirements.body_types
      ? JSON.parse(requirements.body_types)
      : null,
    comfort_levels: requirements.comfort_levels
      ? JSON.parse(requirements.comfort_levels)
      : null,
    experience_levels: requirements.experience_levels
      ? JSON.parse(requirements.experience_levels)
      : null,
    skills: requirements.skills ? JSON.parse(requirements.skills) : null,
    locations: requirements.locations
      ? JSON.parse(requirements.locations)
      : null,
  };

  // Get all applications in this board
  const boardApplications = await knex("board_applications")
    .where({ board_id: boardId })
    .select("application_id");

  // Calculate scores for each application
  for (const ba of boardApplications) {
    const application = await knex("applications")
      .where({ id: ba.application_id, agency_id: agencyId })
      .first();

    if (!application) continue;

    const profile = await knex("profiles")
      .where({ id: application.profile_id })
      .first();

    if (!profile) continue;

    // Calculate match score
    const matchResult = calculateMatchScore(profile, {
      requirements: parsedRequirements,
      scoring_weights,
    });

    // Update board_applications table
    await knex("board_applications")
      .where({ board_id: boardId, application_id: application.id })
      .update({
        match_score: matchResult.score,
        match_details: JSON.stringify(matchResult.details),
        updated_at: knex.fn.now(),
      });

    // Update applications table (cache)
    await knex("applications").where({ id: application.id }).update({
      match_score: matchResult.score,
      match_calculated_at: knex.fn.now(),
    });
  }
}

// GET /api/agency/boards - List all boards for agency
router.get(
  "/api/agency/boards",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;

      const boards = await knex("boards")
        .where({ agency_id: agencyId })
        .orderBy("sort_order", "asc")
        .orderBy("created_at", "asc");

      // Get application counts for each board
      const boardsWithCounts = await Promise.all(
        boards.map(async (board) => {
          const [count, submittedCount, bookedCount] = await Promise.all([
            knex("board_applications")
              .where({ board_id: board.id })
              .count("* as count")
              .first(),
            knex("board_applications as ba")
              .join("applications as a", "a.id", "ba.application_id")
              .where({ "ba.board_id": board.id })
              .whereIn("a.status", ["submitted", "pending"])
              .count("* as count")
              .first(),
            knex("board_applications as ba")
              .join("applications as a", "a.id", "ba.application_id")
              .where({ "ba.board_id": board.id, "a.status": "booked" })
              .count("* as count")
              .first(),
          ]);
          return {
            ...board,
            application_count: parseInt(count?.count || 0),
            submitted_count: parseInt(submittedCount?.count || 0),
            booked_count: parseInt(bookedCount?.count || 0),
          };
        }),
      );

      return res.json(boardsWithCounts);
    } catch (error) {
      console.error("[Boards API] Error fetching boards:", error);
      return res.status(500).json({ error: "Failed to fetch boards" });
    }
  },
);

// GET /api/agency/boards/:boardId - Get board details with requirements and weights
router.get(
  "/api/agency/boards/:boardId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { boardId } = req.params;
      const agencyId = req.session.userId;

      const board = await knex("boards")
        .where({ id: boardId, agency_id: agencyId })
        .first();

      if (!board) {
        return res.status(404).json({ error: "Board not found" });
      }

      // Get requirements
      const requirements = await knex("board_requirements")
        .where({ board_id: boardId })
        .first();

      // Get scoring weights
      const scoring_weights = await knex("board_scoring_weights")
        .where({ board_id: boardId })
        .first();

      // Parse JSON fields
      const parsedRequirements = requirements
        ? {
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
          }
        : null;

      return res.json({
        ...board,
        requirements: parsedRequirements,
        scoring_weights,
      });
    } catch (error) {
      console.error("[Boards API] Error fetching board:", error);
      return res.status(500).json({ error: "Failed to fetch board" });
    }
  },
);

// POST /api/agency/boards - Create new board
router.post(
  "/api/agency/boards",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;
      const {
        name,
        client_name,
        description,
        closes_at,
        target_slots,
        is_active = true,
        sort_order = 0,
        requirements,
        scoring_weights,
      } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Board name is required" });
      }

      // Create board
      const [board] = await knex("boards")
        .insert({
          id: require("crypto").randomUUID(),
          agency_id: agencyId,
          name: name.trim(),
          client_name: client_name?.trim() || null,
          description: description || null,
          closes_at: closes_at || null,
          target_slots:
            target_slots !== undefined &&
            target_slots !== null &&
            target_slots !== ""
              ? parseInt(target_slots, 10) || null
              : null,
          is_active: !!is_active,
          sort_order: parseInt(sort_order) || 0,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        })
        .returning("*");

      // Create default requirements if provided
      if (requirements) {
        await knex("board_requirements").insert({
          id: require("crypto").randomUUID(),
          board_id: board.id,
          min_age: requirements.min_age || null,
          max_age: requirements.max_age || null,
          min_height_cm: requirements.min_height_cm || null,
          max_height_cm: requirements.max_height_cm || null,
          genders: requirements.genders
            ? JSON.stringify(requirements.genders)
            : null,
          min_bust: requirements.min_bust || null,
          max_bust: requirements.max_bust || null,
          min_waist: requirements.min_waist || null,
          max_waist: requirements.max_waist || null,
          min_hips: requirements.min_hips || null,
          max_hips: requirements.max_hips || null,
          body_types: requirements.body_types
            ? JSON.stringify(requirements.body_types)
            : null,
          comfort_levels: requirements.comfort_levels
            ? JSON.stringify(requirements.comfort_levels)
            : null,
          experience_levels: requirements.experience_levels
            ? JSON.stringify(requirements.experience_levels)
            : null,
          skills: requirements.skills
            ? JSON.stringify(requirements.skills)
            : null,
          locations: requirements.locations
            ? JSON.stringify(requirements.locations)
            : null,
          min_social_reach: requirements.min_social_reach || null,
          social_reach_importance: requirements.social_reach_importance || null,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        });
      }

      // Create default scoring weights
      const defaultWeights = scoring_weights || {
        age_weight: 0,
        height_weight: 0,
        measurements_weight: 0,
        body_type_weight: 0,
        comfort_weight: 0,
        experience_weight: 0,
        skills_weight: 0,
        location_weight: 0,
        social_reach_weight: 0,
      };

      await knex("board_scoring_weights").insert({
        id: require("crypto").randomUUID(),
        board_id: board.id,
        ...defaultWeights,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      return res.json(board);
    } catch (error) {
      console.error("[Boards API] Error creating board:", error);
      return res.status(500).json({ error: "Failed to create board" });
    }
  },
);

// PUT /api/agency/boards/:boardId - Update board
router.put(
  "/api/agency/boards/:boardId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { boardId } = req.params;
      const agencyId = req.session.userId;
      const {
        name,
        client_name,
        description,
        closes_at,
        target_slots,
        is_active,
        sort_order,
      } = req.body;

      // Verify board belongs to agency
      const board = await knex("boards")
        .where({ id: boardId, agency_id: agencyId })
        .first();

      if (!board) {
        return res.status(404).json({ error: "Board not found" });
      }

      // Update board
      const updates = {
        updated_at: knex.fn.now(),
      };
      if (name !== undefined) updates.name = name.trim();
      if (client_name !== undefined)
        updates.client_name = client_name?.trim() || null;
      if (description !== undefined) updates.description = description || null;
      if (closes_at !== undefined) updates.closes_at = closes_at || null;
      if (target_slots !== undefined) {
        updates.target_slots =
          target_slots !== null && target_slots !== ""
            ? parseInt(target_slots, 10) || null
            : null;
      }
      if (is_active !== undefined) updates.is_active = !!is_active;
      if (sort_order !== undefined)
        updates.sort_order = parseInt(sort_order) || 0;

      await knex("boards").where({ id: boardId }).update(updates);

      return res.json({ success: true });
    } catch (error) {
      console.error("[Boards API] Error updating board:", error);
      return res.status(500).json({ error: "Failed to update board" });
    }
  },
);

// PUT /api/agency/boards/:boardId/requirements - Update board requirements
router.put(
  "/api/agency/boards/:boardId/requirements",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { boardId } = req.params;
      const agencyId = req.session.userId;
      const requirements = req.body;

      // Verify board belongs to agency
      const board = await knex("boards")
        .where({ id: boardId, agency_id: agencyId })
        .first();

      if (!board) {
        return res.status(404).json({ error: "Board not found" });
      }

      // Check if requirements exist
      const existing = await knex("board_requirements")
        .where({ board_id: boardId })
        .first();

      const requirementsData = {
        min_age: requirements.min_age || null,
        max_age: requirements.max_age || null,
        min_height_cm: requirements.min_height_cm || null,
        max_height_cm: requirements.max_height_cm || null,
        genders: requirements.genders
          ? JSON.stringify(requirements.genders)
          : null,
        min_bust: requirements.min_bust || null,
        max_bust: requirements.max_bust || null,
        min_waist: requirements.min_waist || null,
        max_waist: requirements.max_waist || null,
        min_hips: requirements.min_hips || null,
        max_hips: requirements.max_hips || null,
        body_types: requirements.body_types
          ? JSON.stringify(requirements.body_types)
          : null,
        comfort_levels: requirements.comfort_levels
          ? JSON.stringify(requirements.comfort_levels)
          : null,
        experience_levels: requirements.experience_levels
          ? JSON.stringify(requirements.experience_levels)
          : null,
        skills: requirements.skills
          ? JSON.stringify(requirements.skills)
          : null,
        locations: requirements.locations
          ? JSON.stringify(requirements.locations)
          : null,
        min_social_reach: requirements.min_social_reach || null,
        social_reach_importance: requirements.social_reach_importance || null,
        updated_at: knex.fn.now(),
      };

      if (existing) {
        await knex("board_requirements")
          .where({ board_id: boardId })
          .update(requirementsData);
      } else {
        await knex("board_requirements").insert({
          id: require("crypto").randomUUID(),
          board_id: boardId,
          ...requirementsData,
          created_at: knex.fn.now(),
        });
      }

      // Recalculate match scores for all applications in this board
      await recalculateBoardScores(boardId, agencyId);

      return res.json({ success: true });
    } catch (error) {
      console.error("[Boards API] Error updating requirements:", error);
      return res.status(500).json({ error: "Failed to update requirements" });
    }
  },
);

// PUT /api/agency/boards/:boardId/weights - Update scoring weights
router.put(
  "/api/agency/boards/:boardId/weights",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { boardId } = req.params;
      const agencyId = req.session.userId;
      const weights = req.body;

      // Verify board belongs to agency
      const board = await knex("boards")
        .where({ id: boardId, agency_id: agencyId })
        .first();

      if (!board) {
        return res.status(404).json({ error: "Board not found" });
      }

      // Validate weights (0-5)
      const weightFields = [
        "age_weight",
        "height_weight",
        "measurements_weight",
        "body_type_weight",
        "comfort_weight",
        "experience_weight",
        "skills_weight",
        "location_weight",
        "social_reach_weight",
      ];
      const weightsData = {};
      weightFields.forEach((field) => {
        if (weights[field] !== undefined) {
          const val = parseFloat(weights[field]);
          weightsData[field] = Math.max(0, Math.min(5, val));
        }
      });

      // Check if weights exist
      const existing = await knex("board_scoring_weights")
        .where({ board_id: boardId })
        .first();

      if (existing) {
        await knex("board_scoring_weights")
          .where({ board_id: boardId })
          .update({
            ...weightsData,
            updated_at: knex.fn.now(),
          });
      } else {
        await knex("board_scoring_weights").insert({
          id: require("crypto").randomUUID(),
          board_id: boardId,
          age_weight: 0,
          height_weight: 0,
          measurements_weight: 0,
          body_type_weight: 0,
          comfort_weight: 0,
          experience_weight: 0,
          skills_weight: 0,
          location_weight: 0,
          social_reach_weight: 0,
          ...weightsData,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        });
      }

      // Recalculate match scores
      await recalculateBoardScores(boardId, agencyId);

      return res.json({ success: true });
    } catch (error) {
      console.error("[Boards API] Error updating weights:", error);
      return res.status(500).json({ error: "Failed to update weights" });
    }
  },
);

// DELETE /api/agency/boards/:boardId - Delete board
router.delete(
  "/api/agency/boards/:boardId",
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

      // Delete board (cascade will handle requirements, weights, and board_applications)
      await knex("boards").where({ id: boardId }).delete();

      return res.json({ success: true });
    } catch (error) {
      console.error("[Boards API] Error deleting board:", error);
      return res.status(500).json({ error: "Failed to delete board" });
    }
  },
);

// POST /api/agency/boards/:boardId/duplicate - Duplicate board
router.post(
  "/api/agency/boards/:boardId/duplicate",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { boardId } = req.params;
      const agencyId = req.session.userId;

      // Get original board
      const board = await knex("boards")
        .where({ id: boardId, agency_id: agencyId })
        .first();

      if (!board) {
        return res.status(404).json({ error: "Board not found" });
      }

      // Get requirements and weights
      const requirements = await knex("board_requirements")
        .where({ board_id: boardId })
        .first();

      const weights = await knex("board_scoring_weights")
        .where({ board_id: boardId })
        .first();

      // Create new board
      const newBoardId = require("crypto").randomUUID();
      await knex("boards").insert({
        id: newBoardId,
        agency_id: agencyId,
        name: `${board.name} (Copy)`,
        description: board.description,
        is_active: false, // Inactive by default
        sort_order: board.sort_order,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      // Copy requirements
      if (requirements) {
        const newReq = { ...requirements };
        delete newReq.id;
        delete newReq.board_id;
        delete newReq.created_at;
        delete newReq.updated_at;
        await knex("board_requirements").insert({
          id: require("crypto").randomUUID(),
          board_id: newBoardId,
          ...newReq,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        });
      }

      // Copy weights
      if (weights) {
        const newWeights = { ...weights };
        delete newWeights.id;
        delete newWeights.board_id;
        delete newWeights.created_at;
        delete newWeights.updated_at;
        await knex("board_scoring_weights").insert({
          id: require("crypto").randomUUID(),
          board_id: newBoardId,
          ...newWeights,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        });
      }

      return res.json({ id: newBoardId, success: true });
    } catch (error) {
      console.error("[Boards API] Error duplicating board:", error);
      return res.status(500).json({ error: "Failed to duplicate board" });
    }
  },
);

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
            const { calculateMatchScore } = require("../../lib/match-scoring");

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
          avatar: primaryImage?.path || row.hero_image_path || null,
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

// GET /api/agency/applications - Get filtered applications as JSON
router.get(
  "/api/agency/applications",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const {
        sort = "az",
        city = "",
        letter = "",
        search = "",
        min_height = "",
        max_height = "",
        status = "",
        gender = "",
        tags = "",
        date_from = "",
        date_to = "",
      } = req.query;

      let query = knex("profiles")
        .select(
          "profiles.*",
          "users.email as owner_email",
          "applications.status as application_status",
          "applications.id as application_id",
          "applications.created_at as application_created_at",
        )
        .leftJoin("users", "profiles.user_id", "users.id")
        .leftJoin("applications", (join) => {
          join
            .on("applications.profile_id", "=", "profiles.id")
            .andOn(
              "applications.agency_id",
              "=",
              knex.raw("?", [req.session.userId]),
            );
        })
        .whereNotNull("profiles.bio_curated");

      // Apply filters (same logic as main route)
      if (city) {
        query = query.whereILike("profiles.city", `%${city}%`);
      }
      if (letter) {
        query = query.whereILike("profiles.last_name", `${letter}%`);
      }
      if (search) {
        query = query.andWhere((qb) => {
          qb.whereILike("profiles.first_name", `%${search}%`).orWhereILike(
            "profiles.last_name",
            `%${search}%`,
          );
        });
      }
      if (status && status !== "all") {
        if (status === "pending") {
          query = query.where(function () {
            this.where("applications.status", "pending").orWhereNull(
              "applications.status",
            );
          });
        } else {
          query = query.where("applications.status", status);
        }
      }
      const minHeightNumber = parseInt(min_height, 10);
      const maxHeightNumber = parseInt(max_height, 10);
      if (!Number.isNaN(minHeightNumber)) {
        query = query.where("profiles.height_cm", ">=", minHeightNumber);
      }
      if (!Number.isNaN(maxHeightNumber)) {
        query = query.where("profiles.height_cm", "<=", maxHeightNumber);
      }

      // Gender filter
      if (gender) {
        query = query.where("profiles.gender", gender);
      }

      // Date range filter
      if (date_from) {
        query = query.where(
          "applications.created_at",
          ">=",
          new Date(date_from),
        );
      }
      if (date_to) {
        // Add one day to include the entire end date
        const endDate = new Date(date_to);
        endDate.setDate(endDate.getDate() + 1);
        query = query.where("applications.created_at", "<", endDate);
      }

      // Tags filter - application must have ALL specified tags
      if (tags) {
        const tagArray =
          typeof tags === "string"
            ? tags.split(",").map((t) => t.trim())
            : Array.isArray(tags)
              ? tags
              : [];
        if (tagArray.length > 0) {
          query = query.whereIn("applications.id", function () {
            this.select("application_id")
              .from("application_tags")
              .where({ agency_id: req.session.userId })
              .whereIn("tag", tagArray)
              .groupBy("application_id")
              .havingRaw("COUNT(DISTINCT tag) = ?", [tagArray.length]);
          });
        }
      }

      if (sort === "city") {
        query = query.orderBy(["profiles.city", "profiles.last_name"]);
      } else {
        query = query.orderBy(["profiles.last_name", "profiles.first_name"]);
      }

      const profiles = await query;

      // Fetch images
      const profileIds = profiles.map((p) => p.id);
      const allImages =
        profileIds.length > 0
          ? await knex("images")
              .whereIn("profile_id", profileIds)
              .orderBy(["profile_id", "sort", "created_at"])
          : [];

      const imagesByProfile = {};
      allImages.forEach((img) => {
        if (!imagesByProfile[img.profile_id]) {
          imagesByProfile[img.profile_id] = [];
        }
        imagesByProfile[img.profile_id].push(img);
      });

      // Fetch tags for each application
      const applicationIds = profiles
        .map((p) => p.application_id)
        .filter(Boolean);
      const allTags =
        applicationIds.length > 0
          ? await knex("application_tags")
              .whereIn("application_id", applicationIds)
              .where({ agency_id: req.session.userId })
          : [];

      const tagsByApplication = {};
      allTags.forEach((tag) => {
        if (!tagsByApplication[tag.application_id]) {
          tagsByApplication[tag.application_id] = [];
        }
        tagsByApplication[tag.application_id].push(tag);
      });

      profiles.forEach((profile) => {
        profile.images = imagesByProfile[profile.id] || [];
        profile.tags = tagsByApplication[profile.application_id] || [];
      });

      return res.json({ profiles, count: profiles.length });
    } catch (error) {
      console.error("[API/Agency/Applications] Error:", error);
      return next(error);
    }
  },
);

// GET /api/agency/stats - Get dashboard statistics
router.get(
  "/api/agency/stats",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const allApplications = await knex("applications")
        .where({ agency_id: req.session.userId })
        .select("status", "created_at");

      const stats = {
        total: allApplications.length,
        pending: allApplications.filter(
          (a) => !a.status || a.status === "pending",
        ).length,
        accepted: allApplications.filter((a) => a.status === "accepted").length,
        declined: allApplications.filter((a) => a.status === "declined").length,
        archived: allApplications.filter((a) => a.status === "archived").length,
        newToday: allApplications.filter((a) => {
          const created = new Date(a.created_at);
          const today = new Date();
          return created.toDateString() === today.toDateString();
        }).length,
        newThisWeek: allApplications.filter((a) => {
          const created = new Date(a.created_at);
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          return created >= weekAgo;
        }).length,
      };

      const commissions = await knex("commissions")
        .where({ agency_id: req.session.userId })
        .sum({ total: "amount_cents" })
        .first();

      return res.json({
        stats,
        commissionsTotal: ((commissions?.total || 0) / 100).toFixed(2),
      });
    } catch (error) {
      console.error("[API/Agency/Stats] Error:", error);
      return next(error);
    }
  },
);

// Helper function to log application activities
async function logActivity(
  knex,
  applicationId,
  agencyId,
  userId,
  activityType,
  description,
  metadata = {},
) {
  const { v4: uuidv4 } = require("uuid");
  try {
    const activityUserId = userId
      ? await knex("users")
          .where({ id: userId })
          .first()
          .then((row) => row?.id || null)
      : null;

    await knex("application_activities").insert({
      id: uuidv4(),
      application_id: applicationId,
      agency_id: agencyId,
      user_id: activityUserId,
      activity_type: activityType,
      description,
      metadata: JSON.stringify(metadata),
      created_at: knex.fn.now(),
    });
  } catch (error) {
    console.error("[Activity Logging] Error:", error);
    // Don't fail the main operation if logging fails
  }
}

// POST /api/agency/applications/:applicationId/accept - Accept application
router.post(
  "/api/agency/applications/:applicationId/accept",
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

      const oldStatus = application.status;

      // Update status
      await knex("applications").where({ id: applicationId }).update({
        status: "accepted",
        accepted_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      // Log activity
      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "status_change",
        "Application accepted",
        { old_status: oldStatus, new_status: "accepted" },
      );

      // Send email notification (async, non-blocking)
      (async () => {
        try {
          // Get talent info
          const talent = await knex("users")
            .where({ id: application.talent_id })
            .first();

          // Get agency info
          const agency = await knex("agencies").where({ id: agencyId }).first();

          if (talent && talent.email && agency) {
            await sendApplicationStatusEmail({
              to: talent.email,
              talentName: talent.name || "there",
              agencyName: agency.name || "the agency",
              status: "accepted",
            });
          }
        } catch (emailError) {
          console.error(
            "[Accept Application] Email notification error:",
            emailError,
          );
          // Don't fail the main operation if email fails
        }
      })();

      return res.json({ success: true, message: "Application accepted" });
    } catch (error) {
      console.error("[Accept Application API] Error:", error);
      return res.status(500).json({ error: "Failed to accept application" });
    }
  },
);

// PATCH /api/agency/applications/:applicationId/status - Update application pipeline status
router.patch(
  "/api/agency/applications/:applicationId/status",
  requireRole("AGENCY"),
  async (req, res) => {
    try {
      const { applicationId } = req.params;
      const agencyId = req.session.userId;
      const requestedStatus =
        req.body?.status || mapCastingStageToApplicationStatus(req.body?.stage);

      if (!requestedStatus) {
        return res
          .status(400)
          .json({
            error: "Valid application status or casting stage is required",
          });
      }

      const allowedStatuses = [
        "submitted",
        "shortlisted",
        "accepted",
        "booked",
        "passed",
        "declined",
        "archived",
      ];

      if (!allowedStatuses.includes(requestedStatus)) {
        return res
          .status(400)
          .json({ error: "Unsupported application status" });
      }

      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      await knex("applications")
        .where({ id: applicationId })
        .update({
          status: requestedStatus,
          accepted_at:
            requestedStatus === "accepted"
              ? knex.fn.now()
              : application.accepted_at,
          updated_at: knex.fn.now(),
        });

      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "status_change",
        `Application moved to ${requestedStatus}`,
        { old_status: application.status, new_status: requestedStatus },
      );

      return res.json({
        success: true,
        data: {
          applicationId,
          status: requestedStatus,
          stage: mapApplicationStatusToCastingStage(requestedStatus),
        },
      });
    } catch (error) {
      console.error("[Casting API] Error updating application status:", error);
      return res
        .status(500)
        .json({ error: "Failed to update application status" });
    }
  },
);

// POST /api/agency/applications/:applicationId/decline - Decline application
router.post(
  "/api/agency/applications/:applicationId/decline",
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

      const oldStatus = application.status;

      // Update status
      await knex("applications").where({ id: applicationId }).update({
        status: "declined",
        updated_at: knex.fn.now(),
      });

      // Log activity
      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "status_change",
        "Application declined",
        { old_status: oldStatus, new_status: "declined" },
      );

      // Send email notification (async, non-blocking)
      (async () => {
        try {
          // Get talent info
          const talent = await knex("users")
            .where({ id: application.talent_id })
            .first();

          // Get agency info
          const agency = await knex("agencies").where({ id: agencyId }).first();

          if (talent && talent.email && agency) {
            await sendApplicationStatusEmail({
              to: talent.email,
              talentName: talent.name || "there",
              agencyName: agency.name || "the agency",
              status: "declined",
            });
          }
        } catch (emailError) {
          console.error(
            "[Decline Application] Email notification error:",
            emailError,
          );
          // Don't fail the main operation if email fails
        }
      })();

      return res.json({ success: true, message: "Application declined" });
    } catch (error) {
      console.error("[Decline Application API] Error:", error);
      return res.status(500).json({ error: "Failed to decline application" });
    }
  },
);

// POST /api/agency/applications/:applicationId/archive - Archive application
router.post(
  "/api/agency/applications/:applicationId/archive",
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

      const oldStatus = application.status;

      // Update status
      await knex("applications").where({ id: applicationId }).update({
        status: "archived",
        updated_at: knex.fn.now(),
      });

      // Log activity
      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "status_change",
        "Application archived",
        { old_status: oldStatus, new_status: "archived" },
      );

      return res.json({ success: true, message: "Application archived" });
    } catch (error) {
      console.error("[Archive Application API] Error:", error);
      return res.status(500).json({ error: "Failed to archive application" });
    }
  },
);

// GET /api/agency/applications/:applicationId/timeline - Get activity timeline
router.get(
  "/api/agency/applications/:applicationId/timeline",
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

      // Fetch all activities
      const activities = await knex("application_activities")
        .where({ application_id: applicationId })
        .orderBy("created_at", "desc");

      // Parse metadata JSON
      const parsedActivities = activities.map((activity) => ({
        ...activity,
        metadata:
          typeof activity.metadata === "string"
            ? JSON.parse(activity.metadata)
            : activity.metadata,
      }));

      return res.json(parsedActivities);
    } catch (error) {
      console.error("[Timeline API] Error:", error);
      return res.status(500).json({ error: "Failed to fetch timeline" });
    }
  },
);

// POST /api/agency/applications/bulk-accept - Bulk accept applications
router.post(
  "/api/agency/applications/bulk-accept",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationIds } = req.body;
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

      // Verify all applications belong to this agency
      const applications = await knex("applications")
        .whereIn("id", applicationIds)
        .where({ agency_id: agencyId });

      if (applications.length !== applicationIds.length) {
        return res.status(404).json({ error: "Some applications not found" });
      }

      // Update all to accepted
      await knex("applications").whereIn("id", applicationIds).update({
        status: "accepted",
        accepted_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      // Log activities for each
      for (const app of applications) {
        await logActivity(
          knex,
          app.id,
          agencyId,
          agencyId,
          "status_change",
          "Application accepted (bulk)",
          {
            old_status: app.status,
            new_status: "accepted",
            bulk_operation: true,
          },
        );
      }

      return res.json({ success: true, count: applicationIds.length });
    } catch (error) {
      console.error("[Bulk Accept API] Error:", error);
      return res.status(500).json({ error: "Failed to accept applications" });
    }
  },
);

// PATCH /api/agency/applications/bulk-status - Bulk update application pipeline status
router.patch(
  "/api/agency/applications/bulk-status",
  requireRole("AGENCY"),
  async (req, res) => {
    try {
      const { applicationIds, status, stage } = req.body || {};
      const agencyId = req.session.userId;
      const requestedStatus =
        status || mapCastingStageToApplicationStatus(stage);

      if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
        return res
          .status(400)
          .json({ error: "Application IDs array is required" });
      }

      if (!requestedStatus) {
        return res
          .status(400)
          .json({
            error: "Valid application status or casting stage is required",
          });
      }

      const allowedStatuses = [
        "submitted",
        "shortlisted",
        "accepted",
        "booked",
        "passed",
        "declined",
        "archived",
      ];

      if (!allowedStatuses.includes(requestedStatus)) {
        return res
          .status(400)
          .json({ error: "Unsupported application status" });
      }

      const applications = await knex("applications")
        .whereIn("id", applicationIds)
        .where({ agency_id: agencyId });

      if (applications.length !== applicationIds.length) {
        return res.status(404).json({ error: "Some applications not found" });
      }

      await knex("applications")
        .whereIn("id", applicationIds)
        .update({
          status: requestedStatus,
          accepted_at: requestedStatus === "accepted" ? knex.fn.now() : null,
          updated_at: knex.fn.now(),
        });

      for (const application of applications) {
        await logActivity(
          knex,
          application.id,
          agencyId,
          agencyId,
          "status_change",
          `Application moved to ${requestedStatus} (bulk)`,
          {
            old_status: application.status,
            new_status: requestedStatus,
            bulk_operation: true,
          },
        );
      }

      return res.json({
        success: true,
        data: {
          count: applicationIds.length,
          status: requestedStatus,
          stage: mapApplicationStatusToCastingStage(requestedStatus),
        },
      });
    } catch (error) {
      console.error(
        "[Casting API] Error bulk updating application status:",
        error,
      );
      return res
        .status(500)
        .json({ error: "Failed to bulk update application status" });
    }
  },
);

// POST /api/agency/applications/bulk-decline - Bulk decline applications
router.post(
  "/api/agency/applications/bulk-decline",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationIds } = req.body;
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

      // Verify all applications belong to this agency
      const applications = await knex("applications")
        .whereIn("id", applicationIds)
        .where({ agency_id: agencyId });

      if (applications.length !== applicationIds.length) {
        return res.status(404).json({ error: "Some applications not found" });
      }

      // Update all to declined
      await knex("applications").whereIn("id", applicationIds).update({
        status: "declined",
        updated_at: knex.fn.now(),
      });

      // Log activities for each
      for (const app of applications) {
        await logActivity(
          knex,
          app.id,
          agencyId,
          agencyId,
          "status_change",
          "Application declined (bulk)",
          {
            old_status: app.status,
            new_status: "declined",
            bulk_operation: true,
          },
        );
      }

      return res.json({ success: true, count: applicationIds.length });
    } catch (error) {
      console.error("[Bulk Decline API] Error:", error);
      return res.status(500).json({ error: "Failed to decline applications" });
    }
  },
);

// POST /api/agency/applications/bulk-archive - Bulk archive applications
router.post(
  "/api/agency/applications/bulk-archive",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationIds } = req.body;
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

      // Verify all applications belong to this agency
      const applications = await knex("applications")
        .whereIn("id", applicationIds)
        .where({ agency_id: agencyId });

      if (applications.length !== applicationIds.length) {
        return res.status(404).json({ error: "Some applications not found" });
      }

      // Update all to archived
      await knex("applications").whereIn("id", applicationIds).update({
        status: "archived",
        updated_at: knex.fn.now(),
      });

      // Log activities for each
      for (const app of applications) {
        await logActivity(
          knex,
          app.id,
          agencyId,
          agencyId,
          "status_change",
          "Application archived (bulk)",
          {
            old_status: app.status,
            new_status: "archived",
            bulk_operation: true,
          },
        );
      }

      return res.json({ success: true, count: applicationIds.length });
    } catch (error) {
      console.error("[Bulk Archive API] Error:", error);
      return res.status(500).json({ error: "Failed to archive applications" });
    }
  },
);

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

// GET /api/agency/me - Get current agency profile
router.get("/api/agency/me", requireRole("AGENCY"), async (req, res, next) => {
  try {
    const actorUserId = getSessionActorUserId(req);
    const agencyId = getSessionAgencyId(req);
    const user = await knex("users").where({ id: actorUserId }).first();
    const agency = await knex("agencies").where({ id: agencyId }).first();

    if (!user || !agency) {
      return res.status(404).json({ error: "Agency account not found" });
    }

    // Format response to match frontend expectations
    return res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        agency_name: agency.name,
        agency_logo_path: agency.logo_path,
        agency_brand_color: agency.brand_color,
        agency_description: agency.description,
        agency_website: agency.website,
        agency_location: agency.location,
        notify_new_applications: agency.notify_new_applications,
        notify_status_changes: agency.notify_status_changes,
        default_view: agency.default_view,
        onboarding: {
          started_at: agency.onboarding_started_at || null,
          completed_at: agency.onboarding_completed_at || null,
          completed: !!agency.onboarding_completed_at,
        },
      },
    });
  } catch (error) {
    console.error("[Agency Profile API] Error:", error);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// PUT /api/agency/profile - Update agency profile
router.put(
  "/api/agency/profile",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      const actorUserId = getSessionActorUserId(req);
      const agencyId = getSessionAgencyId(req);
      const {
        first_name,
        last_name,
        agency_name,
        agency_location,
        agency_website,
        agency_description,
      } = req.body;

      const updateData = {};
      if (first_name !== undefined) updateData.first_name = first_name || null;
      if (last_name !== undefined) updateData.last_name = last_name || null;
      if (Object.keys(updateData).length > 0) {
        await knex("users").where({ id: actorUserId }).update(updateData);
      }

      const agencyUpdateData = {};
      if (agency_name !== undefined)
        agencyUpdateData.name = agency_name || null;
      if (agency_location !== undefined)
        agencyUpdateData.location = agency_location || null;
      if (agency_website !== undefined)
        agencyUpdateData.website = agency_website || null;
      if (agency_description !== undefined)
        agencyUpdateData.description = agency_description || null;

      if (Object.keys(agencyUpdateData).length > 0) {
        agencyUpdateData.updated_at = knex.fn.now();
        await knex("agencies").where({ id: agencyId }).update(agencyUpdateData);
      }

      return res.json({
        success: true,
        message: "Profile updated successfully",
      });
    } catch (error) {
      console.error("[Agency Profile API] Error:", error);
      return res.status(500).json({ error: "Failed to update profile" });
    }
  },
);

// POST /api/agency/onboarding/complete - Mark first-login onboarding complete
router.post(
  "/api/agency/onboarding/complete",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);

      const agency = await knex("agencies").where({ id: agencyId }).first();
      if (!agency) {
        return res.status(404).json({ error: "Agency account not found" });
      }

      const updateData = {
        updated_at: knex.fn.now(),
      };

      if (!agency.onboarding_started_at) {
        updateData.onboarding_started_at = knex.fn.now();
      }
      if (!agency.onboarding_completed_at) {
        updateData.onboarding_completed_at = knex.fn.now();
        updateData.onboarding_completed_by_user_id = actorUserId;
      }

      if (Object.keys(updateData).length > 1) {
        await knex("agencies").where({ id: agencyId }).update(updateData);
      }

      req.session.agencyOnboardingCompletedAt =
        agency.onboarding_completed_at || new Date().toISOString();

      await new Promise((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      return res.json({
        success: true,
        data: {
          completed: true,
          redirect: "/dashboard/agency",
        },
      });
    } catch (error) {
      console.error(
        "[Agency Onboarding API] Error completing onboarding:",
        error,
      );
      return res.status(500).json({ error: "Failed to complete onboarding" });
    }
  },
);

// POST /api/agency/branding - Update agency branding (logo and color)
router.post(
  "/api/agency/branding",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  upload.single("agency_logo"),
  async (req, res, next) => {
    try {
      const actorUserId = getSessionActorUserId(req);
      const agencyId = getSessionAgencyId(req);
      const { agency_brand_color, remove_logo } = req.body;

      const updateData = {};

      if (remove_logo === "true") {
        // Remove existing logo
        const agency = await knex("agencies").where({ id: agencyId }).first();
        if (agency && agency.logo_path) {
          // Delete file from storage if needed
          updateData.logo_path = null;
        }
      } else if (req.file) {
        // Process and save new logo
        const processedImage = await processImage(req.file, {
          agencyId: agencyId,
          maxWidth: 400,
          maxHeight: 400,
          quality: 90,
        });
        updateData.logo_path = processedImage.path;
      }

      if (agency_brand_color !== undefined) {
        updateData.brand_color = agency_brand_color || null;
      }

      if (Object.keys(updateData).length > 0) {
        updateData.updated_at = knex.fn.now();
        await knex("agencies").where({ id: agencyId }).update(updateData);
      }

      return res.json({
        success: true,
        message: "Branding updated successfully",
        logo_path: updateData.logo_path || null,
      });
    } catch (error) {
      console.error("[Agency Branding API] Error:", error);
      return res.status(500).json({ error: "Failed to update branding" });
    }
  },
);

// PUT /api/agency/settings - Update agency settings
router.put(
  "/api/agency/settings",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const { notify_new_applications, notify_status_changes, default_view } =
        req.body;

      const updateData = {};
      if (notify_new_applications !== undefined)
        updateData.notify_new_applications = !!notify_new_applications;
      if (notify_status_changes !== undefined)
        updateData.notify_status_changes = !!notify_status_changes;
      if (default_view !== undefined)
        updateData.default_view = default_view || null;

      updateData.updated_at = knex.fn.now();
      await knex("agencies").where({ id: agencyId }).update(updateData);

      return res.json({
        success: true,
        message: "Settings updated successfully",
      });
    } catch (error) {
      console.error("[Agency Settings API] Error:", error);
      return res.status(500).json({ error: "Failed to update settings" });
    }
  },
);

// GET /api/agency/team - List agency members
router.get("/api/agency/team", requireRole("AGENCY"), async (req, res) => {
  try {
    const agencyId = getSessionAgencyId(req);

    const members = await knex("agency_memberships as am")
      .join("users as u", "u.id", "am.user_id")
      .where({ "am.agency_id": agencyId })
      .select(
        "am.id as membership_id",
        "am.agency_id",
        "am.user_id",
        "am.membership_role",
        "am.status as membership_status",
        "am.invited_at",
        "am.joined_at",
        "am.created_at",
        "am.updated_at",
        "u.email",
        "u.first_name",
        "u.last_name",
      )
      .orderBy([
        { column: "am.membership_role", order: "asc" },
        { column: "am.created_at", order: "asc" },
      ]);

    return res.json({
      success: true,
      data: members.map(serializeAgencyMember),
    });
  } catch (error) {
    console.error("[Agency Team API] Error listing members:", error);
    return res.status(500).json({ error: "Failed to load team members" });
  }
});

// POST /api/agency/team - Add an existing agency user to this agency
router.post(
  "/api/agency/team",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const parsed = agencyMemberCreateSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid team member payload",
          details: parsed.error.flatten(),
        });
      }

      const { email, membership_role } = parsed.data;
      const user = await knex("users").where({ email, role: "AGENCY" }).first();

      if (!user) {
        return res.status(404).json({
          error: "Agency user not found",
          message:
            "Only existing provisioned agency logins can be added in this phase.",
        });
      }

      let membership = await knex("agency_memberships")
        .where({ agency_id: agencyId, user_id: user.id })
        .first();

      if (membership && membership.status === "ACTIVE") {
        return res
          .status(409)
          .json({ error: "User is already an active member of this agency" });
      }

      if (membership) {
        await knex("agency_memberships")
          .where({ id: membership.id })
          .update({
            membership_role,
            status: "ACTIVE",
            invited_at: membership.invited_at || knex.fn.now(),
            joined_at: membership.joined_at || knex.fn.now(),
            updated_at: knex.fn.now(),
          });
      } else {
        await knex("agency_memberships").insert({
          id: uuidv4(),
          agency_id: agencyId,
          user_id: user.id,
          membership_role,
          status: "ACTIVE",
          invited_at: knex.fn.now(),
          joined_at: knex.fn.now(),
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        });
      }

      membership = await knex("agency_memberships as am")
        .join("users as u", "u.id", "am.user_id")
        .where({
          "am.agency_id": agencyId,
          "am.user_id": user.id,
        })
        .select(
          "am.id as membership_id",
          "am.agency_id",
          "am.user_id",
          "am.membership_role",
          "am.status as membership_status",
          "am.invited_at",
          "am.joined_at",
          "am.created_at",
          "am.updated_at",
          "u.email",
          "u.first_name",
          "u.last_name",
        )
        .first();

      return res.status(201).json({
        success: true,
        data: serializeAgencyMember(membership),
      });
    } catch (error) {
      console.error("[Agency Team API] Error adding member:", error);
      return res.status(500).json({ error: "Failed to add team member" });
    }
  },
);

// PATCH /api/agency/team/:membershipId - Update membership role
router.patch(
  "/api/agency/team/:membershipId",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const { membershipId } = req.params;
      const parsed = agencyMemberUpdateSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid membership update payload",
          details: parsed.error.flatten(),
        });
      }

      const membership = await knex("agency_memberships")
        .where({ id: membershipId, agency_id: agencyId })
        .first();

      if (!membership) {
        return res.status(404).json({ error: "Team member not found" });
      }

      if (membership.membership_role === "OWNER") {
        return res.status(403).json({
          error: "Owner memberships cannot be changed in this phase",
        });
      }

      if (membership.user_id === actorUserId) {
        return res.status(403).json({
          error: "You cannot change your own membership role in this phase",
        });
      }

      await knex("agency_memberships").where({ id: membershipId }).update({
        membership_role: parsed.data.membership_role,
        updated_at: knex.fn.now(),
      });

      const updatedMembership = await knex("agency_memberships as am")
        .join("users as u", "u.id", "am.user_id")
        .where({ "am.id": membershipId })
        .select(
          "am.id as membership_id",
          "am.agency_id",
          "am.user_id",
          "am.membership_role",
          "am.status as membership_status",
          "am.invited_at",
          "am.joined_at",
          "am.created_at",
          "am.updated_at",
          "u.email",
          "u.first_name",
          "u.last_name",
        )
        .first();

      return res.json({
        success: true,
        data: serializeAgencyMember(updatedMembership),
      });
    } catch (error) {
      console.error("[Agency Team API] Error updating member:", error);
      return res.status(500).json({ error: "Failed to update team member" });
    }
  },
);

// DELETE /api/agency/team/:membershipId - Deactivate a membership
router.delete(
  "/api/agency/team/:membershipId",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const { membershipId } = req.params;

      const membership = await knex("agency_memberships")
        .where({ id: membershipId, agency_id: agencyId })
        .first();

      if (!membership) {
        return res.status(404).json({ error: "Team member not found" });
      }

      if (membership.membership_role === "OWNER") {
        return res.status(403).json({
          error: "Owner memberships cannot be deactivated in this phase",
        });
      }

      if (membership.user_id === actorUserId) {
        return res.status(403).json({
          error: "You cannot deactivate your own membership in this phase",
        });
      }

      await knex("agency_memberships").where({ id: membershipId }).update({
        status: "INACTIVE",
        updated_at: knex.fn.now(),
      });

      return res.json({
        success: true,
        data: { membershipId, status: "INACTIVE" },
      });
    } catch (error) {
      console.error("[Agency Team API] Error deactivating member:", error);
      return res.status(500).json({ error: "Failed to remove team member" });
    }
  },
);

// GET /api/agency/export - Export applications as CSV or JSON
router.get(
  "/api/agency/export",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;
      const { format = "csv", status = "", city = "", search = "" } = req.query;

      // Build query similar to main dashboard route
      let query = knex("profiles")
        .select(
          "profiles.first_name",
          "profiles.last_name",
          "profiles.city",
          "profiles.height_cm",
          "profiles.bust",
          "profiles.waist",
          "profiles.hips",
          "profiles.age",
          "profiles.bio_curated",
          "applications.id as application_id",
          "applications.status as application_status",
          "applications.created_at as application_created_at",
          "applications.accepted_at",
          "applications.declined_at",
          "users.email as owner_email",
        )
        .leftJoin("users", "profiles.user_id", "users.id")
        .innerJoin("applications", (join) => {
          join
            .on("applications.profile_id", "=", "profiles.id")
            .andOn("applications.agency_id", "=", knex.raw("?", [agencyId]));
        })
        .whereNotNull("profiles.bio_curated");

      // Apply filters
      if (status && status !== "all") {
        if (status === "pending") {
          query = query.where(function () {
            this.where("applications.status", "pending").orWhereNull(
              "applications.status",
            );
          });
        } else {
          query = query.where("applications.status", status);
        }
      }

      if (city) {
        query = query.whereILike("profiles.city", `%${city}%`);
      }

      if (search) {
        query = query.andWhere((qb) => {
          qb.whereILike("profiles.first_name", `%${search}%`).orWhereILike(
            "profiles.last_name",
            `%${search}%`,
          );
        });
      }

      const applications = await query.orderBy([
        "profiles.last_name",
        "profiles.first_name",
      ]);

      // Get notes and tags for each application
      const applicationIds = applications
        .map((app) => app.application_id)
        .filter(Boolean);

      let notesMap = {};
      let tagsMap = {};

      if (applicationIds.length > 0) {
        // Fetch aggregated notes
        const notes = await knex("application_notes")
          .select("application_id")
          .select(
            knex.raw("string_agg(note, ' | ' ORDER BY created_at) as notes"),
          )
          .whereIn("application_id", applicationIds)
          .groupBy("application_id");

        notes.forEach((note) => {
          notesMap[note.application_id] = note.notes || "";
        });

        // Fetch tags
        const tags = await knex("application_tags")
          .select("application_id")
          .select(knex.raw("string_agg(tag, ', ' ORDER BY created_at) as tags"))
          .whereIn("application_id", applicationIds)
          .groupBy("application_id");

        tags.forEach((tag) => {
          tagsMap[tag.application_id] = tag.tags || "";
        });
      }

      // Format data for export
      const exportData = applications.map((app) => {
        // Format measurements from individual fields
        const measurements = [];
        if (app.bust) measurements.push(`Bust: ${app.bust}`);
        if (app.waist) measurements.push(`Waist: ${app.waist}`);
        if (app.hips) measurements.push(`Hips: ${app.hips}`);
        const measurementsStr =
          measurements.length > 0 ? measurements.join(", ") : "";

        return {
          name: `${app.first_name} ${app.last_name}`,
          email: app.owner_email || "",
          city: app.city || "",
          height_cm: app.height_cm || "",
          measurements: measurementsStr,
          age: app.age || "",
          bio: app.bio_curated || "",
          notes: notesMap[app.application_id] || "",
          tags: tagsMap[app.application_id] || "",
          application_status: app.application_status || "pending",
          applied_date: app.application_created_at
            ? new Date(app.application_created_at).toISOString()
            : "",
          accepted_date: app.accepted_at
            ? new Date(app.accepted_at).toISOString()
            : "",
          declined_date: app.declined_at
            ? new Date(app.declined_at).toISOString()
            : "",
        };
      });

      if (format === "json") {
        return res.json({
          exported_at: new Date().toISOString(),
          total: exportData.length,
          applications: exportData,
        });
      } else {
        // CSV format
        const csvHeaders = [
          "Name",
          "Email",
          "City",
          "Height (cm)",
          "Measurements",
          "Age",
          "Bio",
          "Notes",
          "Tags",
          "Application Status",
          "Applied Date",
          "Accepted Date",
          "Declined Date",
        ];

        const csvRows = exportData.map((app) => {
          const escapeCSV = (str) => {
            if (!str) return "";
            const string = String(str);
            if (
              string.includes(",") ||
              string.includes('"') ||
              string.includes("\n")
            ) {
              return `"${string.replace(/"/g, '""')}"`;
            }
            return string;
          };

          return [
            escapeCSV(app.name),
            escapeCSV(app.email),
            escapeCSV(app.city),
            escapeCSV(app.height_cm),
            escapeCSV(app.measurements),
            escapeCSV(app.age),
            escapeCSV(app.bio),
            escapeCSV(app.notes),
            escapeCSV(app.tags),
            escapeCSV(app.application_status),
            escapeCSV(
              app.applied_date
                ? new Date(app.applied_date).toLocaleDateString()
                : "",
            ),
            escapeCSV(
              app.accepted_date
                ? new Date(app.accepted_date).toLocaleDateString()
                : "",
            ),
            escapeCSV(
              app.declined_date
                ? new Date(app.declined_date).toLocaleDateString()
                : "",
            ),
          ].join(",");
        });

        const csvContent = [csvHeaders.join(","), ...csvRows].join("\n");
        const filename = `pholio-applications-${new Date().toISOString().split("T")[0]}.csv`;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        );
        return res.send(csvContent);
      }
    } catch (error) {
      console.error("[Export API] Error:", error);
      return res.status(500).json({ error: "Failed to export applications" });
    }
  },
);

// GET /api/agency/applications/:applicationId/notes - Get all notes for an application
router.get(
  "/api/agency/applications/:applicationId/notes",
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

      const notes = await knex("application_notes")
        .where({ application_id: applicationId })
        .orderBy("created_at", "desc");

      return res.json(notes);
    } catch (error) {
      console.error("[Notes API] Error:", error);
      return res.status(500).json({ error: "Failed to fetch notes" });
    }
  },
);

// POST /api/agency/applications/:applicationId/notes - Create a new note
router.post(
  "/api/agency/applications/:applicationId/notes",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const { note } = req.body;
      const agencyId = req.session.userId;

      if (!note || !note.trim()) {
        return res.status(400).json({ error: "Note text is required" });
      }

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const noteId = uuidv4();
      const [newNote] = await knex("application_notes")
        .insert({
          id: noteId,
          application_id: applicationId,
          note: note.trim(),
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        })
        .returning("*");

      // Log activity
      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "note_added",
        "Note added",
        { note_id: noteId, note_preview: note.trim().substring(0, 100) },
      );

      return res.json(newNote);
    } catch (error) {
      console.error("[Notes API] Error:", error);
      return res.status(500).json({ error: "Failed to create note" });
    }
  },
);

// PUT /api/agency/applications/:applicationId/notes/:noteId - Update a note
router.put(
  "/api/agency/applications/:applicationId/notes/:noteId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId, noteId } = req.params;
      const { note } = req.body;
      const agencyId = req.session.userId;

      if (!note || !note.trim()) {
        return res.status(400).json({ error: "Note text is required" });
      }

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      // Verify note exists and belongs to this application
      const existingNote = await knex("application_notes")
        .where({ id: noteId, application_id: applicationId })
        .first();

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      const [updatedNote] = await knex("application_notes")
        .where({ id: noteId })
        .update({
          note: note.trim(),
          updated_at: knex.fn.now(),
        })
        .returning("*");

      // Log activity
      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "note_edited",
        "Note edited",
        { note_id: noteId },
      );

      return res.json(updatedNote);
    } catch (error) {
      console.error("[Notes API] Error:", error);
      return res.status(500).json({ error: "Failed to update note" });
    }
  },
);

// DELETE /api/agency/applications/:applicationId/notes/:noteId - Delete a note
router.delete(
  "/api/agency/applications/:applicationId/notes/:noteId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId, noteId } = req.params;
      const agencyId = req.session.userId;

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      // Verify note exists and belongs to this application
      const existingNote = await knex("application_notes")
        .where({ id: noteId, application_id: applicationId })
        .first();

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      await knex("application_notes").where({ id: noteId }).delete();

      // Log activity
      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "note_deleted",
        "Note deleted",
        { note_id: noteId },
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("[Notes API] Error:", error);
      return res.status(500).json({ error: "Failed to delete note" });
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

// GET /api/agency/applications/:applicationId/details - Get full application details
router.get(
  "/api/agency/applications/:applicationId/details",
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

      // Get full profile with all details
      const profile = await knex("profiles")
        .where({ id: application.profile_id })
        .first();

      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // Get all images
      const images = await knex("images")
        .where({ profile_id: profile.id })
        .orderBy(["sort", "created_at"]);

      // Get user info
      const user = await knex("users").where({ id: profile.user_id }).first();

      // Get notes
      const notes = await knex("application_notes")
        .where({ application_id: applicationId })
        .orderBy("created_at", "desc");

      // Get tags
      const tags = await knex("application_tags")
        .where({ application_id: applicationId, agency_id: agencyId })
        .orderBy("created_at", "desc");

      // Update viewed_at timestamp
      await knex("applications")
        .where({ id: applicationId })
        .update({ viewed_at: knex.fn.now() });

      return res.json({
        application: {
          id: application.id,
          status: application.status,
          created_at: application.created_at,
          accepted_at: application.accepted_at,
          declined_at: application.declined_at,
          viewed_at: application.viewed_at,
          invited_by_agency_id: application.invited_by_agency_id,
        },
        profile: {
          ...profile,
          images,
          user_email: user?.email || null,
        },
        notes,
        tags,
      });
    } catch (error) {
      console.error("[Application Details API] Error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch application details" });
    }
  },
);

// GET /api/agency/profiles/:profileId/details - Get profile details (for discover/scout view)
router.get(
  "/api/agency/profiles/:profileId/details",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { profileId } = req.params;
      const agencyId = getSessionAgencyId(req);

      // Get profile
      const profile = await knex("profiles")
        .where({ id: profileId, is_discoverable: true })
        .first();

      if (!profile) {
        return res
          .status(404)
          .json({ error: "Profile not found or not discoverable" });
      }

      // Get all images
      const images = await knex("images")
        .where({ profile_id: profileId })
        .orderBy(["sort", "created_at"]);

      // Get user info
      const user = await knex("users").where({ id: profile.user_id }).first();

      // Check if there's an existing application for this profile
      const application = await knex("applications")
        .where({ profile_id: profileId, agency_id: agencyId })
        .first();

      // If application exists, get notes and tags
      let notes = [];
      let tags = [];
      if (application) {
        notes = await knex("application_notes")
          .where({ application_id: application.id })
          .orderBy("created_at", "desc");

        tags = await knex("application_tags")
          .where({ application_id: application.id, agency_id: agencyId })
          .orderBy("created_at", "desc");
      }

      return res.json({
        application: application
          ? {
              id: application.id,
              status: application.status,
              created_at: application.created_at,
              accepted_at: application.accepted_at,
              declined_at: application.declined_at,
              viewed_at: application.viewed_at,
              invited_by_agency_id: application.invited_by_agency_id,
            }
          : null,
        profile: {
          ...profile,
          images,
          user_email: user?.email || null,
        },
        notes,
        tags,
      });
    } catch (error) {
      console.error("[Profile Details API] Error:", error);
      return res.status(500).json({ error: "Failed to fetch profile details" });
    }
  },
);

// GET /api/agency/roster - Get all signed roster talent for this agency
router.get(
  "/api/agency/roster",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req.session);

      // Fetch all accepted applications for this agency
      const applications = await knex("applications").where({
        agency_id: agencyId,
        status: "accepted",
      });

      if (!applications.length) {
        return res.json([]);
      }

      const profileIds = applications.map((a) => a.profile_id);

      const profiles = await knex("profiles")
        .leftJoin("users", "profiles.user_id", "users.id")
        .whereIn("profiles.id", profileIds)
        .select(
          "profiles.*",
          "users.email",
          "users.first_name",
          "users.last_name",
          "users.phone",
        );

      const images = await knex("images")
        .whereIn("profile_id", profileIds)
        .orderBy(["profile_id", "sort", "created_at"]);

      // Get latest commissions for each profile to determine lastBooking and status
      const commissions = await knex("commissions")
        .whereIn("profile_id", profileIds)
        .where({ agency_id: agencyId })
        .select("profile_id")
        .max("created_at as last_booking_date")
        .groupBy("profile_id");

      const commissionMap = {};
      commissions.forEach((c) => {
        commissionMap[c.profile_id] = c.last_booking_date;
      });

      // Get tags
      const applicationIds = applications.map((a) => a.id);
      const tags = await knex("application_tags")
        .whereIn("application_id", applicationIds)
        .where({ agency_id: agencyId });

      const tagsByApp = {};
      tags.forEach((t) => {
        if (!tagsByApp[t.application_id]) tagsByApp[t.application_id] = [];
        tagsByApp[t.application_id].push(t.tag);
      });

      const response = profiles.map((p) => {
        const app = applications.find((a) => a.profile_id === p.id);
        const profileImages = images.filter((i) => i.profile_id === p.id);
        const coverImage =
          profileImages.find((i) => i.is_cover) || profileImages[0];

        let archetype = p.archetype ? p.archetype.toLowerCase() : "editorial";
        if (
          !["editorial", "commercial", "runway", "fitness", "plus"].includes(
            archetype,
          )
        ) {
          archetype = "editorial";
        }

        const lastBooking = commissionMap[p.id] || null;
        let status = "available";
        if (lastBooking) {
          const daysSince = Math.floor(
            (Date.now() - new Date(lastBooking).getTime()) / 86400000,
          );
          if (daysSince < 7) status = "booking";
          else if (daysSince > 180) status = "inactive";
        }

        return {
          id: p.id,
          applicationId: app.id,
          name:
            [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email,
          gender: p.gender || "female",
          type: archetype,
          status: status,
          location: p.city || "Unknown",
          height: p.height_cm || p.height || 0,
          bust: p.bust_cm || p.bust || 0,
          waist: p.waist_cm || p.waist || 0,
          hips: p.hips_cm || p.hips || 0,
          lastBooking: lastBooking,
          dateAdded: app.accepted_at || app.updated_at,
          tags: tagsByApp[app.id] || [],
          img: coverImage ? coverImage.url : null,
          email: p.email,
          phone: p.phone,
          notes: p.bio,
        };
      });

      // Order by dateAdded desc
      response.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));

      return res.json(response);
    } catch (error) {
      console.error("[Roster API] Error fetching roster:", error);
      return res.status(500).json({ error: "Failed to fetch roster" });
    }
  },
);

// GET /api/agency/roster/:profileId - Get profile for a signed roster talent (bypasses is_discoverable)
router.get(
  "/api/agency/roster/:profileId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { profileId } = req.params;
      const agencyId = req.session.userId;

      // Verify this talent is actually on this agency's roster (accepted application)
      const application = await knex("applications")
        .where({
          profile_id: profileId,
          agency_id: agencyId,
          status: "accepted",
        })
        .first();

      if (!application) {
        return res.status(403).json({ error: "Talent is not on your roster" });
      }

      const profile = await knex("profiles").where({ id: profileId }).first();

      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const images = await knex("images")
        .where({ profile_id: profileId })
        .orderBy(["sort", "created_at"]);

      // Booking stats from commissions table
      const commissionStats = await knex("commissions")
        .where({ profile_id: profileId, agency_id: agencyId })
        .select(
          knex.raw("COUNT(*) as total_bookings"),
          knex.raw("SUM(amount_cents) as total_cents"),
          knex.raw("MAX(created_at) as last_booking_date"),
        )
        .first();

      return res.json({
        profile: {
          ...profile,
          images,
        },
        bookings: {
          total_bookings: commissionStats?.total_bookings
            ? Number(commissionStats.total_bookings)
            : null,
          commission_earned: commissionStats?.total_cents
            ? (Number(commissionStats.total_cents) / 100).toFixed(2)
            : null,
          last_booking_date: commissionStats?.last_booking_date || null,
        },
        application: {
          id: application.id,
          status: application.status,
          created_at: application.created_at,
          accepted_at: application.accepted_at,
        },
      });
    } catch (error) {
      console.error("[Roster Profile API] Error:", error);
      return res.status(500).json({ error: "Failed to fetch roster profile" });
    }
  },
);

// GET /api/agency/analytics - Get detailed analytics
router.get(
  "/api/agency/analytics",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;

      // Get all applications for this agency
      const allApplications = await knex("applications")
        .where({ agency_id: agencyId })
        .select("status", "created_at", "accepted_at", "declined_at");

      // Calculate time ranges
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      // Applications by status
      const byStatus = {
        total: allApplications.length,
        pending: allApplications.filter(
          (a) => !a.status || a.status === "pending",
        ).length,
        accepted: allApplications.filter((a) => a.status === "accepted").length,
        declined: allApplications.filter((a) => a.status === "declined").length,
        archived: allApplications.filter((a) => a.status === "archived").length,
      };

      // Applications over time
      const overTime = {
        today: allApplications.filter((a) => new Date(a.created_at) >= today)
          .length,
        thisWeek: allApplications.filter(
          (a) => new Date(a.created_at) >= weekAgo,
        ).length,
        thisMonth: allApplications.filter(
          (a) => new Date(a.created_at) >= monthAgo,
        ).length,
        last3Months: allApplications.filter(
          (a) => new Date(a.created_at) >= threeMonthsAgo,
        ).length,
      };

      // Applications by board
      const applicationsByBoard = await knex("board_applications")
        .select("boards.name as board_name", "boards.id as board_id")
        .count("board_applications.id as count")
        .join("boards", "board_applications.board_id", "boards.id")
        .join(
          "applications",
          "board_applications.application_id",
          "applications.id",
        )
        .where("applications.agency_id", agencyId)
        .groupBy("boards.id", "boards.name")
        .orderBy("count", "desc");

      // Match score distribution
      const matchScores = await knex("board_applications")
        .select("board_applications.match_score")
        .join(
          "applications",
          "board_applications.application_id",
          "applications.id",
        )
        .where("applications.agency_id", agencyId)
        .whereNotNull("board_applications.match_score")
        .pluck("board_applications.match_score");

      const scoreDistribution = {
        excellent: matchScores.filter((s) => s >= 80).length,
        good: matchScores.filter((s) => s >= 60 && s < 80).length,
        fair: matchScores.filter((s) => s >= 40 && s < 60).length,
        poor: matchScores.filter((s) => s < 40).length,
      };

      // Average match score
      const avgMatchScore =
        matchScores.length > 0
          ? Math.round(
              matchScores.reduce((a, b) => a + b, 0) / matchScores.length,
            )
          : 0;

      // Applications timeline (last 30 days) with status breakdown
      const timeline = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayStart = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
        );
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const dayApplications = allApplications.filter((a) => {
          const created = new Date(a.created_at);
          return created >= dayStart && created < dayEnd;
        });

        const dayStatusBreakdown = {
          pending: dayApplications.filter(
            (a) => !a.status || a.status === "pending",
          ).length,
          accepted: dayApplications.filter((a) => a.status === "accepted")
            .length,
          declined: dayApplications.filter((a) => a.status === "declined")
            .length,
          archived: dayApplications.filter((a) => a.status === "archived")
            .length,
        };

        timeline.push({
          date: dayStart.toISOString().split("T")[0],
          count: dayApplications.length,
          pending: dayStatusBreakdown.pending,
          accepted: dayStatusBreakdown.accepted,
          declined: dayStatusBreakdown.declined,
          archived: dayStatusBreakdown.archived,
        });
      }

      // Acceptance rate
      const acceptedCount = byStatus.accepted;
      const processedCount = acceptedCount + byStatus.declined;
      const acceptanceRate =
        processedCount > 0
          ? Math.round((acceptedCount / processedCount) * 100)
          : 0;

      return res.json({
        success: true,
        analytics: {
          byStatus,
          overTime,
          byBoard: applicationsByBoard.map((b) => ({
            board_id: b.board_id,
            board_name: b.board_name,
            count: parseInt(b.count || 0),
          })),
          matchScores: {
            distribution: scoreDistribution,
            average: avgMatchScore,
            total: matchScores.length,
          },
          timeline,
          acceptanceRate,
        },
      });
    } catch (error) {
      console.error("[Dashboard/Agency Analytics] Error:", error);
      return res.status(500).json({
        error: "Failed to load analytics",
        details:
          process.env.NODE_ENV !== "production" ? error.message : undefined,
      });
    }
  },
);

// GET /api/agency/overview/recent-applicants - Get recent applicants for overview dashboard
router.get(
  "/api/agency/overview/recent-applicants",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;
      const limit = parseInt(req.query.limit) || 5;

      // Get recent applications with profile data
      const recentApplications = await knex("applications")
        .where({ agency_id: agencyId })
        .join("profiles", "applications.profile_id", "profiles.id")
        .join("users", "profiles.user_id", "users.id")
        .leftJoin("board_applications", function () {
          this.on(
            "applications.id",
            "=",
            "board_applications.application_id",
          ).andOn("board_applications.is_primary", "=", knex.raw("?", [true]));
        })
        .leftJoin("boards", "board_applications.board_id", "boards.id")
        .select(
          "applications.id as application_id",
          "applications.status as application_status",
          "applications.created_at as application_created_at",
          "profiles.id as profile_id",
          "profiles.first_name",
          "profiles.last_name",
          "profiles.profile_image",
          "profiles.city",
          "profiles.country",
          "profiles.height",
          "profiles.age",
          "profiles.slug",
          "users.email as user_email",
          "board_applications.match_score",
        )
        .orderBy("applications.created_at", "desc")
        .limit(limit);

      // Format the response
      const formatted = recentApplications.map((app) => {
        const isNew =
          new Date(app.application_created_at) >
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const fullName =
          `${app.first_name || ""} ${app.last_name || ""}`.trim() || "Unknown";
        const location =
          [app.city, app.country].filter(Boolean).join(", ") ||
          "Location not specified";

        return {
          applicationId: app.application_id,
          profileId: app.profile_id,
          name: fullName,
          location: location,
          height: app.height || "N/A",
          age: app.age || "N/A",
          profileImage: app.profile_image || "/images/default-avatar.png",
          matchScore: app.match_score ? Math.round(app.match_score) : null,
          isNew: isNew,
          slug: app.slug,
          createdAt: app.application_created_at,
        };
      });

      return res.json({
        success: true,
        applicants: formatted,
      });
    } catch (error) {
      console.error("[Dashboard/Agency/Recent Applicants] Error:", error);
      return res.status(500).json({
        error: "Failed to load recent applicants",
        details:
          process.env.NODE_ENV !== "production" ? error.message : undefined,
      });
    }
  },
);

// GET /api/agency/overview/stats - Get overview stats (talent pool, board growth)
router.get(
  "/api/agency/overview/stats",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;

      // Calculate total talent pool (accepted applications + all public talent)
      const acceptedCount = await knex("applications")
        .where({ agency_id: agencyId, status: "accepted" })
        .count("id as count")
        .first();

      // Get all public talent profiles (not just applications)
      const publicTalentCount = await knex("profiles")
        .where({ is_discoverable: true })
        .count("id as count")
        .first();

      const totalTalentPool =
        parseInt(acceptedCount?.count || 0) +
        parseInt(publicTalentCount?.count || 0);

      // Calculate board growth (compare current month vs previous month)
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonthStart = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      );
      const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const currentMonthBoards = await knex("boards")
        .where({ agency_id: agencyId })
        .where("created_at", ">=", currentMonthStart)
        .count("id as count")
        .first();

      const previousMonthBoards = await knex("boards")
        .where({ agency_id: agencyId })
        .where("created_at", ">=", previousMonthStart)
        .where("created_at", "<", currentMonthStart)
        .count("id as count")
        .first();

      const currentCount = parseInt(currentMonthBoards?.count || 0);
      const previousCount = parseInt(previousMonthBoards?.count || 0);

      let growthPercentage = 0;
      if (previousCount > 0) {
        growthPercentage = Math.round(
          ((currentCount - previousCount) / previousCount) * 100,
        );
      } else if (currentCount > 0) {
        growthPercentage = 100; // New boards this month
      }

      return res.json({
        success: true,
        stats: {
          totalTalentPool: totalTalentPool,
          boardGrowth: growthPercentage,
        },
      });
    } catch (error) {
      console.error("[Dashboard/Agency/Overview Stats] Error:", error);
      return res.status(500).json({
        error: "Failed to load overview stats",
        details:
          process.env.NODE_ENV !== "production" ? error.message : undefined,
      });
    }
  },
);

// GET /api/agency/discover - Get discoverable talent (for React frontend)
// Supports optional ?q= parameter for semantic (vibe) search via pgvector.
router.get(
  "/api/agency/discover",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const {
        sort = "az",
        city = "",
        letter = "",
        search = "",
        min_height = "",
        max_height = "",
        min_age = "",
        max_age = "",
        gender = "",
        eye_color = "",
        hair_color = "",
        archetype = "",
        experience_level = "",
        page = "1",
        limit = "20",
        q = "", // semantic / vibe search query
      } = req.query;

      const agencyId = getSessionAgencyId(req);
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      // Get existing application profile IDs
      const existingApplicationProfileIds = await knex("applications")
        .where({ agency_id: agencyId })
        .pluck("profile_id");

      let query = knex("profiles")
        .select("profiles.*", "users.email as owner_email")
        .leftJoin("users", "profiles.user_id", "users.id")
        .where({
          "profiles.is_discoverable": true,
          "profiles.profile_status": "active",
        })
        .whereNotNull("profiles.bio_curated");

      // Exclude profiles that already have applications
      if (existingApplicationProfileIds.length > 0) {
        query = query.whereNotIn("profiles.id", existingApplicationProfileIds);
      }

      // Apply filters
      if (city) {
        query = query.whereILike("profiles.city", `%${city}%`);
      }

      if (letter) {
        query = query.whereILike("profiles.last_name", `${letter}%`);
      }

      if (search) {
        query = query.andWhere((qb) => {
          qb.whereILike("profiles.first_name", `%${search}%`).orWhereILike(
            "profiles.last_name",
            `%${search}%`,
          );
        });
      }

      const minHeightNumber = parseInt(min_height, 10);
      const maxHeightNumber = parseInt(max_height, 10);
      if (!Number.isNaN(minHeightNumber)) {
        query = query.where("profiles.height_cm", ">=", minHeightNumber);
      }
      if (!Number.isNaN(maxHeightNumber)) {
        query = query.where("profiles.height_cm", "<=", maxHeightNumber);
      }

      const minAgeNumber = parseInt(min_age, 10);
      const maxAgeNumber = parseInt(max_age, 10);
      if (!Number.isNaN(minAgeNumber)) {
        query = query.where("profiles.age", ">=", minAgeNumber);
      }
      if (!Number.isNaN(maxAgeNumber)) {
        query = query.where("profiles.age", "<=", maxAgeNumber);
      }

      if (gender) {
        query = query.where("profiles.gender", gender);
      }

      if (eye_color) {
        query = query.where("profiles.eye_color", eye_color);
      }

      if (hair_color) {
        query = query.where("profiles.hair_color", hair_color);
      }

      if (archetype) {
        query = query.where("profiles.archetype", archetype);
      }

      if (experience_level) {
        query = query.where("profiles.experience_level", experience_level);
      }

      // Get total count before applying sort/pagination
      const countQuery = query
        .clone()
        .clearSelect()
        .clearOrder()
        .count("* as count");
      const [countResult] = await countQuery;
      const totalCount = parseInt(countResult?.count || 0, 10);
      const totalPages = Math.ceil(totalCount / limitNum);

      // ── Sort: semantic (vibe) search if ?q= provided, else normal sort ────
      const isPostgres =
        knex.client.config.client === "pg" ||
        knex.client.config.client === "postgresql";
      let usedSemanticSort = false;

      if (q && isPostgres && process.env.OPENAI_API_KEY) {
        try {
          const queryEmbedding = await embed(q);
          const vectorLiteral = toVectorLiteral(queryEmbedding);

          query = query
            .leftJoin("talent_text_embeddings as tte", function () {
              this.on("tte.profile_id", "=", "profiles.id").andOnVal(
                "tte.source",
                "full_profile",
              );
            })
            .select(
              knex.raw("tte.embedding <=> ?::vector as vibe_distance", [
                vectorLiteral,
              ]),
            )
            .orderByRaw("tte.embedding <=> ?::vector ASC NULLS LAST", [
              vectorLiteral,
            ]);

          usedSemanticSort = true;
          console.log(`[Discover] Semantic sort active — query: "${q}"`);
        } catch (embedErr) {
          console.warn(
            "[Discover] Semantic sort failed, using default sort:",
            embedErr.message,
          );
        }
      }

      if (!usedSemanticSort) {
        if (sort === "city") {
          query = query.orderBy(["profiles.city", "profiles.last_name"]);
        } else if (sort === "newest") {
          query = query.orderBy("profiles.created_at", "desc");
        } else {
          query = query.orderBy(["profiles.last_name", "profiles.first_name"]);
        }
      }

      // Apply pagination
      query = query.limit(limitNum).offset(offset);

      const profiles = await query;

      // Fetch images
      const profileIds = profiles.map((p) => p.id);
      const allImages =
        profileIds.length > 0
          ? await knex("images")
              .whereIn("profile_id", profileIds)
              .orderBy(["profile_id", "sort", "created_at"])
          : [];

      const imagesByProfile = {};
      allImages.forEach((img) => {
        if (!imagesByProfile[img.profile_id]) {
          imagesByProfile[img.profile_id] = [];
        }
        imagesByProfile[img.profile_id].push(img);
      });

      profiles.forEach((profile) => {
        profile.images = imagesByProfile[profile.id] || [];
      });

      return res.json({
        profiles,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
        meta: {
          semantic_search: usedSemanticSort,
          query: usedSemanticSort ? q : null,
        },
      });
    } catch (error) {
      console.error("[API/Agency/Discover] Error:", error);
      return next(error);
    }
  },
);

// GET /api/agency/discover/:profileId/preview - Get profile preview
router.get(
  "/api/agency/discover/:profileId/preview",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { profileId } = req.params;

      const profile = await knex("profiles")
        .where({ id: profileId, is_discoverable: true })
        .first();

      if (!profile) {
        return res
          .status(404)
          .json({ error: "Profile not found or not discoverable" });
      }

      // Get images
      const images = await knex("images")
        .where({ profile_id: profileId })
        .orderBy(["sort", "created_at"]);

      return res.json({
        success: true,
        profile: {
          ...profile,
          images: images.map((img) => ({
            path: img.path,
            alt: img.alt || `${profile.first_name} ${profile.last_name}`,
          })),
        },
      });
    } catch (error) {
      console.error("[API/Agency/Discover Preview] Error:", error);
      return res.status(500).json({ error: "Failed to load profile preview" });
    }
  },
);

// POST /api/agency/discover/:profileId/invite - Invite talent to apply
router.post(
  "/api/agency/discover/:profileId/invite",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { profileId } = req.params;
      const agencyId = getSessionAgencyId(req);

      const profile = await knex("profiles")
        .where({ id: profileId, is_discoverable: true })
        .first();

      if (!profile) {
        return res
          .status(404)
          .json({ error: "Profile not found or not discoverable" });
      }

      const existingApplication = await knex("applications")
        .where({ profile_id: profileId, agency_id: agencyId })
        .first();

      if (existingApplication) {
        return res
          .status(409)
          .json({ error: "You have already invited this talent" });
      }

      const applicationId = require("crypto").randomUUID();
      await knex("applications").insert({
        id: applicationId,
        profile_id: profileId,
        agency_id: agencyId,
        status: "pending",
        invited_by_agency_id: agencyId,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      // Send invitation email (optional)
      try {
        const { sendAgencyInviteEmail } = require("../../lib/email");
        const talentUser = await knex("users")
          .where({ id: profile.user_id })
          .first();

        const agency = await knex("agencies").where({ id: agencyId }).first();

        if (talentUser && agency) {
          await sendAgencyInviteEmail({
            talentEmail: talentUser.email,
            talentName: `${profile.first_name} ${profile.last_name}`,
            agencyName: agency.name,
          });
        }
      } catch (emailError) {
        console.error("[Discover Invite] Email send error:", emailError);
        // Don't fail the request if email fails
      }

      return res.json({
        success: true,
        message: "Invitation sent successfully",
      });
    } catch (error) {
      console.error("[API/Agency/Invite] Error:", error);
      return next(error);
    }
  },
);

// ============================================================================
// Messaging API
// ============================================================================

// GET /api/agency/messages/threads - Get all conversation threads for agency
router.get(
  "/api/agency/messages/threads",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;

      // Subquery to get the latest message for each application
      const latestMessageSubquery = knex("messages")
        .select("application_id")
        .max("created_at as max_created_at")
        .groupBy("application_id")
        .as("latest_msgs");

      // Get threads with latest message info
      const threads = await knex("messages as m")
        .join("applications as a", "m.application_id", "a.id")
        .join("profiles as p", "a.profile_id", "p.id")
        .leftJoin("board_applications as ba", "ba.application_id", "a.id")
        .leftJoin("boards as b", "ba.board_id", "b.id")
        .join(latestMessageSubquery, function () {
          this.on("m.application_id", "=", "latest_msgs.application_id");
          this.andOn("m.created_at", "=", "latest_msgs.max_created_at");
        })
        .where("a.agency_id", agencyId)
        .select([
          "a.id as id",
          knex.raw("p.first_name || ' ' || p.last_name as \"senderName\""),
          "b.name as board_name",
          "m.message as preview",
          "m.created_at as timestamp",
          "p.id as profile_id",
        ])
        .orderBy("m.created_at", "desc");

      // Get unread counts for each application
      const unreadCounts = await knex("messages")
        .join("applications", "messages.application_id", "applications.id")
        .where("applications.agency_id", agencyId)
        .where("messages.is_read", false)
        .where("messages.sender_type", "TALENT")
        .groupBy("messages.application_id")
        .select("messages.application_id")
        .count("* as count");

      const unreadMap = {};
      unreadCounts.forEach((row) => {
        unreadMap[row.application_id] = parseInt(row.count);
      });

      // Get primary images for avatars
      const profileIds = threads.map((t) => t.profile_id);
      const images =
        profileIds.length > 0
          ? await knex("images")
              .whereIn("profile_id", profileIds)
              .where("is_primary", true)
          : [];

      const imageMap = {};
      images.forEach((img) => {
        imageMap[img.profile_id] = img.path;
      });

      // Format threads for frontend
      const formattedThreads = threads.map((t) => ({
        id: t.id,
        senderName: t.senderName,
        senderAvatar: imageMap[t.profile_id]
          ? `/${imageMap[t.profile_id]}`
          : null,
        applicationLabel: `Application #${t.id.substring(0, 4).toUpperCase()} · ${t.board_name || "General"}`,
        preview: t.preview,
        timestamp: t.timestamp,
        unread: !!unreadMap[t.id],
        unreadCount: unreadMap[t.id] || 0,
      }));

      return res.json({
        success: true,
        data: formattedThreads,
      });
    } catch (error) {
      console.error("[Messages API] Error fetching threads:", error);
      return res
        .status(500)
        .json({ error: "Failed to load conversation threads" });
    }
  },
);

// GET /api/agency/applications/:applicationId/messages - Get all messages for an application
router.get(
  "/api/agency/applications/:applicationId/messages",
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

      // Get all messages for this application
      const messages = await knex("messages")
        .where({ application_id: applicationId })
        .leftJoin("users", "messages.sender_id", "users.id")
        .select(
          "messages.*",
          "users.email as sender_email",
          "users.name as sender_name",
        )
        .orderBy("messages.created_at", "asc");

      return res.json({
        success: true,
        data: messages,
      });
    } catch (error) {
      console.error("[Messages API] Error fetching messages:", error);
      return res.status(500).json({ error: "Failed to load messages" });
    }
  },
);

// POST /api/agency/applications/:applicationId/messages - Send a message
router.post(
  "/api/agency/applications/:applicationId/messages",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const { message, attachment_url } = req.body;
      const agencyId = req.session.userId;
      const actorUserId = getSessionActorUserId(req.session);

      if (!message || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const { v4: uuidv4 } = require("uuid");
      const messageId = uuidv4();

      await knex("messages").insert({
        id: messageId,
        application_id: applicationId,
        sender_id: actorUserId,
        sender_type: "AGENCY",
        message: message.trim(),
        attachment_url: attachment_url || null,
        is_read: false,
        created_at: knex.fn.now(),
      });

      // Log activity
      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "message_sent",
        "Message sent to talent",
        { message_preview: message.trim().substring(0, 100) },
      );

      // Send email notification (async, non-blocking)
      (async () => {
        try {
          // Get talent info
          const talent = await knex("users")
            .where({ id: application.talent_id })
            .first();

          // Get agency info
          const agency = await knex("agencies").where({ id: agencyId }).first();

          if (talent && talent.email && agency) {
            const messagePreview =
              message.trim().length > 150
                ? message.trim().substring(0, 150) + "..."
                : message.trim();

            await sendNewMessageEmail({
              to: talent.email,
              recipientName: talent.name || "there",
              senderName: agency.name || "An agency",
              messagePreview,
            });
          }
        } catch (emailError) {
          console.error("[Send Message] Email notification error:", emailError);
          // Don't fail the main operation if email fails
        }
      })();

      const newMessage = await knex("messages")
        .where({ id: messageId })
        .leftJoin("users", "messages.sender_id", "users.id")
        .select(
          "messages.*",
          "users.email as sender_email",
          "users.name as sender_name",
        )
        .first();

      return res.json({
        success: true,
        data: newMessage,
      });
    } catch (error) {
      console.error("[Messages API] Error sending message:", error);
      return res.status(500).json({ error: "Failed to send message" });
    }
  },
);

// POST /api/agency/messages/:messageId/read - Mark message as read
router.post(
  "/api/agency/messages/:messageId/read",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { messageId } = req.params;
      const agencyId = req.session.userId;

      // Get message and verify access
      const message = await knex("messages")
        .where({ "messages.id": messageId })
        .join("applications", "messages.application_id", "applications.id")
        .where({ "applications.agency_id": agencyId })
        .select("messages.*")
        .first();

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Mark as read
      await knex("messages").where({ id: messageId }).update({
        is_read: true,
        read_at: knex.fn.now(),
      });

      return res.json({
        success: true,
        data: { message: "Message marked as read" },
      });
    } catch (error) {
      console.error("[Messages API] Error marking message as read:", error);
      return res.status(500).json({ error: "Failed to mark message as read" });
    }
  },
);

// GET /api/agency/messages/unread-count - Get unread message count
router.get(
  "/api/agency/messages/unread-count",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;

      const result = await knex("messages")
        .join("applications", "messages.application_id", "applications.id")
        .where({ "applications.agency_id": agencyId })
        .where({ "messages.is_read": false })
        .where("messages.sender_type", "!=", "AGENCY") // Only count messages FROM talent
        .count("* as count")
        .first();

      return res.json({
        success: true,
        data: {
          unread_count: parseInt(result.count || 0),
        },
      });
    } catch (error) {
      console.error("[Messages API] Error getting unread count:", error);
      return res.status(500).json({ error: "Failed to get unread count" });
    }
  },
);

// ============================================================================
// Filter Presets API
// ============================================================================

// GET /api/agency/filter-presets - List all filter presets for agency
router.get(
  "/api/agency/filter-presets",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;

      const presets = await knex("filter_presets")
        .where({ agency_id: agencyId })
        .orderBy([
          { column: "is_default", order: "desc" },
          { column: "created_at", order: "desc" },
        ]);

      // Parse filters JSON
      const parsedPresets = presets.map((preset) => ({
        ...preset,
        filters: JSON.parse(preset.filters),
      }));

      return res.json({
        success: true,
        data: parsedPresets,
      });
    } catch (error) {
      console.error("[Filter Presets API] Error listing presets:", error);
      return res.status(500).json({ error: "Failed to load filter presets" });
    }
  },
);

// POST /api/agency/filter-presets - Create new filter preset
router.post(
  "/api/agency/filter-presets",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { name, filters } = req.body;
      const agencyId = req.session.userId;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Preset name is required" });
      }

      if (!filters || typeof filters !== "object") {
        return res.status(400).json({ error: "Filters object is required" });
      }

      const { v4: uuidv4 } = require("uuid");
      const presetId = uuidv4();

      await knex("filter_presets").insert({
        id: presetId,
        agency_id: agencyId,
        name: name.trim(),
        filters: JSON.stringify(filters),
        is_default: false,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      const preset = await knex("filter_presets")
        .where({ id: presetId })
        .first();

      return res.json({
        success: true,
        data: {
          ...preset,
          filters: JSON.parse(preset.filters),
        },
      });
    } catch (error) {
      console.error("[Filter Presets API] Error creating preset:", error);
      return res.status(500).json({ error: "Failed to create filter preset" });
    }
  },
);

// PUT /api/agency/filter-presets/:id - Update filter preset
router.put(
  "/api/agency/filter-presets/:id",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, filters } = req.body;
      const agencyId = req.session.userId;

      // Verify ownership
      const preset = await knex("filter_presets")
        .where({ id, agency_id: agencyId })
        .first();

      if (!preset) {
        return res.status(404).json({ error: "Preset not found" });
      }

      const updateData = { updated_at: knex.fn.now() };
      if (name !== undefined) updateData.name = name.trim();
      if (filters !== undefined) updateData.filters = JSON.stringify(filters);

      await knex("filter_presets").where({ id }).update(updateData);

      const updated = await knex("filter_presets").where({ id }).first();

      return res.json({
        success: true,
        data: {
          ...updated,
          filters: JSON.parse(updated.filters),
        },
      });
    } catch (error) {
      console.error("[Filter Presets API] Error updating preset:", error);
      return res.status(500).json({ error: "Failed to update filter preset" });
    }
  },
);

// DELETE /api/agency/filter-presets/:id - Delete filter preset
router.delete(
  "/api/agency/filter-presets/:id",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const agencyId = req.session.userId;

      // Verify ownership
      const preset = await knex("filter_presets")
        .where({ id, agency_id: agencyId })
        .first();

      if (!preset) {
        return res.status(404).json({ error: "Preset not found" });
      }

      await knex("filter_presets").where({ id }).delete();

      return res.json({
        success: true,
        data: { message: "Preset deleted successfully" },
      });
    } catch (error) {
      console.error("[Filter Presets API] Error deleting preset:", error);
      return res.status(500).json({ error: "Failed to delete filter preset" });
    }
  },
);

// PUT /api/agency/filter-presets/:id/set-default - Set preset as default
router.put(
  "/api/agency/filter-presets/:id/set-default",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const agencyId = req.session.userId;

      // Verify ownership
      const preset = await knex("filter_presets")
        .where({ id, agency_id: agencyId })
        .first();

      if (!preset) {
        return res.status(404).json({ error: "Preset not found" });
      }

      // Remove default flag from all other presets
      await knex("filter_presets")
        .where({ agency_id: agencyId })
        .update({ is_default: false });

      // Set this preset as default
      await knex("filter_presets")
        .where({ id })
        .update({ is_default: true, updated_at: knex.fn.now() });

      const updated = await knex("filter_presets").where({ id }).first();

      return res.json({
        success: true,
        data: {
          ...updated,
          filters: JSON.parse(updated.filters),
        },
      });
    } catch (error) {
      console.error(
        "[Filter Presets API] Error setting default preset:",
        error,
      );
      return res.status(500).json({ error: "Failed to set default preset" });
    }
  },
);

// ============================================================================
// Interview Scheduling API
// ============================================================================

// POST /api/agency/applications/:applicationId/interviews - Schedule interview
router.post(
  "/api/agency/applications/:applicationId/interviews",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const {
        proposed_datetime,
        duration_minutes = 30,
        interview_type,
        location,
        meeting_url,
        notes,
      } = req.body;
      const agencyId = req.session.userId;

      // Validate required fields
      if (!proposed_datetime || !interview_type) {
        return res.status(400).json({
          error: "Proposed date/time and interview type are required",
        });
      }

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const interviewId = uuidv4();

      await knex("interviews").insert({
        id: interviewId,
        application_id: applicationId,
        agency_id: agencyId,
        talent_id: application.talent_id,
        proposed_datetime,
        duration_minutes,
        interview_type,
        location: location || null,
        meeting_url: meeting_url || null,
        notes: notes || null,
        status: "pending",
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      // Log activity
      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "interview_scheduled",
        "Interview scheduled",
        {
          interview_id: interviewId,
          datetime: proposed_datetime,
          type: interview_type,
        },
      );

      const interview = await knex("interviews")
        .where({ id: interviewId })
        .first();

      return res.json({
        success: true,
        data: interview,
        message: "Interview scheduled successfully",
      });
    } catch (error) {
      console.error("[Interviews API] Error scheduling interview:", error);
      return res.status(500).json({ error: "Failed to schedule interview" });
    }
  },
);

// GET /api/agency/interviews - Get all interviews for agency
router.get(
  "/api/agency/interviews",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;
      const { status, upcoming } = req.query;

      let query = knex("interviews")
        .where({ "interviews.agency_id": agencyId })
        .leftJoin(
          "applications",
          "interviews.application_id",
          "applications.id",
        )
        .leftJoin("users as talent", "interviews.talent_id", "talent.id")
        .leftJoin("profiles", "talent.id", "profiles.user_id")
        .select(
          "interviews.*",
          "talent.name as talent_name",
          "talent.email as talent_email",
          "profiles.slug as talent_slug",
        );

      // Filter by status
      if (status) {
        query = query.where({ "interviews.status": status });
      }

      // Filter for upcoming interviews only
      if (upcoming === "true") {
        query = query
          .where("interviews.proposed_datetime", ">=", knex.fn.now())
          .whereIn("interviews.status", ["pending", "accepted"]);
      }

      const interviews = await query.orderBy(
        "interviews.proposed_datetime",
        "asc",
      );

      return res.json({
        success: true,
        data: interviews,
      });
    } catch (error) {
      console.error("[Interviews API] Error fetching interviews:", error);
      return res.status(500).json({ error: "Failed to load interviews" });
    }
  },
);

// GET /api/agency/applications/:applicationId/interviews - Get interviews for specific application
router.get(
  "/api/agency/applications/:applicationId/interviews",
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

      const interviews = await knex("interviews")
        .where({ application_id: applicationId })
        .orderBy("proposed_datetime", "desc");

      return res.json({
        success: true,
        data: interviews,
      });
    } catch (error) {
      console.error(
        "[Interviews API] Error fetching application interviews:",
        error,
      );
      return res.status(500).json({ error: "Failed to load interviews" });
    }
  },
);

// PATCH /api/agency/interviews/:interviewId - Update/reschedule interview
router.patch(
  "/api/agency/interviews/:interviewId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { interviewId } = req.params;
      const {
        proposed_datetime,
        duration_minutes,
        interview_type,
        location,
        meeting_url,
        notes,
        status,
      } = req.body;
      const agencyId = req.session.userId;

      // Verify interview belongs to this agency
      const interview = await knex("interviews")
        .where({ id: interviewId, agency_id: agencyId })
        .first();

      if (!interview) {
        return res.status(404).json({ error: "Interview not found" });
      }

      const updates = { updated_at: knex.fn.now() };

      if (proposed_datetime !== undefined)
        updates.proposed_datetime = proposed_datetime;
      if (duration_minutes !== undefined)
        updates.duration_minutes = duration_minutes;
      if (interview_type !== undefined) updates.interview_type = interview_type;
      if (location !== undefined) updates.location = location;
      if (meeting_url !== undefined) updates.meeting_url = meeting_url;
      if (notes !== undefined) updates.notes = notes;
      if (status !== undefined) updates.status = status;

      await knex("interviews").where({ id: interviewId }).update(updates);

      // Log activity if rescheduled
      if (proposed_datetime !== undefined) {
        await logActivity(
          knex,
          interview.application_id,
          agencyId,
          agencyId,
          "interview_rescheduled",
          "Interview rescheduled",
          {
            interview_id: interviewId,
            old_datetime: interview.proposed_datetime,
            new_datetime: proposed_datetime,
          },
        );
      }

      const updated = await knex("interviews")
        .where({ id: interviewId })
        .first();

      return res.json({
        success: true,
        data: updated,
        message: "Interview updated successfully",
      });
    } catch (error) {
      console.error("[Interviews API] Error updating interview:", error);
      return res.status(500).json({ error: "Failed to update interview" });
    }
  },
);

// DELETE /api/agency/interviews/:interviewId - Cancel interview
router.delete(
  "/api/agency/interviews/:interviewId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { interviewId } = req.params;
      const agencyId = req.session.userId;

      // Verify interview belongs to this agency
      const interview = await knex("interviews")
        .where({ id: interviewId, agency_id: agencyId })
        .first();

      if (!interview) {
        return res.status(404).json({ error: "Interview not found" });
      }

      // Mark as cancelled instead of deleting
      await knex("interviews").where({ id: interviewId }).update({
        status: "cancelled",
        updated_at: knex.fn.now(),
      });

      // Log activity
      await logActivity(
        knex,
        interview.application_id,
        agencyId,
        agencyId,
        "interview_cancelled",
        "Interview cancelled",
        {
          interview_id: interviewId,
          datetime: interview.proposed_datetime,
        },
      );

      return res.json({
        success: true,
        message: "Interview cancelled successfully",
      });
    } catch (error) {
      console.error("[Interviews API] Error cancelling interview:", error);
      return res.status(500).json({ error: "Failed to cancel interview" });
    }
  },
);

// ============================================================================
// Reminders API
// ============================================================================

// POST /api/agency/applications/:applicationId/reminders - Create reminder
router.post(
  "/api/agency/applications/:applicationId/reminders",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const {
        reminder_type,
        reminder_date,
        title,
        notes,
        priority = "normal",
      } = req.body;
      const agencyId = req.session.userId;

      // Validate required fields
      if (!reminder_type || !reminder_date || !title) {
        return res
          .status(400)
          .json({ error: "Reminder type, date, and title are required" });
      }

      // Verify application belongs to this agency
      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const reminderId = uuidv4();

      await knex("reminders").insert({
        id: reminderId,
        application_id: applicationId,
        agency_id: agencyId,
        reminder_type,
        reminder_date,
        title,
        notes: notes || null,
        priority,
        status: "pending",
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      // Log activity
      await logActivity(
        knex,
        applicationId,
        agencyId,
        agencyId,
        "reminder_created",
        "Reminder set",
        {
          reminder_id: reminderId,
          reminder_date,
          title,
        },
      );

      const reminder = await knex("reminders")
        .where({ id: reminderId })
        .first();

      return res.json({
        success: true,
        data: reminder,
        message: "Reminder created successfully",
      });
    } catch (error) {
      console.error("[Reminders API] Error creating reminder:", error);
      return res.status(500).json({ error: "Failed to create reminder" });
    }
  },
);

// GET /api/agency/reminders - Get all reminders for agency
router.get(
  "/api/agency/reminders",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;
      const { status, due, priority } = req.query;

      let query = knex("reminders")
        .where({ "reminders.agency_id": agencyId })
        .leftJoin("applications", "reminders.application_id", "applications.id")
        .leftJoin("users as talent", "applications.talent_id", "talent.id")
        .leftJoin("profiles", "talent.id", "profiles.user_id")
        .select(
          "reminders.*",
          "talent.name as talent_name",
          "talent.email as talent_email",
          "profiles.slug as talent_slug",
        );

      // Filter by status
      if (status) {
        query = query.where({ "reminders.status": status });
      }

      // Filter by priority
      if (priority) {
        query = query.where({ "reminders.priority": priority });
      }

      // Filter for due reminders (due today or overdue)
      if (due === "true") {
        query = query
          .where("reminders.reminder_date", "<=", knex.fn.now())
          .where({ "reminders.status": "pending" });
      }

      const reminders = await query.orderBy("reminders.reminder_date", "asc");

      return res.json({
        success: true,
        data: reminders,
      });
    } catch (error) {
      console.error("[Reminders API] Error fetching reminders:", error);
      return res.status(500).json({ error: "Failed to load reminders" });
    }
  },
);

// GET /api/agency/reminders/due - Get count of due reminders
router.get(
  "/api/agency/reminders/due",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = req.session.userId;

      const result = await knex("reminders")
        .where({ agency_id: agencyId, status: "pending" })
        .where("reminder_date", "<=", knex.fn.now())
        .count("* as count")
        .first();

      return res.json({
        success: true,
        data: { count: parseInt(result.count) },
      });
    } catch (error) {
      console.error(
        "[Reminders API] Error fetching due reminders count:",
        error,
      );
      return res
        .status(500)
        .json({ error: "Failed to get due reminders count" });
    }
  },
);

// GET /api/agency/applications/:applicationId/reminders - Get reminders for specific application
router.get(
  "/api/agency/applications/:applicationId/reminders",
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

      const reminders = await knex("reminders")
        .where({ application_id: applicationId })
        .orderBy("reminder_date", "asc");

      return res.json({
        success: true,
        data: reminders,
      });
    } catch (error) {
      console.error(
        "[Reminders API] Error fetching application reminders:",
        error,
      );
      return res.status(500).json({ error: "Failed to load reminders" });
    }
  },
);

// PATCH /api/agency/reminders/:reminderId - Update reminder
router.patch(
  "/api/agency/reminders/:reminderId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { reminderId } = req.params;
      const { reminder_type, reminder_date, title, notes, priority, status } =
        req.body;
      const agencyId = req.session.userId;

      // Verify reminder belongs to this agency
      const reminder = await knex("reminders")
        .where({ id: reminderId, agency_id: agencyId })
        .first();

      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }

      const updates = { updated_at: knex.fn.now() };

      if (reminder_type !== undefined) updates.reminder_type = reminder_type;
      if (reminder_date !== undefined) updates.reminder_date = reminder_date;
      if (title !== undefined) updates.title = title;
      if (notes !== undefined) updates.notes = notes;
      if (priority !== undefined) updates.priority = priority;
      if (status !== undefined) {
        updates.status = status;
        if (status === "completed") {
          updates.completed_at = knex.fn.now();
        }
      }

      await knex("reminders").where({ id: reminderId }).update(updates);

      const updated = await knex("reminders").where({ id: reminderId }).first();

      return res.json({
        success: true,
        data: updated,
        message: "Reminder updated successfully",
      });
    } catch (error) {
      console.error("[Reminders API] Error updating reminder:", error);
      return res.status(500).json({ error: "Failed to update reminder" });
    }
  },
);

// POST /api/agency/reminders/:reminderId/complete - Mark reminder as completed
router.post(
  "/api/agency/reminders/:reminderId/complete",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { reminderId } = req.params;
      const agencyId = req.session.userId;

      // Verify reminder belongs to this agency
      const reminder = await knex("reminders")
        .where({ id: reminderId, agency_id: agencyId })
        .first();

      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }

      await knex("reminders").where({ id: reminderId }).update({
        status: "completed",
        completed_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      // Log activity
      await logActivity(
        knex,
        reminder.application_id,
        agencyId,
        agencyId,
        "reminder_completed",
        "Reminder completed",
        {
          reminder_id: reminderId,
          title: reminder.title,
        },
      );

      return res.json({
        success: true,
        message: "Reminder marked as completed",
      });
    } catch (error) {
      console.error("[Reminders API] Error completing reminder:", error);
      return res.status(500).json({ error: "Failed to complete reminder" });
    }
  },
);

// POST /api/agency/reminders/:reminderId/snooze - Snooze reminder
router.post(
  "/api/agency/reminders/:reminderId/snooze",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { reminderId } = req.params;
      const { snooze_until } = req.body;
      const agencyId = req.session.userId;

      if (!snooze_until) {
        return res.status(400).json({ error: "Snooze until date is required" });
      }

      // Verify reminder belongs to this agency
      const reminder = await knex("reminders")
        .where({ id: reminderId, agency_id: agencyId })
        .first();

      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }

      await knex("reminders").where({ id: reminderId }).update({
        status: "snoozed",
        snoozed_until: snooze_until,
        updated_at: knex.fn.now(),
      });

      return res.json({
        success: true,
        message: "Reminder snoozed",
      });
    } catch (error) {
      console.error("[Reminders API] Error snoozing reminder:", error);
      return res.status(500).json({ error: "Failed to snooze reminder" });
    }
  },
);

// DELETE /api/agency/reminders/:reminderId - Delete reminder
router.delete(
  "/api/agency/reminders/:reminderId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { reminderId } = req.params;
      const agencyId = req.session.userId;

      // Verify reminder belongs to this agency
      const reminder = await knex("reminders")
        .where({ id: reminderId, agency_id: agencyId })
        .first();

      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }

      // Soft delete by marking as cancelled
      await knex("reminders").where({ id: reminderId }).update({
        status: "cancelled",
        updated_at: knex.fn.now(),
      });

      return res.json({
        success: true,
        message: "Reminder cancelled",
      });
    } catch (error) {
      console.error("[Reminders API] Error deleting reminder:", error);
      return res.status(500).json({ error: "Failed to delete reminder" });
    }
  },
);

// GET /api/agency/pipeline-counts
router.get(
  "/api/agency/pipeline-counts",
  requireRole("AGENCY"),
  async (req, res) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const rows = await knex("applications")
        .where({ agency_id: agencyId })
        .select("status")
        .count("* as count")
        .groupBy("status");

      const counts = {};
      for (const row of rows) {
        counts[row.status] = parseInt(row.count, 10);
      }
      return res.json({ success: true, data: counts });
    } catch (error) {
      console.error("[Pipeline API] Error fetching pipeline counts:", error);
      return res.status(500).json({ error: "Failed to fetch pipeline counts" });
    }
  },
);

module.exports = router;
