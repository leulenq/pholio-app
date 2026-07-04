/**
 * Media audit — SERVER-CORE workstream.
 *
 * Adds:
 *  1. Motion asset support on `images` (asset_kind, video_url, video_duration_seconds).
 *  2. A real model-release artifact table (`image_model_releases`) linked 1:1 to an image.
 *
 * Idempotent + SQLite/Postgres safe (hasColumn / hasTable guards).
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const hasImages = await knex.schema.hasTable("images");

  if (hasImages) {
    const hasAssetKind = await knex.schema.hasColumn("images", "asset_kind");
    const hasVideoUrl = await knex.schema.hasColumn("images", "video_url");
    const hasVideoDuration = await knex.schema.hasColumn(
      "images",
      "video_duration_seconds",
    );

    if (!hasAssetKind || !hasVideoUrl || !hasVideoDuration) {
      await knex.schema.alterTable("images", (table) => {
        if (!hasAssetKind) {
          // 'image' (default) | 'video'
          table.string("asset_kind").notNullable().defaultTo("image");
        }
        if (!hasVideoUrl) {
          table.string("video_url", 1024).nullable();
        }
        if (!hasVideoDuration) {
          table.float("video_duration_seconds").nullable();
        }
      });
    }

    // Backfill any pre-existing rows that were created before the default existed.
    if (!hasAssetKind) {
      await knex("images")
        .whereNull("asset_kind")
        .update({ asset_kind: "image" });
    }
  }

  const hasReleases = await knex.schema.hasTable("image_model_releases");
  if (hasImages && !hasReleases) {
    await knex.schema.createTable("image_model_releases", (table) => {
      table.uuid("id").primary();
      table
        .uuid("image_id")
        .notNullable()
        .unique()
        .references("id")
        .inTable("images")
        .onDelete("CASCADE");
      // Stored artifact reference (storage key / file path) and/or a URL.
      table.string("release_ref", 1024).nullable();
      table.string("release_url", 1024).nullable();
      table.string("signer_name", 200).nullable();
      table.timestamp("signed_at").nullable();
      // Free-form or JSON-encoded list of parties to the release.
      table.text("parties").nullable();
      table.text("notes").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.index(["image_id"]);
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  const hasReleases = await knex.schema.hasTable("image_model_releases");
  if (hasReleases) {
    await knex.schema.dropTable("image_model_releases");
  }

  const hasImages = await knex.schema.hasTable("images");
  if (hasImages) {
    const cols = ["asset_kind", "video_url", "video_duration_seconds"];
    const present = {};
    for (const c of cols) {
      present[c] = await knex.schema.hasColumn("images", c);
    }
    if (Object.values(present).some(Boolean)) {
      await knex.schema.alterTable("images", (table) => {
        for (const c of cols) {
          if (present[c]) table.dropColumn(c);
        }
      });
    }
  }
};
