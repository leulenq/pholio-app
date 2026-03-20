const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const knex = require('../db/knex');
const { v4: uuidv4 } = require('uuid');
const { requireRole } = require('../middleware/auth');
const { validateSessionStructure, validateStageTransition } = require('../middleware/session-validator');
const { calculateProfileCompleteness } = require('../lib/dashboard/completeness');

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || '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'
});

/**
 * Maverick System Prompt - Token-Optimized 8-Stage State Machine
 */
const MAVERICK_SYSTEM_PROMPT = `You are Maverick, an elite talent onboarding AI for Pholio. JSON ONLY: { "message": "INSIGHT|INSTRUCTION", "stage": 0-7, "action": "continue|wait|complete", "data": {}, "tool_trigger": string|null }

PIPELINE:
0: Auth | 1: Profile | 2: Visual Intel (Scout) | 3: Physical Metrics | 4: Professional | 5: Market | 6: Detail Reveal | 7: Finalize

STAGE 3 PREDICTION RULES:
When height is confirmed, use Scout's Projections (provided in context) for weight/bust/waist/hips. Present these as "Scout's Projections" for the user to confirm/adjust.

STAGE 3 TOOL SEQUENCE (MANDATORY):
1. 'weight_slider' (Present Scout's projected weight)
2. 'proportions_grid' (Present projected Bust/Waist/Hips)
3. 'shoe_size_slider'
During Stage 3, tool_trigger MUST be a non-empty string. Never return null/undefined/empty for tool_trigger in Stage 3.

RULES:
- Split-Tone: Message format "INSIGHT|INSTRUCTION". Insight = gold text, Instruction = muted text.
- Surgical Context: Use Scout's specific scores (e.g., "Symmetry at 9.2") to build authority. NO generic "Great!" or "Thank you!"
- Linear progress only. Extract data into "data" object (weight_lbs, bust, waist, hips, shoe_size, height_cm).
- Stage 2: Wait for Visual Intel from Scout. Acknowledge with specific observations (facial symmetry score, market fit).
- Stage 6: After completion, say "Everything calibrated, [FirstName]. Let me reveal your Pholio potential." with action: "continue".
- Skip Stage 1 if firstName exists in onboardingData. Start at Stage 2: "Welcome, [FirstName]. I've analyzed your digital footprint—let's get to your editorial shots."

Current session context will be provided with each request.`;

/**
 * POST /api/chat - Maverick Conversation Handler
 */
