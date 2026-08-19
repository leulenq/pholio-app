const express = require("express");
const knex = require("../../../shared/db/knex");
const { z } = require("zod");
const {
  requireRole,
  requireAgencyMembershipRole,
} = require("../../auth/middleware/require-auth");
const {
  upload,
  uploadAgencyLogo,
  processImage,
  processAgencyLogo,
} = require("../../../shared/lib/uploader");
const { v4: uuidv4 } = require("uuid");
const {
  sendApplicationStatusEmail,
  sendAgencyInviteEmail,
  sendTeamInviteEmail,
} = require("../../../shared/lib/email");
const {
  getSessionActorUserId,
  getSessionAgencyId,
} = require("../services/context");
const { injectAgencySocialFields, saveAgencySocialFields } = require("../../../shared/lib/social-helpers");
const { searchDiscoverableTalent } = require("../services/discover-search");
const {
  writeQueryLog,
  writeImpressionEvents,
  writeInviteEvent,
} = require("../services/discover/query-log");
const { recordProfileEvent } = require("../../talent/services/intel/capture");
const {
  createDiscoverRateLimit,
} = require("../../../shared/middleware/discover-rate-limit");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const {
  mapApplicationStatusToCastingStage,
  mapCastingStageToApplicationStatus,
} = require("./casting-stage-helpers");
const logActivity = require("./agency-log-activity");
const {
  notifyTalentForApplicationStatus,
} = require("../../../shared/services/notify-talent-application");
const {
  notifyTalentAgencyProfileView,
} = require("../../../shared/services/notifications");
const {
  CONFIRMED_APPLICATION_STATUS,
  REPRESENTED_APPLICATION_STATUSES,
  WRITABLE_APPLICATION_STATUSES,
  isRepresentedApplicationStatus,
} = require("../../../shared/constants/application-status");
const {
  resolveWindowDays,
} = require("../../../shared/lib/application-auto-close");

const {
  hasApplicantIdentitySupport,
  hasColumnCached,
  identityTruthFields,
  loadMaterialRequests,
  materialsStatusFor,
  resolveApplicantIdentities,
  resolveApplicantIdentity,
} = require("../services/applicant-identity");

const { recordAuditEvent } = require("../services/audit");
const { canAssignRole, normalizePresetRole } = require("../lib/permissions");
const { isAgencyBlockedForTalent } = require("../../../shared/lib/blocked-agencies");
const {
  loadApplicationSubmissionPackages,
} = require("../services/application-submission-package");
const {
  buildSubmissionProfileSnapshot,
} = require("../../../shared/lib/submission-profile");
const {
  AUDIENCE,
  buildAgencyDiscoveryDTO,
  buildAgencySubmissionDTO,
} = require("../../../shared/lib/audience-dto");
const {
  applyImageVisibility,
  isAgencyDiscoverable,
  selectColumnsForAudience,
} = require("../../../shared/lib/profile-visibility");
const {
  ensureModerationColumnChecked,
} = require("../../../shared/lib/content-moderation");
const {
  loadSocialAccountsForProfile,
  loadSocialAccountsForProfiles,
} = require("../../../shared/lib/social-accounts");
const {
  computeAge,
  isMinorProfile,
} = require("../../../shared/lib/talent-age");
const {
  applyMinorSubmissionFilter,
} = require("../services/minor-submission-access");
const {
  createTeamInvitation,
} = require("../services/team-invitations");

const addTeamMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  membership_role: z
    .enum(["ADMIN", "AGENT", "SCOUT", "VIEWER"])
    .optional()
    .default("SCOUT"),
});

const agencyMemberUpdateSchema = z.object({
  membership_role: z.enum(["ADMIN", "AGENT", "SCOUT", "VIEWER"]),
});

/**
 * A resolver DTO, in the column shape `buildSubmissionProfileSnapshot` reads.
 *
 * An unclaimed open-call applicant has no `profiles` row, but the organizer's
 * inbox must not learn a second row shape because of that (design §4: two
 * sources, ONE shape). Rather than hand-assemble a parallel DTO, the resolved
 * identity is expressed as the handful of profile columns the canonical snapshot
 * builder consumes and passed through that builder unchanged.
 */
function identityProfileRow(dto) {
  return {
    id: null,
    slug: null,
    first_name: dto?.firstName || null,
    last_name: dto?.lastName || null,
    city: dto?.city || null,
    gender: dto?.gender || null,
    height_cm: dto?.heightCm ?? null,
    bust_cm: dto?.measurements?.bustCm ?? null,
    waist_cm: dto?.measurements?.waistCm ?? null,
    hips_cm: dto?.measurements?.hipsCm ?? null,
    // Never asserted by an anonymous applicant — the event spec asks for the
    // 18+ attestation, not a date of birth (design §3.1, ruling Q1). A null DOB
    // makes `is_minor` false and `age` null, which is the honest answer.
    date_of_birth: null,
  };
}

/**
 * The comparable part of a phone number: digits only, and at most the last ten
 * of them.
 *
 * "+1 (718) 555-0134", "718-555-0134" and "7185550134" are the same number typed
 * three ways, and the same applicant will type it differently on two editions —
 * once with the country code, once without. Comparing full digit strings misses
 * exactly that case, which is the case §5.6 is about. Ten digits is the national
 * significant number in the markets this ships to; it is deliberately a loose
 * comparison because the output is a *signal* an organizer reads, never an
 * action the system takes.
 */
function phoneDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * The possible-duplicate SIGNAL (design §5.6).
 *
 * "The same human with two email addresses is two identities … automatic
 * merging is not the answer — merging two humans because a phone number matched
 * leaks one person's data to another." So this returns an application id and
 * nothing else: plain data for the organizer to read, never an action.
 *
 * Detail-view only, never the list: it is one bounded query per opened
 * application, and paying it 2,000 times to render a pool would be absurd.
 * Scoped to the same open call when the application has one (an organizer
 * running Brooklyn and Queens expects the same model in both pools — that is
 * the cross-edition path the strategy calls the prize, not a duplicate).
 */
async function findPossibleDuplicateApplication(
  db,
  { agencyId, application, identityDto },
) {
  const digits = phoneDigits(identityDto?.phone);
  // Shorter than a national number: a typo or the response sheet's famous
  // "I don't have a phone num". Never a match.
  if (digits.length < 7) return null;
  if (!(await hasApplicantIdentitySupport(db))) return null;

  const profilePhoneColumn = await hasColumnCached(db, "profiles", "phone");

  let query = db("applications as a")
    .leftJoin("applicant_identities as ai", "ai.id", "a.applicant_identity_id")
    .leftJoin("profiles as p", "p.id", "a.profile_id")
    .where("a.agency_id", agencyId)
    .whereNot("a.id", application.id)
    .whereNot("a.status", "withdrawn")
    .where((scope) => {
      scope.whereNotNull("ai.phone_normalized");
      if (profilePhoneColumn) scope.orWhereNotNull("p.phone");
    })
    .select(
      "a.id",
      "ai.phone_normalized",
      ...(profilePhoneColumn ? ["p.phone"] : []),
    )
    .orderBy("a.created_at", "asc")
    .limit(500);

  if (
    application.open_call_link_id &&
    (await hasApplicationEventColumns(db))
  ) {
    query = query.where("a.open_call_link_id", application.open_call_link_id);
  }

  const rows = await query.catch(() => []);
  const match = rows.find(
    (row) =>
      phoneDigits(row.phone_normalized) === digits ||
      phoneDigits(row.phone) === digits,
  );
  return match?.id || null;
}

function shouldIncludeExportNotes(query) {
  const value = query.include_notes ?? query.includeNotes;
  return value === true || String(value).toLowerCase() === "true";
}

function groupApplicationExportValues(rows, valueKey, separator) {
  const valuesByApplication = new Map();

  rows.forEach((row) => {
    const value = row[valueKey];
    if (!value) return;

    const existing = valuesByApplication.get(row.application_id);
    valuesByApplication.set(
      row.application_id,
      existing ? `${existing}${separator}${value}` : value,
    );
  });

  return valuesByApplication;
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";

  let string = String(value);
  // Spreadsheet applications evaluate formula-like cells even when the CSV is
  // opened locally. Prefix those values so user-provided profile data remains
  // plain text in exported files.
  if (/^\s*[=+\-@]/.test(string)) {
    string = `'${string}`;
  }

  if (
    string.includes(",") ||
    string.includes('"') ||
    string.includes("\n") ||
    string.includes("\r")
  ) {
    return `"${string.replace(/"/g, '""')}"`;
  }

  return string;
}

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
    avatar_url: row.avatar_url || null,
    membership_role: normalizePresetRole(row.membership_role),
    preset_role: normalizePresetRole(row.membership_role),
    status: row.membership_status,
    invited_at: row.invited_at,
    joined_at: row.joined_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const router = express.Router();
mountAgencyApiGuard(router);

