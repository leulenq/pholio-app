/**
 * Casting Call State Machine
 * Linear onboarding flow for the talent "Casting Call".
 *
 * Live flow:
 *   entry → birthdate → gender → scout → measurements → profile → done
 *
 * Birthdate runs before gender (COPPA hygiene): the age screen must gate before
 * any further personal data is collected. The server is the source of truth for
 * which step the user is on. Each step persists its data and transitions forward
 * via transitionTo(); the client reads current_step + step_data from
 * /onboarding/status to resume on reload.
 *
 * Tolerant edges: some `next` arrays carry an extra legacy target so profiles
 * parked mid-flow under the OLD order (entry → gender → birthdate → scout) still
 * advance without 403s after the reorder.
 */
// Step names that may still be stored in old rows' onboarding_state_json /
// onboarding_stage but no longer exist in the live machine. Healed on read so
// legacy profiles resume cleanly instead of getting stuck on an unknown state
// (canTransitionTo returns false for unknown steps).
const LEGACY_STEP_MAP = {
  identity: "birthdate",
  verification_pending: "birthdate",
};

function healStep(step) {
  return LEGACY_STEP_MAP[step] || step;
}

const TRANSITIONS_V2 = {
  entry: {
    next: ["birthdate", "gender"], // birthdate is the new next; gender kept for legacy in-flight profiles
    prev: null,
    parallel: [],
  },
  birthdate: {
    next: ["gender", "scout"], // gender is the new next; scout kept for legacy in-flight profiles
    prev: "entry",
    parallel: [],
  },
  gender: {
    next: ["scout", "birthdate"], // scout is the new next; birthdate kept for legacy in-flight profiles
    prev: "birthdate",
    parallel: [],
  },
  scout: {
    next: ["measurements"], // Go to measurements after photo upload
    prev: "gender",
    parallel: [],
  },
  measurements: {
    next: ["profile"], // Go to profile after confirming measurements
    prev: "scout",
    parallel: [],
  },
  profile: {
    next: ["done"], // Skip reveal, go directly to done
    prev: "measurements",
    parallel: [],
  },
  done: {
    next: null, // Terminal state
    prev: null,
    parallel: [],
  },
};

/**
 * Get current step from profile
 * Prefers onboarding_state_json, falls back to onboarding_stage
 *
 * @param {Object} profile - Profile record with onboarding_state_json
 * @returns {string} Current step name
 */
function getCurrentStep(profile) {
  if (profile.onboarding_state_json) {
    try {
      const state =
        typeof profile.onboarding_state_json === "string"
          ? JSON.parse(profile.onboarding_state_json)
          : profile.onboarding_state_json;

      return healStep(state.current_step || "entry");
    } catch (e) {
      console.warn(
        "[CastingMachine] Failed to parse onboarding_state_json:",
        e.message,
      );
    }
  }

  // Fallback to legacy onboarding_stage
  return healStep(profile.onboarding_stage || "entry");
}

/**
 * Get full state object from profile
 * Returns structured state with current step, completed steps, and step data
 *
 * @param {Object} profile - Profile record
 * @returns {Object} State object: {current_step, completed_steps, step_data, version}
 */
function getState(profile) {
  if (profile.onboarding_state_json) {
    try {
      const state =
        typeof profile.onboarding_state_json === "string"
          ? JSON.parse(profile.onboarding_state_json)
          : profile.onboarding_state_json;

      // Ensure required fields exist (current_step healed from legacy names)
      return {
        version: state.version || "v2_casting_call",
        current_step: healStep(state.current_step || "entry"),
        completed_steps: state.completed_steps || [],
        step_data: state.step_data || {},
        started_at: state.started_at || new Date().toISOString(),
      };
    } catch (e) {
      console.warn(
        "[CastingMachine] Failed to parse state, returning default:",
        e.message,
      );
    }
  }

  // Default initial state
  return {
    version: "v2_casting_call",
    current_step: "entry",
    completed_steps: [],
    step_data: {},
    started_at: new Date().toISOString(),
  };
}

/**
 * Check if transition from one step to another is valid
 * Handles parallel step logic
 *
 * @param {string} from - Current step
 * @param {string} to - Target step
 * @param {string[]} completedSteps - List of completed steps
 * @returns {boolean} True if transition is valid
 */
const STEP_ORDER = ["entry", "birthdate", "gender", "scout", "measurements", "profile", "done"];

function canTransitionTo(from, to, completedSteps = []) {
  if (from === to) return true; // Re-entry is always ok

  const fromIdx = STEP_ORDER.indexOf(from);
  const toIdx = STEP_ORDER.indexOf(to);

  // If both steps are part of the linear flow, allow forward transitions
  if (fromIdx !== -1 && toIdx !== -1) {
    return fromIdx <= toIdx;
  }

  const config = TRANSITIONS_V2[from];
  if (!config) {
    console.warn(`[CastingMachine] Unknown step: ${from}`);
    return false;
  }

  // Check if 'to' is in the valid next steps
  if (Array.isArray(config.next)) {
    return config.next.includes(to);
  } else {
    return config.next === to;
  }
}

/**
 * Check if user can complete the casting flow
 * Requires 'scout', 'measurements', and 'profile' to be in completed_steps
 *
 * @param {Object} state - Full state object
 * @returns {boolean} True if can enter reveal
 */
