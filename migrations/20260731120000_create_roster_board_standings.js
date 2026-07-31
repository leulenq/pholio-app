"use strict";

const { v4: uuidv4 } = require("uuid");

/**
 * Per-board standing for a roster membership (multi-board representation).
 *
 * WHY THIS EXISTS
 *
 * `roster_memberships.board_id` is a single nullable FK, so a talent could sit
 * on exactly ONE board per agency. That contradicts how agencies actually run
 * a roster: a face who books both commercial and editorial is the normal,
 * valuable case, not an edge case. Working agency software (EasyModelling,
 * cDs) lets an agency create as many boards as it needs and place talent
 * across them, and `.claude/skills/industry/reference/standards.md` §2 states
 * it plainly: "A talent can sit on more than one board."
 *
 * STANDING IS A ROSTER FACT, NOT AN APPLICATION FACT
 *
 * Standing lives here rather than on `applications` because agencies routinely
 * shortlist people who never applied — scouted faces, direct adds, and talent
 * transferred from another agency. If standing were derived from an
 * application, none of those could be shortlisted or kept on file. An
 * application is an EVENT with its own lifecycle; a standing is the CURRENT
 * STATE of a relationship to one board. `source_application_id` preserves
 * provenance where an application did start it.
 *
 * The `roster_memberships.board_id` column is left in place and is now the
 * denormalised pointer to the primary board (`is_primary`), so existing reads
 * keep working while callers migrate.
 *
 * @param {import("knex").Knex} knex
 */

// Mirrors STANDINGS in client/src/domains/agency/components/status/divisions.js.
// `unknown` is included deliberately: missing data must be representable as
// missing, never inferred as a positive representation claim.
const STANDINGS = [
  "represented",
  "active",
  "developing",
  "shortlisted",
  "onfile",
  "inactive",
  "ended",
  "passed",
  "unknown",
];

/** Roster stage + status -> the standing on the primary board. */
function deriveStanding(stage, status) {
  if (status === "left" || status === "ended") return "ended";
  if (status === "inactive") return "inactive";
  if (stage === "new_face" || stage === "development") return "developing";
  if (stage === "main") return "represented";
  return "active";
}

exports.up = async function up(knex) {
  if (await knex.schema.hasTable("roster_board_standings")) return;

  await knex.schema.createTable("roster_board_standings", (table) => {
    table.uuid("id").primary();
    table
      .uuid("membership_id")
      .notNullable()
      .references("id")
      .inTable("roster_memberships")
      .onDelete("CASCADE");
    table
      .uuid("board_id")
      .notNullable()
      .references("id")
      .inTable("boards")
      .onDelete("CASCADE");
    table.string("standing", 20).notNullable().defaultTo("unknown");
    // The talent's roster home at this agency. At most one per membership;
    // the rest are market boards they are available for.
    table.boolean("is_primary").notNullable().defaultTo(false);
    table
      .uuid("source_application_id")
      .nullable()
      .references("id")
      .inTable("applications")
      .onDelete("SET NULL");
    table.text("notes").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    table.unique(["membership_id", "board_id"], {
      indexName: "roster_board_standings_membership_board_unique",
    });
    table.index(["board_id", "standing"], "idx_roster_board_standings_board");
    table.check(
      `standing in (${STANDINGS.map((s) => `'${s}'`).join(", ")})`,
      [],
      "roster_board_standings_standing_check",
    );
  });

  // Backfill: every existing membership with a board becomes that board's
  // primary standing, so no roster loses its division on deploy.
  const existing = await knex("roster_memberships")
    .whereNotNull("board_id")
    .select("id", "board_id", "stage", "status", "source_application_id");

  if (existing.length === 0) return;

  const rows = existing.map((m) => ({
    id: uuidv4(),
    membership_id: m.id,
    board_id: m.board_id,
    standing: deriveStanding(m.stage, m.status),
    is_primary: true,
    source_application_id: m.source_application_id || null,
  }));

  // Chunked so a large roster doesn't build one oversized statement.
  for (let i = 0; i < rows.length; i += 200) {
    await knex("roster_board_standings").insert(rows.slice(i, i + 200));
  }
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable("roster_board_standings"))) return;
  await knex.schema.dropTable("roster_board_standings");
};
