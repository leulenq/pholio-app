/**
 * GDPR / privacy data export assembly for talent accounts.
 *
 * Wave 2E: extended to cover the full canonical data inventory
 * (see `talent-data-inventory.js`) after the 2026-06-30 audit found this
 * export omitted social accounts, representations, guardian/agency
 * consents, submission packages/events, sessions, moderation/reports, and
 * derived embeddings.
 */

const {
  PROFILE_AI_COLUMNS,
  TALENT_DATA_INVENTORY,
} = require("./talent-data-inventory");

// Inventory entries handled by bespoke loaders below (pre-existing behavior,
// kept as-is to avoid changing ordering/shape that other code already
// depends on). Every OTHER inventory entry must be either handled here or
// picked up by the generic loader — the assertion at the bottom of this
// module makes that drift impossible to introduce silently.
const BESPOKE_EXPORT_KEYS = new Set([
  "images",
  "applications",
  "messages",
  "image_rights",
  "application_drafts",
  "application_draft_events",
  "application_submission_requests",
  "onboarding_signals",
  "ai_profile_analysis",
  "profile_ai_fields",
  "talent_user_settings",
  "sessions",
]);

// Inventory entries loaded generically off their {scope, column, exportMode}
// declaration. Adding a new "profile" / "user" / "reporter" / "image" /
// "application" scoped table to the inventory and to this list is all a
// future change needs to do — no new export code required.
const GENERIC_EXPORT_KEYS = [
  "moderation_queue",
  "image_model_releases",
  "application_submission_boards",
  "application_spec_snapshots",
  "application_submission_consent_events",
  "talent_submission_packages",
  "spec_registry_engagement_events",
  "social_accounts",
  "talent_representations",
  "profile_booking_lanes",
  "guardian_consent_requests",
  "minor_agency_consents",
  "minor_permits",
  "confirmed_job_safety",
  "adult_context",
  "age_verifications",
  "profile_field_visibility",
  "csam_escalations",
  "reports_filed",
  "talent_embedding_cache",
  "talent_image_embeddings",
  "talent_text_embeddings",
  "message_reply_tokens",
  "message_reply_session_tokens",
  "comp_card_presets",
  "comp_card_imports",
  "notifications",
  "onboarding_analytics",
  "profile_events",
  "share_tokens",
];

// Drift guard: every inventory entry must be accounted for exactly once.
// This throws at require-time (i.e. in tests / on boot) rather than
// silently omitting new tables from the export the way the audited version
// did.
for (const entry of TALENT_DATA_INVENTORY) {
  const bespoke = BESPOKE_EXPORT_KEYS.has(entry.key);
  const generic = GENERIC_EXPORT_KEYS.includes(entry.key);
  if (entry.exportMode === "exclude") continue;
  if (!bespoke && !generic) {
    throw new Error(
      `talent-data-inventory: "${entry.key}" is not wired into buildTalentDataExport (add it to BESPOKE_EXPORT_KEYS or GENERIC_EXPORT_KEYS in data-export.js)`,
    );
  }
  if (bespoke && generic) {
    throw new Error(
      `talent-data-inventory: "${entry.key}" is registered as both bespoke and generic in data-export.js`,
    );
  }
}

function serializeVector(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function formatUserForExport(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.created_at,
    termsAcceptedAt: user.terms_accepted_at ?? null,
    termsAcceptedVersion: user.terms_accepted_version ?? null,
    privacyAcceptedAt: user.privacy_accepted_at ?? null,
    privacyAcceptedVersion: user.privacy_accepted_version ?? null,
  };
}

async function extractProfileAiFields(knex, profile) {
  if (!profile) return null;

  const fields = {};
  let hasAny = false;

  for (const column of PROFILE_AI_COLUMNS) {
    if (!(await knex.schema.hasColumn("profiles", column))) continue;
    if (profile[column] === undefined) continue;
    hasAny = true;
    if (column === "vector_summary" || column === "photo_embedding") {
      fields[column] = serializeVector(profile[column]);
    } else {
      fields[column] = profile[column];
    }
  }

  return hasAny ? fields : null;
}

