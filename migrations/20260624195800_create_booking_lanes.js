const {
  BOOKING_LANES,
  normalizeBookingLaneList,
} = require("../src/shared/constants/booking-lanes");

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

exports.up = async function up(knex) {
  const hasProfiles = await knex.schema.hasTable("profiles");
  if (!hasProfiles) return;

  const hasBookingLanes = await knex.schema.hasTable("booking_lanes");
  if (!hasBookingLanes) {
    await knex.schema.createTable("booking_lanes", (table) => {
      table.string("slug", 80).primary();
      table.string("label", 120).notNullable();
      table.string("group", 80).notNullable();
      table.text("description").nullable();
      table.integer("sort_order").notNullable().defaultTo(0);
      table.boolean("is_active").notNullable().defaultTo(true);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.index(["group", "sort_order"]);
      table.index(["is_active"]);
    });
  }

  const laneRows = BOOKING_LANES.map((lane, index) => ({
    slug: lane.slug,
    label: lane.label,
    group: lane.group,
    description: lane.description,
    sort_order: index + 1,
    is_active: true,
  }));

  for (const row of laneRows) {
    const existing = await knex("booking_lanes").where({ slug: row.slug }).first();
    if (existing) {
      await knex("booking_lanes").where({ slug: row.slug }).update({
        label: row.label,
        group: row.group,
        description: row.description,
        sort_order: row.sort_order,
        is_active: row.is_active,
        updated_at: knex.fn.now(),
      });
    } else {
      await knex("booking_lanes").insert(row);
    }
  }

  const hasProfileBookingLanes = await knex.schema.hasTable("profile_booking_lanes");
  if (!hasProfileBookingLanes) {
    await knex.schema.createTable("profile_booking_lanes", (table) => {
      table.uuid("profile_id").notNullable().references("id").inTable("profiles").onDelete("CASCADE");
      table.string("lane_slug", 80).notNullable().references("slug").inTable("booking_lanes").onDelete("CASCADE");
      table.integer("priority").notNullable().defaultTo(2);
      table.string("source", 40).notNullable().defaultTo("talent_selected");
      table.integer("confidence").nullable();
      table.uuid("confirmed_by_agency_id").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.primary(["profile_id", "lane_slug"]);
      table.index(["profile_id", "priority"]);
      table.index(["lane_slug"]);
      table.index(["source"]);
    });
  }

  const profiles = await knex("profiles").select("id", "modeling_categories");
  for (const profile of profiles) {
    const lanes = normalizeBookingLaneList(parseJsonArray(profile.modeling_categories));
    if (!lanes.length) continue;

    for (const [index, laneSlug] of lanes.slice(0, 4).entries()) {
      const exists = await knex("profile_booking_lanes")
        .where({ profile_id: profile.id, lane_slug: laneSlug })
        .first();
      if (exists) continue;
      await knex("profile_booking_lanes").insert({
        profile_id: profile.id,
        lane_slug: laneSlug,
        priority: index + 1,
        source: "legacy_modeling_categories",
      });
    }
  }
};

exports.down = async function down(knex) {
  const hasProfileBookingLanes = await knex.schema.hasTable("profile_booking_lanes");
  if (hasProfileBookingLanes) {
    await knex.schema.dropTable("profile_booking_lanes");
  }

  const hasBookingLanes = await knex.schema.hasTable("booking_lanes");
  if (hasBookingLanes) {
    await knex.schema.dropTable("booking_lanes");
  }
};
