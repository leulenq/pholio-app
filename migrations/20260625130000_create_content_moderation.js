/**
 * Content moderation infrastructure (legal audit Phase 1).
 *
 * Adds per-image moderation state to `images` and a `moderation_queue` table
 * for items that require human review before becoming visible to agencies or
 * the public.
 *
 * @param {import('knex').Knex} knex
 */
const IMAGE_MODERATION_COLUMNS = [
  "moderation_status",
  "moderation_reason",
  "moderated_at",
];

exports.up = async function up(knex) {
  const hasImages = await knex.schema.hasTable("images");

  if (hasImages) {
    /** @type {Record<string, boolean>} */
    const colExists = {};
    for (const col of IMAGE_MODERATION_COLUMNS) {
      colExists[col] = await knex.schema.hasColumn("images", col);
    }
    const needsAlter = IMAGE_MODERATION_COLUMNS.some((c) => !colExists[c]);
    if (needsAlter) {
      await knex.schema.alterTable("images", (table) => {
        if (!colExists.moderation_status) {
          // pending | approved | rejected | review
          table.string("moderation_status").notNullable().defaultTo("pending");
        }
        if (!colExists.moderation_reason) {
          table.text("moderation_reason").nullable();
        }
        if (!colExists.moderated_at) {
          table.timestamp("moderated_at").nullable();
        }
      });

      const hasStatus = await knex.schema.hasColumn(
        "images",
        "moderation_status",
      );
      if (hasStatus) {
        await knex.schema.alterTable("images", (table) => {
          table.index(["moderation_status"], "images_moderation_status_index");
        });
      }
    }
  }

  const hasQueue = await knex.schema.hasTable("moderation_queue");
  if (!hasQueue) {
    await knex.schema.createTable("moderation_queue", (table) => {
      table.uuid("id").primary();
      table
        .uuid("image_id")
        .nullable()
        .references("id")
        .inTable("images")
        .onDelete("CASCADE");
      table.uuid("profile_id").nullable();
      // pending | approved | rejected
      table.string("status").notNullable().defaultTo("pending");
      table.json("flags").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("reviewed_at").nullable();
      table.uuid("reviewed_by").nullable();
      table.index(["status"]);
      table.index(["image_id"]);
      table.index(["profile_id"]);
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  const hasQueue = await knex.schema.hasTable("moderation_queue");
  if (hasQueue) {
    await knex.schema.dropTableIfExists("moderation_queue");
  }

  const hasImages = await knex.schema.hasTable("images");
  if (hasImages) {
    for (let i = IMAGE_MODERATION_COLUMNS.length - 1; i >= 0; i -= 1) {
      const col = IMAGE_MODERATION_COLUMNS[i];
      const exists = await knex.schema.hasColumn("images", col);
      if (exists) {
        await knex.schema.alterTable("images", (table) => {
          table.dropColumn(col);
        });
      }
    }
  }
};