// GET /api/agency/boards - List all boards for agency
router.get(
  "/api/agency/boards",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req.session);
      const actorUserId = getSessionActorUserId(req.session);

      /* `boards` is dual-purpose: standing DIVISIONS (Women, Editorial) and
         CASTING/PACKAGE boards ("Nike SS26"), discriminated by `board_type`.
         Callers that need one kind pass ?type=division|package; the default
         stays unfiltered so existing casting/signing callers are unaffected.

         `board_type` is nullable and every board predating the column — which
         includes all divisions created by agency setup — is NULL, so a
         division filter must keep NULLs. `whereNot(...)` alone would drop them,
         because `NULL <> 'package'` is NULL rather than true. */
      const boardTypeFilter = String(req.query?.type || "").trim();
      /* `board_type` arrives with a migration; an environment that has not run
         it must still serve boards rather than 500 on a missing column. */
      const canFilterByType = boardTypeFilter
        ? await knex.schema.hasColumn("boards", "board_type")
        : false;
      const boards = await knex("boards")
        .where({ agency_id: agencyId })
        .modify((query) => {
          if (!canFilterByType) return;
          if (boardTypeFilter === "division") {
            query.where((scope) =>
              scope.whereNull("board_type").orWhereNot("board_type", "package"),
            );
          } else if (boardTypeFilter === "package") {
            query.where("board_type", "package");
          }
        })
        .orderBy("sort_order", "asc")
        .orderBy("created_at", "asc");

      // Up to 4 talent headshots per board (content-backed preview thumbnails)
      const allBoardIds = boards.map((b) => b.id);
      const previewRows = allBoardIds.length
        ? await applyMinorSubmissionFilter(
            knex("board_applications as ba")
            .join("applications as a", "a.id", "ba.application_id")
            .join("images as img", "img.profile_id", "a.profile_id")
            .whereIn("ba.board_id", allBoardIds)
            .where("img.is_primary", true)
            .select(
              "ba.board_id",
              knex.raw("COALESCE(img.public_url, img.path) as url"),
            )
            .orderBy(["ba.board_id", "ba.created_at"]),
            { alias: "a", allowMinor: req.allowMinorSubmissions },
          )
        : [];
      const pipelineRows = allBoardIds.length
        ? await applyMinorSubmissionFilter(
            knex("board_applications as ba")
              .join("applications as a", "a.id", "ba.application_id")
              .whereIn("ba.board_id", allBoardIds)
              .groupBy("ba.board_id", "a.status")
              .select(
                "ba.board_id",
                "a.status",
                knex.raw("COUNT(*) as count"),
              ),
            { alias: "a", allowMinor: req.allowMinorSubmissions },
          )
        : [];
      const previewByBoard = {};
      previewRows.forEach((r) => {
        if (!previewByBoard[r.board_id]) previewByBoard[r.board_id] = [];
        if (previewByBoard[r.board_id].length < 4)
          previewByBoard[r.board_id].push(r.url);
      });
      const pipelineByBoard = {};
      pipelineRows.forEach((row) => {
        if (!pipelineByBoard[row.board_id]) pipelineByBoard[row.board_id] = [];
        pipelineByBoard[row.board_id].push({
          status: row.status,
          count: parseInt(row.count, 10) || 0,
        });
      });

      // Get application counts for each board
      const boardsWithCounts = await Promise.all(
        boards.map(async (board) => {
          const [count, submittedCount, representedCount] = await Promise.all([
            applyMinorSubmissionFilter(knex("board_applications as ba")
              .join("applications as a", "a.id", "ba.application_id")
              .where({ "ba.board_id": board.id })
              .count("* as count")
              .first(), { alias: "a", allowMinor: req.allowMinorSubmissions }),
            applyMinorSubmissionFilter(knex("board_applications as ba")
              .join("applications as a", "a.id", "ba.application_id")
              .where({ "ba.board_id": board.id })
              .whereIn("a.status", ["submitted", "pending"])
              .count("* as count")
              .first(), { alias: "a", allowMinor: req.allowMinorSubmissions }),
            applyMinorSubmissionFilter(knex("board_applications as ba")
              .join("applications as a", "a.id", "ba.application_id")
              .where({ "ba.board_id": board.id })
              .whereIn("a.status", REPRESENTED_APPLICATION_STATUSES)
              .count("* as count")
              .first(), { alias: "a", allowMinor: req.allowMinorSubmissions }),
          ]);
          return {
            ...board,
            application_count: parseInt(count?.count || 0),
            submitted_count: parseInt(submittedCount?.count || 0),
            represented_count: parseInt(representedCount?.count || 0),
            pipeline_counts: pipelineByBoard[board.id] || [],
            preview: previewByBoard[board.id] || [],
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

// GET /api/agency/boards/:boardId - Get board details with requirements
router.get(
  "/api/agency/boards/:boardId",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { boardId } = req.params;
      const agencyId = getSessionAgencyId(req.session);
      const actorUserId = getSessionActorUserId(req.session);

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
      });
    } catch (error) {
      console.error("[Boards API] Error fetching board:", error);
      return res.status(500).json({ error: "Failed to fetch board" });
    }
  },
);

// Board identity validation — invalid values fall back to null so the client
// resolves its curated defaults instead of rendering from a bad value.
const BRAND_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const PLATE_STYLES = new Set(["ink", "paper", "cover"]);
const BOARD_TYPES = new Set(["division", "package"]);
const cleanBrandColor = (v) =>
  typeof v === "string" && BRAND_COLOR_RE.test(v) ? v.toUpperCase() : null;
const cleanPlateStyle = (v) => (PLATE_STYLES.has(v) ? v : null);
const cleanBoardType = (v) => (BOARD_TYPES.has(v) ? v : null);

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
        brand_color,
        plate_style,
        board_type,
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
          brand_color: cleanBrandColor(brand_color),
          plate_style: cleanPlateStyle(plate_style),
          board_type: cleanBoardType(board_type),
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

      return res.json(board);
    } catch (error) {
      console.error("[Boards API] Error creating board:", error);
      return res.status(500).json({ error: "Failed to create board" });
    }
  },
);

// PUT/PATCH /api/agency/boards/:boardId - Update board
const updateBoardHandler = [
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
        brand_color,
        plate_style,
        board_type,
        logo_path,
        cover_image_path,
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
      if (brand_color !== undefined)
        updates.brand_color = cleanBrandColor(brand_color);
      if (plate_style !== undefined)
        updates.plate_style = cleanPlateStyle(plate_style);
      if (board_type !== undefined)
        updates.board_type = cleanBoardType(board_type);
      // Image paths are only ever SET via the identity-image upload endpoint;
      // here they may be cleared (null) or re-sent unchanged — anything else
      // is ignored so a client can't point a board at arbitrary files.
      if (logo_path !== undefined && (logo_path === null || logo_path === board.logo_path)) {
        updates.logo_path = logo_path;
      }
      if (
        cover_image_path !== undefined &&
        (cover_image_path === null || cover_image_path === board.cover_image_path)
      ) {
        updates.cover_image_path = cover_image_path;
      }

      await knex("boards").where({ id: boardId }).update(updates);

      return res.json({ success: true });
    } catch (error) {
      console.error("[Boards API] Error updating board:", error);
      return res.status(500).json({ error: "Failed to update board" });
    }
  },
];
router.put("/api/agency/boards/:boardId", ...updateBoardHandler);
router.patch("/api/agency/boards/:boardId", ...updateBoardHandler);

// POST /api/agency/boards/:boardId/identity-image - Upload a board's client
// logo (PNG/SVG, rasterized to PNG) or cover visual (JPG/PNG/WEBP → webp).
// kind comes from the query string so the right multer pipeline can be
// chosen before the multipart body is parsed.
function handleBoardIdentityUpload(req, res, next) {
  const { kind } = req.query;
  if (kind === "logo") {
    return uploadAgencyLogo.single("image")(req, res, (err) =>
      err
        ? res.status(400).json({
            error: err.message || "Logo must be a PNG or SVG file",
          })
        : next(),
    );
  }
  if (kind === "cover") {
    return upload.single("image")(req, res, (err) =>
      err
        ? res.status(400).json({
            error: err.message || "Cover must be a JPG, PNG, or WEBP image",
          })
        : next(),
    );
  }
  return res.status(400).json({ error: "kind must be 'logo' or 'cover'" });
}

const IDENTITY_IMAGE_MAX_BYTES = {
  logo: 2 * 1024 * 1024,
  cover: 8 * 1024 * 1024,
};

router.post(
  "/api/agency/boards/:boardId/identity-image",
  requireRole("AGENCY"),
  handleBoardIdentityUpload,
  async (req, res) => {
    try {
      const { boardId } = req.params;
      const { kind } = req.query;
      const agencyId = getSessionAgencyId(req.session);

      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }
      const size = req.file.size || req.file.buffer?.length || 0;
      if (size > IDENTITY_IMAGE_MAX_BYTES[kind]) {
        return res.status(400).json({
          error: `Image is too large (max ${kind === "logo" ? "2" : "8"} MB)`,
        });
      }

      const board = await knex("boards")
        .where({ id: boardId, agency_id: agencyId })
        .first();
      if (!board) {
        return res.status(404).json({ error: "Board not found" });
      }

      let storedPath;
      if (kind === "logo") {
        const processed = await processAgencyLogo(req.file, {
          agencyId,
          maxWidth: 600,
          maxHeight: 240,
        });
        storedPath = processed.path;
      } else {
        const processed = await processImage(req.file, {
          agencyId,
          maxWidth: 1600,
          quality: 82,
        });
        storedPath = processed.path;
      }

      await knex("boards")
        .where({ id: boardId })
        .update({
          [kind === "logo" ? "logo_path" : "cover_image_path"]: storedPath,
          updated_at: knex.fn.now(),
        });

      return res.json({ success: true, data: { path: storedPath } });
    } catch (error) {
      console.error("[Boards API] Error uploading identity image:", error);
      const isTypeError = /png|svg|jpg|jpeg|webp/i.test(error?.message || "");
      return res.status(isTypeError ? 400 : 500).json({
        error: isTypeError ? error.message : "Failed to upload image",
      });
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

      return res.json({ success: true });
    } catch (error) {
      console.error("[Boards API] Error updating requirements:", error);
      return res.status(500).json({ error: "Failed to update requirements" });
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

      // Get requirements
      const requirements = await knex("board_requirements")
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

      return res.json({ id: newBoardId, success: true });
    } catch (error) {
      console.error("[Boards API] Error duplicating board:", error);
      return res.status(500).json({ error: "Failed to duplicate board" });
    }
  },
);

// Pathological-load guard for the submissions query below — NOT pagination.
// The client derives its tab counts from the full returned set, so this cap
// must stay well above any realistic live-pipeline size for a single agency.
// If an agency ever hits this, the real fix is server-side aggregate counts
// + pagination (roadmap); this constant only stops a runaway agency from
// loading thousands of rows (plus resolving all their images) per request.
const SUBMISSIONS_HARD_CAP = 2000;

/**
 * Deploy-before-migrate guard for the event-casting columns, checked once per
 * process (same idiom as `hasBriefSchema` in `routes/open-call.js`). Both the
 * submissions filter and the CSV export ask before they scope by call, so an
 * environment that has not run the event migrations keeps serving the ordinary
 * inbox instead of failing on a missing column.
 */
let applicationEventColumnsPromise = null;
function hasApplicationEventColumns(db = knex) {
  if (!applicationEventColumnsPromise) {
    applicationEventColumnsPromise = db.schema
      .hasColumn("applications", "open_call_link_id")
      .catch(() => {
        applicationEventColumnsPromise = null;
        return false;
      });
  }
  return applicationEventColumnsPromise;
}