async function loadImageRights(knex, imageIds) {
  if (!imageIds.length) return [];
  if (!(await knex.schema.hasTable("image_rights"))) return [];
  return knex("image_rights").whereIn("image_id", imageIds);
}

async function loadMessages(knex, applicationIds) {
  if (!applicationIds.length) return [];
  if (!(await knex.schema.hasTable("messages"))) return [];
  return knex("messages")
    .whereIn("application_id", applicationIds)
    .orderBy("created_at", "asc");
}

async function loadApplicationDraftData(knex, profileId) {
  if (!profileId || !(await knex.schema.hasTable("application_drafts"))) {
    return {
      application_drafts: [],
      application_draft_events: [],
      application_submission_requests: [],
    };
  }
  const application_drafts = await knex("application_drafts")
    .where({ profile_id: profileId })
    .orderBy("updated_at", "desc");
  let application_draft_events = [];
  if (await knex.schema.hasTable("application_draft_events")) {
    application_draft_events = await knex("application_draft_events")
      .where({ profile_id: profileId })
      .orderBy("created_at", "asc");
  }
  let application_submission_requests = [];
  if (await knex.schema.hasTable("application_submission_requests")) {
    application_submission_requests = await knex("application_submission_requests")
      .where({ profile_id: profileId })
      .orderBy("created_at", "asc");
  }
  return {
    application_drafts,
    application_draft_events,
    application_submission_requests,
  };
}