function canComplete(state) {
  const completedSteps = state.completed_steps || [];
  // Can complete if currently at profile step (meaning scout/measurements are done)
  // or if already reached the done/complete stage
  return (
    (state.current_step === "profile" &&
      completedSteps.includes("measurements")) ||
    state.current_step === "done" ||
    completedSteps.includes("profile")
  );
}

/**
 * Build update payload for a state transition
 * Handles parallel step completion and state serialization
 *
 * @param {Object} currentState - Current state object
 * @param {string} targetStep - Step transitioning to
 * @param {Object} stepData - Metadata to store for this step
 * @param {Object} knex - Knex instance (for DB-specific JSON handling)
 * @returns {Object} Update payload for knex query
 */
function transitionTo(currentState, targetStep, stepData = {}, knex) {
  const completed = currentState.completed_steps || [];
  if (!canTransitionTo(currentState.current_step, targetStep, completed)) {
    console.warn(
      `[CastingMachine] Invalid transition: ${currentState.current_step} -> ${targetStep}`,
      `Completed: [${completed.join(", ")}]`,
    );
    return null;
  }

  // Clone state to avoid mutation
  const newState = {
    ...currentState,
    completed_steps: [...(currentState.completed_steps || [])],
    step_data: { ...(currentState.step_data || {}) },
  };

  const fromIdx = STEP_ORDER.indexOf(currentState.current_step);
  const toIdx = STEP_ORDER.indexOf(targetStep);
  const isForward = fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx;

  if (isForward) {
    // Mark ONLY the step we are actually leaving as complete. Never fabricate
    // completion of intermediate steps that were skipped over — completed_steps
    // must reflect only steps the user genuinely passed through, so completion
    // gates (scout + measurements) can trust it.
    const currentStepName = STEP_ORDER[fromIdx];
    if (
      currentStepName &&
      !newState.completed_steps.includes(currentStepName)
    ) {
      newState.completed_steps.push(currentStepName);
    }
  } else {
    // Fallback for non-ordered steps if any
    const config = TRANSITIONS_V2[currentState.current_step];
    const isForwardLegacy =
      config &&
      ((Array.isArray(config.next) && config.next.includes(targetStep)) ||
        config.next === targetStep);

    if (
      isForwardLegacy &&
      !newState.completed_steps.includes(currentState.current_step)
    ) {
      newState.completed_steps.push(currentState.current_step);
    }
  }

  // Update current step
  newState.current_step = targetStep;

  // Store step data (optional, for analytics/debugging)
  if (Object.keys(stepData).length > 0) {
    // Store data under the step we're completing
    const dataKey = isForward ? currentState.current_step : targetStep;
    if (dataKey) {
      newState.step_data[dataKey] = {
        ...(newState.step_data[dataKey] || {}),
        ...stepData,
        updated_at: new Date().toISOString(),
      };
    }
  }

  // Update timestamp
  newState.updated_at = new Date().toISOString();

  // Serialize for database
  const clientType = knex?.client?.config?.client;
  const isPostgres = clientType === "pg" || clientType === "postgresql";
  const jsonValue = isPostgres ? newState : JSON.stringify(newState);

  return {
    onboarding_stage: targetStep, // Legacy column (for backwards compatibility)
    onboarding_state_json: jsonValue, // New state machine column
    updated_at: knex.fn.now(),
  };
}

/**
 * Create initial state for a new profile
 * Used when profile is first created
 *
 * @param {string} startStep - Starting step (default: 'entry')
 * @param {Object} knex - Knex instance
 * @returns {Object} Initial state payload for insert
 */
function initialState(startStep = "entry", knex) {
  const state = {
    version: "v2_casting_call",
    current_step: startStep,
    completed_steps: [],
    step_data: {},
    can_enter_reveal: false,
    started_at: new Date().toISOString(),
  };

  const isPostgres =
    knex.client.config.client === "pg" ||
    knex.client.config.client === "postgresql";
  const jsonValue = isPostgres ? state : JSON.stringify(state);

  return {
    onboarding_stage: startStep,
    onboarding_state_json: jsonValue,
  };
}

/**
 * Get next available steps for current state
 * Returns array of valid next steps based on current progress
 *
 * @param {Object} state - Current state object
 * @returns {string[]} Array of valid next step names
 */
function getNextSteps(state) {
  const currentStep = state.current_step;
  const config = TRANSITIONS_V2[currentStep];

  if (!config || !config.next) {
    return []; // Terminal state
  }

  // If next is array, return all valid options
  if (Array.isArray(config.next)) {
    // Note: Legacy "reveal" step has been removed from the new casting flow
    // All steps in the new flow (entry → scout → measurements → profile → done) are linear
    return config.next;
  }

  // Single next step
  return [config.next];
}

/**
 * Check if state is complete (reached done)
 * @param {Object} state - State object
 * @returns {boolean} True if onboarding is complete
 */
function isComplete(state) {
  return (
    state.current_step === "done" ||
    (state.completed_steps && state.completed_steps.includes("done"))
  );
}

module.exports = {
  TRANSITIONS_V2,
  getCurrentStep,
  getState,
  canTransitionTo,
  canComplete,
  transitionTo,
  initialState,
  getNextSteps,
  isComplete,
};
