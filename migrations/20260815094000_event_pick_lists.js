"use strict";

/**
 * Designer pick lists (design A5) and the event funnel table (design §(g)).
 *
 * A pick list is the slice of a pool an organizer hands to one designer over a
 * read-only link. Three tables because they answer three different questions:
 * who was given a link (`event_pick_lists`), what was in it
 * (`event_pick_list_items`), and what came back (`event_pick_selections`).
 *
 * Not `boards`/`board_applications`: a board is an agency division with
 * DivisionMark identity and standings behind it, none of which a visiting
 * designer has. Not `share_tokens`: those are talent-owned, CASCADE to
 * profiles, and store the token in plaintext. What is borrowed is
 * share_tokens' open-count idiom and `message_reply_tokens`' hashing — the raw
 * token exists only inside the emailed URL, and only its sha256 is stored, so
 * a database read cannot mint a working link.
 *
 * A designer's `mark` is never an application status: several designers hold
 * private, conflicting opinions about the same applicant, and none of them is
 * the organizer's decision. Only an explicit offer moves the application, and
 * `offered_at` is where that lands.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const isPg =
    knex.client.config.client === "pg" || knex.client.config.client === "postgresql";

  /** `20260710120000:24` — jsonb where it is worth something, text where it is not. */
  const jsonCol = (table, name) =>
    isPg ? table.jsonb(name).nullable() : table.text(name).nullable();

  if (!(await knex.schema.hasTable("event_pick_lists"))) {
    await knex.schema.createTable("event_pick_lists", (table) => {
      table.uuid("id").primary().notNullable();
      table
        .uuid("agency_id")
        .notNullable()
        .references("id")
        .inTable("agencies")
        .onDelete("CASCADE");
      table
        .uuid("open_call_link_id")
        .notNullable()
        .references("id")
        .inTable("agency_open_call_links")
        .onDelete("CASCADE");

      table.string("designer_name", 160).notNullable();
      table.string("designer_email", 254).nullable();
      table.string("label", 120).nullable();
      table.text("organizer_note").nullable();
      table.integer("slots_requested").nullable();
      // draft | open | closed | revoked
      table.string("status", 16).notNullable().defaultTo("draft");

      // sha256 hex of the raw token. The raw value is never stored.
      table.string("token_hash", 64).notNullable().unique();
      table.timestamp("expires_at").notNullable();

      // Forwarding to a group chat is accepted (ruling R3); these are how an
      // organizer sees it happening.
      table.integer("open_count").notNullable().defaultTo(0);
      table.timestamp("first_opened_at").nullable();
      table.timestamp("last_opened_at").nullable();
      table.timestamp("submitted_at").nullable();
      table.timestamp("revoked_at").nullable();
      table.timestamp("rotated_at").nullable();

      table
        .uuid("created_by_user_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.index(["agency_id", "open_call_link_id"], "idx_event_pick_lists_agency_link");
      table.index(["token_hash"], "idx_event_pick_lists_token_hash");
    });
  }

  if (!(await knex.schema.hasTable("event_pick_list_items"))) {
    await knex.schema.createTable("event_pick_list_items", (table) => {
      table.uuid("id").primary().notNullable();
      table
        .uuid("pick_list_id")
        .notNullable()
        .references("id")
        .inTable("event_pick_lists")
        .onDelete("CASCADE");
      table
        .uuid("application_id")
        .notNullable()
        .references("id")
        .inTable("applications")
        .onDelete("CASCADE");
      table.integer("sort").notNullable().defaultTo(0);
      table
        .uuid("added_by_user_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

      table.unique(["pick_list_id", "application_id"], {
        indexName: "uq_event_pick_list_items_list_application",
      });
      table.index(["application_id"], "idx_event_pick_list_items_application");
    });
  }

  if (!(await knex.schema.hasTable("event_pick_selections"))) {
    await knex.schema.createTable("event_pick_selections", (table) => {
      table.uuid("id").primary().notNullable();
      table
        .uuid("pick_list_id")
        .notNullable()
        .references("id")
        .inTable("event_pick_lists")
        .onDelete("CASCADE");
      table
        .uuid("application_id")
        .notNullable()
        .references("id")
        .inTable("applications")
        .onDelete("CASCADE");

      // pick | maybe | pass
      table.string("mark", 8).notNullable();
      table.string("note", 300).nullable();
      table.timestamp("marked_at").notNullable().defaultTo(knex.fn.now());
      table.string("ip_hash", 64).nullable();
      table.string("user_agent", 512).nullable();

      // The organizer's offer, recorded against the selection that prompted it.
      table.timestamp("offered_at").nullable();
      table
        .uuid("offered_by_user_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");

      table.unique(["pick_list_id", "application_id"], {
        indexName: "uq_event_pick_selections_list_application",
      });
      table.index(["application_id", "mark"], "idx_event_pick_selections_application_mark");
    });

    // One live slot offer per applicant per call. Two designers may both pick
    // the same model; only one of them can be handed the slot.
    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_event_pick_selections_offered_application
        ON event_pick_selections (application_id)
        WHERE offered_at IS NOT NULL
    `);
  }

  if (!(await knex.schema.hasTable("event_casting_funnel_events"))) {
    // Modelled on spec_registry_engagement_events. Neither profile_events nor
    // onboarding_analytics can hold these: the first drops viewer_class='self'
    // and the second owns its own step vocabulary, and neither records the
    // pre-signup arrival that is this funnel's denominator — hence `anon_id`,
    // a hashed session id that stitches arrival to submission.
    await knex.schema.createTable("event_casting_funnel_events", (table) => {
      table.uuid("id").primary().notNullable();
      table
        .uuid("open_call_link_id")
        .notNullable()
        .references("id")
        .inTable("agency_open_call_links")
        .onDelete("CASCADE");
      table
        .uuid("agency_id")
        .nullable()
        .references("id")
        .inTable("agencies")
        .onDelete("SET NULL");
      table
        .uuid("profile_id")
        .nullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table.string("anon_id", 64).nullable();
      table.string("event_type", 40).notNullable();
      jsonCol(table, "metadata");
      table.timestamp("occurred_at").notNullable().defaultTo(knex.fn.now());

      table.index(
        ["open_call_link_id", "event_type", "occurred_at"],
        "idx_event_funnel_link_type_time",
      );
      table.index(["profile_id", "occurred_at"], "idx_event_funnel_profile_time");
    });
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("event_casting_funnel_events");
  await knex.raw("DROP INDEX IF EXISTS uq_event_pick_selections_offered_application");
  await knex.schema.dropTableIfExists("event_pick_selections");
  await knex.schema.dropTableIfExists("event_pick_list_items");
  await knex.schema.dropTableIfExists("event_pick_lists");
};
