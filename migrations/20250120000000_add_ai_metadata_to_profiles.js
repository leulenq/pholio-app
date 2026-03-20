/**
 * Migration: Add AI metadata columns to profiles table
 * Adds vibe_score, is_unicorn, and vector_summary for Librarian synthesis
 * 
 * IMPORTANT: This migration requires the pgvector extension in Neon PostgreSQL.
 * Run this SQL first in your Neon console:
 * CREATE EXTENSION IF NOT EXISTS vector;
 */

/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  // Enable pgvector extension (required for VECTOR type)
  await knex.raw('CREATE EXTENSION IF NOT EXISTS vector;');
  
  await knex.schema.table('profiles', (table) => {
    table.decimal('vibe_score', 3, 1).nullable().comment('AI-calculated vibe score (0-10)');
    table.boolean('is_unicorn').defaultTo(false).comment('True if vibe_score > 9.5');
    // True VECTOR(384) type for semantic search - requires pgvector extension
    table.specificType('vector_summary', 'vector(384)').nullable().comment('Semantic search vector summary from Librarian (384-dim embedding)');
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.table('profiles', (table) => {
    table.dropColumn('vibe_score');
    table.dropColumn('is_unicorn');
    table.dropColumn('vector_summary');
  });
};