router.post('/api/chat', requireRole('TALENT'), validateSessionStructure, validateStageTransition, async (req, res, next) => {
  try {
    const { message, userId } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Initialize or get session conversation history
    if (!req.session.onboardingHistory) {
      req.session.onboardingHistory = [];
      req.session.currentStage = 0;
      req.session.onboardingData = {};
    }

    // Check for authenticated user and inject profile data
    let userData = null;
    let profileData = null;
    if (req.session.userId || req.user?.id || req.body.userId) {
      const userId = req.session.userId || req.user?.id || req.body.userId;
      try {
        // Load user data
        userData = await knex('users').where({ id: userId }).first();
        
        // Load profile data if user exists and is TALENT
        if (userData && userData.role === 'TALENT') {
          profileData = await knex('profiles').where({ user_id: userId }).first();
        }

        // If we have name and email, inject into onboardingData and skip to Stage 2
        if (userData && userData.email) {
          const hasName = profileData?.first_name || req.session.onboardingData?.firstName;
          const hasEmail = userData.email;
          const hasLocation = profileData?.city || req.session.onboardingData?.city;

          // Inject available data into onboardingData
          if (!req.session.onboardingData) {
            req.session.onboardingData = {};
          }
          
          req.session.onboardingData.email = userData.email;
          
          if (profileData?.first_name) {
            req.session.onboardingData.firstName = profileData.first_name;
          }
          if (profileData?.last_name) {
            req.session.onboardingData.lastName = profileData.last_name;
          }
          if (profileData?.city) {
            req.session.onboardingData.city = profileData.city;
          }

          // Only skip to Stage 2 if we have both name AND email
          if (hasName && hasEmail) {
            req.session.onboardingData.googleProfileSynced = true;

            // If at Stage 0 or 1 and have required data, skip to Stage 2
            if (req.session.currentStage === 0 || req.session.currentStage === 1) {
              req.session.currentStage = 2;
            }
          }
        }
      } catch (userError) {
        console.error('[Chat API] Error loading user data:', userError);
        // Continue without user data
      }
    }

    const currentStage = req.session.currentStage || 0;
    const history = req.session.onboardingHistory || [];
    const onboardingData = req.session.onboardingData || {};

    // Build context from session
    let context = `Current Stage: ${currentStage}\n`;
    context += `Session Data: ${JSON.stringify(onboardingData, null, 2)}\n\n`;
    
    // Add user authentication context
    if (userData && onboardingData.googleProfileSynced) {
      context += `USER AUTHENTICATION CONTEXT:\n`;
      context += `- User is authenticated via Google\n`;
      context += `- Name: ${onboardingData.firstName} ${onboardingData.lastName || ''}\n`;
      context += `- Email: ${onboardingData.email}\n`;
      if (onboardingData.city) {
        context += `- Location: ${onboardingData.city}\n`;
      }
      if (onboardingData.googlePhotoURL) {
        context += `- Google profile photo available: Yes\n`;
        context += `- user_photo_available: true\n`;
      }
      context += `- Profile synced: Yes\n\n`;
    }
    
    // Add Visual Intel if available (from Scout analysis)
    if (onboardingData.visualIntel) {
      context += `VISUAL INTEL (from Scout):\n${JSON.stringify(onboardingData.visualIntel, null, 2)}\n\n`;
      
      // Extract visual estimates for Stage 3
      if (onboardingData.visualIntel.analysis?.visualEstimates) {
        const estimates = onboardingData.visualIntel.analysis.visualEstimates;
        if (estimates.heightEstimate && estimates.heightEstimate > 0) {
          const feet = Math.floor(estimates.heightEstimate / 12);
          const inches = estimates.heightEstimate % 12;
          context += `VISUAL ESTIMATE (Height): ${feet}'${inches}" (${estimates.heightEstimate} inches)\n`;
        }
        if (estimates.weightEstimate && estimates.weightEstimate > 0) {
          context += `VISUAL ESTIMATE (Weight): ${estimates.weightEstimate} lbs\n`;
        }
      }
    }

    // Add conversation history (last 10 messages to keep context manageable)
    const recentHistory = history.slice(-10);
    if (recentHistory.length > 0) {
      context += `Recent Conversation:\n${recentHistory.map(h => `${h.role}: ${h.content}`).join('\n')}\n\n`;
    }

    // Calculate Scout Projections (Stage 3 predictive math)
    let projections = {};
    if (onboardingData.height_cm && currentStage === 3) {
      const hIn = onboardingData.height_cm / 2.54;
      const apparentGender = onboardingData.visualIntel?.analysis?.visualEstimates?.apparentGender;
      const bodyType = onboardingData.visualIntel?.analysis?.visualEstimates?.bodyType;
      const isMale = apparentGender === 'male';
      
      // Base predictive math using modeling industry formulas
      let baseWeight = Math.round(((hIn * hIn) * (isMale ? 0.033 : 0.031)) * 703);
      
      // Adjust weight based on body type from Scout
      if (bodyType === 'endomorph') {
        baseWeight = Math.round(baseWeight * 1.10); // +10% for endomorph
      } else if (bodyType === 'ectomorph') {
        baseWeight = Math.round(baseWeight * 0.90); // -10% for ectomorph
      }
      
      projections = {
        weight: baseWeight,
        bust: Math.round(hIn * (isMale ? 0.56 : 0.49)),
        waist: Math.round(hIn * (isMale ? 0.45 : 0.35)),
        hips: Math.round(hIn * (isMale ? 0.53 : 0.50))
      };
      
      // Inject projections into context so Maverick can reference them
      context += `SCOUT PROJECTIONS (Based on ${onboardingData.height_cm}cm height):\n`;
      context += `- Weight: ${projections.weight} lbs${bodyType ? ` (adjusted for ${bodyType} body type)` : ''}\n`;
      context += `- Bust: ${projections.bust}"\n`;
      context += `- Waist: ${projections.waist}"\n`;
      context += `- Hips: ${projections.hips}"\n`;
      context += `Present these projections to the user for confirmation/adjustment.\n\n`;
    }

    // Construct messages for Groq
    const messages = [
      {
        role: 'system',
        content: MAVERICK_SYSTEM_PROMPT
      },
      ...recentHistory,
      {
        role: 'user',
        content: `Context: ${context}\n\nUser Message: ${message}`
      }
    ];

    // Call Groq API with Maverick model
    const completion = await groq.chat.completions.create({
      messages: messages,
      model: 'meta-llama/llama-4-maverick-17b-128e-instruct', // Maverick model for onboarding
      temperature: 1,
      max_completion_tokens: 1024,
      top_p: 1,
      frequency_penalty: 0.5, // Ensure Maverick stays sophisticated and authoritative without repetition
      response_format: { type: 'json_object' } // Force JSON response
    });

    let responseData;
    try {
      const rawResponse = completion.choices[0]?.message?.content || '{}';
      responseData = JSON.parse(rawResponse);
      
      // Debug logging for Stage 3
      if (currentStage === 3) {
        console.log('[Chat API] Stage 3 response from Maverick:', JSON.stringify(responseData, null, 2));
        if (!responseData.tool_trigger) {
          console.warn('[Chat API] Stage 3 response missing tool_trigger! Response:', rawResponse.substring(0, 200));
        }
      }
    } catch (parseError) {
      // Fallback if JSON parsing fails
      console.error('[Chat API] JSON parse error:', parseError);
      const rawContent = completion.choices[0]?.message?.content || '';
      responseData = {
        message: rawContent,
        stage: currentStage,
        action: 'continue',
        data: {},
        tool_trigger: null
      };
    }

    // Extract stage from response (if provided)
    if (typeof responseData.stage === 'number' && responseData.stage >= 0 && responseData.stage <= 7) {
      req.session.currentStage = responseData.stage;
    }

    // Store data if provided
    if (responseData.data && typeof responseData.data === 'object') {
      req.session.onboardingData = {
        ...req.session.onboardingData,
        ...responseData.data
      };
    }

    // Fallback: Extract height_cm from message if not in data (for Stage 3)
    if (currentStage === 3 && !req.session.onboardingData.height_cm) {
      const heightMatch = message.match(/\((\d+)\s*cm\)/);
      if (heightMatch) {
        req.session.onboardingData.height_cm = parseInt(heightMatch[1], 10);
        console.log('[Chat API] Extracted height_cm from message:', req.session.onboardingData.height_cm);
      }
    }

    // Update conversation history
    req.session.onboardingHistory = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: responseData.message || '' }
    ].slice(-20); // Keep last 20 messages

    // Handle Stage 6 completion -> Trigger Reveal
    if (currentStage === 6 && responseData.action === 'continue') {
      // Mark reveal stage
      responseData.action = 'reveal';
      responseData.stage = 6; // Stay at stage 6, but trigger reveal
    }

    // Handle Stage 7 finalization
    if (responseData.action === 'complete' && currentStage === 7) {
      // Trigger Librarian synthesis
      await triggerLibrarianSynthesis(req.session.onboardingData, userId, req);
    }

    // Save session
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // STRICT: In Stage 3, enforce tool_trigger (should never be null/undefined)
    let toolTrigger = responseData.tool_trigger || null;
    if (req.session.currentStage === 3 && !toolTrigger) {
      console.warn('[Chat API] Stage 3 response without tool_trigger - Maverick should have provided one');
    }

    return res.json({
      message: responseData.message || 'I understand.',
      stage: req.session.currentStage,
      action: responseData.action || 'continue',
      data: responseData.data || {},
      tool_trigger: toolTrigger
    });

  } catch (error) {
    console.error('[Chat API] Error:', error);
    return next(error);
  }
});

