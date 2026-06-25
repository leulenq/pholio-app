"use strict";

const { evaluateSendReadiness } = require("./send-readiness");

/**
 * Server-side mirror of Apply Send-scene gates (defense in depth).
 * @param {object} profile
 * @param {Array} images — package images (subset when submissionPackage.imageIds provided)
 */
function validateSubmissionPackage(profile, images = []) {
  const readiness = evaluateSendReadiness(profile, images);
  const errors = readiness.sendBlockers.map((blocker) => ({
    code: blocker.code,
    message: blocker.message,
    ...(blocker.key ? { key: blocker.key } : {}),
  }));

  return {
    ok: readiness.isSendReady,
    errors,
    audit: readiness.audit,
    strength: readiness.strength,
  };
}

module.exports = {
  validateSubmissionPackage,
};
