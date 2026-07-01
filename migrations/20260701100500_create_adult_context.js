"use strict";

const crypto = require("crypto");

/**
 * Wave 2B — Expand + Backfill (adult context, private/gated).
 *
 * Decision 2: PRIVATE verified-adult context. Content boundaries + verified-adult
 * creator links (incl. OnlyFans) move OUT of generic discovery/scoring into a
 * private, verified-adult-only context with explicit per-audience controls and
 * per-brief consent (wired later by a separate agent). Never exposed for minors.
 *
 * IMPORTANT: this table is private/gated. It MUST NOT be added to any audience DTO
 * in this pass — a later agent wires per-brief consent gating. Audience-control
 * flags default to FALSE (nothing shared until explicit consent).
 *
 * Backfill:
 *   - content_boundaries  ← profiles.comfort_levels (copied; source not dropped)
 *   - onlyfans_url        ← social_accounts (platform = 'onlyfans')
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable("adult_context");
  if (!hasTable) {
    await knex.schema.createTable("adult_context", (table) => {
      table.uuid("id").primary();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      // Content boundary fields (from comfort_levels + structured additions).
      table.text("content_boundaries").nullable();
      // Verified-adult creator links.
      table.string("onlyfans_url", 500).nullable();
      table.jsonb("creator_links").nullable();
      // Audience-control flags — default FALSE (per-brief consent only).
      table
        .boolean("share_with_named_submission")
        .notNullable()
        .defaultTo(false);
      table.boolean("share_with_confirmed_job").notNullable().defaultTo(false);
      // Verified-adult gate.
      table.boolean("verified_adult").notNullable().defaultTo(false);
      table.timestamp("verified_adult_at").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.unique(["profile_id"]);
    });
  }

  // Backfill content boundaries from comfort_levels.
  const profiles = await knex("profiles")
    .whereNotNull("comfort_levels")
    .select("id", "comfort_levels");

  // Backfill OnlyFans links from social_accounts.
  const onlyfans = await knex("social_accounts")
    .where("platform", "onlyfans")
    .whereNotNull("profile_id")
    .select("profile_id", "url");
  const onlyfansByProfile = new Map();
  for (const row of onlyfans) {
    if (row.url) onlyfansByProfile.set(row.profile_id, row.url);
  }

  const byProfile = new Map();
  for (const p of profiles) {
    byProfile.set(p.id, { content_boundaries: p.comfort_levels || null });
  }
  for (const [profileId, url] of onlyfansByProfile.entries()) {
    const entry = byProfile.get(profileId) || {};
    entry.onlyfans_url = url;
    byProfile.set(profileId, entry);
  }

  const rows = [];
  for (const [profileId, data] of byProfile.entries()) {
    const existing = await knex("adult_context")
      .where({ profile_id: profileId })
      .first();
    if (existing) continue;
    rows.push({
      id: crypto.randomUUID(),
      profile_id: profileId,
      content_boundaries: data.content_boundaries || null,
      onlyfans_url: data.onlyfans_url || null,
      creator_links: null,
      share_with_named_submission: false,
      share_with_confirmed_job: false,
      verified_adult: false,
      verified_adult_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  if (rows.length > 0) {
    await knex.batchInsert("adult_context", rows, 200);
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable("adult_context")) {
    await knex.schema.dropTable("adult_context");
  }
};
