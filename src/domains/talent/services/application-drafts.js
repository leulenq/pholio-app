"use strict";

const { v4: uuidv4 } = require("uuid");
const {
  isDigitalSlot,
  hasShotType,
} = require("./profile-readiness-images");
const {
  currentVersion: DRAFT_SCHEMA_VERSION,
} = require("../../../../shared/application-draft-schema.json");

const DRAFT_EXPIRES_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
const DRAFT_RECOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Kept as a compatibility export for callers that used the former 30-day
// "stale" hint. Lifecycle expiry is now the authoritative state.
const DRAFT_STALE_AFTER_MS = DRAFT_EXPIRES_AFTER_MS;
const DRAFT_LIFECYCLE_STATES = Object.freeze({
  ACTIVE: "active",
  DELETED: "deleted",
  EXPIRED: "expired",
  SUBMITTED: "submitted",
});
const DRAFT_STEP_IDS = Object.freeze([
  "board",
  "digitals",
  "stats",
  "book",
  "compcard",
  "message",
  "review",
]);
const DIGITAL_SLOT_MATCHES = Object.freeze({
  headshot: ["headshot", "beauty"],
  three_quarter: ["three_quarter", "half_body"],
  full_length: ["full_length"],
  profile: ["profile", "profile_left", "profile_right"],
  back: ["back"],
});
const DIGITAL_SLOT_KEYS = new Set(Object.keys(DIGITAL_SLOT_MATCHES));

function parseJson(raw, fallback) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function uniqueStrings(value, maxItems = 100) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, maxItems);
}

function normalizeStepId(value) {
  return DRAFT_STEP_IDS.includes(value) ? value : DRAFT_STEP_IDS[0];
}

function normalizeClientId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[a-zA-Z0-9:_-]{8,128}$/.test(normalized) ? normalized : null;
}

function normalizeClientUpdatedAt(value) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // Do not allow a bad device clock to create an indefinitely "newer" draft.
  if (parsed.getTime() > Date.now() + 5 * 60 * 1000) return null;
  return parsed.toISOString();
}

function repairWarning(code, field, message) {
  return { code, field, message };
}

