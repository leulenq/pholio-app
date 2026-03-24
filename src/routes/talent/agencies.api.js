const express = require('express');
const router = express.Router();
const knex = require('../../shared/db/knex');
const { requireRole } = require('../../domains/auth/middleware/require-auth');
const asyncHandler = require('express-async-handler');

/**
 * GET /api/talent/agencies
 * List agencies for discovery with matching logic
 */
router.get('/', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  const isPro = profile && profile.is_pro;

  // 1. Fetch Agencies as organizations, not login rows
  const agencies = await knex('agencies')
    .where({ status: 'ACTIVE' })
    .select(
      'id', 
      'name',
      'location as agency_location',
      'website as agency_website',
      'description as agency_description',
      'logo_path as profile_image'
    );

  // 2. Calculate Match Scores (Mock Heuristic)
  const scoredAgencies = agencies.map(agency => {
    // Determine Mock Score
    // Factors: Location match, random "Style" match
    let score = 60 + Math.floor(Math.random() * 35); // Base 60-95
    
    // Boost if location matches (simple check)
    if (profile.location && agency.agency_location && 
        agency.agency_location.toLowerCase().includes(profile.location.toLowerCase())) {
      score += 5; // Boost
    }
    
    // Cap at 99
    score = Math.min(99, score);

    // Breakdowns (Studio+ only)
    const breakdown = {
      location: profile.location && agency.agency_location?.includes(profile.location) ? 'High' : 'Medium',
      style: Math.random() > 0.5 ? 'High' : 'Medium',
      roster: 'Open',
      requirements: 'Match'
    };

    return {
      ...agency,
      matchScore: score,
      matchBreakdown: isPro ? breakdown : null // Hide breakdown for free users? Or backend sends it but frontend hides?
      // Requirement: "Match Scores: Not visible" for Free.
      // We'll mask the score itself for free users to be safe, or let frontend handle it.
      // Let's send it but mask it in frontend? No, cleaner to mask here if strictly hidden.
      // Requirement says "Match Scores: Not visible", "Top 20 matched only".
    };
  });

  // 3. Sort by Score
  scoredAgencies.sort((a, b) => b.matchScore - a.matchScore);

  // 4. Apply Limits
  let result = scoredAgencies;
  if (!isPro) {
    // Free Tier: Top 20 only
    result = scoredAgencies.slice(0, 20).map(a => ({
      ...a,
      matchScore: undefined, // Hide score
      matchBreakdown: undefined
    }));
  }

  res.json({ success: true, data: result });
}));

module.exports = router;