/**
 * Trigger Librarian synthesis on Stage 7 completion
 */
async function triggerLibrarianSynthesis(onboardingData, userId, req) {
  try {
    const librarianPrompt = `You are the Librarian, a data synthesis AI for Pholio. Your task is to synthesize onboarding data into structured formats for Neon PostgreSQL and semantic search.

Onboarding Data:
${JSON.stringify(onboardingData, null, 2)}

Tasks:
1. Generate SQL INSERT JSON for Neon Tech (profiles table)
2. Generate Vector Summary TEXT for semantic search (plain text, not a vector array)
3. Calculate vibe_score (0-10 scale) based on profile completeness, quality, and potential
4. Determine if is_unicorn = TRUE (if vibe_score > 9.5)

IMPORTANT: The "sql" object should ONLY contain fields that belong to the profiles table. DO NOT include:
- email (belongs in users table, not profiles)
- firebase_uid (belongs in users table)
- role (belongs in users table)
- id or user_id (these are handled by the system)
- vector_summary (this is a vector type and requires numeric array format, handled separately)

Valid profiles table fields include: first_name, last_name, city, phone, height_cm, weight_lbs, bust, waist, hips, shoe_size, bio_raw, bio_curated, specialties, experience_level, training, portfolio_url, instagram_handle, twitter_handle, tiktok_handle, availability_travel, availability_schedule, comfort_levels, previous_representations, and other profile-specific fields.

NOTE: vectorSummary should be a plain text summary for semantic search. The system will handle vector embedding conversion separately if needed.

Respond in JSON:
{
  "sql": { ... }, // SQL data structure matching profiles table schema (NO email, firebase_uid, role, id, user_id, vector_summary)
  "vectorSummary": "...", // Plain text semantic search summary (NOT a vector array)
  "vibeScore": 0-10,
  "isUnicorn": true/false
}`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: librarianPrompt },
        { role: 'user', content: 'Synthesize the onboarding data.' }
      ],
      model: 'llama-3.3-70b-versatile', // Librarian uses 70B model for synthesis
      temperature: 0.3, // Lower temperature for more consistent synthesis
      max_completion_tokens: 2000,
      top_p: 1,
      response_format: { type: 'json_object' }
    });

    const synthesis = JSON.parse(completion.choices[0]?.message?.content || '{}');
    
    // Store synthesis in onboarding data
    onboardingData._synthesis = synthesis;
    req.session.onboardingData = onboardingData;

    // Create profile in database if user exists
    if (userId && req.session.userId) {
      await createProfileFromSynthesis(onboardingData, synthesis, req.session.userId);
    }
    
    return synthesis;
  } catch (error) {
    console.error('[Librarian] Synthesis error:', error);
    throw error;
  }
}

/**
 * Create profile in database from Librarian synthesis
 */
