/**
 * AI Photo Analysis Service Interface
 * 
 * This file defines the interface contract for photo analysis services.
 * Implementations should follow this interface to ensure compatibility.
 * 
 * The service analyzes uploaded photos and returns:
 * - Embedding vector for semantic search
 * - Physical predictions (height, weight, measurements, appearance traits)
 * - Market fit rankings (5 markets with scores and descriptions)
 * - Confidence scores for predictions
 * 
 * Current implementation: Mock (see photo-analysis.js)
 * Future: Replace with real AI provider (OpenAI, Anthropic, Groq, etc.)
 */

/**
 * @typedef {Object} PhotoAnalysisResult
 * @property {number[]} embedding - Vector embedding for semantic search (array of numbers)
 * @property {Object} predictions - Physical predictions
 * @property {number} predictions.height_cm - Predicted height in cm
 * @property {number} predictions.weight_lbs - Predicted weight in lbs
 * @property {number} predictions.bust - Predicted bust in inches
 * @property {number} predictions.waist - Predicted waist in inches
 * @property {number} predictions.hips - Predicted hips in inches
 * @property {string} predictions.hair_color - Predicted hair color
 * @property {string} predictions.eye_color - Predicted eye color
 * @property {string} predictions.skin_tone - Predicted skin tone
 * @property {Array<Object>} markets - Market fit rankings (5 markets, sorted by score descending)
 * @property {string} markets[].name - Market name (e.g., 'Commercial', 'Editorial')
 * @property {number} markets[].score - Score (0-1, where 1 is highest fit)
 * @property {string} markets[].description - One-line description of fit
 * @property {Object} confidence - Confidence scores for predictions
 * @property {number} confidence.overall - Overall confidence (0-1)
 * @property {number} confidence.measurements - Confidence in measurements (0-1)
 * @property {number} confidence.appearance - Confidence in appearance traits (0-1)
 */

/**
 * Analyzes an uploaded photo and returns predictions and market fit rankings.
 * 
 * @param {string} imagePath - Path to the uploaded image file
 * @returns {Promise<PhotoAnalysisResult>} Analysis results
 * 
 * @example
 * const result = await analyzePhoto('/uploads/image.jpg');
 * console.log(result.predictions.height_cm); // 175
 * console.log(result.markets[0].name); // 'Commercial'
 */
async function analyzePhoto(imagePath) {
  throw new Error('analyzePhoto must be implemented');
}

module.exports = {
  analyzePhoto
};
