const knex = require('../../shared/db/knex');
const { v4: uuidv4 } = require('uuid');

/**
 * Onboarding Analytics Service
 * Tracks user progression through the onboarding funnel
 */
class OnboardingAnalytics {
  
  /**
   * Log an onboarding event
   * @param {Object} params
   * @param {string} params.profileId - The UUID of the profile
   * @param {string} params.step - The current onboarding step
   * @param {string} params.eventType - 'entered', 'completed', 'abandoned', 'error'
   * @param {Object} [params.metadata] - Optional metadata (errors, field counts, etc)
   * @param {number} [params.durationMs] - Time spent on this step (for completion events)
   */
  async track({ profileId, step, eventType, metadata = {}, durationMs = null }) {
    if (!profileId) {
      // This might happen on very early errors before profile creation, gracefully skip
      return;
    }

    try {
      const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
      
      const entry = {
        id: uuidv4(),
        profile_id: profileId,
        step,
        event_type: eventType,
        duration_ms: durationMs,
        metadata_json: isPostgres 
          ? JSON.stringify(metadata) // Postgres knex doesn't always auto-stringify for json columns depending on setup, safer to stringify or let knex handle. Usually knex handles object->json. Let's try passing object for PG if configured correctly, but purely for safety in this hybrid env, stringify if unsure. Actually, knex usually handles `json` type by stringifying objects. 
          : JSON.stringify(metadata),
        created_at: new Date()
      };

      // Fix double-stringification if knex handles it
      // Actually, for SQLite it stores as text.
      
      await knex('onboarding_analytics').insert(entry);
    } catch (error) {
      // Don't crash the app if analytics fail
      console.warn('[OnboardingAnalytics] Failed to track event:', error.message);
    }
  }

  /**
   * Helper for tracking step entry
   */
  async trackEntry(profileId, step, metadata = {}) {
    return this.track({ profileId, step, eventType: 'entered', metadata });
  }

  /**
   * Helper for tracking step completion
   */
  async trackCompletion(profileId, step, durationMs = null, metadata = {}) {
    return this.track({ profileId, step, eventType: 'completed', durationMs, metadata });
  }

  /**
   * Helper for tracking errors
   */
  async trackError(profileId, step, error, metadata = {}) {
    return this.track({ 
      profileId, 
      step, 
      eventType: 'error', 
      metadata: { ...metadata, error: error.message || String(error) } 
    });
  }
}

module.exports = new OnboardingAnalytics();