/** Accepts either casing so the SPA and hand-built query strings both work. */
function readEventScopeParams(query = {}) {
  return {
    openCallLinkId: String(
      query.openCallLinkId || query.open_call_link_id || "",
    ).trim(),
    pickListId: String(query.pickListId || query.pick_list_id || "").trim(),
  };
}

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

      const [identitySupported, emailVerifiedColumn] = await Promise.all([
        hasApplicantIdentitySupport(knex),
        hasColumnCached(knex, "users", "email_verified"),
      ]);

      // SECURITY (audit P0-3): this endpoint returns ONLY real applicants to the
      // session agency. The scope is `applications.agency_id = <session agency>`
      // — never the old LEFT JOIN + `whereNull("applications.id")` path, which
      // leaked every discoverable profile (non-applicants included) to any
      // agency. Withdrawn submissions are excluded.
      //
      // INCLUDES UNCLAIMED APPLICANTS (design §4, §6 requirement 1). The query
      // used to be driven FROM `profiles` and inner-join `applications`, which
      // made "has a profile" a precondition of appearing in the inbox at all.
      // It is now driven from `applications` — the primary object (design §2.6)
      // — with `profiles` LEFT JOINed, and the `bio_curated` gate applies only
      // to the account-backed half that has a profile to gate on. For a pool of
      // account-backed applications the rows, the shape and the order are
      // unchanged.
      //
      // NOTE: knex silently drops .select() arguments that follow an array
      // argument, so the audience columns must be spread into one flat list
      // or the application_* aliases never reach the SQL.
      let query = knex("applications")
        .select([
          ...selectColumnsForAudience(AUDIENCE.AGENCY_SUBMISSION, {
            table: "profiles",
          }),
          "applications.status as application_status",
          "applications.id as application_id",
          "applications.created_at as application_created_at",
          "applications.profile_id as application_profile_id",
          // Plain-data truth fields (design §6 requirement 2) — read from the
          // two authoritative columns rather than through the resolver, which
          // would cost a second pass over rows this query already has.
          ...(emailVerifiedColumn
            ? ["users.email_verified as account_email_verified"]
            : []),
          ...(identitySupported
            ? [
                "applications.applicant_identity_id",
                "applicant_identities.claimed_at as identity_claimed_at",
                "applicant_identities.disowned_at as identity_disowned_at",
              ]
            : []),
        ])
        .leftJoin("profiles", "applications.profile_id", "profiles.id")
        .leftJoin("users", "profiles.user_id", "users.id")
        .modify((builder) => {
          if (identitySupported) {
            builder.leftJoin(
              "applicant_identities",
              "applicant_identities.id",
              "applications.applicant_identity_id",
            );
          }
        })
        .where("applications.agency_id", req.session.userId)
        .whereNot("applications.status", "withdrawn")
        .where((scope) => {
          scope.whereNotNull("profiles.bio_curated");
          if (identitySupported) {
            scope.orWhereNull("applications.profile_id");
          }
        });
      query = applyMinorSubmissionFilter(query, {
        alias: "applications",
        allowMinor: req.allowMinorSubmissions,
      });

      /* Scope the desk to one event call (design §e O3). Ruling R10 forbids a
         second inbox for organizers, so the event pool IS this endpoint with a
         link filter — the same rows, the same DTO, the same triage verbs.

         RULING R7 CONFLICT, reported to the lead: this route has no
         pagination. `SUBMISSIONS_HARD_CAP` is a truncating ceiling and R7
         sizes a call at exactly 2,000 applications, so a call at the design
         ceiling is cut at the cap boundary (`capped: true`). The paginated
         read is `GET /api/agency/events/:linkId/pool`. */
      const { openCallLinkId } = readEventScopeParams(req.query);
      if (openCallLinkId && (await hasApplicationEventColumns())) {
        query = query.where("applications.open_call_link_id", openCallLinkId);
      }

      /* Apply filters (same logic as main route).
         A filter that names a `profiles` column cannot be evaluated in SQL for
         an identity-backed row — its name, city and height live inside a JSON
         payload no database in this stack can index. Rather than let those rows
         be dropped by a predicate that can only be false for them (the exact
         silent-omission failure this lane exists to stop), each profile-scoped
         predicate keeps `applications.profile_id IS NULL` rows in the candidate
         set, and the identical filter is re-applied in JS against the resolved
         DTO further down (`identityFilters`). The result set is bounded by
         SUBMISSIONS_HARD_CAP, so the second pass is over a page, not a table. */
      const keepIdentityRows = (scope, build) => {
        scope.where((inner) => {
          build(inner);
          if (identitySupported) inner.orWhereNull("applications.profile_id");
        });
      };
      if (city) {
        query = query.where((scope) =>
          keepIdentityRows(scope, (inner) =>
            inner.whereILike("profiles.city", `%${city}%`),
          ),
        );
      }
      if (letter) {
        query = query.where((scope) =>
          keepIdentityRows(scope, (inner) =>
            inner.whereILike("profiles.last_name", `${letter}%`),
          ),
        );
      }
      if (search) {
        query = query.where((scope) =>
          keepIdentityRows(scope, (inner) =>
            inner
              .whereILike("profiles.first_name", `%${search}%`)
              .orWhereILike("profiles.last_name", `%${search}%`),
          ),
        );
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
        query = query.where((scope) =>
          keepIdentityRows(scope, (inner) =>
            inner.where("profiles.height_cm", ">=", minHeightNumber),
          ),
        );
      }
      if (!Number.isNaN(maxHeightNumber)) {
        query = query.where((scope) =>
          keepIdentityRows(scope, (inner) =>
            inner.where("profiles.height_cm", "<=", maxHeightNumber),
          ),
        );
      }

      // Gender filter
      if (gender) {
        query = query.where((scope) =>
          keepIdentityRows(scope, (inner) =>
            inner.where("profiles.gender", gender),
          ),
        );
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

      // Safety ceiling only — see SUBMISSIONS_HARD_CAP comment above.
      query = query.limit(SUBMISSIONS_HARD_CAP);

      const allRows = await query;
      const capped = allRows.length >= SUBMISSIONS_HARD_CAP;
      if (capped) {
        console.warn(
          `[API/Agency/Applications] Submissions hard cap (${SUBMISSIONS_HARD_CAP}) reached for agency ${req.session.userId}; results truncated.`,
        );
      }

      /* Resolve the identity-backed half from the frozen snapshot, then finish
         the profile-scoped filters and the sort in JS (see `keepIdentityRows`).
         `profiles` below is the surviving set, so everything downstream — image
         fallback, tags, DTO shaping — is unchanged for account-backed rows. */
      const identityRows = allRows.filter(
        (row) => !row.application_profile_id && row.applicant_identity_id,
      );
      const resolvedIdentities = identityRows.length
        ? await resolveApplicantIdentities(
            knex,
            identityRows.map((row) => ({
              id: row.application_id,
              profile_id: null,
              applicant_identity_id: row.applicant_identity_id,
            })),
          )
        : new Map();

      const matchesIdentityFilters = (dto) => {
        if (!dto) return false;
        const like = (value, term) =>
          String(value || "")
            .toLowerCase()
            .includes(String(term).toLowerCase());
        if (city && !like(dto.city, city)) return false;
        if (
          letter &&
          !String(dto.lastName || "")
            .toLowerCase()
            .startsWith(String(letter).toLowerCase())
        ) {
          return false;
        }
        if (
          search &&
          !like(dto.firstName, search) &&
          !like(dto.lastName, search)
        ) {
          return false;
        }
        if (!Number.isNaN(minHeightNumber)) {
          if (dto.heightCm == null || dto.heightCm < minHeightNumber) return false;
        }
        if (!Number.isNaN(maxHeightNumber)) {
          if (dto.heightCm == null || dto.heightCm > maxHeightNumber) return false;
        }
        if (gender && dto.gender !== gender) return false;
        return true;
      };

      const profiles = allRows.filter((row) => {
        if (row.application_profile_id) return true;
        if (!row.applicant_identity_id) return true;
        return matchesIdentityFilters(
          resolvedIdentities.get(row.application_id),
        );
      });

      /* SQL ordered by `profiles.last_name` / `profiles.city`, which are NULL
         for an identity-backed row, so the ordering is completed here against
         the resolved values. An all-account-backed pool sorts identically. */
      const sortKeyFor = (row) => {
        const dto = resolvedIdentities.get(row.application_id);
        const last = (row.last_name || dto?.lastName || "").toLowerCase();
        const first = (row.first_name || dto?.firstName || "").toLowerCase();
        const town = (row.city || dto?.city || "").toLowerCase();
        return sort === "city" ? [town, last] : [last, first];
      };
      profiles.sort((a, b) => {
        const left = sortKeyFor(a);
        const right = sortKeyFor(b);
        for (let i = 0; i < left.length; i += 1) {
          if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
        }
        return 0;
      });

      const submissionPackages = await loadApplicationSubmissionPackages(
        knex,
        profiles
          .filter((profile) => profile.application_id && profile.id)
          .map((profile) => ({
            id: profile.application_id,
            profile_id: profile.id,
            slug: profile.slug,
          })),
      );

      // Legacy applications without a package retain the live-profile fallback.
      // Once a package exists, only its submitted image selection is exposed.
      const profileIds = profiles
        .filter(
          (profile) =>
            profile.id &&
            (!profile.application_id ||
              !submissionPackages.has(profile.application_id)),
        )
        .map((profile) => profile.id);
      let allImages = [];
      if (profileIds.length > 0) {
        await ensureModerationColumnChecked(knex);
        const imageQuery = knex("images").whereIn("profile_id", profileIds);
        applyImageVisibility(imageQuery, AUDIENCE.AGENCY_DISCOVERY, {
          table: "images",
        });
        allImages = await imageQuery.orderBy([
          "profile_id",
          "sort",
          "created_at",
        ]);
      }

      const imagesByProfile = {};
      allImages.forEach((img) => {
        if (!imagesByProfile[img.profile_id]) {
          imagesByProfile[img.profile_id] = [];
        }
        imagesByProfile[img.profile_id].push(img);
      });

      // Batched with the image query above — same live-fallback profileIds,
      // one query for the whole page (audit P1-4, avoids N+1).
      const socialByProfile = await loadSocialAccountsForProfiles(profileIds);

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

      // One query for the page (design §6: requested / fulfilled / overdue as
      // plain text on the row).
      const materialsByApplication = await loadMaterialRequests(
        knex,
        applicationIds,
      );

      const safeProfiles = profiles.map((profile) => {
        const submissionPackage = submissionPackages.get(
          profile.application_id,
        );
        const identityDto = resolvedIdentities.get(profile.application_id);
        // A frozen submission snapshot (already minor-safe) wins; otherwise shape
        // the live row through the agency-submission DTO. Never spread the raw
        // profile row and never surface the owner's account email (audit P0-3).
        //
        // An identity-backed row has no live profile at all, so the resolver DTO
        // is fed through the SAME snapshot builder — one shape for the SPA,
        // whichever source it came from.
        const submitted = submissionPackage?.profile
          ? {
              ...submissionPackage.profile,
              images: submissionPackage.images || [],
            }
          : profile.id
            ? buildAgencySubmissionDTO(profile, {
                images: imagesByProfile[profile.id] || [],
                social: socialByProfile.get(profile.id) || [],
              })
            : {
                ...buildAgencySubmissionDTO(
                  identityProfileRow(identityDto),
                  {},
                ),
                images: identityDto?.images || [],
              };
        return {
          ...submitted,
          application_status: profile.application_status,
          application_id: profile.application_id,
          application_created_at: profile.application_created_at,
          submission_package: submissionPackage || null,
          tags: tagsByApplication[profile.application_id] || [],
          ...identityTruthFields(
            profile.application_profile_id
              ? {
                  isEmailVerified: Boolean(profile.account_email_verified),
                  isClaimed: true,
                  isDisowned: Boolean(profile.identity_disowned_at),
                  identitySource: "profile",
                }
              : {
                  isEmailVerified: Boolean(profile.identity_claimed_at),
                  isClaimed: Boolean(profile.identity_claimed_at),
                  isDisowned: Boolean(profile.identity_disowned_at),
                  identitySource: "submission",
                },
            materialsByApplication.get(profile.application_id),
          ),
        };
      });

      return res.json({
        profiles: safeProfiles,
        count: safeProfiles.length,
        capped,
      });
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
        development: allApplications.filter(
          (a) => a.status === "development",
        ).length,
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

      return res.json({
        stats,
      });
    } catch (error) {
      console.error("[API/Agency/Stats] Error:", error);
      return next(error);
    }
  },
);

