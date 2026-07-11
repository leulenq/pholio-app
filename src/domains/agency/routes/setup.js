const express = require("express");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");
const {
  requireRole,
  requireAgencyMembershipRole,
} = require("../../auth/middleware/require-auth");
const {
  getSessionActorUserId,
  getSessionAgencyId,
} = require("../services/context");

const router = express.Router();

const REQUIRED_STEPS = [
  "profile",
  "boards",
  "team",
  "roster",
  "open_call",
  "defaults",
  "privacy",
];

const STEP_LABELS = {
  profile: "Agency profile",
  boards: "Boards and markets",
  team: "Team and permissions",
  roster: "Roster path",
  open_call: "Open call routing",
  defaults: "Operating defaults",
  privacy: "Privacy and minors",
};

function isPostgres() {
  return (
    knex.client.config.client === "pg" ||
    knex.client.config.client === "postgresql"
  );
}

function jsonForDb(value) {
  return isPostgres() ? value : JSON.stringify(value ?? null);
}

function parseMaybeJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function cleanString(value, max = 500) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, max) : null;
}

function cleanArray(value, maxItems = 24, maxLength = 120) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return source
    .map((item) => cleanString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function boolValue(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

async function markSetupStep(trx, agencyId, stepKey, status, actorUserId, data = {}) {
  const row = {
    id: uuidv4(),
    agency_id: agencyId,
    step_key: stepKey,
    status,
    completed_by_user_id: status === "complete" ? actorUserId : null,
    completed_at: status === "complete" ? trx.fn.now() : null,
    data: jsonForDb(data),
    created_at: trx.fn.now(),
    updated_at: trx.fn.now(),
  };

  const existing = await trx("agency_setup_steps")
    .where({ agency_id: agencyId, step_key: stepKey })
    .first();

  if (existing) {
    await trx("agency_setup_steps")
      .where({ id: existing.id })
      .update({
        status,
        completed_by_user_id: row.completed_by_user_id,
        completed_at: row.completed_at,
        data: row.data,
        updated_at: trx.fn.now(),
      });
    return;
  }

  await trx("agency_setup_steps").insert(row);
}

function mapSetupStep(row) {
  return {
    key: row.step_key,
    label: STEP_LABELS[row.step_key] || row.step_key,
    status: row.status,
    completedAt: row.completed_at,
    data: parseMaybeJson(row.data, {}),
  };
}

function setupStepData(state, key) {
  return state.steps.find((step) => step.key === key)?.data || {};
}

function setupIncludesMinorData(state) {
  const boardData = setupStepData(state, "boards");
  const rosterData = setupStepData(state, "roster");
  const openCallData = setupStepData(state, "open_call");

  return Boolean(
    state.agency.minorDataAcknowledgedAt ||
      boardData.acceptsMinors ||
      rosterData.includesMinors ||
      openCallData.acceptsMinors ||
      state.importJobs.some((job) => job.includesMinors) ||
      state.openCallLinks.some((link) => link.acceptsMinors || link.guardianConsentRequired),
  );
}

async function loadSetupState(agencyId) {
  const [agency, steps, boards, importJobs, openCallLinks, team] =
    await Promise.all([
      knex("agencies").where({ id: agencyId }).first(),
      knex("agency_setup_steps").where({ agency_id: agencyId }),
      knex("boards")
        .where({ agency_id: agencyId })
        .orderBy("sort_order", "asc")
        .orderBy("created_at", "asc"),
      knex.schema.hasTable("agency_import_jobs").then((has) =>
        has
          ? knex("agency_import_jobs")
              .where({ agency_id: agencyId })
              .orderBy("created_at", "desc")
              .limit(10)
          : [],
      ),
      knex.schema.hasTable("agency_open_call_links").then((has) =>
        has
          ? knex("agency_open_call_links")
              .where({ agency_id: agencyId })
              .orderBy("created_at", "desc")
              .limit(10)
          : [],
      ),
      knex("agency_memberships as am")
        .join("users as u", "u.id", "am.user_id")
        .where({ "am.agency_id": agencyId, "am.status": "ACTIVE" })
        .select(
          "am.id",
          "am.membership_role",
          "u.email",
          "u.first_name",
          "u.last_name",
        )
        .orderBy("am.created_at", "asc"),
    ]);

  const stepMap = new Map(steps.map((step) => [step.step_key, mapSetupStep(step)]));
  const normalizedSteps = REQUIRED_STEPS.map((key) =>
    stepMap.get(key) || {
      key,
      label: STEP_LABELS[key],
      status: "not_started",
      completedAt: null,
      data: {},
    },
  );

  return {
    agency: {
      id: agency.id,
      name: agency.name,
      location: agency.location,
      website: agency.website,
      description: agency.description,
      supportEmail: agency.support_email || null,
      agencyType: agency.agency_type || null,
      status: agency.status,
      onboardingStartedAt: agency.onboarding_started_at,
      onboardingCompletedAt: agency.onboarding_completed_at,
      minorDataAcknowledgedAt: agency.minor_data_acknowledged_at || null,
      setupReturnTo: agency.setup_return_to || null,
    },
    steps: normalizedSteps,
    requiredComplete: normalizedSteps.every((step) => step.status === "complete"),
    boards: boards.map((board) => ({
      id: board.id,
      name: board.name,
      kind: board.kind || "division",
      description: board.description,
      isActive: board.is_active !== false,
    })),
    team: team.map((member) => ({
      id: member.id,
      role: member.membership_role,
      email: member.email,
      name: [member.first_name, member.last_name].filter(Boolean).join(" "),
    })),
    importJobs: importJobs.map((job) => ({
      id: job.id,
      sourceType: job.source_type,
      status: job.status,
      includesMinors: !!job.includes_minors,
      createdAt: job.created_at,
    })),
    openCallLinks: openCallLinks.map((link) => ({
      id: link.id,
      label: link.label,
      status: link.status,
      acceptsMinors: !!link.accepts_minors,
      guardianConsentRequired: !!link.guardian_consent_required,
      createdAt: link.created_at,
    })),
  };
}

router.get("/api/agency/setup", requireRole("AGENCY"), async (req, res, next) => {
  try {
    const agencyId = getSessionAgencyId(req);
    const state = await loadSetupState(agencyId);
    return res.json({ success: true, data: state });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  "/api/agency/setup/profile",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const payload = {
        name: cleanString(req.body?.agencyName || req.body?.name, 180),
        location: cleanString(req.body?.location || req.body?.primaryMarket, 160),
        website: cleanString(req.body?.website, 512),
        description: cleanString(req.body?.description, 1000),
        support_email: cleanString(req.body?.supportEmail || req.body?.support_email, 254),
        agency_type: cleanString(req.body?.agencyType || req.body?.agency_type, 80),
        updated_at: knex.fn.now(),
      };

      if (!payload.name) {
        return res.status(400).json({ success: false, error: "Agency name is required." });
      }

      await knex.transaction(async (trx) => {
        await trx("agencies").where({ id: agencyId }).update(payload);
        await markSetupStep(trx, agencyId, "profile", "complete", actorUserId, {
          agencyName: payload.name,
        });
      });

      return res.json({ success: true, data: await loadSetupState(agencyId) });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  "/api/agency/setup/boards",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const boardNames = cleanArray(req.body?.boards || req.body?.boardNames, 24, 80);
      const acceptsMinors = boolValue(req.body?.acceptsMinors || req.body?.accepts_minors);

      if (boardNames.length === 0) {
        return res.status(400).json({ success: false, error: "Add at least one agency board." });
      }

      await knex.transaction(async (trx) => {
        for (const [index, name] of boardNames.entries()) {
          const existing = await trx("boards")
            .where({ agency_id: agencyId })
            .whereRaw("LOWER(name) = ?", [name.toLowerCase()])
            .first();
          if (existing) {
            await trx("boards")
              .where({ id: existing.id })
              .update({ kind: existing.kind || "division", is_active: true, updated_at: trx.fn.now() });
          } else {
            await trx("boards").insert({
              id: uuidv4(),
              agency_id: agencyId,
              name,
              kind: "division",
              is_active: true,
              sort_order: index,
              created_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            });
          }
        }

        await markSetupStep(trx, agencyId, "boards", "complete", actorUserId, {
          boards: boardNames,
          acceptsMinors,
        });

        if (acceptsMinors) {
          await markSetupStep(trx, agencyId, "privacy", "in_review", actorUserId, {
            reason: "minor_board_selected",
          });
        }
      });

      return res.json({ success: true, data: await loadSetupState(agencyId) });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  "/api/agency/setup/team",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const skipped = boolValue(req.body?.skipped);
      await knex.transaction(async (trx) => {
        await markSetupStep(trx, agencyId, "team", "complete", actorUserId, { skipped });
      });
      return res.json({ success: true, data: await loadSetupState(agencyId) });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/api/agency/import-jobs",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const sourceType = cleanString(req.body?.sourceType || req.body?.source_type, 80) || "concierge";
      const includesMinors = boolValue(req.body?.includesMinors || req.body?.includes_minors);
      const status = includesMinors ? "needs_review" : "uploaded";
      const jobId = uuidv4();

      await knex.transaction(async (trx) => {
        await trx("agency_import_jobs").insert({
          id: jobId,
          agency_id: agencyId,
          requested_by_user_id: actorUserId,
          source_type: sourceType,
          status,
          original_filename: cleanString(req.body?.originalFilename || req.body?.original_filename, 255),
          mapping: jsonForDb(req.body?.mapping || null),
          validation_summary: jsonForDb({ intakeOnly: true, notes: cleanString(req.body?.notes, 500) }),
          includes_minors: includesMinors,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
        await markSetupStep(trx, agencyId, "roster", includesMinors ? "in_review" : "complete", actorUserId, {
          importJobId: jobId,
          sourceType,
          includesMinors,
        });
      });

      return res.status(201).json({ success: true, data: await loadSetupState(agencyId) });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  "/api/agency/setup/roster",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const path = cleanString(req.body?.path || "blank", 40);
      await knex.transaction(async (trx) => {
        await markSetupStep(trx, agencyId, "roster", "complete", actorUserId, { path });
      });
      return res.json({ success: true, data: await loadSetupState(agencyId) });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  "/api/agency/setup/open-call",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const enabled = boolValue(req.body?.enabled);
      const acceptsMinors = boolValue(req.body?.acceptsMinors || req.body?.accepts_minors);
      const guardianConsentRequired = acceptsMinors || boolValue(req.body?.guardianConsentRequired || req.body?.guardian_consent_required);

      await knex.transaction(async (trx) => {
        await markSetupStep(trx, agencyId, "open_call", "complete", actorUserId, {
          enabled,
          acceptsMinors,
          guardianConsentRequired,
          receivingBoards: cleanArray(req.body?.receivingBoards || req.body?.receiving_board_ids, 24, 80),
        });
        if (acceptsMinors) {
          await markSetupStep(trx, agencyId, "privacy", "in_review", actorUserId, {
            reason: "minor_open_call_selected",
          });
        }
      });

      return res.json({ success: true, data: await loadSetupState(agencyId) });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  "/api/agency/setup/defaults",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const defaults = {
        timezone: cleanString(req.body?.timezone, 80),
        currency: cleanString(req.body?.currency, 12),
        units: cleanString(req.body?.units, 20),
      };
      await knex.transaction(async (trx) => {
        await markSetupStep(trx, agencyId, "defaults", "complete", actorUserId, defaults);
      });
      return res.json({ success: true, data: await loadSetupState(agencyId) });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  "/api/agency/setup/privacy",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const acknowledgesMinorData = boolValue(req.body?.acknowledgesMinorData || req.body?.acknowledges_minor_data);
      const state = await loadSetupState(agencyId);
      const includesMinorData = setupIncludesMinorData(state);

      if (includesMinorData && !acknowledgesMinorData) {
        return res.status(400).json({
          success: false,
          error: "MINOR_PRIVACY_ACK_REQUIRED",
          message: "Acknowledge minor-data handling before completing agency setup.",
        });
      }

      await knex.transaction(async (trx) => {
        const agencyUpdate = { updated_at: trx.fn.now() };
        if (acknowledgesMinorData) {
          agencyUpdate.minor_data_acknowledged_at = trx.fn.now();
        }
        await trx("agencies").where({ id: agencyId }).update(agencyUpdate);
        await markSetupStep(trx, agencyId, "privacy", "complete", actorUserId, {
          acknowledgesMinorData,
          includesMinorData,
        });
      });

      return res.json({ success: true, data: await loadSetupState(agencyId) });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/api/agency/setup/complete",
  requireRole("AGENCY"),
  requireAgencyMembershipRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const actorUserId = getSessionActorUserId(req);
      const state = await loadSetupState(agencyId);
      const incomplete = state.steps.filter((step) => step.status !== "complete");
      if (incomplete.length > 0) {
        return res.status(400).json({
          success: false,
          error: "SETUP_INCOMPLETE",
          message: "Complete the required agency setup steps before opening the dashboard.",
          incomplete: incomplete.map((step) => step.key),
        });
      }

      if (setupIncludesMinorData(state) && !state.agency.minorDataAcknowledgedAt) {
        return res.status(400).json({
          success: false,
          error: "MINOR_PRIVACY_ACK_REQUIRED",
          message: "Acknowledge minor-data handling before opening the dashboard.",
        });
      }

      await knex("agencies").where({ id: agencyId }).update({
        status: "ACTIVE",
        onboarding_completed_at: knex.fn.now(),
        onboarding_completed_by_user_id: actorUserId,
        updated_at: knex.fn.now(),
      });

      req.session.agencyOnboardingCompletedAt = new Date().toISOString();
      const redirect = state.agency.setupReturnTo || "/dashboard/agency";
      delete req.session.agencySetupReturnTo;
      await new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));

      return res.json({ success: true, data: { completed: true, redirect } });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
