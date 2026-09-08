const MIN_REQUIRED_IMAGES = 5;
const MIN_PRINT_SHORT_EDGE_PX = 1200;
const {
  RIGHTS_DENIED_STATUSES,
  resolveRightsStatusToken,
} = require("../../shared/lib/image-rights");
const RIGHTS_DENIED_VALUES = RIGHTS_DENIED_STATUSES;

function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === "object") return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

function toInt(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function resolveImageDimensions(image) {
  if (!image) return { width: null, height: null };
  const metadata = parseMetadata(image.metadata);
  const width = toInt(image.width ?? metadata.width);
  const height = toInt(image.height ?? metadata.height);
  return { width, height };
}

// Delegates to the shared resolver in `shared/lib/image-rights.js` — this
// used to be its own `??`-based chain, which let an empty-string value in a
// higher-priority field (e.g. `usage_rights: ""`) mask a real "denied"
// status sitting in a lower-priority one, silently letting a denied image
// through comp-card composition. `firstNonEmpty` (used by the shared
// resolver) treats an empty string as absent, matching how the submission-
// time check already resolved the same fields.
function resolveRightsToken(image) {
  return resolveRightsStatusToken(image);
}

function checkImageSlotIntegrity(heroImage, gridImages) {
  const checks = [];
  if (!heroImage) {
    checks.push({
      id: "hero-required",
      level: "error",
      message: "Hero image is required for comp-card generation.",
    });
  }

  const missingSlots = (gridImages || []).filter((img) => !img).length;
  if (missingSlots > 0) {
    checks.push({
      id: "grid-slots-required",
      level: "error",
      message: `${missingSlots} grid slot${missingSlots > 1 ? "s are" : " is"} empty.`,
    });
  }

  return checks;
}

function checkImageAvailability(images) {
  if (!Array.isArray(images) || images.length < MIN_REQUIRED_IMAGES) {
    return [
      {
        id: "image-count-minimum",
        level: "warn",
        message: `At least ${MIN_REQUIRED_IMAGES} images are recommended for a full comp card.`,
      },
    ];
  }
  return [];
}

function checkSourcePaths(selectedImages) {
  const checks = [];
  selectedImages.forEach((image) => {
    const hasPath = Boolean(image?.public_url || image?.path);
    if (!hasPath) {
      checks.push({
        id: "image-source-path",
        level: "error",
        message: `Image ${image?.id || "unknown"} is missing a renderable source path.`,
      });
    }
  });
  return checks;
}

/**
 * Comp-card composition guardrail — denial only.
 *
 * An image is usable unless someone has actively marked it as denied (for
 * example after a dispute or a DMCA hold). The absence of licensing
 * metadata is the default state of every upload and is not itself a signal
 * of anything, so it never blocks composition.
 */
function checkRightsMetadata(selectedImages) {
  const checks = [];
  selectedImages.forEach((image) => {
    const rights = resolveRightsToken(image);
    if (RIGHTS_DENIED_VALUES.has(rights)) {
      checks.push({
        id: "rights-permitted",
        level: "error",
        message: `Image ${image?.id || "unknown"} is marked as not available for use.`,
      });
    }
  });
  return checks;
}

function checkPrintReadiness(selectedImages) {
  const checks = [];
  selectedImages.forEach((image) => {
    const { width, height } = resolveImageDimensions(image);
    if (!width || !height) {
      checks.push({
        id: "image-dimensions-present",
        level: "warn",
        message: `Image ${image?.id || "unknown"} is missing width/height metadata.`,
      });
      return;
    }
    const shortEdge = Math.min(width, height);
    if (shortEdge < MIN_PRINT_SHORT_EDGE_PX) {
      checks.push({
        id: "print-min-resolution",
        level: "warn",
        message: `Image ${image?.id || "unknown"} short edge (${shortEdge}px) may be low for print.`,
      });
    }
  });
  return checks;
}

function checkProfileLegibility(profile) {
  const checks = [];
  if (!profile?.first_name || !profile?.last_name) {
    checks.push({
      id: "profile-name-required",
      level: "error",
      message: "Profile first and last name are required for comp card output.",
    });
  }

  if (!profile?.height_cm && !profile?.height) {
    checks.push({
      id: "profile-height-recommended",
      level: "warn",
      message:
        "Height is missing; card legibility and completeness may be reduced.",
    });
  }

  return checks;
}

function summarize(checks) {
  const blockingIssues = checks.filter((check) => check.level === "error");
  const warnings = checks.filter((check) => check.level === "warn");
  const status =
    blockingIssues.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass";

  return {
    status,
    blockingIssueCount: blockingIssues.length,
    warningCount: warnings.length,
    blockingIssues,
    warnings,
  };
}

function evaluateCompCardGuardrails({
  profile,
  images,
  heroImage,
  gridImages,
  mode = "draft",
}) {
  const selectedImages = [heroImage, ...(gridImages || [])].filter(Boolean);
  const checks = [
    ...checkImageAvailability(images),
    ...checkImageSlotIntegrity(heroImage, gridImages),
    ...checkSourcePaths(selectedImages),
    ...checkRightsMetadata(selectedImages),
    ...checkPrintReadiness(selectedImages),
    ...checkProfileLegibility(profile),
  ];
  const summary = summarize(checks);

  return {
    mode: mode === "master" ? "master" : "draft",
    ...summary,
    checks,
  };
}

module.exports = {
  MIN_REQUIRED_IMAGES,
  MIN_PRINT_SHORT_EDGE_PX,
  RIGHTS_DENIED_VALUES,
  evaluateCompCardGuardrails,
};