// POST /api/agency/applications/:applicationId/accept - Record an offer to move forward
router.post(
  "/api/agency/applications/:applicationId/accept",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const agencyId = getSessionAgencyId(req.session);
      const application = await knex.transaction(async (trx) => {
        const row = await trx("applications")
          .where({ id: applicationId, agency_id: agencyId })
          .first();
        if (!row) return null;

        const acceptedAt = new Date();
        await trx("applications").where({ id: applicationId }).update({
          status: "accepted",
          accepted_at: acceptedAt,
          declined_at: null,
          updated_at: trx.fn.now(),
        });
        await logActivity(
          req,
          trx,
          applicationId,
          agencyId,
          "status_change",
          "Representation offered",
          { old_status: row.status, new_status: "accepted" },
        );
        return row;
      });

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const oldStatus = application.status;

      await notifyTalentForApplicationStatus({
        application,
        agencyId,
        newStatus: "accepted",
        previousStatus: oldStatus,
      });

      // Send email notification (async, non-blocking)
      (async () => {
        try {
          // Get talent info — applications have no talent_id column, only
          // profile_id, so resolve the recipient through profiles.user_id
          // (same idiom as the accept/decline flow in roster.js).
          const profile = await knex("profiles")
            .where({ id: application.profile_id })
            .first();
          const talent = profile
            ? await knex("users").where({ id: profile.user_id }).first()
            : null;

          // Get agency info
          const agency = await knex("agencies").where({ id: agencyId }).first();

          if (talent && talent.email && agency) {
            await sendApplicationStatusEmail({
              to: talent.email,
              talentName:
                `${profile.first_name} ${profile.last_name}`.trim() || "there",
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

      return res.json({ success: true, message: "Representation offer recorded" });
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
      const agencyId = getSessionAgencyId(req.session);
      const requestedStatus =
        req.body?.status || mapCastingStageToApplicationStatus(req.body?.stage);

      if (!requestedStatus) {
        return res.status(400).json({
          error: "Valid application status or casting stage is required",
        });
      }

      if (!WRITABLE_APPLICATION_STATUSES.includes(requestedStatus)) {
        return res
          .status(400)
          .json({ error: "Unsupported application status" });
      }

      const application = await knex.transaction(async (trx) => {
        const row = await trx("applications")
          .where({ id: applicationId, agency_id: agencyId })
          .first();
        if (!row) return null;

        const acceptedAt =
          requestedStatus === "accepted"
            ? new Date()
            : isRepresentedApplicationStatus(requestedStatus)
              ? row.accepted_at || new Date()
              : null;
        await trx("applications").where({ id: applicationId }).update({
          status: requestedStatus,
          accepted_at: acceptedAt,
          declined_at:
            requestedStatus === "declined" || requestedStatus === "passed"
              ? trx.fn.now()
              : null,
          // Resets the auto-close review window: the agency just moved this,
          // so its silence starts again from here.
          status_changed_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
        await logActivity(
          req,
          trx,
          applicationId,
          agencyId,
          "status_change",
          `Application moved to ${requestedStatus}`,
          { old_status: row.status, new_status: requestedStatus },
        );
        return row;
      });

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      await notifyTalentForApplicationStatus({
        application,
        agencyId,
        newStatus: requestedStatus,
        previousStatus: application.status,
      });

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
        req,
        knex,
        applicationId,
        agencyId,
        "status_change",
        "Not moving forward",
        { old_status: oldStatus, new_status: "declined" },
      );

      await notifyTalentForApplicationStatus({
        application,
        agencyId,
        newStatus: "declined",
        previousStatus: oldStatus,
      });

      // Send email notification (async, non-blocking)
      (async () => {
        try {
          // Get talent info — applications have no talent_id column, only
          // profile_id, so resolve the recipient through profiles.user_id
          // (same idiom as the accept/decline flow in roster.js).
          const profile = await knex("profiles")
            .where({ id: application.profile_id })
            .first();
          const talent = profile
            ? await knex("users").where({ id: profile.user_id }).first()
            : null;

          // Get agency info
          const agency = await knex("agencies").where({ id: agencyId }).first();

          if (talent && talent.email && agency) {
            await sendApplicationStatusEmail({
              to: talent.email,
              talentName:
                `${profile.first_name} ${profile.last_name}`.trim() || "there",
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

      return res.json({ success: true, message: "Not moving forward" });
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
        req,
        knex,
        applicationId,
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

// POST /api/agency/applications/bulk-accept - Bulk record offers to move forward
router.post(
  "/api/agency/applications/bulk-accept",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationIds } = req.body;
      const agencyId = getSessionAgencyId(req.session);
      if (
        !applicationIds ||
        !Array.isArray(applicationIds) ||
        applicationIds.length === 0
      ) {
        return res
          .status(400)
          .json({ error: "Application IDs array is required" });
      }

      const applications = await knex.transaction(async (trx) => {
        const rows = await trx("applications")
          .whereIn("id", applicationIds)
          .where({ agency_id: agencyId });
        if (rows.length !== applicationIds.length) return null;

        const acceptedAt = new Date();
        await trx("applications").whereIn("id", applicationIds).update({
          status: "accepted",
          accepted_at: acceptedAt,
          declined_at: null,
          updated_at: trx.fn.now(),
        });

        for (const app of rows) {
          await logActivity(
            req,
            trx,
            app.id,
            agencyId,
            "status_change",
            "Representation offered (bulk)",
            {
              old_status: app.status,
              new_status: "accepted",
              bulk_operation: true,
            },
          );
        }
        return rows;
      });

      if (!applications) {
        return res.status(404).json({ error: "Some applications not found" });
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
      const agencyId = getSessionAgencyId(req.session);
      const requestedStatus =
        status || mapCastingStageToApplicationStatus(stage);

      if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
        return res
          .status(400)
          .json({ error: "Application IDs array is required" });
      }

      if (!requestedStatus) {
        return res.status(400).json({
          error: "Valid application status or casting stage is required",
        });
      }

      if (!WRITABLE_APPLICATION_STATUSES.includes(requestedStatus)) {
        return res
          .status(400)
          .json({ error: "Unsupported application status" });
      }

      const applications = await knex.transaction(async (trx) => {
        const rows = await trx("applications")
          .whereIn("id", applicationIds)
          .where({ agency_id: agencyId });
        if (rows.length !== applicationIds.length) return null;

        const acceptedAt = new Date();
        await trx("applications").whereIn("id", applicationIds).update({
          status: requestedStatus,
          accepted_at:
            requestedStatus === "accepted"
              ? acceptedAt
              : isRepresentedApplicationStatus(requestedStatus)
                ? trx.raw("COALESCE(accepted_at, CURRENT_TIMESTAMP)")
                : null,
          declined_at:
            requestedStatus === "declined" || requestedStatus === "passed"
              ? trx.fn.now()
              : null,
          // Resets the auto-close review window, same as the single-status
          // path — a bulk triage is still the agency acting.
          status_changed_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

        for (const application of rows) {
          await logActivity(
            req,
            trx,
            application.id,
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
        return rows;
      });

      if (!applications) {
        return res.status(404).json({ error: "Some applications not found" });
      }

      for (const application of applications) {
        await notifyTalentForApplicationStatus({
          application,
          agencyId,
          newStatus: requestedStatus,
          previousStatus: application.status,
        });
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
          req,
          knex,
          app.id,
          agencyId,
          "status_change",
          "Not moving forward (bulk)",
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
          req,
          knex,
          app.id,
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

// GET /api/agency/me - Get current agency profile
router.get("/api/agency/me", requireRole("AGENCY"), async (req, res, next) => {
  try {
    const actorUserId = getSessionActorUserId(req);
    const agencyId = getSessionAgencyId(req);
    const user = await knex("users").where({ id: actorUserId }).first();
    let agency = await knex("agencies").where({ id: agencyId }).first();
    if (agency) {
      agency = await injectAgencySocialFields(agency);
    }

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
        avatar_url: user.avatar_url || null,
        agency_name: agency.name,
        agency_logo_path: agency.logo_path,
        agency_brand_color: agency.brand_color,
        agency_description: agency.description,
        agency_website: agency.website,
        agency_instagram_handle: agency.instagram_handle,
        agency_tiktok_handle: agency.tiktok_handle,
        agency_twitter_handle: agency.twitter_handle,
        agency_youtube_handle: agency.youtube_handle,
        agency_video_reel_url: agency.video_reel_url,
        agency_location: agency.location,
        notify_new_applications: agency.notify_new_applications,
        notify_status_changes: agency.notify_status_changes,
        default_view: agency.default_view,
        application_review_window_days: resolveWindowDays(
          agency.application_review_window_days,
        ),
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

const agencyProfileUpdateSchema = z.object({
  first_name: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  last_name: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  agency_name: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  agency_location: z.string().trim().max(255).optional().or(z.literal("")).or(z.null()),
  agency_website: z.string().trim().url("Enter a valid URL").max(255).optional().or(z.literal("")).or(z.null()),
  agency_description: z.string().trim().max(1000).optional().or(z.literal("")).or(z.null()),
  agency_instagram_handle: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  agency_tiktok_handle: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  agency_twitter_handle: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  agency_youtube_handle: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  agency_video_reel_url: z.string().trim().url("Enter a valid URL").max(500).optional().or(z.literal("")).or(z.null()),
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

      const parsed = agencyProfileUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const {
        first_name,
        last_name,
        agency_name,
        agency_location,
        agency_website,
        agency_description,
        agency_instagram_handle,
        agency_tiktok_handle,
        agency_twitter_handle,
        agency_youtube_handle,
        agency_video_reel_url,
      } = parsed.data;

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

      const socialData = {};
      if (agency_instagram_handle !== undefined) socialData.instagram_handle = agency_instagram_handle;
      if (agency_tiktok_handle !== undefined) socialData.tiktok_handle = agency_tiktok_handle;
      if (agency_twitter_handle !== undefined) socialData.twitter_handle = agency_twitter_handle;
      if (agency_youtube_handle !== undefined) socialData.youtube_handle = agency_youtube_handle;
      if (agency_video_reel_url !== undefined) socialData.video_reel_url = agency_video_reel_url;

      await saveAgencySocialFields(agencyId, socialData);

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

function handleAgencyLogoUpload(req, res, next) {
  uploadAgencyLogo.single("agency_logo")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: err.message || "Agency logo must be a PNG or SVG file",
      });
    }
    next();
  });
}

// POST /api/agency/branding - Update agency branding (logo and color)
router.post(
  "/api/agency/branding",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  handleAgencyLogoUpload,
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const { agency_brand_color, remove_logo } = req.body;

      const updateData = {};

      if (remove_logo === "true") {
        const agency = await knex("agencies").where({ id: agencyId }).first();
        if (agency?.logo_path) {
          updateData.logo_path = null;
        }
      } else if (req.file) {
        const processedImage = await processAgencyLogo(req.file, {
          agencyId,
          maxWidth: 400,
          maxHeight: 400,
        });
        const logoPath = processedImage.path || "";
        updateData.logo_path = logoPath.startsWith("http")
          ? logoPath
          : logoPath.replace(/^\//, "");
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
        data: { logo_path: updateData.logo_path || null },
        logo_path: updateData.logo_path || null,
      });
    } catch (error) {
      console.error("[Agency Branding API] Error:", error);
      const isLogoTypeError = /png|svg/i.test(error?.message || "");
      const message = isLogoTypeError
        ? error.message
        : "Failed to update branding";
      return res.status(isLogoTypeError ? 400 : 500).json({ error: message });
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
      const {
        notify_new_applications,
        notify_status_changes,
        default_view,
        application_review_window_days: reviewWindowDays,
      } = req.body;

      const updateData = {};
      if (notify_new_applications !== undefined)
        updateData.notify_new_applications = !!notify_new_applications;
      if (notify_status_changes !== undefined)
        updateData.notify_status_changes = !!notify_status_changes;
      if (default_view !== undefined)
        updateData.default_view = default_view || null;
      if (reviewWindowDays !== undefined) {
        // 0 disables auto-close for this agency. The upper bound keeps the
        // window from being set so far out that it silently disables it while
        // appearing to be on.
        const days = Number(reviewWindowDays);
        if (!Number.isInteger(days) || days < 0 || days > 365) {
          return res.status(400).json({
            error:
              "application_review_window_days must be a whole number of days between 0 and 365 (0 turns auto-close off).",
          });
        }
        updateData.application_review_window_days = days;
      }

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

// GET /api/agency/team - List agency members and outstanding invitations
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
        "u.avatar_url",
      )
      .orderBy([
        { column: "am.membership_role", order: "asc" },
        { column: "am.created_at", order: "asc" },
      ]);

    const pendingInvitations = await knex("agency_team_invitations as invitation")
      .where({ "invitation.agency_id": agencyId })
      .whereNull("invitation.accepted_at")
      .whereNull("invitation.revoked_at")
      .where("invitation.expires_at", ">", knex.fn.now())
      .select(
        "invitation.id as invitation_id",
        "invitation.agency_id",
        "invitation.email",
        "invitation.membership_role",
        "invitation.expires_at",
        "invitation.created_at",
        "invitation.updated_at",
      )
      .orderBy("invitation.created_at", "asc");

    return res.json({
      success: true,
      data: [
        ...members
          .filter((member) => member.membership_status !== "INVITED")
          .map(serializeAgencyMember),
        ...pendingInvitations.map((invitation) => ({
          membershipId: null,
          invitationId: invitation.invitation_id,
          userId: null,
          agencyId: invitation.agency_id,
          email: invitation.email,
          first_name: null,
          last_name: null,
          full_name: invitation.email,
          membership_role: normalizePresetRole(invitation.membership_role),
          preset_role: normalizePresetRole(invitation.membership_role),
          status: "INVITED",
          invited_at: invitation.created_at,
          joined_at: null,
          expires_at: invitation.expires_at,
          created_at: invitation.created_at,
          updated_at: invitation.updated_at,
        })),
      ],
    });
  } catch (error) {
    console.error("[Agency Team API] Error listing members:", error);
    return res.status(500).json({ error: "Failed to load team members" });
  }
});

// POST /api/agency/team - Invite a teammate into this vetted agency workspace
router.post("/api/agency/team", requireRole("AGENCY"), async (req, res) => {
  try {
    const agencyId = getSessionAgencyId(req);
    const actorUserId = getSessionActorUserId(req);
    const actorMembershipId = req.session.agencyMembershipId || null;
    const actorRole = normalizePresetRole(req.session.agencyMembershipRole);
    const parsed = addTeamMemberSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid team member payload",
        details: parsed.error.flatten(),
      });
    }

    const { email, membership_role } = parsed.data;

    if (!canAssignRole(actorRole, membership_role)) {
      return res.status(403).json({
        error: "You cannot assign this role",
        membership_role,
      });
    }
    const user = await knex("users").where({ email }).first();
    if (user && user.role !== "AGENCY") {
      return res.status(409).json({
        error: "This email belongs to a talent account",
        message: "Use a different work email for agency access.",
      });
    }

    let membership = user
      ? await knex("agency_memberships")
          .where({ agency_id: agencyId, user_id: user.id })
          .first()
      : null;

    if (membership && membership.status === "ACTIVE") {
      return res
        .status(409)
        .json({ error: "User is already an active member of this agency" });
    }

    const agency = await knex("agencies").where({ id: agencyId }).first();
    const actor = actorUserId
      ? await knex("users").where({ id: actorUserId }).first()
      : null;
    const inviteResult = await knex.transaction(async (trx) => {
      if (user) {
        if (membership) {
          await trx("agency_memberships").where({ id: membership.id }).update({
            membership_role,
            status: "INVITED",
            invited_at: trx.fn.now(),
            joined_at: null,
            updated_at: trx.fn.now(),
          });
        } else {
          membership = {
            id: uuidv4(),
            agency_id: agencyId,
            user_id: user.id,
            membership_role,
            status: "INVITED",
          };
          await trx("agency_memberships").insert({
            ...membership,
            invited_at: trx.fn.now(),
            joined_at: null,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
        }
      }
      return createTeamInvitation({
        db: trx,
        agencyId,
        email,
        membershipRole: membership_role,
        invitedByUserId: actorUserId,
        invitedByMembershipId: actorMembershipId,
      });
    });

    const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
    try {
      await sendTeamInviteEmail({
        to: email,
        inviteeName: user?.first_name || null,
        agencyName: agency?.name || "your agency",
        inviterName:
          [actor?.first_name, actor?.last_name].filter(Boolean).join(" ") ||
          actor?.email ||
          "Your agency team",
        roleLabel: normalizePresetRole(membership_role),
        acceptUrl: `${appUrl}/login?invite=${encodeURIComponent(inviteResult.rawToken)}`,
      });
    } catch (emailError) {
      await knex.transaction(async (trx) => {
        await trx("agency_team_invitations")
          .where({ id: inviteResult.invitation.id })
          .update({ revoked_at: trx.fn.now(), updated_at: trx.fn.now() });
        if (membership?.id) {
          await trx("agency_memberships")
            .where({ id: membership.id, status: "INVITED" })
            .update({ status: "INACTIVE", updated_at: trx.fn.now() });
        }
      });
      console.error("[Agency Team API] Invitation email failed:", emailError);
      return res.status(502).json({
        error: "Invitation could not be delivered",
        message: "No access was granted. Check the address and try again.",
      });
    }

    await recordAuditEvent({
      agencyId,
      actorMembershipId,
      actorUserId,
      eventType: "team.invitation_sent",
      targetType: "team_invitation",
      targetId: inviteResult.invitation.id,
      summary: `Invited ${email} as ${membership_role}`,
      afterState: { email, membership_role },
      req,
    });

    return res.status(201).json({
      success: true,
      data: {
        membershipId: null,
        invitationId: inviteResult.invitation.id,
        userId: user?.id || null,
        agencyId,
        email,
        full_name: email,
        membership_role: normalizePresetRole(membership_role),
        preset_role: normalizePresetRole(membership_role),
        status: "INVITED",
        invited_at: inviteResult.invitation.created_at,
        expires_at: inviteResult.invitation.expires_at,
      },
    });
  } catch (error) {
    console.error("[Agency Team API] Error adding member:", error);
    return res.status(500).json({ error: "Failed to add team member" });
  }
});

// PATCH /api/agency/team/:membershipId - Update membership role
router.patch(
  "/api/agency/team/:membershipId",
  requireRole("AGENCY"),
  async (req, res) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const actorMembershipId = req.session.agencyMembershipId || null;
      const actorRole = normalizePresetRole(req.session.agencyMembershipRole);
      const { membershipId } = req.params;
      const parsed = agencyMemberUpdateSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid membership update payload",
          details: parsed.error.flatten(),
        });
      }

      if (!canAssignRole(actorRole, parsed.data.membership_role)) {
        return res.status(403).json({
          error: "You cannot assign this role",
          membership_role: parsed.data.membership_role,
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

      await recordAuditEvent({
        agencyId,
        actorMembershipId,
        actorUserId,
        eventType: "team.role_changed",
        targetType: "membership",
        targetId: membershipId,
        summary: `Role changed to ${parsed.data.membership_role}`,
        beforeState: { membership_role: membership.membership_role },
        afterState: { membership_role: parsed.data.membership_role },
        req,
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
  async (req, res) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const actorMembershipId = req.session.agencyMembershipId || null;
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

      await recordAuditEvent({
        agencyId,
        actorMembershipId,
        actorUserId,
        eventType: "team.member_deactivated",
        targetType: "membership",
        targetId: membershipId,
        summary: `Removed team member from agency`,
        beforeState: {
          status: membership.status,
          membership_role: membership.membership_role,
        },
        afterState: { status: "INACTIVE" },
        req,
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

/**
 * The six event columns (design §f). Availability and the walk-video URL are
 * frozen into the submission package at submit time rather than stored on
 * `applications`, so they are read back off the package payload — the same
 * frozen snapshot the designer page renders, never a live profile.
 */
function parseExportPackagePayload(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** "2026-09-04 to 2026-09-07" — a call sheet reads dates, not JSON. */
function formatExportAvailability(availability) {
  if (!availability || typeof availability !== "object") return "";
  const from = availability.from ? String(availability.from).slice(0, 10) : "";
  const to = availability.to ? String(availability.to).slice(0, 10) : "";
  const note = typeof availability.note === "string" ? availability.note.trim() : "";
  const range = from && to ? `${from} to ${to}` : from || to;
  return [range, note].filter(Boolean).join(" — ");
}

function formatExportCompensation(link) {
  if (!link?.compensation_type) return "";
  const type = String(link.compensation_type).toUpperCase();
  const details = link.compensation_details
    ? String(link.compensation_details).trim()
    : "";
  return details ? `${type} — ${details}` : type;
}

/**
 * Who holds this applicant and what they said about them.
 *
 * Designer and Mark are two columns built from ONE ordered pass so they line
 * up positionally: the nth name in Designer marked the nth value in Mark. An
 * applicant on a list nobody has answered yet gets "—" rather than a blank,
 * so a silent designer is visibly distinct from a designer who passed.
 */
async function loadEventExportAnnotations(db, { agencyId, openCallLinkId, applicationIds }) {
  const annotations = new Map();
  if (applicationIds.length === 0) return annotations;

  const rows = await db("event_pick_list_items as i")
    .join("event_pick_lists as l", "l.id", "i.pick_list_id")
    .leftJoin("event_pick_selections as s", (join) => {
      join
        .on("s.pick_list_id", "=", "i.pick_list_id")
        .andOn("s.application_id", "=", "i.application_id");
    })
    .where("l.agency_id", agencyId)
    .where("l.open_call_link_id", openCallLinkId)
    .whereIn("i.application_id", applicationIds)
    .select("i.application_id", "l.designer_name", "s.mark")
    .orderBy([
      { column: "i.application_id", order: "asc" },
      { column: "l.created_at", order: "asc" },
      { column: "l.id", order: "asc" },
    ]);

  for (const row of rows) {
    const entry = annotations.get(row.application_id) || {
      designers: [],
      marks: [],
    };
    entry.designers.push(row.designer_name);
    entry.marks.push(row.mark || "—");
    annotations.set(row.application_id, entry);
  }
  return annotations;
}

/** Availability + walk video, read off the frozen package for each applicant. */
async function loadEventExportPackageExtras(db, applicationIds) {
  const extras = new Map();
  if (applicationIds.length === 0) return extras;
  if (!(await db.schema.hasTable("talent_submission_packages"))) return extras;

  const rows = await db("talent_submission_packages")
    .whereIn("application_id", applicationIds)
    .orderBy("created_at", "desc")
    .select("application_id", "payload", "revoked_at", "redacted_at");

  for (const row of rows) {
    // Newest package per application wins; a withdrawn or expired one exports
    // nothing rather than the values it was redacted for holding.
    if (extras.has(row.application_id)) continue;
    if (row.revoked_at || row.redacted_at) {
      extras.set(row.application_id, { availability: null, walkVideoUrl: null });
      continue;
    }
    const payload = parseExportPackagePayload(row.payload);
    const eventContext =
      payload.eventContext && typeof payload.eventContext === "object"
        ? payload.eventContext
        : {};
    const availability = payload.availability || eventContext.availability;
    const walkVideoUrl = payload.walkVideoUrl || eventContext.walkVideoUrl;
    extras.set(row.application_id, {
      availability:
        availability && typeof availability === "object" ? availability : null,
      walkVideoUrl: typeof walkVideoUrl === "string" ? walkVideoUrl : null,
    });
  }
  return extras;
}

// GET /api/agency/export - Export applications as CSV or JSON
router.get(
  "/api/agency/export",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const { format = "csv", status = "", city = "", search = "" } = req.query;
      const includeNotes = shouldIncludeExportNotes(req.query);

      /* EVENT SCOPE (design §f). An organizer exports one call — or one
         designer's slice of it — as the call sheet they actually work from, so
         the export gains two filters and, when it is event-scoped, the six
         columns a run-of-show needs. Everything below is inert for a
         representation export: same query, same columns, same audit event. */
      const eventScope = readEventScopeParams(req.query);
      let pickListId = eventScope.pickListId;
      let openCallLinkId = eventScope.openCallLinkId;
      const eventSchemaReady =
        (openCallLinkId || pickListId) && (await hasApplicationEventColumns());

      /* A pick-list export is an event export by definition, so resolving the
         list's own call is what makes `?pickListId=` alone carry the event
         columns too. Scoped to this agency: an id from another organizer
         resolves to nothing and the export comes back empty. */
      let eventLink = null;
      if (eventSchemaReady && pickListId) {
        const pickList = await knex("event_pick_lists")
          .where({ id: pickListId, agency_id: agencyId })
          .first("id", "open_call_link_id");
        if (!pickList) {
          return res.status(404).json({ error: "Pick list not found" });
        }
        if (!openCallLinkId) openCallLinkId = pickList.open_call_link_id;
      }
      if (eventSchemaReady && openCallLinkId) {
        eventLink = await knex("agency_open_call_links")
          .where({ id: openCallLinkId, agency_id: agencyId })
          .first();
        if (!eventLink) {
          return res.status(404).json({ error: "Event call not found" });
        }
      }
      const eventScoped = Boolean(eventLink);

      const [identitySupported, emailVerifiedColumn, profilePhoneColumn] =
        await Promise.all([
          hasApplicantIdentitySupport(knex),
          hasColumnCached(knex, "users", "email_verified"),
          hasColumnCached(knex, "profiles", "phone"),
        ]);

      /* Build query similar to main dashboard route.
         INCLUDES UNCLAIMED APPLICANTS (design §6 requirement 3): "an export that
         silently omits unclaimed rows is worse than the Google Form and would
         end the partnership on contact." Driven from `applications` with
         `profiles` LEFT JOINed; the `bio_curated` gate applies only to rows that
         have a profile to gate on. Identity-backed name/email/phone/city/height
         come from the resolver below. */
      let query = knex("applications")
        .select(
          "profiles.first_name",
          "profiles.last_name",
          "profiles.city",
          "profiles.height_cm",
          "profiles.bust_cm as bust",
          "profiles.waist_cm as waist",
          "profiles.hips_cm as hips",
          // Age is DERIVED from DOB (audit P0-7) — never the stored column.
          "profiles.date_of_birth",
          "profiles.bio_curated",
          ...(profilePhoneColumn ? ["profiles.phone"] : []),
          "applications.id as application_id",
          "applications.profile_id as application_profile_id",
          "applications.status as application_status",
          "applications.created_at as application_created_at",
          "applications.accepted_at",
          "applications.declined_at",
          "users.email as owner_email",
          ...(emailVerifiedColumn
            ? ["users.email_verified as owner_email_verified"]
            : []),
          ...(identitySupported
            ? ["applications.applicant_identity_id"]
            : []),
        )
        .leftJoin("profiles", "applications.profile_id", "profiles.id")
        .leftJoin("users", "profiles.user_id", "users.id")
        .where("applications.agency_id", agencyId)
        .whereNot("applications.status", "withdrawn")
        .where((scope) => {
          scope.whereNotNull("profiles.bio_curated");
          if (identitySupported) {
            scope.orWhereNull("applications.profile_id");
          }
        });

      if (eventScoped) {
        // `status_changed_at` is when the applicant answered; there is no
        // separate confirmed_at column and adding one would duplicate it.
        query = query
          .select(
            "profiles.id as profile_id",
            "applications.status_changed_at",
          )
          .where("applications.open_call_link_id", openCallLinkId);
      }
      if (eventScoped && pickListId) {
        query = query.whereIn("applications.id", function subquery() {
          this.select("i.application_id")
            .from("event_pick_list_items as i")
            .join("event_pick_lists as pl", "pl.id", "i.pick_list_id")
            .where("i.pick_list_id", pickListId)
            // Tenancy lives in the subquery too, not only in the outer scope.
            .where("pl.agency_id", agencyId);
        });
      }

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

      /* Profile-scoped filters keep identity-backed rows in the candidate set
         (their name and city live in a JSON payload no index can reach) and are
         re-applied against the resolved DTO below. Same rule, same reason as
         `GET /api/agency/applications`. */
      const keepIdentityRows = (scope, build) => {
        scope.where((inner) => {
          build(inner);
          if (identitySupported) inner.orWhereNull("applications.profile_id");
        });
      };

      if (city) {
        query = query.where((scope) =>
          keepIdentityRows(scope, (inner) =>
            inner.whereILike("profiles.city", `%${city}%`),
          ),
        );
      }

      if (search) {
        query = query.where((scope) =>
          keepIdentityRows(scope, (inner) =>
            inner
              .whereILike("profiles.first_name", `%${search}%`)
              .orWhereILike("profiles.last_name", `%${search}%`),
          ),
        );
      }

      const allApplications = await query.orderBy([
        "profiles.last_name",
        "profiles.first_name",
      ]);

      const exportIdentities = await resolveApplicantIdentities(
        knex,
        allApplications
          .filter(
            (app) => !app.application_profile_id && app.applicant_identity_id,
          )
          .map((app) => ({
            id: app.application_id,
            profile_id: null,
            applicant_identity_id: app.applicant_identity_id,
          })),
      );

      const includesTerm = (value, term) =>
        String(value || "")
          .toLowerCase()
          .includes(String(term).toLowerCase());

      const applications = allApplications
        .filter((app) => {
          if (app.application_profile_id || !app.applicant_identity_id) {
            return true;
          }
          const dto = exportIdentities.get(app.application_id);
          if (!dto) return false;
          if (city && !includesTerm(dto.city, city)) return false;
          if (
            search &&
            !includesTerm(dto.firstName, search) &&
            !includesTerm(dto.lastName, search) &&
            !includesTerm(dto.displayName, search)
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          // SQL sorted on profile columns, NULL for identity rows; finish it
          // against the resolved names so the sheet reads alphabetically.
          const nameOf = (row) => {
            const dto = exportIdentities.get(row.application_id);
            return [
              (row.last_name || dto?.lastName || "").toLowerCase(),
              (row.first_name || dto?.firstName || "").toLowerCase(),
            ];
          };
          const left = nameOf(a);
          const right = nameOf(b);
          for (let i = 0; i < left.length; i += 1) {
            if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
          }
          return 0;
        });

      // Query related rows and aggregate in JavaScript rather than using a
      // database-specific aggregate (PostgreSQL string_agg vs SQLite group_concat).
      const applicationIds = applications
        .map((app) => app.application_id)
        .filter(Boolean);

      let notesByApplication = new Map();
      let tagsByApplication = new Map();

      if (applicationIds.length > 0) {
        if (includeNotes) {
          const notes = await knex("application_notes")
            .whereIn("application_id", applicationIds)
            .select("application_id", "note")
            .orderBy([
              { column: "application_id", order: "asc" },
              { column: "created_at", order: "asc" },
              { column: "id", order: "asc" },
            ]);
          notesByApplication = groupApplicationExportValues(notes, "note", " | ");
        }

        const tags = await knex("application_tags")
          .where({ agency_id: agencyId })
          .whereIn("application_id", applicationIds)
          .select("application_id", "tag")
          .orderBy([
            { column: "application_id", order: "asc" },
            { column: "created_at", order: "asc" },
            { column: "id", order: "asc" },
          ]);
        tagsByApplication = groupApplicationExportValues(tags, "tag", ", ");
      }

      let eventAnnotations = new Map();
      let eventExtras = new Map();
      if (eventScoped) {
        [eventAnnotations, eventExtras] = await Promise.all([
          loadEventExportAnnotations(knex, {
            agencyId,
            openCallLinkId,
            applicationIds,
          }),
          loadEventExportPackageExtras(knex, applicationIds),
        ]);
      }
      const compensationCell = eventScoped
        ? formatExportCompensation(eventLink)
        : "";

      // The two columns design §6 requirement 2 makes mandatory before FWBK is
      // asked to switch. One query for the whole sheet.
      const materialsByApplication = await loadMaterialRequests(
        knex,
        applicationIds,
      );

      // Format data for export
      const exportData = applications.map((app) => {
        const identity = app.application_profile_id
          ? null
          : exportIdentities.get(app.application_id) || null;

        // Format measurements from individual fields
        const measurements = [];
        if (app.bust) measurements.push(`Bust: ${app.bust}`);
        if (app.waist) measurements.push(`Waist: ${app.waist}`);
        if (app.hips) measurements.push(`Hips: ${app.hips}`);
        const measurementsStr =
          measurements.length > 0
            ? measurements.join(", ")
            : identity?.measurements?.text || "";

        // Applicant email to the agency they applied to is legitimate — but a
        // minor's contact is nulled (guardian-mediated), matching the DTO layer.
        // An identity-backed row has no DOB and so is never a known minor; the
        // 18+ attestation is what the event spec collects (design §3.1).
        const minor = isMinorProfile(app);
        const derivedAge = computeAge(app.date_of_birth);
        const materials = materialsByApplication.get(app.application_id);
        const emailVerified = identity
          ? identity.isEmailVerified
          : Boolean(app.owner_email_verified);

        const exportedApplication = {
          name:
            [app.first_name, app.last_name].filter(Boolean).join(" ") ||
            identity?.displayName ||
            "",
          email: minor ? "" : app.owner_email || identity?.email || "",
          phone: minor ? "" : identity?.phone || app.phone || "",
          city: app.city || identity?.city || "",
          height_cm: app.height_cm || identity?.heightCm || "",
          measurements: measurementsStr,
          age: derivedAge != null ? derivedAge : "",
          bio: app.bio_curated || "",
          email_verified: emailVerified ? "Yes" : "No",
          materials:
            materialsStatusFor(materials) === "none"
              ? ""
              : materialsStatusFor(materials),
          tags: tagsByApplication.get(app.application_id) || "",
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

        if (includeNotes) {
          exportedApplication.notes =
            notesByApplication.get(app.application_id) || "";
        }

        if (eventScoped) {
          const annotation = eventAnnotations.get(app.application_id);
          const extra = eventExtras.get(app.application_id);
          exportedApplication.designer = annotation
            ? annotation.designers.join(", ")
            : "";
          exportedApplication.mark = annotation ? annotation.marks.join(", ") : "";
          exportedApplication.availability = formatExportAvailability(
            extra?.availability,
          );
          exportedApplication.walk_video_url = extra?.walkVideoUrl || "";
          exportedApplication.compensation = compensationCell;
          exportedApplication.confirmed_date =
            app.application_status === CONFIRMED_APPLICATION_STATUS &&
            app.status_changed_at
              ? new Date(app.status_changed_at).toISOString()
              : "";
        }

        return exportedApplication;
      });

      await recordAuditEvent({
        agencyId,
        actorMembershipId: req.session.agencyMembershipId || null,
        actorUserId: getSessionActorUserId(req),
        eventType: "org.data_exported",
        targetType: "applications",
        summary: `Exported ${exportData.length} application${
          exportData.length === 1 ? "" : "s"
        } as ${format}`,
        afterState: {
          format,
          application_count: exportData.length,
          include_notes: includeNotes,
          // Only present on an event-scoped export: a representation export's
          // audit record must keep the exact shape it has always had.
          ...(eventScoped ? { open_call_link_id: openCallLinkId } : {}),
          ...(eventScoped && pickListId ? { pick_list_id: pickListId } : {}),
        },
        req,
      });

      if (format === "json") {
        return res.json({
          exported_at: new Date().toISOString(),
          total: exportData.length,
          applications: exportData,
        });
      } else {
        // CSV format
        const csvColumns = [
          { header: "Name", key: "name" },
          { header: "Email", key: "email" },
          // Phone is what the FWBK response sheet collects and what an
          // organizer chases a shortlisted applicant on; the column exists so
          // an identity-backed row is not a name and an email alone.
          { header: "Phone", key: "phone" },
          { header: "City", key: "city" },
          { header: "Height (cm)", key: "height_cm" },
          { header: "Measurements", key: "measurements" },
          { header: "Age", key: "age" },
          { header: "Bio", key: "bio" },
          ...(includeNotes ? [{ header: "Notes", key: "notes" }] : []),
          { header: "Tags", key: "tags" },
          { header: "Application Status", key: "application_status" },
          { header: "Applied Date", key: "applied_date" },
          { header: "Accepted Date", key: "accepted_date" },
          { header: "Declined Date", key: "declined_date" },
          /* Design §6 requirement 2: "Verified-email state must be visible …
             It is real signal about who will actually turn up to a fitting, and
             it is FWBK's replacement for 'I emailed them and it bounced.'" And
             the materials request reads as exactly what it is, in one word.
             Both sit BEFORE the event block so `headers.slice(-6)` stays the
             run-of-show columns. */
          { header: "Email verified", key: "email_verified" },
          { header: "Materials", key: "materials" },
          // Design §f, in the order a run-of-show is read.
          ...(eventScoped
            ? [
                { header: "Designer", key: "designer" },
                { header: "Mark", key: "mark" },
                { header: "Availability", key: "availability" },
                { header: "Walk Video URL", key: "walk_video_url" },
                { header: "Compensation", key: "compensation" },
                { header: "Confirmed Date", key: "confirmed_date" },
              ]
            : []),
        ];

        const csvRows = exportData.map((app) =>
          csvColumns
            .map(({ key }) => {
              const value = key.endsWith("_date")
                ? app[key]
                  ? new Date(app[key]).toLocaleDateString()
                  : ""
                : app[key];
              return escapeCsvValue(value);
            })
            .join(","),
        );

        const csvContent = [
          csvColumns.map(({ header }) => header).join(","),
          ...csvRows,
        ].join("\n");
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
      if (application.status === "withdrawn") {
        return res.status(410).json({
          error: "application_withdrawn",
          message:
            "The talent withdrew this submission and Pholio revoked access to its disclosure package.",
        });
      }

      const notes = await knex("application_notes as note")
        .leftJoin("users as author", "author.id", "note.created_by_user_id")
        .leftJoin("users as editor", "editor.id", "note.updated_by_user_id")
        .where({ "note.application_id": applicationId })
        .whereNull("note.deleted_at")
        .select(
          "note.*",
          "author.first_name as author_first_name",
          "author.last_name as author_last_name",
          "author.email as author_email",
          "editor.first_name as editor_first_name",
          "editor.last_name as editor_last_name",
        )
        .orderBy("note.created_at", "desc");

      return res.json(
        notes.map((note) => ({
          ...note,
          created_by:
            [note.author_first_name, note.author_last_name].filter(Boolean).join(" ") ||
            note.author_email ||
            "Former team member",
          edited: Boolean(
            note.updated_by_user_id &&
              String(note.updated_at) !== String(note.created_at),
          ),
        })),
      );
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
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);

      if (!note || !note.trim() || note.trim().length > 2000) {
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
      const noteText = note.trim();
      const newNote = await knex.transaction(async (trx) => {
        const [created] = await trx("application_notes").insert({
          id: noteId,
          application_id: applicationId,
          note: noteText,
          created_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        }).returning("*");
        await trx("application_note_audit_events").insert({
          id: uuidv4(),
          note_id: noteId,
          application_id: applicationId,
          agency_id: agencyId,
          actor_user_id: actorUserId,
          event_type: "created",
          before_note: null,
          after_note: noteText,
          created_at: trx.fn.now(),
        });
        return created;
      });

      // Log activity
      await logActivity(
        req,
        knex,
        applicationId,
        agencyId,
        "note_added",
        "Note added",
        { note_id: noteId, note_preview: noteText.substring(0, 100) },
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
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);

      if (!note || !note.trim() || note.trim().length > 2000) {
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
        .whereNull("deleted_at")
        .first();

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      const noteText = note.trim();
      const updatedNote = await knex.transaction(async (trx) => {
        const [updated] = await trx("application_notes")
          .where({ id: noteId })
          .whereNull("deleted_at")
          .update({
            note: noteText,
            updated_by_user_id: actorUserId,
            updated_at: trx.fn.now(),
          })
          .returning("*");
        await trx("application_note_audit_events").insert({
          id: uuidv4(),
          note_id: noteId,
          application_id: applicationId,
          agency_id: agencyId,
          actor_user_id: actorUserId,
          event_type: "updated",
          before_note: existingNote.note,
          after_note: noteText,
          created_at: trx.fn.now(),
        });
        return updated;
      });

      // Log activity
      await logActivity(
        req,
        knex,
        applicationId,
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
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);

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
        .whereNull("deleted_at")
        .first();

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      await knex.transaction(async (trx) => {
        await trx("application_notes").where({ id: noteId }).update({
          deleted_at: trx.fn.now(),
          deleted_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
          updated_at: trx.fn.now(),
        });
        await trx("application_note_audit_events").insert({
          id: uuidv4(),
          note_id: noteId,
          application_id: applicationId,
          agency_id: agencyId,
          actor_user_id: actorUserId,
          event_type: "deleted",
          before_note: existingNote.note,
          after_note: null,
          created_at: trx.fn.now(),
        });
      });

      // Log activity
      await logActivity(
        req,
        knex,
        applicationId,
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
      if (application.status === "withdrawn") {
        return res.status(410).json({
          error: "application_withdrawn",
          message:
            "The talent withdrew this submission and Pholio revoked access to its disclosure package.",
        });
      }

      /* INCLUDES UNCLAIMED APPLICANTS (design §4, §6 requirement 1). An
         identity-backed application has no `profiles` row at all, so the
         previous "Profile not found" 404 was the detail view's version of the
         silent drop: the organizer could see the row in their inbox and could
         not open it. The resolver supplies the identity block for that branch. */
      const identityDto = await resolveApplicantIdentity(knex, application);
      const materialRequest =
        (await loadMaterialRequests(knex, [application.id])).get(
          application.id,
        ) || null;

      const profile = application.profile_id
        ? await knex("profiles")
            .where({ id: application.profile_id })
            .select(
              selectColumnsForAudience(AUDIENCE.AGENCY_SUBMISSION, {
                table: "profiles",
              }),
            )
            .first()
        : null;

      if (application.profile_id && !profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // Get user info
      const user = profile?.user_id
        ? await knex("users").where({ id: profile.user_id }).first("email")
        : null;
      const submissionPackages = profile
        ? await loadApplicationSubmissionPackages(knex, [
            {
              id: application.id,
              profile_id: application.profile_id,
              slug: profile.slug,
            },
          ])
        : new Map();
      const submittedPackage = submissionPackages.get(application.id) || null;
      // Only needed for the live-profile fallback below — a frozen package
      // snapshot already has its social links baked in.
      const social =
        submittedPackage?.profile || !profile
          ? []
          : await loadSocialAccountsForProfile(profile.id);
      const submittedProfile =
        submittedPackage?.profile ||
        buildSubmissionProfileSnapshot(profile || identityProfileRow(identityDto), {
          social,
        });
      let images;
      if (submittedPackage) {
        images = submittedPackage.images;
      } else if (!profile) {
        // The frozen snapshot's media — `open_call_submission_media` ids with
        // already-public URLs (design §3.3).
        images = identityDto.images;
      } else {
        await ensureModerationColumnChecked(knex);
        const imageQuery = knex("images").where({ profile_id: profile.id });
        applyImageVisibility(imageQuery, AUDIENCE.AGENCY_DISCOVERY, {
          table: "images",
        });
        images = await imageQuery.orderBy(["sort", "created_at"]);
      }
      const submissionPackage = submittedPackage
        ? {
            ...submittedPackage,
            contact: submittedProfile.is_minor
              ? null
              : submittedPackage.contact || {
                  email: user?.email || profile.email || null,
                  phone: profile.phone || null,
                },
          }
        : !profile
          ? {
              // No frozen package row for this application (or one that was
              // redacted): the identity still owes the organizer a contact.
              id: null,
              submittedAt: application.created_at || null,
              images: identityDto.images,
              contact: {
                email: identityDto.email,
                phone: identityDto.phone,
              },
              profile: null,
            }
          : null;

      const possibleDuplicateOf = await findPossibleDuplicateApplication(knex, {
        agencyId,
        application,
        identityDto,
      });

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
          ...submittedProfile,
          images,
          user_email: submittedProfile.is_minor
            ? null
            : user?.email || identityDto.email || null,
        },
        submissionPackage,
        notes,
        tags,
        // Plain data, words not badges (design §6 requirement 2, CLAUDE.md
        // banned pattern #4).
        ...identityTruthFields(identityDto, materialRequest),
        materialRequest,
        /* §5.6's duplicate SIGNAL: "surfaced to the organizer as plain inline
           text on the row … and never as an automatic action or a badge. The
           organizer knows their pool; the system does not." */
        possibleDuplicateOf,
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

      // An existing submission may remain on record after the talent leaves
      // Discover, so resolve it before anything else — it decides both whether
      // this agency may see the profile at all and what it sees.
      //
      // The live `profiles` row IS still read below, but only ever as an access
      // gate (discoverability, block state, `user_id`, `slug`) and as the
      // legacy fallback for rows submitted before packages carried a profile
      // snapshot. Whenever a frozen snapshot exists it is what gets served, so
      // a talent editing their profile after submitting cannot retroactively
      // change what the agency was sent. Locked by the post-edit assertions in
      // tests/talent/application-drafts.test.js.
      const application = await knex("applications")
        .where({ profile_id: profileId, agency_id: agencyId })
        .first();
      if (application?.status === "withdrawn") {
        return res.status(410).json({
          error: "application_withdrawn",
          message:
            "The talent withdrew this submission and Pholio revoked access to its disclosure package.",
        });
      }

      const profileQuery = knex("profiles").where({ id: profileId });
      if (!application) profileQuery.where({ is_discoverable: true });
      const profile = await profileQuery
        .select(
          [...new Set([
            ...selectColumnsForAudience(AUDIENCE.AGENCY_DISCOVERY, {
              table: "profiles",
            }),
            ...selectColumnsForAudience(AUDIENCE.AGENCY_SUBMISSION, {
              table: "profiles",
            }),
          ])],
        )
        .first();

      if (!profile) {
        return res
          .status(404)
          .json({ error: "Profile not found or not discoverable" });
      }

      const agencyBlocked = profile.user_id
        ? await isAgencyBlockedForTalent(knex, profile.user_id, agencyId)
        : false;

      // Without an application this is GENERIC discovery — a minor (no named-
      // agency guardian auth) or a profile excluding this agency must not be
      // exposed here (audit P0-3, fail closed).
      if (
        !application &&
        (agencyBlocked || !isAgencyDiscoverable(profile, { agencyId }))
      ) {
        return res
          .status(404)
          .json({ error: "Profile not found or not discoverable" });
      }

      const submissionPackages = application
        ? await loadApplicationSubmissionPackages(knex, [
            {
              id: application.id,
              profile_id: profileId,
              slug: profile.slug,
            },
          ])
        : new Map();
      const submittedPackage = application
        ? submissionPackages.get(application.id) || null
        : null;
      if (submittedPackage?.redacted) {
        return res.status(410).json({
          error: "submission_package_unavailable",
          message: "This submission package is no longer available.",
        });
      }

      // A block may leave the historical application row in place, but it must
      // never reopen live-profile access. A frozen package is the only material
      // the agency may continue to see.
      if (application && agencyBlocked && !submittedPackage?.profile) {
        return res.status(403).json({
          error: "PROFILE_ACCESS_BLOCKED",
          message: "This talent has blocked profile access from your agency.",
        });
      }

      let images;
      if (submittedPackage?.profile) {
        images = submittedPackage.images;
      } else {
        await ensureModerationColumnChecked(knex);
        const imageQuery = knex("images").where({ profile_id: profileId });
        applyImageVisibility(imageQuery, AUDIENCE.AGENCY_DISCOVERY, {
          table: "images",
        });
        images = await imageQuery.orderBy(["sort", "created_at"]);
      }

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

      // Static-allowlist DTO — never spread the raw profile row and never leak
      // the owner's account email. An actual submission gets the richer (still
      // minor-safe) submission snapshot; generic discovery gets the tighter card.
      const social = submittedPackage?.profile
        ? []
        : await loadSocialAccountsForProfile(profileId);
      const profileDto = submittedPackage?.profile
        ? { ...submittedPackage.profile, images }
        : application
          ? buildAgencySubmissionDTO(profile, { images, social })
          : buildAgencyDiscoveryDTO(profile, { images, social });

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
        profile: profileDto,
        submissionPackage: submittedPackage,
        notes,
        tags,
      });
    } catch (error) {
      console.error("[Profile Details API] Error:", error);
      return res.status(500).json({ error: "Failed to fetch profile details" });
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

      const identitySupported = await hasApplicantIdentitySupport(knex);

      // Get recent applications with profile data
      // Explicit allowlist select (no users join / owner email needed — the
      // response below is a hand-built shape, not a raw row).
      //
      // INCLUDES UNCLAIMED APPLICANTS (design §4, §6 requirement 1). This was an
      // INNER JOIN, so "recent applicants" on the organizer's overview would
      // show nothing at all for a call running under
      // `identity_policy: account_optional` — the newest arrivals are exactly
      // the ones least likely to have claimed yet.
      const recentApplications = await knex("applications")
        .where({ "applications.agency_id": agencyId })
        .leftJoin("profiles", "applications.profile_id", "profiles.id")
        .select(
          "applications.id as application_id",
          "applications.status as application_status",
          "applications.created_at as application_created_at",
          ...(identitySupported
            ? ["applications.applicant_identity_id"]
            : []),
          "profiles.id as profile_id",
          "profiles.first_name",
          "profiles.last_name",
          "profiles.city",
          "profiles.archetype",
          "profiles.height_cm",
          "profiles.date_of_birth",
          "profiles.slug",
        )
        .orderBy("applications.created_at", "desc")
        .limit(limit);

      const recentIdentityRows = recentApplications.filter(
        (a) => !a.profile_id && a.applicant_identity_id,
      );
      const recentResolved = recentIdentityRows.length
        ? await resolveApplicantIdentities(
            knex,
            recentIdentityRows.map((a) => ({
              id: a.application_id,
              profile_id: null,
              applicant_identity_id: a.applicant_identity_id,
            })),
          )
        : new Map();

      // Primary headshot per profile (separate query avoids row duplication)
      const recentPids = recentApplications
        .map((a) => a.profile_id)
        .filter(Boolean);
      const primaryImages = recentPids.length
        ? await knex("images")
            .whereIn("profile_id", recentPids)
            .where({ is_primary: true })
            .select("profile_id", "public_url", "path")
        : [];
      const imageByProfile = {};
      primaryImages.forEach((im) => {
        if (!imageByProfile[im.profile_id])
          imageByProfile[im.profile_id] = im.public_url || im.path;
      });

      const ageFrom = (dob) => {
        if (!dob) return null;
        const d = new Date(dob);
        if (Number.isNaN(d.getTime())) return null;
        return Math.floor(
          (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000),
        );
      };

      // Format the response
      const formatted = recentApplications.map((app) => {
        const isNew =
          new Date(app.application_created_at) >
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const identity = recentResolved.get(app.application_id) || null;
        const fullName =
          `${app.first_name || ""} ${app.last_name || ""}`.trim() ||
          identity?.displayName ||
          "Unknown";

        return {
          applicationId: app.application_id,
          profileId: app.profile_id || null,
          name: fullName,
          archetype: app.archetype || null,
          location: app.city || identity?.city || "Location not specified",
          height: app.height_cm || identity?.heightCm || null,
          age: ageFrom(app.date_of_birth),
          profileImage:
            imageByProfile[app.profile_id] ||
            identity?.images?.[0]?.public_url ||
            null,
          isNew: isNew,
          // No profile means no portfolio page to link to; the organizer opens
          // the application detail instead.
          slug: app.slug || null,
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

      // Calculate total talent pool (completed representation agreements + public talent).
      const acceptedCount = await knex("applications")
        .where({ agency_id: agencyId })
        .whereIn("status", REPRESENTED_APPLICATION_STATUSES)
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

// Shared across Discover search + invite: one per-user quota for the surface.
const discoverLimiter = createDiscoverRateLimit();

// GET /api/agency/discover - Get discoverable talent (for React frontend)
// Supports optional ?q= natural-language briefs parsed into factual constraints.
router.get(
  "/api/agency/discover",
  discoverLimiter,
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const result = await searchDiscoverableTalent(knex, {
        agencyId,
        ...req.query,
      });

      // WS6.5 — launch-mode query logging. Best-effort: a log failure never
      // fails the search. Returns query_log_id so outcome events (impression /
      // invite) can be attributed back to this query.
      let queryLogId = null;
      if (result && result._launch) {
        const L = result._launch;
        queryLogId = await writeQueryLog(knex, {
          agencyUserId: agencyId,
          rawBrief: req.query.q || "",
          contract: L.contract,
          disagreements: {
            dropped: L.dropped,
            needs_confirmation: L.needs_confirmation_fields,
          },
          engine: L.engine,
          resultProfileIds: L.result_profile_ids,
          groupCounts: L.group_counts,
          timings: L.timings,
        });
        result.query_log_id = queryLogId;
        if (result.meta) result.meta.query_log_id = queryLogId;
        if (result.discover_v2) result.discover_v2.query_log_id = queryLogId;
        delete result._launch;
      }

      const shownIds = (result?.profiles || [])
        .map((p) => p?.id)
        .filter(Boolean);
      if (shownIds.length) {
        // Attribute impressions to the logged query (launch engine only).
        if (queryLogId) {
          writeImpressionEvents(knex, queryLogId, shownIds).catch(() => {});
        }
      }
      return res.json(result);
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

      // Generic discovery preview — fail closed on minors (no named-agency
      // guardian auth here) and agency-excluded profiles (audit P0-3).
      const agencyId = getSessionAgencyId(req);
      if (
        !isAgencyDiscoverable(profile, { agencyId }) ||
        (profile.user_id &&
          (await isAgencyBlockedForTalent(knex, profile.user_id, agencyId)))
      ) {
        return res
          .status(404)
          .json({ error: "Profile not found or not discoverable" });
      }

      recordProfileEvent({
        profile,
        action: "discovery_open",
        req,
        viewerClass: "agency",
      });

      // Get visible images only (moderation + agency-exclusion filtered).
      await ensureModerationColumnChecked(knex);
      const imageQuery = knex("images").where({ profile_id: profileId });
      applyImageVisibility(imageQuery, AUDIENCE.AGENCY_DISCOVERY, {
        table: "images",
      });
      const images = await imageQuery.orderBy(["sort", "created_at"]);

      if (agencyId && profile.user_id) {
        const agency = await knex("agencies")
          .where({ id: agencyId })
          .select("name")
          .first();
        notifyTalentAgencyProfileView({
          userId: profile.user_id,
          agencyId,
          agencyName: agency?.name,
        }).catch((err) =>
          console.error("[Discover Preview] Notification failed:", err),
        );
      }

      // Static-allowlist DTO — never spread the raw discoverable profile row.
      const social = await loadSocialAccountsForProfile(profileId);
      return res.json({
        success: true,
        profile: buildAgencyDiscoveryDTO(profile, { images, social }),
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
  discoverLimiter,
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

      if (
        profile.user_id &&
        (await isAgencyBlockedForTalent(knex, profile.user_id, agencyId))
      ) {
        return res.status(403).json({
          error: "Contact blocked",
          message: "This talent has blocked contact from your agency.",
        });
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

      // WS6.5 — attribute this invite back to the originating search when the
      // client passes the query_log_id. Best-effort; never fails the invite.
      const queryLogId = req.body && req.body.query_log_id;
      if (queryLogId) {
        writeInviteEvent(knex, queryLogId, profileId).catch(() => {});
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
