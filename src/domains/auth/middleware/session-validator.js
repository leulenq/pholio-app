/**
 * Session Validator Middleware
 * 
 * Validates the structure of req.session.onboardingData to prevent "Ghost State" errors.
 * Ensures that session data is valid before allowing stage transitions in the onboarding flow.
 */

/**
 * Validates onboardingData structure
 * @param {object} onboardingData - The onboarding data from session
 * @returns {object} - { valid: boolean, errors: string[] }
 */
function validateOnboardingData(onboardingData) {
  const errors = [];

  // If onboardingData exists, it should be an object
  if (onboardingData !== null && onboardingData !== undefined) {
    if (typeof onboardingData !== 'object' || Array.isArray(onboardingData)) {
      errors.push('onboardingData must be an object');
      return { valid: false, errors };
    }

    // Validate currentStage if present (should be a number between 0 and 7)
    if ('currentStage' in onboardingData) {
      const stage = onboardingData.currentStage;
      if (typeof stage !== 'number' || stage < 0 || stage > 7 || !Number.isInteger(stage)) {
        errors.push('currentStage must be an integer between 0 and 7');
      }
    }

    // Validate onboardingHistory if present (should be an array)
    if ('onboardingHistory' in onboardingData) {
      if (!Array.isArray(onboardingData.onboardingHistory)) {
        errors.push('onboardingHistory must be an array');
      }
    }

    // Validate common field types (optional fields, but if present should be correct type)
    const stringFields = ['firstName', 'lastName', 'city', 'city_secondary', 'phone', 'email'];
    stringFields.forEach(field => {
      if (field in onboardingData && typeof onboardingData[field] !== 'string') {
        errors.push(`${field} must be a string if present`);
      }
    });

    const numberFields = ['height_cm', 'heightFeet', 'heightInches', 'weight_lbs', 'bust', 'waist', 'hips'];
    numberFields.forEach(field => {
      if (field in onboardingData && typeof onboardingData[field] !== 'number') {
        errors.push(`${field} must be a number if present`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Middleware to validate session structure before onboarding operations
 * Applies to chat.js and scout.js routes
 */
function validateSessionStructure(req, res, next) {
  // Check if session exists
  if (!req.session) {
    return res.status(401).json({
      error: 'Session required',
      message: 'No session found. Please sign in to continue.'
    });
  }

  // Check if userId exists (required for authenticated operations)
  if (!req.session.userId) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'User session not found. Please sign in to continue.'
    });
  }

  // Validate onboardingData structure if it exists
  if (req.session.onboardingData !== undefined) {
    const validation = validateOnboardingData(req.session.onboardingData);
    
    if (!validation.valid) {
      console.error('[Session Validator] Invalid onboardingData structure:', {
        userId: req.session.userId,
        errors: validation.errors,
        onboardingData: req.session.onboardingData
      });

      // If onboardingData is corrupted, reset it to a clean state
      req.session.onboardingData = {
        currentStage: 0,
        onboardingHistory: []
      };

      return res.status(400).json({
        error: 'Invalid session data',
        message: 'Session data structure is invalid. Please start over.',
        errors: validation.errors
      });
    }
  }

  // If onboardingData doesn't exist, initialize it with default structure
  if (!req.session.onboardingData) {
    req.session.onboardingData = {
      currentStage: 0,
      onboardingHistory: []
    };
  }

  return next();
}

/**
 * Middleware to validate currentStage before stage transitions
 * Ensures currentStage is valid and within bounds
 */
function validateStageTransition(req, res, next) {
  if (!req.session || !req.session.onboardingData) {
    return next(); // Let validateSessionStructure handle this
  }

  const currentStage = req.session.onboardingData.currentStage;

  // Validate currentStage if provided in request body
  if (req.body && 'currentStage' in req.body) {
    const requestedStage = parseInt(req.body.currentStage, 10);
    
    if (isNaN(requestedStage) || requestedStage < 0 || requestedStage > 7) {
      return res.status(400).json({
        error: 'Invalid stage',
        message: 'currentStage must be an integer between 0 and 7'
      });
    }
  }

  // Validate session currentStage
  if (currentStage !== undefined && currentStage !== null) {
    if (typeof currentStage !== 'number' || currentStage < 0 || currentStage > 7 || !Number.isInteger(currentStage)) {
      console.warn('[Session Validator] Invalid currentStage in session, resetting to 0:', currentStage);
      req.session.onboardingData.currentStage = 0;
    }
  }

  return next();
}

module.exports = {
  validateSessionStructure,
  validateStageTransition,
  validateOnboardingData
};



