/**
 * Onboarding State Machine (DEPRECATED)
 * ⚠️ WARNING: This is the OLD onboarding system using the identity → upload → confirm flow
 * The NEW casting call system uses casting-machine.js with: entry → scout → measurements → profile
 *
 * This file is kept for backward compatibility with existing profiles that started the old flow.
 * New implementations should use casting-machine.js instead.
 *
 * Legacy flow: identity → upload → confirm → goals → reveal → completing → submitted → processing → processed
 * Supports dual-write legacy 'onboarding_stage' (string) and new 'onboarding_state_json' (JSON).
 */

const TRANSITIONS = {
  // Phase A: Interactive Wizard
  identity: { next: 'upload', prev: null },
  upload: { next: 'confirm', prev: 'identity' },
  confirm: { next: 'goals', prev: 'upload' }, // New goals step
  goals: { next: 'reveal', prev: 'confirm' },
  reveal: { next: 'completing', prev: 'goals' },
  
  // Phase B: Completion & Processing (Forward-only)
  completing: { next: 'submitted', prev: null },
  submitted: { next: 'processing', prev: null },
  processing: { next: 'processed', prev: null },
  processed: { next: null, prev: null }
};

/**
 * Get current step from profile, preferring JSON state but falling back to string
 * @param {Object} profile 
 * @returns {string} current step
 */
function getCurrentStep(profile) {
  if (profile.onboarding_state_json) {
    try {
      const state = typeof profile.onboarding_state_json === 'string' 
        ? JSON.parse(profile.onboarding_state_json) 
        : profile.onboarding_state_json;
      return state.current_step || 'identity';
    } catch (e) {
      console.warn('Failed to parse onboarding_state_json', e);
    }
  }
  return profile.onboarding_stage || 'identity';
}

/**
 * Get full state object
 * @param {Object} profile 
 * @returns {Object} { current_step, completed_steps: [], step_data: {} }
 */
function getState(profile) {
  if (profile.onboarding_state_json) {
    try {
      return typeof profile.onboarding_state_json === 'string' 
        ? JSON.parse(profile.onboarding_state_json) 
        : profile.onboarding_state_json;
    } catch (e) { /* ignore */ }
  }
  
  // Backfill/Fallback logic
  const stage = profile.onboarding_stage || 'identity';
  const completed = [];
  
  // Infer completed steps based on current stage order
  const order = ['identity', 'upload', 'confirm', 'goals', 'reveal', 'completing', 'submitted', 'processing', 'processed'];
  const idx = order.indexOf(stage);
  if (idx > 0) {
    for (let i = 0; i < idx; i++) {
        completed.push(order[i]);
    }
  }
  
  return {
    current_step: stage,
    completed_steps: completed,
    step_data: {}
  };
}

/**
 * Check if transition is valid
 * @param {string} from 
 * @param {string} to 
 * @returns {boolean}
 */
function canTransitionTo(from, to) {
  if (from === to) return true; // Re-entry ok
  const config = TRANSITIONS[from];
  if (!config) return false;
  return config.next === to || config.prev === to;
}

/**
 * Build update payload for a transition
 * @param {Object} currentState - Full state object
 * @param {string} targetStep - Step moving to
 * @param {Object} stepData - Metadata to save for this step
 * @param {Object} knex - Knex instance (detected for Postgres vs SQLite JSON handling)
 * @returns {Object} Update payload for knex
 */
function transitionTo(currentState, targetStep, stepData = {}, knex) {
  // 1. Validate (warn only to maintain robustness)
  if (!canTransitionTo(currentState.current_step, targetStep)) {
    console.warn(`[StateMachine] Invalid transition: ${currentState.current_step} -> ${targetStep}`);
  }

  // 2. Update State
  const newState = { ...currentState };
  
  // If moving forward, mark previous as complete
  const isForward = TRANSITIONS[currentState.current_step]?.next === targetStep;
  if (isForward && !newState.completed_steps.includes(currentState.current_step)) {
    newState.completed_steps.push(currentState.current_step);
  }
  
  // Update current step
  newState.current_step = targetStep;
  
  // Merge step data
  newState.step_data = newState.step_data || {};
  // Only save data if meaningful
  if (Object.keys(stepData).length > 0) {
      // Store data under the step we just came FROM (completion data) or the one we are IN?
      // Usually "completing a step" produces data. 
      // e.g. completing 'upload' produces { photo_count }.
      // So if moving forward, store in previous step key.
      // If re-entering/staying, store in current.
      
      const dataKey = isForward ? TRANSITIONS[targetStep].prev : targetStep;
      if (dataKey) {
        newState.step_data[dataKey] = {
            ...(newState.step_data[dataKey] || {}),
            ...stepData,
            updated_at: new Date().toISOString()
        };
      }
  }

  // 3. Serialize for DB
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  const jsonValue = isPostgres ? newState : JSON.stringify(newState);

  return {
    onboarding_stage: targetStep, // Legacy column
    onboarding_state_json: jsonValue, // New column
    updated_at: knex.fn.now()
  };
}

/**
 * Build initial Insert payload
 * @param {string} startStep 
 * @param {Object} knex 
 * @returns {Object}
 */
function initialState(startStep = 'identity', knex) {
  const state = {
    current_step: startStep,
    completed_steps: [],
    step_data: {}
  };
  
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  const jsonValue = isPostgres ? state : JSON.stringify(state);

  return {
    onboarding_stage: startStep,
    onboarding_state_json: jsonValue
  };
}

module.exports = {
  TRANSITIONS,
  getState,
  getCurrentStep,
  canTransitionTo,
  transitionTo,
  initialState
};
