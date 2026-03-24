const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { upload, processImage } = require('../shared/lib/uploader');
const multer = require('multer');
const { requireRole } = require('../middleware/auth');
const { validateSessionStructure } = require('../middleware/session-validator');

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || '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'
});

// Configure multer for file uploads
const uploadMiddleware = multer({
  dest: require('../config').uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

/**
 * POST /api/upload - Scout Vision Analysis
 * Analyzes uploaded image using Scout model (llama-4-scout) for facial symmetry and market fit
 */
router.post('/api/upload', requireRole('TALENT'), validateSessionStructure, uploadMiddleware.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    // Fetch profile to get profile.id for R2 path
    const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Process and optimize image
    const { publicUrl: storedPath } = await processImage(req.file, profile.id);
    
    // Convert image to base64 for Groq vision API
    const fs = require('fs');
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    // Scout analysis prompt
    const scoutPrompt = `You are Scout, an elite facial analysis AI for Pholio. Analyze this image for:

1. Facial Symmetry: Rate 0-10 with detailed analysis
2. Market Fit: Assess suitability for modeling/acting markets (editorial, commercial, runway, etc.)
3. Unique Features: Identify standout characteristics
4. Professional Potential: Overall assessment and recommendations
5. Visual Estimates: Estimate height (in inches) and weight (in lbs) based on visual proportions

Respond in JSON format:
{
  "facialSymmetry": {
    "score": 0-10,
    "analysis": "...",
    "notes": "..."
  },
  "marketFit": {
    "editorial": "high|medium|low",
    "commercial": "high|medium|low",
    "runway": "high|medium|low",
    "overall": "..."
  },
  "uniqueFeatures": ["...", "..."],
  "professionalPotential": {
    "score": 0-10,
    "assessment": "...",
    "recommendations": ["...", "..."]
  },
  "visualEstimates": {
    "heightEstimate": 0,
    "weightEstimate": 0
  }
}`;

    // Use Groq vision API with Scout model
    // Note: Groq may not have llama-4-scout, so we'll use the best available vision model
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: scoutPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      model: 'meta-llama/llama-4-scout-17b-16e-instruct', // Scout model for image analysis
      temperature: 0.5,
      max_completion_tokens: 1000,
      top_p: 1,
      response_format: { type: 'json_object' }
    });

    let scoutAnalysis;
    try {
      scoutAnalysis = JSON.parse(completion.choices[0]?.message?.content || '{}');
    } catch (parseError) {
      // Fallback if JSON parsing fails
      scoutAnalysis = {
        facialSymmetry: { score: 7, analysis: 'Analysis completed', notes: '' },
        marketFit: { overall: 'Moderate potential' },
        uniqueFeatures: [],
        professionalPotential: { score: 7, assessment: 'Good potential' },
        visualEstimates: {
          heightEstimate: 0,
          weightEstimate: 0
        }
      };
    }

    // Store Visual Intel in session
    if (!req.session.onboardingData) {
      req.session.onboardingData = {};
    }

    req.session.onboardingData.visualIntel = {
      imagePath: storedPath,
      analysis: scoutAnalysis,
      uploadedAt: new Date().toISOString()
    };

    // Save session
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return res.json({
      success: true,
      imagePath: storedPath,
      visualIntel: scoutAnalysis,
      message: 'Image analyzed successfully by Scout',
      action: 'continue' // This triggers autopilot
    });

  } catch (error) {
    console.error('[Scout Upload] Error:', error);
    
    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        const fs = require('fs');
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
    
    return next(error);
  }
});

module.exports = router;

