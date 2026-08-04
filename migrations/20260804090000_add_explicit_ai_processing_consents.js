"use strict";

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const DISCLOSURE_VERSION = "2026-08-04";
const DISCLOSURES = {
  image_analysis:
    "Allow Pholio to send portfolio images to its image-analysis provider for shot classification and profile insights.",
  agency_search_matching:
    "Allow Pholio to send a limited profile summary to its embedding provider so vetted agency searches can find relevant talent.",
};

function disclosureHash(purpose) {
  return crypto
    .createHash("sha256")
    .update(`${DISCLOSURE_VERSION}\n${DISCLOSURES[purpose]}`, "utf8")
    .digest("hex");
}

function parseJson(raw, fallback = {}) {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function jsonForDb(knex, value) {
  const client = knex.client?.config?.client;
  return client === "pg" || client === "postgresql"
    ? value
    : JSON.stringify(value);
}

async function hasTable(knex, table) {
  try {
    return await knex.schema.hasTable(table);
  } catch {
    return false;
  }
}

async function existingColumns(knex, table, columns) {
  const found = [];
  for (const column of columns) {
    if (await knex.schema.hasColumn(table, column)) found.push(column);
  }
  return found;
}

function userClassification(metadata, image) {
  const classification = metadata?.ai?.classification;
  if (!classification || classification.source !== "user") return null;

  const preserved = {
    source: "user",
    confirmed: classification.confirmed === true,
    band: classification.band || "ask",
  };
  if (classification.review_deferred === true) preserved.review_deferred = true;
  for (const field of ["shot_type", "style_type", "image_type"]) {
    if (image[field] != null && String(image[field]).trim()) {
      preserved[field] = { value: image[field], source: "user" };
    }
  }
  return preserved;
}

async function purgeImageDerivatives(knex) {
  if (!(await hasTable(knex, "images"))) return;

  const columns = ["id", "metadata"];
  for (const column of ["shot_type", "style_type", "image_type"]) {
    if (await knex.schema.hasColumn("images", column)) columns.push(column);
  }
  const hasEmbedding = await knex.schema.hasColumn("images", "embedding");
  if (hasEmbedding) columns.push("embedding");

  const images = await knex("images").select(columns);
  for (const image of images) {
    const metadata = parseJson(image.metadata, {});
    const classification = userClassification(metadata, image);
    const nextMetadata = { ...metadata };
    if (classification) nextMetadata.ai = { classification };
    else delete nextMetadata.ai;

    const update = { metadata: jsonForDb(knex, nextMetadata) };
    if (!classification && metadata?.ai?.classification) {
      for (const field of ["shot_type", "style_type", "image_type"]) {
        if (columns.includes(field)) update[field] = null;
      }
    }
    if (hasEmbedding) update.embedding = null;
    await knex("images").where({ id: image.id }).update(update);
  }

  for (const table of ["image_signals", "image_classification_feedback"]) {
    if (await hasTable(knex, table)) await knex(table).del();
  }
}

async function purgeProfileDerivatives(knex) {
  const nullableProfileColumns = await existingColumns(knex, "profiles", [
    "image_analysis",
    "image_analyzed_at",
    "image_analysis_model",
    "look_descriptor",
    "look_descriptor_generated_at",
    "archetype",
    "fit_score_runway",
    "fit_score_editorial",
    "fit_score_commercial",
    "fit_score_lifestyle",
    "fit_score_swim_fitness",
    "fit_score_overall",
    "fit_scores_calculated_at",
    "photo_embedding",
    "vector_summary",
    "vector_summary_text",
    "visual_intel",
    "onboarding_predictions",
    "librarian_synthesis",
    "market_fit_rankings",
    "vibe_score",
    "predicted_height_cm",
    "predicted_weight_lbs",
    "predicted_bust",
    "predicted_waist",
    "predicted_hips",
    "predicted_hair_color",
    "predicted_eye_color",
    "predicted_skin_tone",
    "search_document",
    "search_vector",
  ]);
  const profileUpdate = Object.fromEntries(
    nullableProfileColumns.map((column) => [column, null]),
  );
  if (await knex.schema.hasColumn("profiles", "is_unicorn")) {
    profileUpdate.is_unicorn = false;
  }
  if (Object.keys(profileUpdate).length) await knex("profiles").update(profileUpdate);

  if (await hasTable(knex, "onboarding_signals")) {
    const columns = await existingColumns(knex, "onboarding_signals", [
      "ai_results",
      "archetype_runway_pct",
      "archetype_editorial_pct",
      "archetype_lifestyle_pct",
      "archetype_commercial_pct",
      "archetype_label",
      "casting_verdict",
    ]);
    if (columns.length) {
      await knex("onboarding_signals").update(
        Object.fromEntries(columns.map((column) => [column, null])),
      );
    }
  }

  for (const table of [
    "ai_profile_analysis",
    "talent_text_embeddings",
    "talent_image_embeddings",
    "talent_embedding_cache",
    "profiles_fts",
  ]) {
    if (await hasTable(knex, table)) await knex(table).del();
  }
}

async function createConsentEventsTable(knex) {
  if (!(await hasTable(knex, "ai_processing_consent_events"))) {
    await knex.schema.createTable("ai_processing_consent_events", (table) => {
      table.increments("sequence").primary();
      table.uuid("id").notNullable().unique();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table
        .uuid("actor_user_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      table.string("purpose", 48).notNullable();
      table.string("event_type", 48).notNullable();
      table.boolean("granted").notNullable();
      table.string("disclosure_version", 32).notNullable();
      table.string("disclosure_hash", 64).notNullable();
      table.string("actor_type", 32).notNullable();
      table.string("request_ip", 64).nullable();
      table.text("user_agent").nullable();
      table.string("deletion_state", 24).notNullable();
      table.text("deletion_error").nullable();
      table.uuid("related_event_id").nullable();
      table.timestamp("occurred_at").notNullable().defaultTo(knex.fn.now());
      table.index(
        ["profile_id", "purpose", "occurred_at"],
        "idx_ai_consent_profile_purpose_time",
      );
    });
  }

  // Evidence rows are append-only. Deletes remain possible through the profile
  // cascade so an account-erasure request is not blocked.
  const client = knex.client?.config?.client;
  if (client === "sqlite3" || client === "better-sqlite3") {
    await knex.raw(`
      CREATE TRIGGER IF NOT EXISTS ai_processing_consent_events_no_update
      BEFORE UPDATE ON ai_processing_consent_events
      BEGIN
        SELECT RAISE(ABORT, 'ai_processing_consent_events are immutable');
      END
    `);
  } else if (client === "pg" || client === "postgresql") {
    await knex.raw(`
      CREATE OR REPLACE FUNCTION prevent_ai_consent_event_update()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'ai_processing_consent_events are immutable';
      END;
      $$ LANGUAGE plpgsql
    `);
    await knex.raw(`
      DROP TRIGGER IF EXISTS ai_processing_consent_events_no_update
      ON ai_processing_consent_events
    `);
    await knex.raw(`
      CREATE TRIGGER ai_processing_consent_events_no_update
      BEFORE UPDATE ON ai_processing_consent_events
      FOR EACH ROW EXECUTE FUNCTION prevent_ai_consent_event_update()
    `);
  }
}

async function recordDefaultOffEvidence(knex) {
  const profiles = await knex("profiles").select("id");
  const existingRows = await knex("ai_processing_consent_events")
    .where({ event_type: "migration_default_off" })
    .select("profile_id", "purpose");
  const existing = new Set(
    existingRows.map((row) => `${row.profile_id}\u0000${row.purpose}`),
  );
  const rows = [];
  for (const profile of profiles) {
    for (const purpose of Object.keys(DISCLOSURES)) {
      if (existing.has(`${profile.id}\u0000${purpose}`)) continue;
      rows.push({
        id: uuidv4(),
        profile_id: profile.id,
        actor_user_id: null,
        purpose,
        event_type: "migration_default_off",
        granted: false,
        disclosure_version: DISCLOSURE_VERSION,
        disclosure_hash: disclosureHash(purpose),
        actor_type: "system",
        request_ip: null,
        user_agent: null,
        deletion_state: "complete",
        deletion_error: null,
        related_event_id: null,
        occurred_at: knex.fn.now(),
      });
    }
  }

  // Avoid a single huge insert on established databases.
  for (let index = 0; index < rows.length; index += 250) {
    await knex("ai_processing_consent_events").insert(rows.slice(index, index + 250));
  }
}

/**
 * Establish separate, affirmative purposes and remove every legacy derivative
 * that was created before those purposes were default-off.
 */
exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    for (const column of [
      "ai_processing_consent",
      "embedding_processing_consent",
    ]) {
      if (!(await trx.schema.hasColumn("profiles", column))) {
        await trx.schema.alterTable("profiles", (table) => {
          table.boolean(column).notNullable().defaultTo(false);
        });
      }
      await trx("profiles").update({ [column]: false });
    }

    await createConsentEventsTable(trx);
    await purgeImageDerivatives(trx);
    await purgeProfileDerivatives(trx);
    await recordDefaultOffEvidence(trx);
  });
};

// Rolling this migration back would erase consent evidence and make explicit
// preferences unrepresentable. Keep the safety baseline intact.
exports.down = async function down() {};

exports.__testables = {
  DISCLOSURE_VERSION,
  DISCLOSURES,
  disclosureHash,
  userClassification,
};
