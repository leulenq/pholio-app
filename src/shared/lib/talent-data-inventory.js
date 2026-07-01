"use strict";

/**
 * Canonical talent data-lifecycle inventory (Wave 2E).
 *
 * ONE enumeration of every table that can hold a talent's personal data,
 * reused by both `data-export.js` (subject-access export) and
 * `account-deletion.js` (durable deletion) so the two cannot silently drift
 * apart the way the 2026-06-30 audit found them to (export omitted whole
 * categories that deletion nominally covered via FK cascade, and neither
 * agreed on what "the talent's data" actually is).
 *
 * This module intentionally holds no I/O. It is metadata: which table, how
 * it is scoped to a talent, whether the DB schema already cascades its
 * deletion from `users`/`profiles`, and how a subject-access export should
 * treat it (full row / summarized / secret columns redacted / excluded
 * entirely).
 *
 * Scope of this pass (see tasks/profile-tab-multidiscipline-audit-2026-06-30.md,
 * "Export, deletion, and retention do not cover the complete lifecycle"):
 * every table the audit named by name, plus the Wave-2B compliance tables
 * (`minor_permits`, `confirmed_job_safety`, `adult_context`,
 * `profile_field_visibility`), plus the small set of directly-adjacent
 * tables needed for those categories to be complete (representation/social
 * secrets, image release records, magic-link tokens). Tables that are not
 * talent personal data (agency-owned boards, reference catalogs like
 * `booking_lanes`/`reference_languages`) are deliberately excluded.
 *
 * Not yet folded in (candidates for a follow-up pass, not blocking this
 * wave): `comp_card_presets`/`comp_card_preset_revisions`, `notifications`,
 * `onboarding_analytics`, `commissions`. None of these were named in the
 * audit finding this wave fixes, and all are already FK-cascaded from
 * `profiles`/`users` so deletion is not silently incomplete for them today.
 *
 * scope values:
 *   - "user"      simple `column = userId` lookup on `table`
 *   - "profile"   simple `column = profileId` lookup on `table`
 *   - "image"     derived — rows keyed by an `image_id` that belongs to one
 *                 of the talent's images (loaded via imageIds, not directly)
 *   - "application" derived — rows keyed by an `application_id` that
 *                 belongs to one of the talent's applications
 *   - "reporter"  `reporter_user_id = userId` — reports the talent filed
 *                 (NOT reports filed against them; see notes on "reports")
 *   - "session-json" special — `sessions.sess` is an opaque JSON blob with
 *                 no FK; must be scanned and matched on `sess.userId`
 *   - "profile-column" not a separate table — a column subset of the
 *                 `profiles` row itself (see PROFILE_AI_COLUMNS)
 *
 * cascade values:
 *   - "fk"    the DB schema already cascades deletion of this table's rows
 *             when the owning `profiles`/`users`/`images`/`applications`
 *             row is deleted (verified against the CREATE TABLE migration).
 *   - "set-null" the FK exists but nulls out the reference on delete rather
 *             than deleting the row (used for moderation/report continuity
 *             — the record should outlive the reported/reporting account).
 *   - "none"  no FK/cascade exists; deletion must explicitly clean this up
 *             or it is orphaned. Consulted by account-deletion.js via
 *             `TABLES_REQUIRING_EXPLICIT_CLEANUP`.
 *
 * exportMode values:
 *   - "full"     include the row(s) as-is
 *   - "redact"   include the row(s) with `redactColumns` stripped (secrets/
 *                tokens — never leave the export mechanism able to leak
 *                bearer credentials)
 *   - "summary"  include a reduced, human-meaningful projection instead of
 *                the raw row (raw vectors, detection heuristics, and
 *                investigator notes are not "meaningful information" to the
 *                data subject and are bulky/sensitive in ways a summary
 *                avoids); see per-entry notes for exactly what is kept
 *   - "exclude"  never part of the self-service export (none currently —
 *                everything a talent can query about themselves belongs in
 *                their own export; kept as a valid value for completeness)
 */

const PROFILE_AI_COLUMNS = [
  "vibe_score",
  "is_unicorn",
  "vector_summary",
  "photo_embedding",
  "archetype",
  "analysis_status",
  "analysis_error",
  "image_analysis",
  "fit_score_runway",
  "fit_score_editorial",
  "fit_score_commercial",
  "fit_score_lifestyle",
  "fit_score_swim_fitness",
  "fit_score_overall",
  "fit_scores_calculated_at",
  "market_fit_rankings",
  "modeling_categories",
];

