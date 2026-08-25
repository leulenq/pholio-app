/**
 * NOT transactional, deliberately.
 *
 * SQLite has no DROP COLUMN, so knex rebuilds the table: create-copy-drop-
 * rename. It guards that with `PRAGMA foreign_keys = OFF`, which SQLite
 * silently ignores inside a transaction. Dropping a column from a table other
 * rows reference would then cascade and empty them — the exact regression
 * tests/migrations/event-casting-schema.test.js exists to catch, and which it
 * caught here.
 */
exports.config = { transaction: false };

/**
 * Drop dormant automated-scoring schema (board_scoring_weights,
 * applications.match_score, applications.match_calculated_at).
 *
 * WHY: this schema is a numeric-scoring surface over protected
 * characteristics of applicants (age, measurements, body type, etc. — see
 * `board_scoring_weights` in migrations/20260206000000_update_boards_system_complete.js)
 * with zero readers anywhere in the app. No route, service, or UI computes or
 * displays a match_score, and nothing writes to board_scoring_weights.
 * Confirmed via:
 *
 *   grep -rn "board_scoring_weights\|match_score" \
 *     --include='*.js' --include='*.jsx' src/ client/src/
 *   -> no matches outside migrations/
 *
 * Leaving unused automated-scoring machinery like this in the schema is a
 * needless NYC Local Law 144 (automated-employment-decision-tool) exposure
 * surface — better to remove it than to explain, in an audit, why a scoring
 * table with zero readers still exists. `board_applications.match_score` and
 * `applications.board_id` are untouched — out of scope for this cleanup.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasWeightsTable = await knex.schema.hasTable('board_scoring_weights');
  if (hasWeightsTable) {
    await knex.schema.dropTable('board_scoring_weights');
    console.log('[Migration] Dropped board_scoring_weights table');
  }

  const hasApplicationsTable = await knex.schema.hasTable('applications');
  if (hasApplicationsTable) {
    const hasMatchScore = await knex.schema.hasColumn('applications', 'match_score');
    const hasMatchCalculatedAt = await knex.schema.hasColumn(
      'applications',
      'match_calculated_at',
    );

    if (hasMatchScore || hasMatchCalculatedAt) {
      await knex.schema.table('applications', (table) => {
        if (hasMatchScore) table.dropColumn('match_score');
        if (hasMatchCalculatedAt) table.dropColumn('match_calculated_at');
      });
      // Name only what was actually dropped. Production has `match_score` but
      // not `match_calculated_at` — the guards above handle that correctly, but
      // a log claiming both makes the next drift investigation harder, not
      // easier.
      const dropped = [
        hasMatchScore ? 'match_score' : null,
        hasMatchCalculatedAt ? 'match_calculated_at' : null,
      ].filter(Boolean);
      console.log(
        `[Migration] Dropped applications.${dropped.join(' / applications.')}`,
      );
    }
  }
};

/**
 * Faithful restore of the columns/table as originally defined in
 * migrations/20260206000000_update_boards_system_complete.js.
 *
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const hasApplicationsTable = await knex.schema.hasTable('applications');
  if (hasApplicationsTable) {
    const hasMatchScore = await knex.schema.hasColumn('applications', 'match_score');
    const hasMatchCalculatedAt = await knex.schema.hasColumn(
      'applications',
      'match_calculated_at',
    );

    if (!hasMatchScore || !hasMatchCalculatedAt) {
      await knex.schema.table('applications', (table) => {
        if (!hasMatchScore) table.integer('match_score').nullable();
        if (!hasMatchCalculatedAt) {
          table.timestamp('match_calculated_at').nullable();
        }
      });
    }

    if (!hasMatchScore) {
      await knex.raw(
        'CREATE INDEX IF NOT EXISTS applications_match_score_index ON applications(match_score)',
      );
    }
  }

  const hasWeightsTable = await knex.schema.hasTable('board_scoring_weights');
  const hasBoardsTable = await knex.schema.hasTable('boards');
  if (!hasWeightsTable && hasBoardsTable) {
    await knex.schema.createTable('board_scoring_weights', (table) => {
      table.uuid('id').primary();
      table
        .uuid('board_id')
        .notNullable()
        .references('id')
        .inTable('boards')
        .onDelete('CASCADE');

      // Weight sliders (0-5 scale)
      table.decimal('age_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('height_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('measurements_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('body_type_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('comfort_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('experience_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('skills_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('location_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('social_reach_weight', 3, 1).notNullable().defaultTo(0);

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['board_id']);
      table.index('board_id');
    });
    console.log('[Migration] Restored board_scoring_weights table');
  }
};
