/**
 * Signal Collector Service
 * Collects and processes signals during "Project Casting Call" onboarding
 *
 * Responsibilities:
 * - Store raw signals from OAuth, AI, and chat interactions
 * - Calculate archetype scores based on weighted signals
 * - Provide unified interface for signal management
 *
 * Part of Phase 1: Backend Infrastructure
 */

const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");

class SignalCollector {
  /**
   * Collect Smart Entry signals from OAuth authentication
   * Extracts location, name, and bio keywords from OAuth provider data
   *
   * @param {string} profileId - Profile UUID
   * @param {Object} data - Entry signal data
   * @param {string} data.oauth_provider - 'google' | 'instagram'
   * @param {string} [data.inferred_location] - Location from OAuth profile
   * @param {string[]} [data.inferred_bio_keywords] - Keywords from bio/description
   * @returns {Promise<Object>} Created/updated signals record
   */
  static async collectEntrySignals(profileId, data) {
    const { oauth_provider, inferred_location, inferred_bio_keywords } = data;

    // Check if signals record exists
    const existing = await knex("onboarding_signals")
      .where({ profile_id: profileId })
      .first();

    const isPostgres =
      knex.client.config.client === "pg" ||
      knex.client.config.client === "postgresql";

    // Prepare bio keywords (array for Postgres, JSON string for SQLite)
    let bioKeywords = inferred_bio_keywords;
    if (!isPostgres && Array.isArray(inferred_bio_keywords)) {
      bioKeywords = JSON.stringify(inferred_bio_keywords);
    }

    const signalData = {
      oauth_provider,
      inferred_location: inferred_location || null,
      inferred_bio_keywords: bioKeywords || null,
      updated_at: knex.fn.now(),
    };

    if (existing) {
      // Update existing record
      await knex("onboarding_signals")
        .where({ id: existing.id })
        .update(signalData);

      return knex("onboarding_signals").where({ id: existing.id }).first();
    } else {
      // Create new record
      const signalId = uuidv4();
      await knex("onboarding_signals").insert({
        id: signalId,
        profile_id: profileId,
        ...signalData,
        created_at: knex.fn.now(),
      });

      return knex("onboarding_signals").where({ id: signalId }).first();
    }
  }

  /**
   * Get signals record by profile ID
   * @param {string} profileId - Profile UUID
   * @returns {Promise<Object|null>} Signals record or null
   */
  static async getSignalsByProfileId(profileId) {
    return knex("onboarding_signals").where({ profile_id: profileId }).first();
  }

  /**
   * Get signals record by signal ID
   * @param {string} signalsId - Signals UUID
   * @returns {Promise<Object|null>} Signals record or null
   */
  static async getSignalsById(signalsId) {
    return knex("onboarding_signals").where({ id: signalsId }).first();
  }

  /**
   * Delete signals record (used for testing or reset)
   * @param {string} profileId - Profile UUID
   * @returns {Promise<number>} Number of deleted records
   */
  static async deleteSignals(profileId) {
    return knex("onboarding_signals").where({ profile_id: profileId }).del();
  }
}

module.exports = SignalCollector;