const TALENT_DATA_INVENTORY = [
  // ---- media ----------------------------------------------------------
  {
    key: "images",
    table: "images",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "image_rights",
    table: "image_rights",
    scope: "image",
    column: "image_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "image_model_releases",
    table: "image_model_releases",
    scope: "image",
    column: "image_id",
    cascade: "fk",
    exportMode: "full",
    notes: "Model-release consent artifacts for the talent's own images.",
  },
  {
    key: "moderation_queue",
    table: "moderation_queue",
    scope: "profile",
    column: "profile_id",
    cascade: "none",
    exportMode: "summary",
    notes:
      "profile_id has no FK/cascade (only image_id does); status/timestamps only — `flags` (detection heuristics) and `reviewed_by` (staff id) are withheld.",
  },

  // ---- applications / submissions -------------------------------------
  {
    key: "applications",
    table: "applications",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "messages",
    table: "messages",
    scope: "application",
    column: "application_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "application_drafts",
    table: "application_drafts",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "application_draft_events",
    table: "application_draft_events",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "application_submission_requests",
    table: "application_submission_requests",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "application_submission_consent_events",
    table: "application_submission_consent_events",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
    notes: "The talent's own consent/disclosure audit trail for submissions.",
  },
  {
    key: "application_submission_boards",
    table: "application_submission_boards",
    scope: "application",
    column: "application_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "talent_submission_packages",
    table: "talent_submission_packages",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },

  // ---- representation / social -----------------------------------------
  {
    key: "social_accounts",
    table: "social_accounts",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "redact",
    redactColumns: ["oauth_token_encrypted"],
    notes: "OAuth tokens are provider bearer credentials — never exported.",
  },
  {
    key: "talent_representations",
    table: "talent_representations",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "profile_booking_lanes",
    table: "profile_booking_lanes",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },

  // ---- guardian / minor compliance --------------------------------------
  {
    key: "guardian_consent_requests",
    table: "guardian_consent_requests",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "redact",
    redactColumns: ["token_hash"],
    notes: "token_hash is a verification secret — never exported.",
  },
  {
    key: "minor_agency_consents",
    table: "minor_agency_consents",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "minor_permits",
    table: "minor_permits",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },

  // ---- confirmed job / adult context / visibility -----------------------
  {
    key: "confirmed_job_safety",
    table: "confirmed_job_safety",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "adult_context",
    table: "adult_context",
    scope: "profile",
    column: "profile_id",
    single: true,
    cascade: "fk",
    exportMode: "full",
    notes:
      "Private/gated: migration 20260701100500 forbids adding this to any audience DTO. That rule is about public/agency/submission consumers, not the subject's own export — a talent has a right to see their own adult-context data, so it IS included here.",
  },
  {
    key: "profile_field_visibility",
    table: "profile_field_visibility",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },

  // ---- moderation / safety ------------------------------------------------
  {
    key: "csam_escalations",
    table: "csam_escalations",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "summary",
    notes:
      "Safety/abuse-investigation record. Summarized to status/severity/dates only — raw `flags` and investigator `notes` are withheld to avoid disclosing detection heuristics or ongoing-review commentary.",
  },
  {
    key: "reports_filed",
    table: "reports",
    scope: "reporter",
    column: "reporter_user_id",
    cascade: "set-null",
    exportMode: "redact",
    redactColumns: ["reviewed_by"],
    notes:
      "Reports the talent themselves filed (their own submitted content). Reports filed AGAINST the talent are deliberately not part of this export — moderation/investigation records about a subject are handled the same way as csam_escalations, not disclosed through self-service export.",
  },

  // ---- AI / derived -------------------------------------------------------
  {
    key: "onboarding_signals",
    table: "onboarding_signals",
    scope: "profile",
    column: "profile_id",
    single: true,
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "ai_profile_analysis",
    table: "ai_profile_analysis",
    scope: "profile",
    column: "profile_id",
    single: true,
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "profile_ai_fields",
    table: "profiles",
    scope: "profile-column",
    single: true,
    cascade: "fk",
    exportMode: "full",
    notes: "Subset of the profiles row itself; see PROFILE_AI_COLUMNS.",
  },
  {
    key: "talent_embedding_cache",
    table: "talent_embedding_cache",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "summary",
    notes:
      "SQLite/dev embedding cache. Raw `embedding_json` vectors are not meaningful to a human reader and are withheld; `source_text` (the actual text that was embedded) is kept because that IS the meaningful, human-readable content.",
  },
  {
    key: "talent_image_embeddings",
    table: "talent_image_embeddings",
    scope: "profile",
    column: "profile_id",
    single: true,
    cascade: "fk",
    exportMode: "summary",
    notes: "Postgres-only pgvector table; same raw-vector rationale as talent_embedding_cache.",
  },
  {
    key: "talent_text_embeddings",
    table: "talent_text_embeddings",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "summary",
    notes: "Postgres-only pgvector table; same raw-vector rationale as talent_embedding_cache.",
  },

  // ---- account / settings --------------------------------------------------
  {
    key: "talent_user_settings",
    table: "talent_user_settings",
    scope: "user",
    column: "user_id",
    single: true,
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "sessions",
    table: "sessions",
    scope: "session-json",
    cascade: "none",
    exportMode: "summary",
    notes:
      "No FK — `sess` is an opaque JSON blob matched on sess.userId. The raw `sid` is a session-hijack-relevant identifier and the raw `sess` blob may carry other session state; only counts/expiry are exported. Because there is no cascade, account-deletion.js must explicitly purge these rows (see TABLES_REQUIRING_EXPLICIT_CLEANUP).",
  },
  {
    key: "message_reply_tokens",
    table: "message_reply_tokens",
    scope: "user",
    column: "talent_user_id",
    cascade: "fk",
    exportMode: "redact",
    redactColumns: ["token"],
    notes: "Magic-link bearer token — never exported.",
  },
  {
    key: "comp_card_presets",
    table: "comp_card_presets",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "notifications",
    table: "notifications",
    scope: "user",
    column: "user_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "onboarding_analytics",
    table: "onboarding_analytics",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },
  {
    key: "commissions",
    table: "commissions",
    scope: "profile",
    column: "profile_id",
    cascade: "fk",
    exportMode: "full",
  },
];

/** Inventory entries with no DB-level cascade — deletion must clean these up explicitly. */
const TABLES_REQUIRING_EXPLICIT_CLEANUP = TALENT_DATA_INVENTORY.filter(
  (entry) => entry.cascade === "none",
);

function findInventoryEntry(key) {
  return TALENT_DATA_INVENTORY.find((entry) => entry.key === key) || null;
}

module.exports = {
  PROFILE_AI_COLUMNS,
  TALENT_DATA_INVENTORY,
  TABLES_REQUIRING_EXPLICIT_CLEANUP,
  findInventoryEntry,
};