function dedupeRepairWarnings(warnings) {
  const seen = new Set();
  return (Array.isArray(warnings) ? warnings : []).filter((warning) => {
    if (!warning || typeof warning.code !== "string") return false;
    const key = `${warning.code}:${warning.field || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isEligibleAgencyImage(image) {
  if (!image) return false;
  const status = String(image.status || "active").toLowerCase();
  return status === "active" && !Boolean(image.exclude_from_agency);
}

function isEligibleDigitalForSlot(image, slot) {
  return (
    isEligibleAgencyImage(image) &&
    isDigitalSlot(image) &&
    hasShotType(image, DIGITAL_SLOT_MATCHES[slot] || [])
  );
}

async function normalizeDraftPayloadWithRepairs(
  db,
  { profileId, agency, payload },
) {
  const source = payload && typeof payload === "object" ? payload : {};
  const repairs = [];
  const sourceSchemaVersion = Number(source.schemaVersion);
  if (
    Number.isFinite(sourceSchemaVersion) &&
    sourceSchemaVersion > DRAFT_SCHEMA_VERSION
  ) {
    const error = new Error("Unsupported draft schema version");
    error.code = "UNSUPPORTED_DRAFT_SCHEMA";
    error.schemaVersion = sourceSchemaVersion;
    throw error;
  }
  if (
    Number.isFinite(sourceSchemaVersion) &&
    sourceSchemaVersion > 0 &&
    sourceSchemaVersion < DRAFT_SCHEMA_VERSION
  ) {
    repairs.push(
      repairWarning(
        "schema_upgraded",
        "schemaVersion",
        "This draft was upgraded to the current format.",
      ),
    );
  }

  const imageRows = await db("images")
    .where({ profile_id: profileId })
    .select(
      "id",
      "image_type",
      "shot_type",
      "status",
      "exclude_from_agency",
      "set_id",
    );
  const imagesById = new Map(imageRows.map((row) => [row.id, row]));
  const eligibleImageIds = new Set(
    imageRows.filter(isEligibleAgencyImage).map((row) => row.id),
  );

  const requestedSetId =
    typeof source.mediaSetId === "string" ? source.mediaSetId : "current";
  let mediaSetId = "current";
  if (requestedSetId !== "current") {
    const ownedSet = await db("image_sets")
      .where({ id: requestedSetId, profile_id: profileId })
      .first("id", "kind", "retired_at");
    if (
      ownedSet &&
      String(ownedSet.kind || "").toLowerCase() !== "digitals" &&
      !ownedSet.retired_at
    ) {
      mediaSetId = ownedSet.id;
    } else {
      repairs.push(
        repairWarning(
          "media_set_unavailable",
          "mediaSetId",
          "The selected book set is no longer available; the current book will be used.",
        ),
      );
    }
  }

  const openBoards = new Set(
    uniqueStrings(parseJson(agency?.open_boards, []), 50),
  );
  const requestedBoards = uniqueStrings(source.boards, 20);
  const boards = requestedBoards.filter((board) => openBoards.has(board));
  if (boards.length !== requestedBoards.length) {
    repairs.push(
      repairWarning(
        "boards_changed",
        "boards",
        "One or more selected boards are no longer open.",
      ),
    );
  }

  const requestedExcludedImageIds = uniqueStrings(
    source.excludedImageIds,
    200,
  );
  const excludedImageIds = requestedExcludedImageIds.filter((id) =>
    eligibleImageIds.has(id),
  );
  if (excludedImageIds.length !== requestedExcludedImageIds.length) {
    repairs.push(
      repairWarning(
        "images_unavailable",
        "excludedImageIds",
        "One or more image references are no longer available.",
      ),
    );
  }

  const digitalSlotPicks = {};
  if (source.digitalSlotPicks && typeof source.digitalSlotPicks === "object") {
    let repaired = false;
    for (const [slot, imageId] of Object.entries(source.digitalSlotPicks)) {
      const image = imagesById.get(imageId);
      if (
        DIGITAL_SLOT_KEYS.has(slot) &&
        typeof imageId === "string" &&
        isEligibleDigitalForSlot(image, slot)
      ) {
        digitalSlotPicks[slot] = imageId;
      } else {
        repaired = true;
      }
    }
    if (repaired) {
      repairs.push(
        repairWarning(
          "digital_slots_repaired",
          "digitalSlotPicks",
          "One or more selected digitals no longer match their slot.",
        ),
      );
    }
  }

  let compCardPreset = null;
  const requestedPresetId =
    typeof source.compCardPresetId === "string"
      ? source.compCardPresetId
      : source.compCardPreset?.id;
  if (requestedPresetId) {
    const preset = await db("comp_card_presets")
      .where({ id: requestedPresetId, profile_id: profileId })
      .first("id", "name", "seed");
    if (preset) {
      compCardPreset = {
        id: preset.id,
        name: preset.name,
        seed: preset.seed || null,
      };
    } else {
      repairs.push(
        repairWarning(
          "comp_card_unavailable",
          "compCardPreset",
          "The selected comp card is no longer available.",
        ),
      );
    }
  }

  const rawNote = typeof source.note === "string" ? source.note : "";
  const note = rawNote.slice(0, 1200);
  if (note.length !== rawNote.length) {
    repairs.push(
      repairWarning(
        "note_truncated",
        "note",
        "The note was shortened to the supported length.",
      ),
    );
  }

  return {
    payload: {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      boards,
      mediaSetId,
      excludedImageIds,
      digitalSlotPicks,
      compCardPreset,
      note,
      consent: source.consent === true,
      accuracyConfirmed: source.accuracyConfirmed === true,
      adultAuthorityConfirmed: source.adultAuthorityConfirmed === true,
    },
    repairWarnings: dedupeRepairWarnings(repairs),
  };
}

async function normalizeDraftPayload(db, options) {
  return (await normalizeDraftPayloadWithRepairs(db, options)).payload;
}

function parseDraftPayload(raw) {
  const parsed = parseJson(raw, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function toIsoTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const text = String(value).trim().replace(" ", "T");
  // SQLite CURRENT_TIMESTAMP is UTC but has no offset. Parsing that value
  // directly makes Node treat it as server-local time and shifts the instant.
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const parsed = new Date(hasExplicitZone ? text : `${text}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function lifecycleState(row) {
  return Object.values(DRAFT_LIFECYCLE_STATES).includes(row?.lifecycle_state)
    ? row.lifecycle_state
    : DRAFT_LIFECYCLE_STATES.ACTIVE;
}

function mapAgency(rowOrAgency) {
  if (!rowOrAgency) return null;
  const id = rowOrAgency.agency_meta_id || rowOrAgency.id;
  if (!id) return null;
  return {
    id,
    name: rowOrAgency.agency_name || rowOrAgency.name || null,
    location: rowOrAgency.agency_location || rowOrAgency.location || null,
    logo: rowOrAgency.agency_logo || rowOrAgency.logo_path || null,
    website: rowOrAgency.agency_website || rowOrAgency.website || null,
    status: rowOrAgency.agency_status || rowOrAgency.status || null,
    isBlocked: rowOrAgency.isBlocked === true,
  };
}

function mapDraftRow(row, payload, now = Date.now(), options = {}) {
  if (!row) return null;
  const updatedAt = toIsoTimestamp(row.updated_at);
  const state = lifecycleState(row);
  const recoverableUntil = toIsoTimestamp(row.recoverable_until);
  const isRecoverable =
    (state === DRAFT_LIFECYCLE_STATES.DELETED ||
      state === DRAFT_LIFECYCLE_STATES.EXPIRED) &&
    !!recoverableUntil &&
    Date.parse(recoverableUntil) > now;
  const storedWarnings = parseJson(row.repair_warnings, []);
  const repairWarnings = dedupeRepairWarnings([
    ...storedWarnings,
    ...(options.repairWarnings || []),
  ]);
  const agency = options.agency || mapAgency(row);
  const agencyIsActive =
    String(agency?.status || "").toUpperCase() === "ACTIVE";
  const unsupportedSchema = repairWarnings.some(
    (warning) => warning.code === "unsupported_schema",
  );
  const canResume =
    state === DRAFT_LIFECYCLE_STATES.ACTIVE &&
    agencyIsActive &&
    agency?.isBlocked !== true &&
    !unsupportedSchema;
  let unavailableReason = null;
  if (state === DRAFT_LIFECYCLE_STATES.DELETED) unavailableReason = "deleted";
  else if (state === DRAFT_LIFECYCLE_STATES.EXPIRED) unavailableReason = "expired";
  else if (agency?.isBlocked === true) unavailableReason = "blocked";
  else if (!agencyIsActive) unavailableReason = "agency_unavailable";
  else if (unsupportedSchema) unavailableReason = "unsupported_schema";

  return {
    id: row.id,
    agencyId: row.agency_id,
    status: "draft",
    lifecycleState: state,
    payload: state === DRAFT_LIFECYCLE_STATES.SUBMITTED ? {} : payload,
    schemaVersion: Number(row.schema_version) || DRAFT_SCHEMA_VERSION,
    currentStepId: normalizeStepId(row.current_step_id),
    version: Number(row.version) || 1,
    generation: Number(row.generation) || 1,
    lastSavedByClientId: row.last_saved_by_client_id || null,
    clientUpdatedAt: toIsoTimestamp(row.client_updated_at),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt,
    expiresAt: toIsoTimestamp(row.expires_at),
    recoverableUntil,
    isRecoverable,
    agency,
    canResume,
    unavailableReason,
    repairWarnings,
  };
}

function expiryTimestamp(now = Date.now()) {
  const time = now instanceof Date ? now.getTime() : Number(now);
  return new Date(time + DRAFT_EXPIRES_AFTER_MS).toISOString();
}

function recoveryTimestamp(now = Date.now()) {
  const time = now instanceof Date ? now.getTime() : Number(now);
  return new Date(time + DRAFT_RECOVERY_WINDOW_MS).toISOString();
}

async function expireInactiveDrafts(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const rows = await db("application_drafts")
    .where({ lifecycle_state: DRAFT_LIFECYCLE_STATES.ACTIVE })
    .where("expires_at", "<=", now.toISOString())
    .select("id", "profile_id", "agency_id", "version", "generation");

  let expired = 0;
  for (const row of rows) {
    const nextVersion = Number(row.version || 1) + 1;
    const updated = await db("application_drafts")
      .where({
        id: row.id,
        lifecycle_state: DRAFT_LIFECYCLE_STATES.ACTIVE,
        version: row.version,
      })
      .update({
        lifecycle_state: DRAFT_LIFECYCLE_STATES.EXPIRED,
        expired_at: now.toISOString(),
        recoverable_until: recoveryTimestamp(now),
        version: nextVersion,
      });
    if (updated) {
      expired += 1;
      await recordDraftEvent(db, {
        ...row,
        eventType: "expired",
        version: nextVersion,
        lifecycleState: DRAFT_LIFECYCLE_STATES.EXPIRED,
      });
    }
  }
  return expired;
}

async function scrubUnrecoverableDrafts(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  // Keep selection and deletion in one statement. A prior SELECT followed by
  // DELETE-by-id could erase a draft that was recovered between those calls.
  return db("application_drafts")
    .whereIn("lifecycle_state", [
      DRAFT_LIFECYCLE_STATES.DELETED,
      DRAFT_LIFECYCLE_STATES.EXPIRED,
    ])
    .whereNotNull("recoverable_until")
    .where("recoverable_until", "<=", now.toISOString())
    .del();
}

async function runDraftLifecycleCleanup(db, options = {}) {
  const expired = await expireInactiveDrafts(db, options);
  const purged = await scrubUnrecoverableDrafts(db, options);
  return { expired, purged };
}

const ALLOWED_EVENT_TYPES = new Set([
  "created",
  "saved",
  "save_conflict",
  "deleted",
  "delete_conflict",
  "recovered",
  "recovery_failed",
  "expired",
  "submitted",
]);

function safeEventMetadata(metadata = {}) {
  const safe = {};
  if (Number.isInteger(metadata.repairCount)) safe.repairCount = metadata.repairCount;
  if (Array.isArray(metadata.repairCodes)) {
    safe.repairCodes = metadata.repairCodes
      .filter((code) => typeof code === "string")
      .slice(0, 20);
  }
  if (typeof metadata.source === "string") {
    safe.source = metadata.source.slice(0, 32);
  }
  if (typeof metadata.reason === "string") {
    safe.reason = metadata.reason.slice(0, 32);
  }
  if (typeof metadata.hadDraft === "boolean") safe.hadDraft = metadata.hadDraft;
  return safe;
}

async function recordDraftEvent(db, event) {
  if (!ALLOWED_EVENT_TYPES.has(event.eventType)) return;
  try {
    await db("application_draft_events").insert({
      id: uuidv4(),
      draft_id: event.id || event.draftId || null,
      profile_id: event.profile_id || event.profileId,
      agency_id: event.agency_id || event.agencyId,
      event_type: event.eventType,
      version: Number.isInteger(Number(event.version)) ? Number(event.version) : null,
      generation: Number.isInteger(Number(event.generation))
        ? Number(event.generation)
        : null,
      lifecycle_state: event.lifecycleState || event.lifecycle_state || null,
      metadata: JSON.stringify(safeEventMetadata(event.metadata)),
    });
  } catch (error) {
    // Telemetry must never change draft behavior. During rolling deploys the
    // event table may not exist until migrations finish.
    console.error("[ApplicationDrafts] Event recording failed:", error.message);
  }
}

module.exports = {
  DRAFT_EXPIRES_AFTER_MS,
  DRAFT_LIFECYCLE_STATES,
  DRAFT_RECOVERY_WINDOW_MS,
  DRAFT_SCHEMA_VERSION,
  DRAFT_STALE_AFTER_MS,
  DRAFT_STEP_IDS,
  expiryTimestamp,
  expireInactiveDrafts,
  isEligibleAgencyImage,
  mapDraftRow,
  normalizeClientId,
  normalizeClientUpdatedAt,
  normalizeDraftPayload,
  normalizeDraftPayloadWithRepairs,
  normalizeStepId,
  parseDraftPayload,
  recordDraftEvent,
  recoveryTimestamp,
  runDraftLifecycleCleanup,
  scrubUnrecoverableDrafts,
  toIsoTimestamp,
};
