"use strict";

const knex = require("../../../../shared/db/knex");
const apiResponse = require("../../../../shared/lib/api-response");

async function loadTalentProfile(userId) {
  return knex("profiles").where({ user_id: userId }).first();
}

/**
 * Load the caller's profile for an AI writing endpoint, or answer the request
 * with 404 and return null.
 *
 * There is deliberately NO subscription check here. New York's Fashion Workers
 * Act defines a "model management company" to include anyone who renders
 * "vocational guidance or counseling services to models for a fee" — charging
 * for AI writing guidance is a registration tripwire. Every AI writer is free
 * to any authenticated talent; abuse is handled by the shared rate limiter in
 * `shared/middleware/ai-writer-rate-limit.js`, not by a paywall.
 */
async function requireTalentProfile(req, res) {
  const profile = await loadTalentProfile(req.session.userId);
  if (!profile) {
    apiResponse.notFound(res, "Profile not found");
    return null;
  }
  return profile;
}

module.exports = {
  loadTalentProfile,
  requireTalentProfile,
};
