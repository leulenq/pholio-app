/**
 * Add AI pipeline results to onboarding_signals.
 *
 * - ai_results     (jsonb/text) — raw output from groq-casting pipeline
 *                                 {scout:{…}, director:{…}, scores:{…}, verdict, primary_archetype}
 * - archetype_runway_pct (decimal) — runway score from Director step
 *                                    (existing schema only had commercial/editorial/lifestyle)
 * - casting_verdict (text)         — 1-sentence casting verdict from Director
 */

exports.up = async function(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  await knex.schema.table('onboarding_signals', (table) => {
    if (isPostgres) {
      table.jsonb('ai_results').nullable()
        .comment('Raw output from groq-casting 2-step pipeline');
    } else {
      table.text('ai_results').nullable()
        .comment('JSON: raw output from groq-casting 2-step pipeline');
    }

    table.decimal('archetype_runway_pct', 5, 2).nullable()
      .comment('Runway archetype score from AI Director (0-100)');

    table.text('casting_verdict').nullable()
      .comment('1-sentence casting verdict from AI Director');
  });
};

exports.down = async function(knex) {
  await knex.schema.table('onboarding_signals', (table) => {
    table.dropColumn('ai_results');
    table.dropColumn('archetype_runway_pct');
    table.dropColumn('casting_verdict');
  });
};
