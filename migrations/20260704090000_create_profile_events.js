/**
 * First-party event schema for factual, talent-owned portfolio analytics.
 * Both tables cascade from `profiles`, so account erasure removes their rows.
 */

exports.up = async function up(knex) {
  const hasEvents = await knex.schema.hasTable("profile_events");
  if (!hasEvents) {
    await knex.schema.createTable("profile_events", (table) => {
      table.uuid("id").primary();
      table.uuid("profile_id").notNullable();
      // 'view' | 'card_pull' | 'link_open' | 'bio_read' | 'social_click'
      // | 'portfolio_click' | 'scroll_depth' | 'contact_click'
      // | 'image_impression' | 'image_open' | 'image_dwell'
      // | 'discovery_impression' | 'discovery_open'
      table.string("action", 40).notNullable();
      // 'agency' | 'shared' | 'public' | 'self'. Historical rows may use
      // 'client'; readers normalize those to 'shared'.
      table.string("viewer_class", 12).notNullable().defaultTo("public");
      table.string("session_id", 64).nullable();
      // Industry market slug ('new-york', 'paris', ...) or ISO-3166 alpha-2
      // country fallback ('us', 'fr'). Never city/coords/IP.
      table.string("market", 32).nullable();
      table.uuid("image_id").nullable();
      table.integer("dwell_ms").nullable();
      table.uuid("share_token_id").nullable();
      // 'instagram' | 'tiktok' | 'twitter' | 'facebook' | 'search'
      // | 'share_link' | 'card_link' | 'agency' | 'direct' | referrer host
      table.string("source", 60).nullable();
      table.string("referrer", 512).nullable();
      table.json("metadata").nullable();
      table.timestamp("occurred_at").notNullable().defaultTo(knex.fn.now());

      table
        .foreign("profile_id")
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table.index(["profile_id", "occurred_at"]);
      table.index(["profile_id", "action", "occurred_at"]);
      table.index(["profile_id", "viewer_class", "occurred_at"]);
      table.index(["share_token_id"]);
    });
  }

  const hasTokens = await knex.schema.hasTable("share_tokens");
  if (!hasTokens) {
    await knex.schema.createTable("share_tokens", (table) => {
      table.uuid("id").primary();
      table.uuid("profile_id").notNullable();
      table.string("token", 64).notNullable().unique();
      // Recipient label the talent chose ("Marilyn NY", "casting — L'Oréal").
      table.string("label", 120).nullable();
      // 'portfolio' | 'card'
      table.string("kind", 20).notNullable().defaultTo("portfolio");
      table.integer("open_count").notNullable().defaultTo(0);
      table.timestamp("first_opened_at").nullable();
      table.timestamp("last_opened_at").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("revoked_at").nullable();

      table
        .foreign("profile_id")
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table.index(["profile_id"]);
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("profile_events");
  await knex.schema.dropTableIfExists("share_tokens");
};
