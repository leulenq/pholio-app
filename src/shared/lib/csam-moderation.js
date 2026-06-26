/**
 * CSAM screening scaffold — pluggable provider architecture.
 * Does NOT auto-submit to NCMEC; escalations require human + legal review.
 */
const crypto = require("crypto");

const CSAM_SEVERITY = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  CRITICAL: "critical",
});

const CSAM_ESCALATION_STATUS = Object.freeze({
  PENDING_REVIEW: "pending_review",
  ESCALATED: "escalated",
  CLEARED: "cleared",
  FALSE_POSITIVE: "false_positive",
});

function getCsamProvider() {
  return String(process.env.CSAM_MODERATION_PROVIDER || "heuristic_escalation")
    .toLowerCase()
    .trim();
}

/**
 * @param {Buffer} buffer
 * @param {{ moderationFlags?: object, moderationReason?: string }} [metadata]
 */
async function screenImageForCsam(buffer, metadata = {}) {
  const provider = getCsamProvider();
  if (provider === "none") {
    return {
      provider,
      severity: null,
      flags: {},
      shouldBlock: false,
      shouldEscalate: false,
    };
  }

  const flags = metadata.moderationFlags || {};
  const reason = metadata.moderationReason || "";
  const skinRatio = Number(flags.skin_tone_ratio);
  const extremeAspect = flags.extreme_aspect_ratio === true;

  if (
    reason === "high_skin_ratio" ||
    (Number.isFinite(skinRatio) && skinRatio >= 0.75) ||
    extremeAspect
  ) {
    return {
      provider,
      severity: CSAM_SEVERITY.CRITICAL,
      flags: { ...flags, csam_heuristic: true, reason },
      shouldBlock: false,
      shouldEscalate: true,
    };
  }

  if (reason === "moderation_error") {
    return {
      provider,
      severity: CSAM_SEVERITY.MEDIUM,
      flags: { ...flags, csam_heuristic: true },
      shouldBlock: false,
      shouldEscalate: true,
    };
  }

  return {
    provider,
    severity: CSAM_SEVERITY.LOW,
    flags: {},
    shouldBlock: false,
    shouldEscalate: false,
  };
}

async function recordCsamEscalation(db, payload) {
  const hasTable = await db.schema.hasTable("csam_escalations");
  if (!hasTable) return null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db("csam_escalations").insert({
    id,
    image_id: payload.imageId,
    profile_id: payload.profileId,
    provider: payload.provider || getCsamProvider(),
    severity: payload.severity || CSAM_SEVERITY.MEDIUM,
    status: CSAM_ESCALATION_STATUS.PENDING_REVIEW,
    flags: JSON.stringify(payload.flags || {}),
    notes: payload.notes || null,
    created_at: now,
  });
  return id;
}

module.exports = {
  CSAM_SEVERITY,
  CSAM_ESCALATION_STATUS,
  getCsamProvider,
  screenImageForCsam,
  recordCsamEscalation,
};
