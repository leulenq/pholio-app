/**
 * Unit coverage for the casting state machine's transition guard.
 *
 * Regression net for audit finding M3: `canTransitionTo` must allow ONLY the
 * declared adjacency edges (which include the tolerant legacy edges), never an
 * arbitrary multi-step forward jump. The old `fromIdx <= toIdx` rule let a
 * client parked at an early step POST straight to a later mutating route,
 * advancing current_step past scout/measurements without ever completing them —
 * and because there is no backward transition, that permanently bricked the
 * completion gate.
 */
const {
  canTransitionTo,
  transitionTo,
  getState,
} = require("../../src/domains/onboarding/services/state-machine");

// Minimal knex stub — transitionTo only reads knex.client.config.client and
// calls knex.fn.now(); it never touches a real DB.
const knexStub = {
  client: { config: { client: "sqlite3" } },
  fn: { now: () => "NOW()" },
};

describe("casting state machine — transition guard (M3)", () => {
  describe("canTransitionTo", () => {
    it("allows adjacent forward steps", () => {
      expect(canTransitionTo("scout", "measurements")).toBe(true);
      expect(canTransitionTo("measurements", "profile")).toBe(true);
      expect(canTransitionTo("profile", "done")).toBe(true);
      expect(canTransitionTo("birthdate", "gender")).toBe(true);
      expect(canTransitionTo("gender", "scout")).toBe(true);
    });

    it("allows the tolerant legacy edges preserved in the adjacency map", () => {
      // Legacy in-flight profiles under the old order still advance.
      expect(canTransitionTo("entry", "gender")).toBe(true); // legacy next
      expect(canTransitionTo("birthdate", "scout")).toBe(true); // legacy next
      expect(canTransitionTo("gender", "birthdate")).toBe(true); // legacy next
    });

    it("treats re-entry to the same step as valid (idempotent saves)", () => {
      expect(canTransitionTo("gender", "gender")).toBe(true);
      expect(canTransitionTo("scout", "scout")).toBe(true);
    });

    it("REJECTS arbitrary multi-step forward jumps (the M3 brick vector)", () => {
      // Parked at gender, POSTing measurements must NOT advance.
      expect(canTransitionTo("gender", "measurements")).toBe(false);
      // Parked at gender, POSTing profile must NOT advance.
      expect(canTransitionTo("gender", "profile")).toBe(false);
      // Parked at scout, skipping measurements straight to profile.
      expect(canTransitionTo("scout", "profile")).toBe(false);
      // Parked at birthdate, jumping to measurements.
      expect(canTransitionTo("birthdate", "measurements")).toBe(false);
      // Entry cannot leap to done.
      expect(canTransitionTo("entry", "done")).toBe(false);
    });

    it("rejects unknown source steps", () => {
      expect(canTransitionTo("bogus", "scout")).toBe(false);
    });
  });

  describe("transitionTo", () => {
    it("returns null (no update) for an invalid forward jump", () => {
      const state = {
        version: "v2_casting_call",
        current_step: "gender",
        completed_steps: ["entry", "birthdate"],
        step_data: {},
      };
      expect(transitionTo(state, "measurements", {}, knexStub)).toBeNull();
    });

    it("advances an adjacent step and marks only the step being left complete", () => {
      const state = {
        version: "v2_casting_call",
        current_step: "scout",
        completed_steps: ["entry", "birthdate", "gender"],
        step_data: {},
      };
      const payload = transitionTo(state, "measurements", {}, knexStub);
      expect(payload).not.toBeNull();
      expect(payload.onboarding_stage).toBe("measurements");
      const next = getState({ onboarding_state_json: payload.onboarding_state_json });
      expect(next.current_step).toBe("measurements");
      expect(next.completed_steps).toContain("scout");
      // Never fabricates completion of steps that were never passed through.
      expect(next.completed_steps).not.toContain("measurements");
    });
  });
});
