/**
 * Comp card import — A3 of the August 2026 product plan.
 *
 * A talent uploads a comp card they already have, Pholio reads it, and the
 * talent confirms the fields before anything is written. Two pieces of schema.
 *
 * `comp_card_imports` holds one import attempt: the proposal that was shown, and
 * what the talent actually accepted from it. It exists for three reasons —
 * the review screen has to survive a page reload, confirm has to validate what it
 * applies against what was genuinely offered (otherwise the "proposal, never a
 * silent write" rule is only enforced in the browser), and a talent asking
 * "where did this number come from" deserves an answer.
 *
 * What it deliberately does not hold: the uploaded file. The card is read in
 * memory and dropped. Storing it would be the *attachment* feature, which the
 * plan separates from import on purpose and which is not this change. It also
 * holds no biometric data of any kind — no face template, no embedding, no
 * identity linkage — see `docs/comp-card-import-architecture.md`.
 *
 * `profiles.measurements_source` records that a measurement was declared on
 * import rather than measured. An uploaded card could be three years old, so
 * without this column `measurements_updated_at` would tell an agency the numbers
 * were taken on the day of the import. NULL means self-entered, which is what
 * every existing row is.
 */

exports.up = async function up(knex) {
  // Both steps are guarded so a run that aborted between them can be re-run.
  if (!(await knex.schema.hasTable("comp_card_imports"))) {
    await knex.schema.createTable("comp_card_imports", (table) => {
      table.uuid("id").primary();
      table
        .uuid("user_id")
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE")
        .index();

      // How the text was obtained: 'pdf_text' (the card's own text layer),
      // 'vision' (OCR fallback), or 'none' (nothing could be read).
      table.string("extraction_method", 32).notNullable().defaultTo("none");
      // Why nothing was read, when nothing was — 'pdf_no_text_layer' and friends.
      table.string("extraction_reason", 64).nullable();
      table.string("source_filename", 255).nullable();
      table.string("source_mime_type", 100).nullable();

      // The proposal exactly as shown, so confirm can validate against it.
      table.text("proposal_json").notNullable();
      // The field keys the talent accepted. Null until they confirm.
      table.text("accepted_json").nullable();

      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("confirmed_at").nullable();
      table.timestamp("discarded_at").nullable();
    });
  }

  if (!(await knex.schema.hasColumn("profiles", "measurements_source"))) {
    await knex.schema.alterTable("profiles", (table) => {
      table.string("measurements_source", 32).nullable();
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("profiles", (table) => {
    table.dropColumn("measurements_source");
  });
  await knex.schema.dropTableIfExists("comp_card_imports");
};
