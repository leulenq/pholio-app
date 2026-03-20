/**
 * Migration: Create ai_profile_analysis table
 * Stores AI analysis results (predictions, market fit, embeddings) per profile
 * 
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  
  await knex.schema.createTable('ai_profile_analysis', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('profile_id').notNullable().unique()
      .references('id')
      .inTable('profiles')
      .onDelete('CASCADE');
    
    // Predicted measurements
    table.integer('predicted_height_cm').nullable();
    table.integer('predicted_weight_kg').nullable();
    
    // Predicted measurements (JSONB for PostgreSQL, TEXT for SQLite)
    if (isPostgres) {
      table.jsonb('predicted_measurements_json').nullable().comment('JSON: {bust?: number, waist?: number, hips?: number}');
      table.jsonb('market_fit_json').nullable().comment('JSON: top 5 markets with scores [{category, score}, ...]');
      table.jsonb('confidence_json').nullable().comment('JSON: confidence scores {height, weight, measurements, market_fit}');
      table.jsonb('embedding_vector').nullable().comment('Vector embedding (JSON array or bytea, depending on vector support)');
    } else {
      table.text('predicted_measurements_json').nullable().comment('JSON string: {bust?: number, waist?: number, hips?: number}');
      table.text('market_fit_json').nullable().comment('JSON string: top 5 markets with scores');
      table.text('confidence_json').nullable().comment('JSON string: confidence scores');
      table.text('embedding_vector').nullable().comment('Vector embedding (JSON string)');
    }
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Index
    table.index('profile_id');
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('ai_profile_analysis');
};