function parseSessJson(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Sessions have no FK to `users` — `sess` is an opaque JSON blob matched on
 * `sess.userId`. The raw `sid` (session-hijack-relevant) and the raw `sess`
 * blob are never included; only a summary (count + expiry) is exported.
 */
async function loadSessionsSummary(knex, userId) {
  if (!userId || !(await knex.schema.hasTable("sessions"))) {
    return { count: 0, sessions: [] };
  }
  const rows = await knex("sessions").select("sess", "expired");
  const now = Date.now();
  const sessions = rows
    .map((row) => {
      const sess = parseSessJson(row.sess);
      if (!sess || sess.userId !== userId) return null;
      const expiredAt = row.expired ? new Date(row.expired) : null;
      return {
        active: expiredAt ? expiredAt.getTime() > now : true,
        expiresAt: expiredAt ? expiredAt.toISOString() : null,
      };
    })
    .filter(Boolean);
  return { count: sessions.length, sessions };
}

function redactRow(row, columns) {
  if (!row) return row;
  const clone = { ...row };
  for (const column of columns || []) {
    delete clone[column];
  }
  return clone;
}

// Per-key projections for exportMode: "summary" entries. Raw vectors,
// detection heuristics, and investigator notes are not "meaningful
// information" to the data subject (GDPR Art. 15) and are bulky/sensitive
// in ways a summary avoids — see notes in talent-data-inventory.js.
const SUMMARIZERS = {
  moderation_queue: (row) => ({
    id: row.id,
    image_id: row.image_id ?? null,
    status: row.status,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at ?? null,
  }),
  csam_escalations: (row) => ({
    id: row.id,
    image_id: row.image_id ?? null,
    severity: row.severity,
    status: row.status,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at ?? null,
  }),
  talent_embedding_cache: (row) => ({
    profile_id: row.profile_id,
    source: row.source,
    source_text: row.source_text ?? null,
    embedded_at: row.embedded_at ?? null,
    updated_at: row.updated_at ?? null,
  }),
  talent_image_embeddings: (row) => ({
    profile_id: row.profile_id,
    source_text: row.source_text ?? null,
    embedded_at: row.embedded_at ?? null,
    updated_at: row.updated_at ?? null,
  }),
  talent_text_embeddings: (row) => ({
    profile_id: row.profile_id,
    source: row.source,
    source_text: row.source_text ?? null,
    embedded_at: row.embedded_at ?? null,
    updated_at: row.updated_at ?? null,
  }),
};

function applyExportMode(entry, rows) {
  if (entry.exportMode === "redact") {
    return rows.map((row) => redactRow(row, entry.redactColumns));
  }
  if (entry.exportMode === "summary") {
    const summarize = SUMMARIZERS[entry.key];
    return summarize ? rows.map(summarize) : rows;
  }
  return rows;
}

async function loadInventoryEntry(knex, entry, ctx) {
  if (!(await knex.schema.hasTable(entry.table))) {
    return entry.single ? null : [];
  }

  let rows;
  if (entry.scope === "profile") {
    if (!ctx.profileId) return entry.single ? null : [];
    rows = await knex(entry.table).where({ [entry.column]: ctx.profileId }).select();
  } else if (entry.scope === "user" || entry.scope === "reporter") {
    if (!ctx.userId) return entry.single ? null : [];
    rows = await knex(entry.table).where({ [entry.column]: ctx.userId }).select();
  } else if (entry.scope === "image") {
    const ids = ctx.imageIds || [];
    if (!ids.length) return [];
    rows = await knex(entry.table).whereIn(entry.column, ids).select();
  } else if (entry.scope === "application") {
    const ids = ctx.applicationIds || [];
    if (!ids.length) return [];
    rows = await knex(entry.table).whereIn(entry.column, ids).select();
  } else {
    return entry.single ? null : [];
  }

  rows = applyExportMode(entry, rows || []);
  return entry.single ? rows[0] || null : rows;
}

async function loadGenericInventoryData(knex, ctx) {
  const entries = TALENT_DATA_INVENTORY.filter((entry) =>
    GENERIC_EXPORT_KEYS.includes(entry.key),
  );
  const results = await Promise.all(
    entries.map((entry) => loadInventoryEntry(knex, entry, ctx)),
  );
  const out = {};
  entries.forEach((entry, index) => {
    out[entry.key] = results[index];
  });
  return out;
}

/**
 * Build a structured JSON export payload for a talent user.
 * @param {import('knex').Knex} knex
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function buildTalentDataExport(knex, userId) {
  const user = await knex("users").where({ id: userId }).first();
  const profile = await knex("profiles").where({ user_id: userId }).first();
  const profileId = profile?.id || null;

  const [
    images,
    applications,
    onboarding_signals,
    ai_profile_analysis,
    talent_user_settings,
  ] = await Promise.all([
    profileId
      ? knex("images").where({ profile_id: profileId }).orderBy("sort", "asc")
      : [],
    profileId
      ? knex("applications")
          .where({ profile_id: profileId })
          .orderBy("created_at", "desc")
      : [],
    profileId && (await knex.schema.hasTable("onboarding_signals"))
      ? knex("onboarding_signals").where({ profile_id: profileId }).first()
      : null,
    profileId && (await knex.schema.hasTable("ai_profile_analysis"))
      ? knex("ai_profile_analysis").where({ profile_id: profileId }).first()
      : null,
    (await knex.schema.hasTable("talent_user_settings"))
      ? knex("talent_user_settings").where({ user_id: userId }).first()
      : null,
  ]);

  const applicationIds = applications.map((row) => row.id);
  const imageIds = images.map((row) => row.id);

  const [messages, image_rights, profile_ai_fields, sessions, generic] =
    await Promise.all([
      loadMessages(knex, applicationIds),
      loadImageRights(knex, imageIds),
      extractProfileAiFields(knex, profile),
      loadSessionsSummary(knex, userId),
      loadGenericInventoryData(knex, {
        profileId,
        userId,
        imageIds,
        applicationIds,
      }),
    ]);
  const draftData = await loadApplicationDraftData(knex, profileId);

  return {
    user: formatUserForExport(user),
    profile,
    images,
    image_rights,
    applications,
    ...draftData,
    messages,
    onboarding_signals,
    ai_profile_analysis,
    profile_ai_fields,
    talent_user_settings,
    sessions,
    ...generic,
  };
}

module.exports = {
  buildTalentDataExport,
  PROFILE_AI_COLUMNS,
};