async function createProfileFromSynthesis(onboardingData, synthesis, userId) {
  try {
    const { ensureUniqueSlug } = require('../lib/slugify');
    const { curateBio } = require('../lib/curate');

    // Extract data from onboarding data and synthesis
    const sqlData = synthesis.sql || {};
    const vibeScore = synthesis.vibeScore || 0;
    const isUnicorn = synthesis.isUnicorn || (vibeScore > 9.5);
    
    // Get user
    const user = await knex('users').where({ id: userId }).first();
    if (!user) {
      throw new Error('User not found');
    }

    // Helper function to safely stringify JSON fields
    const stringifyJsonField = (value) => {
      if (!value) return null;
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    };

    // Check if profile already exists
    const existingProfile = await knex('profiles').where({ user_id: userId }).first();
    if (existingProfile) {
      // EXCEPTION: Verified system data (not part of Librarian synthesis)
      // - IP-verified location (from geolocation API, not conversational)
      // - Google-verified profile data (from OAuth, not conversational)
      // - Visual Intel image paths (from Scout, not conversational)
      const verifiedCity = onboardingData.ipGeolocation?.city || onboardingData.verifiedLocationIntel?.ip_verified?.city;
      const verifiedCountry = onboardingData.ipGeolocation?.country || onboardingData.verifiedLocationIntel?.ip_verified?.country;
      const verifiedRegion = onboardingData.ipGeolocation?.region || onboardingData.verifiedLocationIntel?.ip_verified?.region;
      
      // STANDARD: Use sqlData as single source of truth for all conversational onboarding fields
      // The Librarian has already synthesized onboardingData into clean, validated sqlData
      // Filter out fields that don't belong in profiles table (e.g., email belongs in users table)
      const { email, firebase_uid, role, id, user_id, created_at, ...validProfileFields } = sqlData;
      const updateData = {
        ...validProfileFields, // Spread all Librarian-synthesized fields (excluding invalid ones)
        
        // EXCEPTION: Verified system data (prioritize over Librarian synthesis)
        // Location: Use IP-verified city if available, otherwise trust Librarian's sqlData.city
        city: verifiedCity || sqlData.city || undefined,
        ip_country: verifiedCountry || sqlData.ip_country || undefined,
        ip_region: verifiedRegion || sqlData.ip_region || undefined,
        ip_city: verifiedCity || sqlData.ip_city || undefined,
        ip_timezone: onboardingData.ipGeolocation?.timezone || sqlData.ip_timezone || undefined,
        verified_location_intel: onboardingData.verifiedLocationIntel ? JSON.stringify(onboardingData.verifiedLocationIntel) : (sqlData.verified_location_intel || undefined),
        
        // Google-verified fields (from OAuth, not conversational)
        google_birthday: onboardingData.googleBirthday || sqlData.google_birthday || undefined,
        google_gender: onboardingData.googleGender || sqlData.google_gender || undefined,
        google_phone: onboardingData.googlePhone || sqlData.google_phone || undefined,
        google_addresses: onboardingData.googleAddresses ? JSON.stringify(onboardingData.googleAddresses) : (sqlData.google_addresses || undefined),
        google_organization: onboardingData.googleOrganization || sqlData.google_organization || undefined,
        
        // System-generated fields
        bio_curated: sqlData.bio_curated || undefined, // Librarian may have curated bio, otherwise system will generate
        
        // Ensure JSON fields are properly stringified (Librarian should provide these as arrays/objects)
        specialties: sqlData.specialties ? stringifyJsonField(sqlData.specialties) : undefined,
        experience_details: sqlData.experience_details ? stringifyJsonField(sqlData.experience_details) : undefined,
        languages: sqlData.languages ? stringifyJsonField(sqlData.languages) : undefined,
        comfort_levels: sqlData.comfort_levels ? stringifyJsonField(sqlData.comfort_levels) : undefined,
        previous_representations: sqlData.previous_representations ? stringifyJsonField(sqlData.previous_representations) : undefined,
        
        updated_at: knex.fn.now()
      };
      
      // Remove undefined values to avoid overwriting existing data with null
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });
      
      // Add optional columns if they exist in schema
      // vector_summary must be a numeric array (vector format), not a text string
      // Only set if it's a proper array with 384 dimensions
      if (synthesis.vectorSummary && Array.isArray(synthesis.vectorSummary) && synthesis.vectorSummary.length === 384) {
        updateData.vector_summary = synthesis.vectorSummary;
      } else if (synthesis.vectorSummary && typeof synthesis.vectorSummary === 'string') {
        // If it's a string, we'd need an embedding service to convert it to a vector
        // For now, skip setting vector_summary - it requires pgvector format: [1.0, 2.0, ..., 384.0]
        console.log('[Librarian] Skipping vector_summary - text string provided, needs embedding conversion');
      }
      if (vibeScore !== undefined) updateData.vibe_score = vibeScore;
      if (isUnicorn !== undefined) updateData.is_unicorn = isUnicorn;
      
      await knex('profiles').where({ id: existingProfile.id }).update(updateData);
      
      // Log profile data persistence for debugging
      console.log('[Librarian] Updated existing profile (sqlData as single source of truth):', {
        profileId: existingProfile.id,
        userId,
        sqlDataFields: Object.keys(sqlData).length,
        hasPhone: Boolean(updateData.phone),
        hasHeight: Boolean(updateData.height_cm),
        hasMeasurements: Boolean(updateData.bust && updateData.waist && updateData.hips),
        hasComfortLevels: Boolean(updateData.comfort_levels),
        hasAvailability: Boolean(updateData.availability_schedule || updateData.availability_travel !== null),
        updatedFields: Object.keys(updateData).filter(key => key !== 'updated_at'),
        verifiedDataOverrides: {
          city: verifiedCity ? 'IP-verified' : (sqlData.city ? 'Librarian synthesis' : 'none'),
          googleBirthday: Boolean(onboardingData.googleBirthday)
        }
      });
      
      return existingProfile.id;
    }

    // Create new profile
    const profileId = uuidv4();
    
    // STANDARD: Trust Librarian synthesis for name (fallback only for system safety)
    const firstName = sqlData.first_name || onboardingData.firstName || 'User';
    const lastName = sqlData.last_name || onboardingData.lastName || '';
    const slug = await ensureUniqueSlug(knex, 'profiles', `${firstName}-${lastName}`);

    // STANDARD: Trust Librarian synthesis for bio
    const bioRaw = sqlData.bio_raw || onboardingData.bio || '';
    const bioCurated = sqlData.bio_curated || (bioRaw ? curateBio(bioRaw, firstName, lastName) : '');

    // EXCEPTION: Visual Intel image (from Scout, not conversational)
    let heroImagePath = null;
    if (onboardingData.visualIntel && onboardingData.visualIntel.imagePath) {
      heroImagePath = onboardingData.visualIntel.imagePath;
    }

    // EXCEPTION: Verified system data (IP geolocation, Google OAuth)
    const verifiedCity = onboardingData.ipGeolocation?.city || onboardingData.verifiedLocationIntel?.ip_verified?.city;
    const verifiedCountry = onboardingData.ipGeolocation?.country || onboardingData.verifiedLocationIntel?.ip_verified?.country;
    const verifiedRegion = onboardingData.ipGeolocation?.region || onboardingData.verifiedLocationIntel?.ip_verified?.region;
    
    // STANDARD: Use sqlData as single source of truth for all conversational onboarding fields
    // EXCEPTION: Override city with IP-verified city if available (trust system > AI synthesis for location)
    // Filter out fields that don't belong in profiles table (e.g., email belongs in users table)
    const { email, firebase_uid, role, id, user_id, created_at, ...validProfileFields } = sqlData;
    const profileData = {
      id: profileId,
      user_id: userId,
      slug,
      first_name: firstName,
      last_name: lastName,
      
      // Spread all Librarian-synthesized fields (excluding invalid ones)
      ...validProfileFields,
      
      // EXCEPTION: Override with verified system data (prioritize over Librarian synthesis)
      city: verifiedCity || sqlData.city || null,
      ip_country: verifiedCountry || sqlData.ip_country || null,
      ip_region: verifiedRegion || sqlData.ip_region || null,
      ip_city: verifiedCity || sqlData.ip_city || null,
      ip_timezone: onboardingData.ipGeolocation?.timezone || onboardingData.verifiedLocationIntel?.ip_verified?.timezone || sqlData.ip_timezone || null,
      verified_location_intel: onboardingData.verifiedLocationIntel ? JSON.stringify(onboardingData.verifiedLocationIntel) : (sqlData.verified_location_intel || null),
      
      // Google-verified fields (from OAuth, not conversational)
      google_birthday: onboardingData.googleBirthday || sqlData.google_birthday || null,
      google_gender: onboardingData.googleGender || sqlData.google_gender || null,
      google_phone: onboardingData.googlePhone || sqlData.google_phone || null,
      google_addresses: onboardingData.googleAddresses ? JSON.stringify(onboardingData.googleAddresses) : (sqlData.google_addresses || null),
      google_organization: onboardingData.googleOrganization || sqlData.google_organization || null,
      
      // System-generated fields
      bio_raw: bioRaw, // Use Librarian's bio_raw, or fallback to onboardingData.bio
      bio_curated: bioCurated, // Use Librarian's curated bio, or system-generated
      // hero_image_path removed as it is now a derived field 
      
      // Ensure JSON fields are properly stringified (Librarian should provide these as arrays/objects)
      specialties: sqlData.specialties ? stringifyJsonField(sqlData.specialties) : null,
      experience_details: sqlData.experience_details ? stringifyJsonField(sqlData.experience_details) : null,
      languages: sqlData.languages ? stringifyJsonField(sqlData.languages) : null,
      comfort_levels: sqlData.comfort_levels ? stringifyJsonField(sqlData.comfort_levels) : null,
      previous_representations: sqlData.previous_representations ? stringifyJsonField(sqlData.previous_representations) : null,
      
      is_pro: false, // Default to free tier
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    };
    
    // Log profile data persistence for debugging
    console.log('[Librarian] Creating profile with onboarding data:', {
      hasPhone: Boolean(profileData.phone),
      hasHeight: Boolean(profileData.height_cm),
      hasMeasurements: Boolean(profileData.bust && profileData.waist && profileData.hips),
      hasComfortLevels: Boolean(profileData.comfort_levels),
      hasAvailability: Boolean(profileData.availability_schedule || profileData.availability_travel !== null),
      hasExperience: Boolean(profileData.experience_level || profileData.training),
      fromOnboardingData: {
        phone: Boolean(onboardingData.phone),
        height_cm: Boolean(onboardingData.height_cm),
        bust: Boolean(onboardingData.bust),
        comfort_levels: Boolean(onboardingData.comfort_levels),
        availability_schedule: Boolean(onboardingData.availability_schedule)
      }
    });

    // Add optional columns if they exist in schema
    // vector_summary must be a numeric array (vector format), not a text string
    // Only set if it's a proper array with 384 dimensions
    if (synthesis.vectorSummary && Array.isArray(synthesis.vectorSummary) && synthesis.vectorSummary.length === 384) {
      profileData.vector_summary = synthesis.vectorSummary;
    } else if (synthesis.vectorSummary && typeof synthesis.vectorSummary === 'string') {
      // If it's a string, we'd need an embedding service to convert it to a vector
      // For now, skip setting vector_summary - it requires pgvector format: [1.0, 2.0, ..., 384.0]
      console.log('[Librarian] Skipping vector_summary - text string provided, needs embedding conversion');
    }
    if (vibeScore !== undefined) profileData.vibe_score = vibeScore;
    if (isUnicorn !== undefined) profileData.is_unicorn = isUnicorn;

    await knex('profiles').insert(profileData);
    console.log('[Librarian] Created profile:', { profileId, userId, isUnicorn, vibeScore });

    return profileId;
  } catch (error) {
    console.error('[Librarian] Profile creation error:', error);
    throw error;
  }
}

