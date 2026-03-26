/**
 * Phase 1 database foundation: image_sets, image_rights, and extended images metadata.
 *
 * @param {import('knex').Knex} knex
 */
const { v4: uuidv4 } = require("uuid");

const IMAGE_EXTRA_COLUMNS = [
  "image_type",
  "shot_type",
  "style_type",
  "status",
  "exclude_from_public",
  "exclude_from_agency",
  "captured_at",
  "retouched_at",
  "set_id",
];

exports.up = async function up(knex) {
  const hasProfiles = await knex.schema.hasTable("profiles");
  if (!hasProfiles) {
    return;
  }

  const hasImages = await knex.schema.hasTable("images");

  const hasImageSets = await knex.schema.hasTable("image_sets");
  if (!hasImageSets) {
    await knex.schema.createTable("image_sets", (table) => {
      table.uuid("id").primary();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table.string("kind").notNullable();
      table.string("name").nullable();
      table.boolean("is_current").notNullable().defaultTo(false);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("retired_at").nullable();
      table.index(["profile_id"]);
      table.index(["kind"]);
      table.index(["is_current"]);
    });
  }

  if (hasImages) {
    /** @type {Record<string, boolean>} */
    const colExists = {};
    for (const col of IMAGE_EXTRA_COLUMNS) {
      colExists[col] = await knex.schema.hasColumn("images", col);
    }
    const needsAlter = IMAGE_EXTRA_COLUMNS.some((c) => !colExists[c]);
    if (needsAlter) {
      await knex.schema.alterTable("images", (table) => {
        if (!colExists.image_type) {
          table.string("image_type").nullable();
        }
        if (!colExists.shot_type) {
          table.string("shot_type").nullable();
        }
        if (!colExists.style_type) {
          table.string("style_type").nullable();
        }
        if (!colExists.status) {
          table.string("status").notNullable().defaultTo("active");
        }
        if (!colExists.exclude_from_public) {
          table.boolean("exclude_from_public").notNullable().defaultTo(false);
        }
        if (!colExists.exclude_from_agency) {
          table.boolean("exclude_from_agency").notNullable().defaultTo(false);
        }
        if (!colExists.captured_at) {
          table.timestamp("captured_at").nullable();
        }
        if (!colExists.retouched_at) {
          table.timestamp("retouched_at").nullable();
        }
        if (!colExists.set_id) {
          table
            .uuid("set_id")
            .nullable()
            .references("id")
            .inTable("image_sets")
            .onDelete("SET NULL");
        }
      });
    }
  }

  if (hasImages) {
    const hasImageRights = await knex.schema.hasTable("image_rights");
    if (!hasImageRights) {
      await knex.schema.createTable("image_rights", (table) => {
        table.uuid("id").primary();
        table
          .uuid("image_id")
          .notNullable()
          .unique()
          .references("id")
          .inTable("images")
          .onDelete("CASCADE");
        table.string("copyright_owner").nullable();
        table.string("photographer_name").nullable();
        table.string("license_type").nullable();
        table.string("usage_scope").nullable();
        table.string("territory").nullable();
        table.timestamp("start_at").nullable();
        table.timestamp("expires_at").nullable();
        table.boolean("exclusive").notNullable().defaultTo(false);
        table.string("model_release_ref").nullable();
        table.string("rights_status").nullable();
        table.text("notes").nullable();
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.timestamp("updated_at").defaultTo(knex.fn.now());
      });
    }
  }

  if (!hasImages) {
    return;
  }

  const hasStatus = await knex.schema.hasColumn("images", "status");
  if (hasStatus) {
    await knex("images").whereNull("status").update({ status: "active" });
  }

  const hasImageType = await knex.schema.hasColumn("images", "image_type");
  if (hasImageType) {
    await knex("images")
      .whereNull("image_type")
      .update({ image_type: "portfolio" });
  }

  const hasSetId = await knex.schema.hasColumn("images", "set_id");
  if (!hasSetId) {
    return;
  }

  const profileRows = await knex("images")
    .distinct("profile_id")
    .select("profile_id");
  for (const row of profileRows) {
    const profileId = row.profile_id;
    if (!profileId) {
      continue;
    }

    let setRow = await knex("image_sets")
      .where({ profile_id: profileId, kind: "portfolio_test" })
      .first();

    if (!setRow) {
      const newId = uuidv4();
      await knex("image_sets").insert({
        id: newId,
        profile_id: profileId,
        kind: "portfolio_test",
        name: "Imported Portfolio",
        is_current: true,
        created_at: knex.fn.now(),
        retired_at: null,
      });
      setRow = { id: newId };
    }

    if (setRow.id) {
      await knex("images")
        .where({ profile_id: profileId })
        .whereNull("set_id")
        .update({ set_id: setRow.id });
    }
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  const hasImages = await knex.schema.hasTable("images");

  if (hasImages) {
    const hasImageRights = await knex.schema.hasTable("image_rights");
    if (hasImageRights) {
      await knex.schema.dropTableIfExists("image_rights");
    }
  }

  if (hasImages) {
    for (let i = IMAGE_EXTRA_COLUMNS.length - 1; i >= 0; i -= 1) {
      const col = IMAGE_EXTRA_COLUMNS[i];
      const exists = await knex.schema.hasColumn("images", col);
      if (exists) {
        await knex.schema.alterTable("images", (table) => {
          table.dropColumn(col);
        });
      }
    }
  }

  const hasImageSets = await knex.schema.hasTable("image_sets");
  if (hasImageSets) {
    await knex.schema.dropTableIfExists("image_sets");
  }
};
