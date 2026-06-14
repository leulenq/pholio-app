/**
 * Agency social presence fields (mirrors talent profile social columns).
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable("agencies");
  if (!hasTable) return;

  const hasInstagram = await knex.schema.hasColumn(
    "agencies",
    "instagram_handle",
  );
  if (!hasInstagram) {
    await knex.schema.alterTable("agencies", (table) => {
      table.string("instagram_handle", 255).nullable();
      table.string("tiktok_handle", 255).nullable();
      table.string("twitter_handle", 255).nullable();
      table.string("youtube_handle", 255).nullable();
      table.string("video_reel_url", 500).nullable();
    });
  }
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable("agencies");
  if (!hasTable) return;

  const hasInstagram = await knex.schema.hasColumn(
    "agencies",
    "instagram_handle",
  );
  if (hasInstagram) {
    await knex.schema.alterTable("agencies", (table) => {
      table.dropColumn("instagram_handle");
      table.dropColumn("tiktok_handle");
      table.dropColumn("twitter_handle");
      table.dropColumn("youtube_handle");
      table.dropColumn("video_reel_url");
    });
  }
};