/**
 * POST /api/chat/initialize - Initialize a new onboarding session
 */
router.post('/api/chat/initialize', requireRole('TALENT'), validateSessionStructure, async (req, res) => {
  try {
    req.session.onboardingHistory = [];
    req.session.currentStage = 0;
    req.session.onboardingData = {};

    // Check for authenticated user and inject profile data
    let userData = null;
    let profileData = null;
    let initialStage = 0;
    let initialMessage = 'Welcome to Pholio. Let\'s start your journey.';

    if (req.session.userId || req.user?.id) {
      const userId = req.session.userId || req.user?.id;
      try {
        // Load user data
        userData = await knex('users').where({ id: userId }).first();
        
        // Load profile data if user exists and is TALENT
        if (userData && userData.role === 'TALENT') {
          profileData = await knex('profiles').where({ user_id: userId }).first();
        }

        // Silent Stage 1: If firstName exists in database, automatically skip to Stage 2
        if (userData && userData.email && profileData && profileData.first_name) {
          // Inject user data into onboardingData
          req.session.onboardingData.firstName = profileData.first_name;
          req.session.onboardingData.lastName = profileData.last_name || '';
          req.session.onboardingData.email = userData.email;
          req.session.onboardingData.city = profileData.city || '';
          req.session.onboardingData.googleProfileSynced = true;
          
          // Google photo handled by setting it as primary in onboarding.js if needed

          // Skip to Stage 2 - Maverick's context-aware Stage 2 greeting
          initialStage = 2;
          
          // Context-aware message: Maverick acknowledges digital footprint analysis
          if (req.session.onboardingData.googlePhotoURL) {
            initialMessage = `Welcome, ${profileData.first_name}. I've analyzed your digital footprint—I've got your Google profile photo, but let's get an editorial-grade shot for your comp card.`;
          } else {
            initialMessage = `Welcome, ${profileData.first_name}. I've analyzed your digital footprint—let's get to your editorial shots.`;
          }
        }
      } catch (userError) {
        console.error('[Chat Init] Error loading user data:', userError);
        // Continue without user data
      }
    }

    req.session.currentStage = initialStage;

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return res.json({
      success: true,
      stage: initialStage,
      message: initialMessage
    });
  } catch (error) {
    console.error('[Chat Init] Error:', error);
    return res.status(500).json({ error: 'Failed to initialize session' });
  }
});

