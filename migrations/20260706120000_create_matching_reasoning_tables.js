/**
 * Matching decision-support engine — foundational tables (Stage 0).
 *
 * Non-breaking: adds the object-model discriminator + the reasoning/criteria/
 * learning stores the new engine reads and writes. Does NOT alter or drop the
 * existing weighted board-scoring path; that keeps working untouched.
 *
 *  - boards.kind          division | casting   (splits the overloaded boards table)
 *  - match_criteria       sparse constraints + signal-relevance priors per scope
 *  - match_evaluations    immutable "fit brief" records (audit + replay)
 *  - agency_preference_model  per-agency learned capacities + case weights
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const isPostgres =
    knex.client.config.client === "pg" ||
    knex.client.config.client === "postgresql";

  const jsonCol = (table, name) =>
    isPostgres ? table.jsonb(name).nullable() : table.text(name).nullable();

  const uuidPk = (table) =>
    isPostgres
      ? table.uuid("id").primary().defaultTo(knex.fn.uuid())
      : table.uuid("id").primary();

  // 1. boards.kind discriminator ------------------------------------------------
  const hasBoards = await knex.schema.hasTable("boards");
  if (hasBoards) {
    const hasKind = await knex.schema.hasColumn("boards", "kind");
    if (!hasKind) {
      await knex.schema.alterTable("boards", (table) => {
        table.string("kind", 20).notNullable().defaultTo("division");
      });
      // Backfill: any board carrying casting metadata is a casting brief.
      const cols = await Promise.all([
        knex.schema.hasColumn("boards", "client_name"),
        knex.schema.hasColumn("boards", "closes_at"),
        knex.schema.hasColumn("boards", "target_slots"),
      ]);
      const [hasClient, hasCloses, hasSlots] = cols;
      if (hasClient || hasCloses || hasSlots) {
        await knex("boards")
          .where((qb) => {
            if (hasClient) qb.orWhereNotNull("client_name");
            if (hasCloses) qb.orWhereNotNull("closes_at");
            if (hasSlots) qb.orWhereNotNull("target_slots");
          })
          .update({ kind: "casting" });
      }
    }
  }

  // 2. match_criteria -----------------------------------------------------------
  const hasCriteria = await knex.schema.hasTable("match_criteria");
  if (!hasCriteria) {
    await knex.schema.createTable("match_criteria", (table) => {
      uuidPk(table);
      table.string("scope_type", 20).notNullable(); // agency | board | brief
      table.uuid("scope_id").notNullable();
      jsonCol(table, "constraints"); // hard vetoes + soft near-miss defs
      jsonCol(table, "signal_relevance"); // {importance:{dim:n}, interactions:{"a|b":n}}
      jsonCol(table, "look_target"); // target look vector / aesthetic
      table.integer("version").notNullable().defaultTo(1);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.unique(["scope_type", "scope_id"]);
      table.index(["scope_type", "scope_id"]);
    });
  }

  // 3. match_evaluations (immutable reasoning records) --------------------------
  const hasEvals = await knex.schema.hasTable("match_evaluations");
  if (!hasEvals) {
    await knex.schema.createTable("match_evaluations", (table) => {
      uuidPk(table);
      table.string("scope_type", 20).notNullable();
      table.uuid("scope_id").notNullable();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table.string("posture", 20).nullable();
      table.string("band", 20).nullable();
      table.integer("fit_index").nullable(); // secondary sort handle only
      table.decimal("confidence", 4, 3).nullable();
      jsonCol(table, "brief"); // full fit brief (case for/against/missing/…)
      jsonCol(table, "evidence_snapshot"); // evidence units at compute time
      table.integer("criteria_version").nullable();
      table.string("capacity_version", 40).nullable();
      table.string("engine_version", 20).nullable();
      table.timestamp("computed_at").defaultTo(knex.fn.now());
      table.index(["scope_type", "scope_id"]);
      table.index("profile_id");
      table.index("computed_at");
    });
  }

  // 4. agency_preference_model (learned capacities + case weights) --------------
  const hasPref = await knex.schema.hasTable("agency_preference_model");
  if (!hasPref) {
    await knex.schema.createTable("agency_preference_model", (table) => {
      uuidPk(table);
      table.uuid("agency_id").notNullable();
      table.string("scope_type", 20).notNullable().defaultTo("agency");
      table.uuid("scope_id").nullable(); // null = agency-wide default
      jsonCol(table, "capacity"); // learned {phi:{dim:n}, interaction:{"a|b":n}}
      jsonCol(table, "case_weights"); // learned CBR weights
      table.integer("version").notNullable().defaultTo(1);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.unique(["agency_id", "scope_type", "scope_id"]);
      table.index("agency_id");
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("agency_preference_model");
  await knex.schema.dropTableIfExists("match_evaluations");
  await knex.schema.dropTableIfExists("match_criteria");

  const hasBoards = await knex.schema.hasTable("boards");
  if (hasBoards) {
    const hasKind = await knex.schema.hasColumn("boards", "kind");
    if (hasKind) {
      await knex.schema.alterTable("boards", (table) => {
        table.dropColumn("kind");
      });
    }
  }
};
