"use strict";

const {
  PITS_MAX_CONCURRENT_VISION,
} = require("../../../shared/constants/package-intelligence");

const profileQueues = new Map();

function getQueueState(profileId) {
  const key = String(profileId);
  let state = profileQueues.get(key);
  if (!state) {
    state = { activeCount: 0, pending: [] };
    profileQueues.set(key, state);
  }
  return { key, state };
}

function drainQueue(profileId) {
  const key = String(profileId);
  const state = profileQueues.get(key);
  if (!state) return;

  while (
    state.activeCount < PITS_MAX_CONCURRENT_VISION &&
    state.pending.length > 0
  ) {
    const { jobFn, resolve, reject } = state.pending.shift();
    state.activeCount += 1;

    Promise.resolve()
      .then(() => jobFn())
      .then(resolve, reject)
      .finally(() => {
        state.activeCount -= 1;
        if (state.activeCount === 0 && state.pending.length === 0) {
          profileQueues.delete(key);
          return;
        }
        drainQueue(key);
      });
  }
}

function enqueuePitsJob(profileId, jobFn) {
  if (!profileId) {
    return Promise.reject(new Error("profileId is required"));
  }
  if (typeof jobFn !== "function") {
    return Promise.reject(new Error("jobFn must be a function"));
  }

  const { key, state } = getQueueState(profileId);
  return new Promise((resolve, reject) => {
    state.pending.push({ jobFn, resolve, reject });
    drainQueue(key);
  });
}

module.exports = { enqueuePitsJob };