/**
 * GET /api/chat/status - Get current onboarding status
 */
router.get('/api/chat/status', requireRole('TALENT'), validateSessionStructure, async (req, res) => {
  try {
    return res.json({
      stage: req.session.currentStage || 0,
      data: req.session.onboardingData || {},
      hasVisualIntel: !!(req.session.onboardingData?.visualIntel),
      synthesis: req.session.onboardingData?._synthesis || null
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * Calculate Model Score (0-100) based on completeness, proportions, and photo quality
 */
function calculateModelScore(profile, images = [], onboardingData = {}) {
  // 1. Completeness Score (0-40 points)
  const completeness = calculateProfileCompleteness(profile, images);
  const completenessScore = Math.round((completeness.percentage / 100) * 40);

  // 2. Proportions Balance Score (0-30 points) - based on industry-standard normalization
  let proportionsScore = 0;
  if (profile.height_cm && profile.bust && profile.waist && profile.hips) {
    // Use the same industry-standard normalization as radar chart
    const radarData = generateRadarData(profile);
    // Average the radar scores (excluding shoe size) for proportions balance
    const measurementScores = radarData.values.slice(0, 4); // Height, Bust, Waist, Hips
    const avgScore = measurementScores.reduce((a, b) => a + b, 0) / measurementScores.length;
    // Convert 0-100 score to 0-30 points
    proportionsScore = Math.round((avgScore / 100) * 30);
  }

  // 3. Photo Quality Score (0-30 points) - use Scout's visual analysis if available
  let photoScore = 0;
  const scoutAnalysis = onboardingData.visualIntel || null;
  
  if (scoutAnalysis?.analysis) {
    // Base score from Scout's visual analysis (0-25 points)
    const scoutData = scoutAnalysis.analysis;
    const facialSymmetry = scoutData.facialSymmetryScore || scoutData.facialSymmetry || 0;
    const marketFit = scoutData.marketFitScore || scoutData.marketFit || 0;
    
    // Average Scout scores and normalize to 0-1, then scale to 0-25 points
    const avgScoutScore = ((facialSymmetry + marketFit) / 2) / 10;
    photoScore = Math.round(avgScoutScore * 25);
    
    // Bonus for image count (0-5 points)
    const imageCount = Array.isArray(images) ? images.length : 0;
    if (imageCount >= 3) photoScore += 5; // +5 points for 3+ images
    else if (imageCount >= 1) photoScore += 2; // +2 points for 1-2 images
  } else {
    // Fallback to image count if no Scout analysis available
    const imageCount = Array.isArray(images) ? images.length : 0;
    if (imageCount >= 6) photoScore = 30;
    else if (imageCount >= 4) photoScore = 25;
    else if (imageCount >= 2) photoScore = 20;
    else if (imageCount >= 1) photoScore = 15;
  }
  
  photoScore = Math.min(photoScore, 30);

  const totalScore = Math.min(completenessScore + proportionsScore + photoScore, 100);
  
  return {
    modelScore: totalScore,
    scoreBreakdown: {
      completeness: completenessScore,
      proportions: proportionsScore,
      photoQuality: photoScore
    }
  };
}

/**
 * Generate Market Potential Tags based on profile data and Scout's visual analysis
 * Uses Scout's facial symmetry and market fit scores to assign specific market tags
 */
function generateMarketTags(profile, scoutAnalysis = null) {
  const tags = [];
  
  if (!profile) return tags;

  // Extract Scout analysis scores (support both nested and flat structures)
  const scoutData = scoutAnalysis?.analysis || scoutAnalysis || {};
  const facialSymmetry = scoutData.facialSymmetryScore || scoutData.facialSymmetry || 0;
  const marketFit = scoutData.marketFitScore || scoutData.marketFit || 0;

  // Runway Viable: High-fashion proportions + high facial symmetry (≥8)
  const hasRunwayProportions = profile.height_cm >= 175 && 
    profile.waist && parseFloat(profile.waist) <= 26 &&
    profile.bust && parseFloat(profile.bust) >= 32 && parseFloat(profile.bust) <= 34;
  
  if (hasRunwayProportions && facialSymmetry >= 8) {
    tags.push('Runway Viable');
  }

  // Commercial Strong: Commercial proportions + good market fit (≥7)
  const hasCommercialProportions = profile.bust && profile.waist && profile.hips &&
    parseFloat(profile.bust) >= 30 && parseFloat(profile.bust) <= 38 &&
    parseFloat(profile.waist) >= 24 && parseFloat(profile.waist) <= 30;
  
  if (hasCommercialProportions && marketFit >= 7) {
    tags.push('Commercial Strong');
  }

  // Editorial Fit: Strong facial symmetry (≥7.5) + editorial height (≥170cm)
  if (facialSymmetry >= 7.5 && profile.height_cm >= 170) {
    tags.push('Editorial Fit');
  }

  // Fallback: If Scout analysis exists but no tags matched, use basic criteria
  if (tags.length === 0 && scoutAnalysis) {
    // Use proportions-only criteria if Scout data exists but scores are lower
    if (hasRunwayProportions) {
      tags.push('Runway Viable');
    } else if (hasCommercialProportions) {
      tags.push('Commercial Strong');
    }
  }

  // Default: Emerging Talent if no tags match
  if (tags.length === 0) {
    tags.push('Emerging Talent');
  }

  return tags;
}

/**
 * Calculate deviation score from ideal proportion (0-100 scale)
 * Perfect match = 100, within ideal range = 80-100, outside = 0-80
 */
function calculateDeviationScore(value, ideal, min, max) {
  if (!value || value === 0) return 0;
  
  // Perfect match = 100
  if (value === ideal) return 100;
  
  // Within ideal range = 80-100 (gradient from center)
  if (value >= min && value <= max) {
    const range = max - min;
    const distanceFromCenter = Math.abs(value - ideal);
    const maxDistance = range / 2;
    return 100 - (distanceFromCenter / maxDistance) * 20; // 100 down to 80
  }
  
  // Outside ideal range, calculate penalty
  const distanceFromRange = value < min ? min - value : value - max;
  const penaltyRange = (max - min) * 2; // 2x the ideal range for penalty calculation
  const penalty = Math.min(80, (distanceFromRange / penaltyRange) * 80);
  
  return Math.max(0, 80 - penalty);
}

/**
 * Generate Radar Chart Data from profile measurements
 * Normalized against industry-standard "ideal" proportions for high-fashion runway
 */
function generateRadarData(profile) {
  if (!profile) {
    return {
      labels: ['Height', 'Bust', 'Waist', 'Hips', 'Shoe'],
      values: [0, 0, 0, 0, 0]
    };
  }

  // Industry-standard "ideal" proportions for high-fashion runway
  const IDEAL_PROPORTIONS = {
    height: { min: 175, max: 180, center: 177.5 }, // cm (5'10" - 5'11")
    bust: { min: 32, max: 34, center: 33 }, // inches
    waist: { min: 24, max: 26, center: 25 }, // inches
    hips: { min: 34, max: 36, center: 35 }, // inches
    shoe: { min: 8, max: 9, center: 8.5 } // US size
  };

  // Calculate deviation from ideal for each measurement
  const heightValue = profile.height_cm ? 
    calculateDeviationScore(
      profile.height_cm,
      IDEAL_PROPORTIONS.height.center,
      IDEAL_PROPORTIONS.height.min,
      IDEAL_PROPORTIONS.height.max
    ) : 0;
  
  const bustValue = profile.bust ? 
    calculateDeviationScore(
      parseFloat(profile.bust),
      IDEAL_PROPORTIONS.bust.center,
      IDEAL_PROPORTIONS.bust.min,
      IDEAL_PROPORTIONS.bust.max
    ) : 0;
  
  const waistValue = profile.waist ? 
    calculateDeviationScore(
      parseFloat(profile.waist),
      IDEAL_PROPORTIONS.waist.center,
      IDEAL_PROPORTIONS.waist.min,
      IDEAL_PROPORTIONS.waist.max
    ) : 0;
  
  const hipsValue = profile.hips ? 
    calculateDeviationScore(
      parseFloat(profile.hips),
      IDEAL_PROPORTIONS.hips.center,
      IDEAL_PROPORTIONS.hips.min,
      IDEAL_PROPORTIONS.hips.max
    ) : 0;
  
  // Shoe size: Extract number from string (e.g., "8 US" -> 8)
  const shoeMatch = profile.shoe_size ? profile.shoe_size.match(/(\d+)/) : null;
  const shoeNumber = shoeMatch ? parseFloat(shoeMatch[1]) : 0;
  const shoeValue = shoeNumber > 0 ? 
    calculateDeviationScore(
      shoeNumber,
      IDEAL_PROPORTIONS.shoe.center,
      IDEAL_PROPORTIONS.shoe.min,
      IDEAL_PROPORTIONS.shoe.max
    ) : 0;

  return {
    labels: ['Height', 'Bust', 'Waist', 'Hips', 'Shoe'],
    values: [heightValue, bustValue, waistValue, hipsValue, shoeValue]
  };
}

/**
 * Generate Action Plan based on profile completeness
 */
function generateActionPlan(profile, images = []) {
  const actions = [];
  
  if (!profile) return actions;

  // Social links
  if (!profile.instagram_handle && !profile.twitter_handle && !profile.tiktok_handle) {
    actions.push('Complete social links for better discoverability');
  }

  // References
  if (!profile.reference_name || !profile.reference_email) {
    actions.push('Add professional references');
  }

  // Emergency contact
  if (!profile.emergency_contact_name || !profile.emergency_contact_phone) {
    actions.push('Add emergency contact information');
  }

  // More photos
  const imageCount = Array.isArray(images) ? images.length : 0;
  if (imageCount < 6) {
    actions.push(`Add ${6 - imageCount} more photos to complete your portfolio`);
  }

  // Agency applications
  if (profile.partner_agency_id) {
    const agency = profile.partner_agency_name || 'your partner agency';
    actions.push(`Apply to ${agency}`);
  } else {
    actions.push('Explore agency matches in your dashboard');
  }

  return actions;
}

/**
 * POST /api/chat/reveal - Get Personalized Reveal data
 * Triggers Librarian synthesis if not already completed
 */
router.post('/api/chat/reveal', requireRole('TALENT'), validateSessionStructure, async (req, res, next) => {
  try {
    const currentStage = req.session.currentStage || 0;
    const userId = req.session.userId;
    
    console.log('[Reveal] Request received:', {
      currentStage,
      userId: userId ? 'present' : 'missing',
      hasOnboardingData: !!(req.session.onboardingData),
      hasSynthesis: !!(req.session.onboardingData?._synthesis)
    });
    
    // Allow reveal data if at stage 4+ OR if user has enough data
    if (currentStage < 4) {
      console.log('[Reveal] Stage too early - current stage:', currentStage, 'minimum required: 4');
      return res.status(400).json({ 
        success: false,
        error: `Reveal data requires completing at least Stage 4. Current stage: ${currentStage}`,
        currentStage,
        minimumStage: 4
      });
    }

    if (!userId) {
      console.log('[Reveal] Missing userId in session');
      return res.status(401).json({ 
        success: false,
        error: 'User authentication required' 
      });
    }

    // Trigger Librarian synthesis if not already completed
    // This ensures reveal data uses synthesized profile data
    if (!req.session.onboardingData?._synthesis) {
      console.log('[Reveal] Synthesis not found, triggering Librarian synthesis...');
      try {
        await triggerLibrarianSynthesis(req.session.onboardingData, userId, req);
        console.log('[Reveal] Synthesis completed successfully');
      } catch (synthesisError) {
        console.error('[Reveal] Synthesis error:', synthesisError);
        // Continue even if synthesis fails - we'll use existing data
      }
    }

    // Get profile data - check database first, then session onboardingData
    let profile = null;
    let images = [];

    try {
      profile = await knex('profiles').where({ user_id: req.session.userId }).first();
      if (profile) {
        images = await knex('images').where({ profile_id: profile.id }).orderBy('sort', 'asc');
      }
    } catch (dbError) {
      console.error('[Reveal] Database error:', dbError);
    }

    // Fallback to onboardingData if profile doesn't exist yet
    if (!profile && req.session.onboardingData) {
      profile = {
        first_name: req.session.onboardingData.firstName || null,
        last_name: req.session.onboardingData.lastName || null,
        height_cm: req.session.onboardingData.height_cm || null,
        bust: req.session.onboardingData.bust || null,
        waist: req.session.onboardingData.waist || null,
        hips: req.session.onboardingData.hips || null,
        shoe_size: req.session.onboardingData.shoe_size || null,
        weight_lbs: req.session.onboardingData.weight_lbs || null,
        experience_level: req.session.onboardingData.experience_level || null,
        specialties: req.session.onboardingData.specialties || null,
        // hero_image_path removed
        bio_curated: req.session.onboardingData.bio_curated || null,
        instagram_handle: req.session.onboardingData.instagram_handle || null,
        twitter_handle: req.session.onboardingData.twitter_handle || null,
        tiktok_handle: req.session.onboardingData.tiktok_handle || null,
        reference_name: req.session.onboardingData.reference_name || null,
        reference_email: req.session.onboardingData.reference_email || null,
        emergency_contact_name: req.session.onboardingData.emergency_contact_name || null,
        emergency_contact_phone: req.session.onboardingData.emergency_contact_phone || null,
        partner_agency_id: req.session.onboardingData.partner_agency_id || null
      };
    }

    // Get Scout visual analysis if available
    const scoutAnalysis = req.session.onboardingData?.visualIntel || null;

    // Calculate model score
    const scoreData = calculateModelScore(profile, images, req.session.onboardingData);

    // Generate radar chart data
    const radarData = generateRadarData(profile);

    // Generate market tags
    const marketTags = generateMarketTags(profile, scoutAnalysis);

    // Get bio preview (curated bio or raw bio)
    const bioPreview = profile?.bio_curated || profile?.bio_raw || 
      'Your AI-curated bio will appear here once profile is complete.';

    // Get hero image (first uploaded image or Google photo)
    let heroImage = null;
    if (images && images.length > 0 && images[0].path) {
      heroImage = images[0].path.startsWith('http') ? images[0].path : `/uploads/${images[0].path.split('/').pop()}`;
    }

    // Generate action plan
    const actionPlan = generateActionPlan(profile, images);

    return res.json({
      success: true,
      firstName: profile?.first_name || req.session.onboardingData?.firstName || 'Talent',
      modelScore: scoreData.modelScore,
      scoreBreakdown: scoreData.scoreBreakdown,
      radarData,
      marketTags,
      bioPreview,
      heroImage,
      actionPlan
    });
  } catch (error) {
    console.error('[Reveal] Error:', error);
    return next(error);
  }
});

/**
 * POST /api/chat/finalize - Manually trigger finalization (for Stage 7)
 */
router.post('/api/chat/finalize', requireRole('TALENT'), validateSessionStructure, validateStageTransition, async (req, res, next) => {
  try {
    if (req.session.currentStage !== 7) {
      return res.status(400).json({ error: 'Can only finalize at Stage 7' });
    }

    if (!req.session.userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const synthesis = await triggerLibrarianSynthesis(
      req.session.onboardingData || {},
      req.session.userId,
      req
    );

    return res.json({
      success: true,
      synthesis,
      message: 'Onboarding completed successfully!'
    });
  } catch (error) {
    console.error('[Finalize] Error:', error);
    return next(error);
  }
});

module.exports = router;

