const CASTING_PIPELINE_STAGES = [
  "Applied",
  "Shortlisted",
  "Offered",
  "Booked",
  "Passed",
];

function mapApplicationStatusToCastingStage(status) {
  switch ((status || "").toLowerCase()) {
    case "submitted":
    case "pending":
      return "Applied";
    case "shortlisted":
      return "Shortlisted";
    case "accepted":
      return "Offered";
    case "booked":
      return "Booked";
    case "passed":
    case "declined":
    case "archived":
      return "Passed";
    default:
      return "Applied";
  }
}

function mapCastingStageToApplicationStatus(stage) {
  switch ((stage || "").toLowerCase()) {
    case "applied":
      return "submitted";
    case "shortlisted":
      return "shortlisted";
    case "offered":
      return "accepted";
    case "booked":
      return "booked";
    case "passed":
      return "passed";
    default:
      return null;
  }
}

function formatCastingMeasurements(row) {
  const bust = row.bust_cm ?? row.bust ?? null;
  const waist = row.waist_cm ?? row.waist ?? null;
  const hips = row.hips_cm ?? row.hips ?? null;
  const parts = [bust, waist, hips].filter(
    (value) => value !== null && value !== undefined && value !== "",
  );
  return parts.length ? parts.join("-") : null;
}

module.exports = {
  CASTING_PIPELINE_STAGES,
  mapApplicationStatusToCastingStage,
  mapCastingStageToApplicationStatus,
  formatCastingMeasurements,
};
