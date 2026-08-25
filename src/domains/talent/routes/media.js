const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole, requireActiveAccount } = require("../../auth/middleware/require-auth");
const { upload, processImage, s3 } = require("../../../shared/lib/uploader");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs").promises;
const path = require("path");
const config = require("../../../config");
const { ensureUniqueSlug } = require("../../../shared/lib/slugify");
const { logActivity } = require("../services/shared-utils");
const {
  captureSubmissionReadiness,
  notifyIfSubmissionReadinessLost,
} = require("../../../shared/services/notify-profile-readiness");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const {
  parseImageStructuredFieldsFromBody,
  parseImageRightsPatchFromBody,
  imageRightsRowToApi,
  parseImageModelReleasePatchFromBody,
  imageModelReleaseRowToApi,
  parseVideoAssetFromBody,
} = require("../../../shared/lib/validation");
const {
  runImageClassification,
  imageAiProcessingAllowed,
} = require("../services/run-image-classification");
const { enqueuePitsJob } = require("../services/pits-queue");
const { enqueueMattePrecompute } = require("../services/matte-precompute");
const {
  logClassificationFeedback,
} = require("../services/image-classification-policy");
const {
  isMinorProfile,
  minorSensitiveFieldsUnlocked,
} = require("../../../shared/lib/talent-age");
const { fetchImageBuffer } = require("../../../shared/lib/fetch-image-buffer");
const {
  excludeProviderAccountAvatarImages,
  reclaimProviderAccountAvatarSeeds,
} = require("../../../shared/lib/account-avatar");
const { masterVisionAnalysis } = require("../../ai/analyzeProfileImage");
const {
  MODERATION_STATUS,
  analyzeImageBuffer,
  enqueueImageForReview,
} = require("../../../shared/lib/content-moderation");
const {
  screenImageForCsam,
  recordCsamEscalation,
} = require("../../../shared/lib/csam-moderation");
const {
  purgeStoredImageArtifacts,
} = require("../../../shared/lib/purge-image-artifacts");
const {
  submissionRetentionExpiry,
} = require("../../../shared/lib/submission-retention");

// Body-revealing framing. An unconsented minor may not upload or make
// agency/public-visible any of these. Extended beyond full-length framing
// (audit P0 #1) to cover three-quarter / half-body framing too.
const SENSITIVE_SHOT_TYPES = new Set([
  "full_length",
  "full_body",
  "three_quarter",
  "half_body",
]);
// Swim/body/fitness registers are body imagery regardless of framing tag.
const SENSITIVE_STYLE_TYPES = new Set(["swimwear", "fitness"]);
// PITS body-visibility signals that indicate a body frame (metadata.ai.signals).
const SENSITIVE_BODY_VISIBILITY = new Set(["three_quarter", "full_length"]);

const MINOR_BODY_BLOCK_MESSAGE =
  "Guardian consent is required before uploading or sharing body imagery (full-length, three-quarter, swimwear, or fitness).";

/** Read the PITS body_visibility signal from an image's metadata. */
function bodyVisibilitySignalFromMetadata(metadata) {
  const m = metadata && typeof metadata === "object" ? metadata : {};
  const ai = m.ai && typeof m.ai === "object" ? m.ai : {};
  const signals =
    (ai.signals && typeof ai.signals === "object" && ai.signals) ||
    (ai.classification &&
      typeof ai.classification === "object" &&
      ai.classification.signals) ||
    null;
  const raw = signals && typeof signals === "object" ? signals.body_visibility : null;
  return raw ? String(raw).toLowerCase() : "";
}

/**
 * Is the resolved image a body image by any signal (framing, register, role,
 * or the PITS body_visibility signal)?
 */
function isSensitiveBodyImage({ shot_type, style_type, role, body_visibility } = {}) {
  const shot = shot_type ? String(shot_type).toLowerCase() : "";
  if (shot && SENSITIVE_SHOT_TYPES.has(shot)) return true;
  if (role === "full_body") return true;
  const style = style_type ? String(style_type).toLowerCase() : "";
  if (style && SENSITIVE_STYLE_TYPES.has(style)) return true;
  const bv = body_visibility ? String(body_visibility).toLowerCase() : "";
  if (bv && SENSITIVE_BODY_VISIBILITY.has(bv)) return true;
  return false;
}

router.use(requireActiveAccount());

/**
 * Returns a block message when an unconsented minor would upload or expose body
 * imagery; null otherwise.
 *
 * `context` carries the resolved image state: shot_type, style_type, role,
 * body_visibility (PITS signal). Pass `agencyVisible: false` to allow a minor to
 * keep a body frame strictly private (the gate only blocks agency/public
 * exposure when visibility is explicitly resolved). When `agencyVisible` is
 * omitted the frame is treated as visible (default for uploads).
 */
function minorBlocksSensitiveImage(profile, context = {}) {
  if (!profile || !isMinorProfile(profile) || minorSensitiveFieldsUnlocked(profile)) {
    return null;
  }
  if (!isSensitiveBodyImage(context)) return null;
  if (context.agencyVisible === false) return null;
  return MINOR_BODY_BLOCK_MESSAGE;
}

function respondMinorImageBlock(res, message) {
  return res.status(403).json({
    success: false,
    message,
    code: "MINOR_CONSENT_REQUIRED",
  });
}

/**
 * Audit P0-8 — default-private for unconsented minors.
 *
 * An unconsented minor's newly written image must NEVER be publicly or
 * agency-visible, regardless of the client-declared shot_type/style_type
 * metadata (which cannot be trusted for the safety decision). Returns true when
 * the profile is a minor WITHOUT valid guardian authorization on file — in that
 * case the caller forces exclude_from_public = exclude_from_agency = true.
 */
function minorForcesPrivate(profile) {
  return (
    !!profile &&
    isMinorProfile(profile) &&
    !minorSensitiveFieldsUnlocked(profile)
  );
}

/** Column overrides that pin an image fully private (public + agency). */
function forcedPrivateColumns(profile) {
  return minorForcesPrivate(profile)
    ? { exclude_from_public: true, exclude_from_agency: true }
    : {};
}

/**
 * Audit P0-5 (image-AI half) — consent gate for SENSITIVE image inference.
 *
 * Image inference requires a valid adult DOB, explicit purpose-specific
 * consent, and the deployment feature flag. Guardian authorization never
 * enables provider image analysis for a minor.
 */
/**
 * Fire-and-forget sensitive image AI for a profile's primary photo, gated on
 * consent + minor status. This is where image AI now lives after the legacy
 * masterVisionAnalysis trigger was removed from profile.js — analysis runs in
 * the MEDIA domain wherever an image is uploaded or becomes primary.
 */
function runSensitiveImageAnalysisIfAllowed(profileId, imageRow) {
  if (!profileId || !imageRow) return;
  fetchImageBuffer(imageRow)
    .then((buffer) => {
      if (!buffer || !buffer.length) return;
      // masterVisionAnalysis owns the provider boundary and authoritatively
      // re-reads DOB, consent, and the feature flag before every provider call
      // and again before persisting its output.
      return masterVisionAnalysis(knex, buffer, profileId);
    })
    .catch((err) =>
      console.warn(
        "[Media] Sensitive image analysis failed:",
        imageRow.id,
        err?.message || String(err),
      ),
    );
}

function scheduleImageClassification(profile, imageId) {
  // Matting is local comp-card preparation, not provider analysis. Schedule it
  // independently so opt-out and provider failures cannot suppress it.
  enqueueMattePrecompute(knex, imageId);
  if (!imageAiProcessingAllowed(profile)) return Promise.resolve(false);
  return enqueuePitsJob(profile.id, () => runImageClassification(knex, imageId))
    .catch((err) =>
      console.warn("[PITS] classification failed:", imageId, err.message),
    );
}

/** Normalize processImage() return (camelCase) for DB columns (snake_case). */
function fieldsFromProcessed(processed) {
  if (!processed || typeof processed !== "object") {
    return {
      path: null,
      public_url: null,
      storage_key: null,
      absolute_path: null,
      imageIntel: null,
      delivery_mime_type: null,
      delivery_size_bytes: null,
      delivery_width_px: null,
      delivery_height_px: null,
    };
  }
  return {
    path: processed.path || processed.publicUrl || null,
    public_url: processed.publicUrl || processed.public_url || null,
    storage_key: processed.storageKey || processed.storage_key || null,
    absolute_path: processed.absolutePath || processed.absolute_path || null,
    imageIntel: processed.imageIntel || processed.image_intel || null,
    delivery_mime_type:
      processed.deliveryMimeType || processed.delivery_mime_type || null,
    delivery_size_bytes:
      processed.deliverySizeBytes ?? processed.delivery_size_bytes ?? null,
    delivery_width_px:
      processed.deliveryWidthPx ?? processed.delivery_width_px ?? null,
    delivery_height_px:
      processed.deliveryHeightPx ?? processed.delivery_height_px ?? null,
  };
}

const IMAGE_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_METADATA_MAX_BYTES = 8 * 1024;
const IMAGE_ROLE_ALLOWED = new Set([
  "headshot",
  "full_body",
  "editorial",
  "lifestyle",
]);
const IMAGE_VISIBILITY_ALLOWED = new Set(["public", "private"]);

/** Conservative slug-style kinds for image_sets (alphanumeric + underscore/hyphen). */
const IMAGE_SET_KIND_MAX = 64;
const IMAGE_SET_KIND_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const IMAGE_SET_NAME_MAX = 120;

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeRightsStatus(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function isUuid(value) {
  return typeof value === "string" && IMAGE_ID_REGEX.test(value);
}

function parseImageMetadataFromDb(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return {};
    try {
      const parsed = JSON.parse(t);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return { ...parsed };
      }
    } catch {
      /* ignore */
    }
    return {};
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { ...raw };
  }
  return {};
}

function normalizeIncomingMetadataPatch(body) {
  const m = body?.metadata;
  if (m == null) return {};
  if (typeof m === "string") {
    const t = m.trim();
    if (!t) return {};
    try {
      const parsed = JSON.parse(t);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return { ...parsed };
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof m === "object" && !Array.isArray(m)) {
    return { ...m };
  }
  return {};
}

function sanitizeIncomingMetadataPatch(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const out = {};

  if (Object.hasOwn(metadata, "visibility")) {
    const visibility = String(metadata.visibility || "")
      .toLowerCase()
      .trim();
    if (IMAGE_VISIBILITY_ALLOWED.has(visibility)) {
      out.visibility = visibility;
    }
  }

  if (Object.hasOwn(metadata, "role")) {
    const role = metadata.role == null ? null : String(metadata.role).trim();
    if (role === null || IMAGE_ROLE_ALLOWED.has(role)) {
      out.role = role;
    }
  }

  if (Object.hasOwn(metadata, "caption")) {
    const caption =
      typeof metadata.caption === "string" ? metadata.caption.trim() : "";
    out.caption = caption.slice(0, 300);
  }

  if (Object.hasOwn(metadata, "tags")) {
    const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
    out.tags = tags
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((tag) => tag.slice(0, 40));
  }

  if (Object.hasOwn(metadata, "credits")) {
    const credits =
      metadata.credits &&
      typeof metadata.credits === "object" &&
      !Array.isArray(metadata.credits)
        ? metadata.credits
        : {};

    out.credits = {
      photographer:
        typeof credits.photographer === "string"
          ? credits.photographer.trim().slice(0, 120)
          : "",
      mua:
        typeof credits.mua === "string" ? credits.mua.trim().slice(0, 120) : "",
      stylist:
        typeof credits.stylist === "string"
          ? credits.stylist.trim().slice(0, 120)
          : "",
      // Tearsheet publication credit (audit P1 #9)
      publication:
        typeof credits.publication === "string"
          ? credits.publication.trim().slice(0, 160)
          : "",
      issue:
        typeof credits.issue === "string"
          ? credits.issue.trim().slice(0, 80)
          : "",
      credit:
        typeof credits.credit === "string"
          ? credits.credit.trim().slice(0, 200)
          : "",
    };
  }

  if (Object.hasOwn(metadata, "ai")) {
    const ai = metadata.ai;
    if (ai && typeof ai === "object" && !Array.isArray(ai)) {
      out.ai = ai;
    }
  }

  // focal { x, y } in 0–1: the talent-set point the comp-card crop keeps
  // centered (the crop engine reads metadata.focal first, before any role
  // heuristic). null clears it back to automatic. Anything malformed is
  // dropped rather than stored.
  if (Object.hasOwn(metadata, "focal")) {
    const focal = metadata.focal;
    if (focal === null) {
      out.focal = null;
    } else if (
      focal &&
      typeof focal === "object" &&
      Number.isFinite(Number(focal.x)) &&
      Number.isFinite(Number(focal.y))
    ) {
      const clamp01 = (n) => Math.max(0, Math.min(1, Number(n)));
      out.focal = {
        x: Math.round(clamp01(focal.x) * 1000) / 1000,
        y: Math.round(clamp01(focal.y) * 1000) / 1000,
      };
    }
  }

  return out;
}

function isoOrNull(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseImageSetKind(raw) {
  if (raw == null || typeof raw !== "string") {
    return { ok: false, error: "kind is required" };
  }
  const kind = raw.trim();
  if (!kind) {
    return { ok: false, error: "kind is required" };
  }
  if (kind.length > IMAGE_SET_KIND_MAX) {
    return { ok: false, error: "kind is too long" };
  }
  if (!IMAGE_SET_KIND_REGEX.test(kind)) {
    return {
      ok: false,
      error:
        "kind must start with a letter or number and use only letters, numbers, underscores, and hyphens",
    };
  }
  return { ok: true, value: kind.toLowerCase() };
}

function parseImageSetName(raw) {
  if (raw == null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "name must be a string" };
  }
  const name = raw.trim();
  if (!name) {
    return { ok: true, value: null };
  }
  if (name.length > IMAGE_SET_NAME_MAX) {
    return { ok: false, error: "name is too long" };
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(name)) {
    return { ok: false, error: "name contains invalid characters" };
  }
  return { ok: true, value: name };
}

function parseOptionalBooleanCurrent(raw) {
  if (raw === undefined) {
    return { ok: true, value: false };
  }
  if (raw === true || raw === false) {
    return { ok: true, value: raw };
  }
  if (raw === "true" || raw === "false") {
    return { ok: true, value: raw === "true" };
  }
  return { ok: false, error: "is_current must be a boolean" };
}

function imageSetRowToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    profile_id: row.profile_id,
    kind: row.kind,
    name: row.name,
    is_current: !!row.is_current,
    created_at: isoOrNull(row.created_at),
    retired_at: isoOrNull(row.retired_at),
  };
}

function structuredFieldsFromImageRow(image) {
  if (!image) return {};
  return {
    image_type: image.image_type ?? null,
    shot_type: image.shot_type ?? null,
    style_type: image.style_type ?? null,
    status: image.status != null ? image.status : "active",
    exclude_from_public: !!image.exclude_from_public,
    exclude_from_agency: !!image.exclude_from_agency,
    captured_at: isoOrNull(image.captured_at),
    retouched_at: isoOrNull(image.retouched_at),
    set_id: image.set_id ?? null,
    asset_kind: image.asset_kind || "image",
    video_url: image.video_url ?? null,
    video_duration_seconds:
      image.video_duration_seconds == null
        ? null
        : Number(image.video_duration_seconds),
  };
}

function classificationStatusFromMetadata(metadata) {
  const m =
    metadata && typeof metadata === "object"
      ? metadata
      : parseImageMetadataFromDb(metadata);
  const band = m?.ai?.classification?.band;
  if (band === "pending") return "pending";
  if (band === "disabled") return "not_requested";
  return "ready";
}

function buildInitialUploadMetadata(
  imageIntel,
  { classificationPending = true } = {},
) {
  const base =
    imageIntel && typeof imageIntel === "object" ? { ...imageIntel } : {};
  return {
    ...base,
    ai: {
      classification: {
        band: classificationPending ? "pending" : "disabled",
        source: classificationPending ? "pending" : "disabled",
        confirmed: false,
        ...(!classificationPending
          ? { reason: "image_processing_disabled" }
          : {}),
      },
    },
  };
}

function mergeMetadataWithAi(currentMetadata, sanitizedIncoming) {
  const merged = { ...currentMetadata, ...sanitizedIncoming };
  if (sanitizedIncoming.ai && typeof sanitizedIncoming.ai === "object") {
    merged.ai = {
      ...(currentMetadata.ai || {}),
      ...sanitizedIncoming.ai,
      classification: {
        ...(currentMetadata.ai?.classification || {}),
        ...(sanitizedIncoming.ai.classification || {}),
      },
    };
  }
  return merged;
}

function toPublicImagePayload(image, metadataOverride, extra = {}) {
  const metadata =
    metadataOverride !== undefined
      ? metadataOverride
      : parseImageMetadataFromDb(image.metadata);
  return {
    id: image.id,
    profile_id: image.profile_id,
    path: image.path,
    public_url: image.public_url,
    is_primary: !!image.is_primary,
    label: image.label,
    sort: image.sort,
    created_at: image.created_at,
    updated_at: image.updated_at,
    has_original: !!(image.original_path || image.original_public_url),
    metadata,
    classification_status: classificationStatusFromMetadata(metadata),
    // Owner-visible moderation state (WS10): `review` renders as a plain-text
    // "Under review" state in the talent UI; agencies/public never receive
    // these rows at all (query-level filter in profile-visibility.js).
    moderation_status: image.moderation_status ?? null,
    ...structuredFieldsFromImageRow(image),
    ...extra,
  };
}

/**
 * Derived release_on_file: true when a model-release artifact exists for the
 * image OR the rights row carries a model_release_ref. Safe if the releases
 * table has not been migrated yet.
 */
async function imageReleaseOnFile(imageId) {
  let rightsRow = null;
  try {
    rightsRow = await knex("image_rights")
      .where({ image_id: imageId })
      .first();
  } catch {
    rightsRow = null;
  }
  let releaseRow = null;
  const hasReleasesTable = await knex.schema
    .hasTable("image_model_releases")
    .catch(() => false);
  if (hasReleasesTable) {
    releaseRow = await knex("image_model_releases")
      .where({ image_id: imageId })
      .first()
      .catch(() => null);
  }
  return Boolean(
    (releaseRow &&
      (releaseRow.release_ref || releaseRow.release_url) &&
      releaseRow.signer_name &&
      releaseRow.signed_at) ||
      (rightsRow &&
        rightsRow.model_release_ref &&
        releaseRow?.signer_name &&
        releaseRow?.signed_at),
  );
}

async function normalizeProfileImageSort(trx, profileId) {
  const rows = await trx("images")
    .where({ profile_id: profileId })
    .orderBy("sort", "asc")
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .select("id");
  const updates = rows.map((row, index) =>
    trx("images")
      .where({ id: row.id })
      .update({ sort: index + 1 }),
  );
  await Promise.all(updates);
}

/**
 * Middleware to ensure profile exists for the current user
 * and attach it to req.profile for use in multer/S3 naming.
 */
const ensureProfile = async (req, res, next) => {
  const userId = req.session.userId;
  if (!userId) return next();

  let profile = await knex.transaction(async (trx) => {
    let existing = await trx("profiles").where({ user_id: userId }).first();
    if (existing) return existing;

    let userQuery = trx("users").where({ id: userId });
    if (
      trx.client.config.client === "pg" ||
      trx.client.config.client === "postgresql"
    ) {
      userQuery = userQuery.forUpdate();
    }
    const user = await userQuery.first();
    if (!user) return null;

    // Re-check inside transaction after optional row lock.
    existing = await trx("profiles").where({ user_id: userId }).first();
    if (existing) return existing;

    const emailParts = user.email.split("@")[0];
    const placeholderFirstName =
      emailParts.charAt(0).toUpperCase() + emailParts.slice(1).split(".")[0];
    const placeholderLastName = "User";
    const profileId = uuidv4();
    const slug = await ensureUniqueSlug(
      trx,
      "profiles",
      `${placeholderFirstName}-${placeholderLastName}`,
    );

    await trx("profiles").insert({
      id: profileId,
      user_id: userId,
      slug,
      first_name: placeholderFirstName,
      last_name: placeholderLastName,
      city: "Not specified",
      height_cm: 0,
      bio_raw: "",
      bio_curated: "",
      is_pro: false,
    });

    return trx("profiles").where({ id: profileId }).first();
  });
  if (!profile) {
    if (req.session) req.session.destroy(() => {});
    return res.status(401).json({ success: false, message: "User not found" });
  }

  req.profile = profile;
  next();
};

/**
 * GET /api/talent/media/recent
 * Get 8 most recent uploads for dashboard gallery
 */
router.get(
  "/recent",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const profile = await knex("profiles").where({ user_id: userId }).first();

    if (!profile) return res.json({ success: true, images: [] });

    await reclaimProviderAccountAvatarSeeds(knex, {
      userId,
      profileId: profile.id,
    });

    const images = excludeProviderAccountAvatarImages(
      await knex("images")
        .where({ profile_id: profile.id })
        .orderBy("created_at", "desc")
        .limit(8)
        .select(
          "id",
          "path",
          "public_url",
          "is_primary",
          "metadata",
          "sort",
          "created_at",
          "absolute_path",
          // storage_key is what marks a row as our own upload rather than a
          // provider avatar; without it the filter hides real R2 images.
          "storage_key",
          "image_type",
          "asset_kind",
        ),
    );

    return res.json({
      success: true,
      images: images.map((img) => ({
        id: img.id,
        url: img.public_url || img.path,
        uploaded_at: img.created_at,
      })),
    });
  }),
);

/**
 * GET /api/talent/media/sets
 * List image sets for the current profile (newest first).
 */
router.get(
  "/sets",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const profile = await knex("profiles").where({ user_id: userId }).first();

    if (!profile) {
      return res.json({ success: true, sets: [] });
    }

    const rows = await knex("image_sets")
      .where({ profile_id: profile.id })
      .orderBy("created_at", "desc")
      .select(
        "id",
        "profile_id",
        "kind",
        "name",
        "is_current",
        "created_at",
        "retired_at",
      );

    return res.json({
      success: true,
      sets: rows.map((r) => imageSetRowToApi(r)),
    });
  }),
);

/**
 * POST /api/talent/media/sets
 * Create an image set; optional is_current clears other current sets for the same kind.
 */
router.post(
  "/sets",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const kindParsed = parseImageSetKind(req.body?.kind);
    if (!kindParsed.ok) {
      return res
        .status(400)
        .json({ success: false, message: kindParsed.error });
    }
    const nameParsed = parseImageSetName(req.body?.name);
    if (!nameParsed.ok) {
      return res
        .status(400)
        .json({ success: false, message: nameParsed.error });
    }
    const currentParsed = parseOptionalBooleanCurrent(req.body?.is_current);
    if (!currentParsed.ok) {
      return res
        .status(400)
        .json({ success: false, message: currentParsed.error });
    }

    const userId = req.session.userId;
    let profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: "Profile not found" });
    }

    const newId = uuidv4();
    const kind = kindParsed.value;

    await knex.transaction(async (trx) => {
      if (currentParsed.value) {
        await trx("image_sets")
          .where({ profile_id: profile.id, kind })
          .update({ is_current: false });
      }
      await trx("image_sets").insert({
        id: newId,
        profile_id: profile.id,
        kind,
        name: nameParsed.value,
        is_current: !!currentParsed.value,
        created_at: trx.fn.now(),
        retired_at: null,
      });
    });

    const row = await knex("image_sets").where({ id: newId }).first();

    return res.status(201).json({
      success: true,
      set: imageSetRowToApi(row),
    });
  }),
);

/**
 * PATCH /api/talent/media/sets/:id/current
 * Mark this set as current for its kind; unset others for the same profile + kind.
 */
router.patch(
  "/sets/:id/current",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const setId = req.params.id;
    if (!isUuid(setId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid set id",
      });
    }

    const userId = req.session.userId;

    const existing = await knex("image_sets")
      .select("image_sets.*")
      .leftJoin("profiles", "image_sets.profile_id", "profiles.id")
      .where("image_sets.id", setId)
      .where("profiles.user_id", userId)
      .first();

    if (!existing) {
      return res.status(404).json({ success: false, message: "Set not found" });
    }

    await knex.transaction(async (trx) => {
      await trx("image_sets")
        .where({
          profile_id: existing.profile_id,
          kind: existing.kind,
        })
        .update({ is_current: false });

      await trx("image_sets").where({ id: setId }).update({ is_current: true });
    });

    const row = await knex("image_sets").where({ id: setId }).first();

    return res.json({
      success: true,
      set: imageSetRowToApi(row),
    });
  }),
);

/** Netlify/Lambda cannot serve /uploads from disk; R2 (or USE_R2) is required in production. */
function requirePersistentUploadStorage(req, res, next) {
  const useR2 =
    (config.nodeEnv === "production" || process.env.USE_R2 === "true") &&
    config.r2.bucket;
  if (config.isServerless && !useR2) {
    return res.status(503).json({
      success: false,
      error: "upload_storage_unavailable",
      message:
        "Image storage is not configured for production. Set R2_BUCKET and Cloudflare R2 credentials in Netlify environment variables.",
    });
  }
  return next();
}

/**
 * Upload pipeline, phase 1 — encode, store and moderate ONE file.
 *
 * Takes no `trx` and touches no database connection, deliberately. Everything
 * in here is CPU (two Sharp encodes, forensics, computeBestMatte) plus network
 * I/O to three other services (three R2 PutObjects, the moderation provider
 * with its 8s timeout, and the CSAM screen). On a request carrying the maximum
 * twelve files that is tens of seconds of work with no SQL in it at all, and it
 * used to run inside `knex.transaction`. See the block comment on phase 2 for
 * why that mattered.
 *
 * Returns `{ rejected: true, artifact }` when moderation blocks the image — the
 * caller purges the stored bytes and reports the file as failed — otherwise the
 * full set of values the insert needs.
 */
async function prepareUploadedFile(file, { profile, structuredInsert }) {
  const processed = await processImage(file, profile.id);
  const stored = fieldsFromProcessed(processed);
  const artifact = {
    storage_key: stored.storage_key,
    absolute_path: stored.absolute_path,
  };

  // --- Content moderation (legal audit Phase 1) ---
  // Analyze the exact processed bytes we persisted. Fails toward `review`;
  // never auto-approves uncertain content.
  let moderation;
  try {
    moderation = await analyzeImageBuffer(processed.processedBuffer);
  } catch (modErr) {
    moderation = {
      status: MODERATION_STATUS.REVIEW,
      reason: "moderation_error",
      flags: { error: modErr.message },
    };
  }
  const modStatus = moderation.status;
  let isRejected = modStatus === MODERATION_STATUS.REJECTED;
  let isReview = modStatus === MODERATION_STATUS.REVIEW;

  const csamScreen = await screenImageForCsam(processed.processedBuffer, {
    moderationFlags: moderation.flags,
    moderationReason: moderation.reason,
  });
  if (csamScreen.shouldBlock) {
    isRejected = true;
  }
  if (csamScreen.shouldEscalate) {
    isReview = true;
  }
  const effectiveModStatus = isRejected
    ? MODERATION_STATUS.REJECTED
    : isReview
      ? MODERATION_STATUS.REVIEW
      : modStatus;

  if (isRejected) {
    // Never persisted. The caller schedules the stored bytes for removal.
    return { rejected: true, artifact };
  }

  const initialMetadata = buildInitialUploadMetadata(stored.imageIntel, {
    classificationPending: imageAiProcessingAllowed(profile),
  });
  // A framing value chosen in the upload form is a direct talent declaration,
  // not an AI suggestion. Preserve that provenance so conservative agency-spec
  // matching can rely on the exact label.
  if (structuredInsert.shot_type) {
    initialMetadata.ai.classification = {
      ...initialMetadata.ai.classification,
      source: "user",
      confirmed: true,
      band: "confirmed",
      shot_type: {
        value: structuredInsert.shot_type,
        confidence: 1,
      },
    };
  }

  return {
    rejected: false,
    artifact,
    imageId: uuidv4(),
    stored,
    moderation,
    csamScreen,
    effectiveModStatus,
    isReview,
    initialMetadata,
  };
}

/**
 * POST /api/talent/media
 * Upload multiple images (max 12)
 */
router.post(
  "/",
  requireRole("TALENT"),
  ensureProfile,
  requirePersistentUploadStorage,
  upload.array("media", 12),
  asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one image to upload.",
      });
    }

    const profile = req.profile;
    // NOTE: the "does a hero already exist?" read used to live here. It now
    // happens inside the insert transaction — phase 1 below runs for seconds
    // before any row is written, so a value read at this point would be stale
    // by the time it decides the one-hero invariant.

    const structuredParsed = parseImageStructuredFieldsFromBody(req.body);
    if (!structuredParsed.ok) {
      return res.status(400).json({
        success: false,
        message: structuredParsed.error,
      });
    }
    const structuredInsert = { ...structuredParsed.values };
    if (structuredInsert.set_id) {
      const setRow = await knex("image_sets")
        .where({ id: structuredInsert.set_id, profile_id: profile.id })
        .first();
      if (!setRow) {
        return res.status(400).json({
          success: false,
          message: "Invalid set_id for this profile",
        });
      }
    }

    const uploadBlock = minorBlocksSensitiveImage(profile, structuredInsert);
    if (uploadBlock) {
      return respondMinorImageBlock(res, uploadBlock);
    }
    // Audit P0-8: an unconsented minor's uploads default fully private and the
    // client-declared shot/style metadata is NOT trusted to relax this.
    const forcedPrivate = forcedPrivateColumns(profile);
    const hasCapturedAtColumn = await knex.schema.hasColumn(
      "images",
      "captured_at",
    );
    // Only persist a client-provided shoot date when the column exists.
    if (!hasCapturedAtColumn) {
      delete structuredInsert.captured_at;
    }
    const hasModerationColumns = await knex.schema.hasColumn(
      "images",
      "moderation_status",
    );
    const hasModerationQueue = hasModerationColumns
      ? await knex.schema.hasTable("moderation_queue")
      : false;
    const hasImageRightsTable = await knex.schema.hasTable("image_rights");

    const uploadedImages = [];
    const uploadedImageIds = [];
    const failedFiles = [];
    let heroSet = false;
    let firstUploadedImageId = null;
    // Every object this request wrote to storage, in file order. A failure at
    // any later point compensates against this list.
    const processedArtifacts = [];
    const rejectedArtifacts = [];
    // Files that passed moderation and are waiting to be inserted.
    const prepared = [];
    // TEMP DIAGNOSTIC — remove once the missing-commit cause is found.
    // Uploads return 200 with a populated uploadedImages array while no row
    // reaches the database, and non-transactional writes from the same request
    // (activities, sessions) DO land. These three numbers separate the possible
    // causes: insert never ran / COMMIT silently discarded / row removed after.
    // Kept deliberately: the phase split below removes the most likely cause
    // (a transaction held open across ~20s of third-party I/O, so a severed or
    // recycled connection lands mid-transaction) but does not prove it was the
    // cause, so the instrumentation stays until production logs say so.
    const diag = {
      inTxnCount: null,
      txnResolved: false,
      afterCommitCount: null,
    };
    try {
      // ===================================================================
      // PHASE 1 — encode, store, moderate. NO pooled connection is held.
      //
      // This ran inside the transaction until now. Per file it is two Sharp
      // encodes, forensics, computeBestMatte, three R2 PutObjects, a
      // moderation call with an 8s timeout, and a CSAM screen — up to twelve
      // files, none of it SQL. On Netlify the pg pool is max 5 with a 10s
      // acquire timeout and the whole function budget is 26s, so a single
      // upload could pin a connection for the entire request and three
      // concurrent uploads on one container starved every other route on it.
      // A transaction is for database work; this is not database work.
      // ===================================================================
      for (const file of req.files) {
        try {
          const item = await prepareUploadedFile(file, {
            profile,
            structuredInsert,
          });
          processedArtifacts.push(item.artifact);

          if (item.rejected) {
            // Do not persist the image row; the stored bytes are purged once
            // the request has finished deciding what else to keep.
            rejectedArtifacts.push(item.artifact);
            failedFiles.push({
              name: file.originalname || "Unknown file",
              message:
                "Image was blocked by automated content moderation and was not saved.",
            });
            continue;
          }

          item.fileName = file.originalname || "Unknown file";
          prepared.push(item);
        } catch (fileError) {
          // Keep the real cause. Replacing it with a bare string made every
          // upload failure — Sharp, R2 PutObject, and DB constraint errors
          // alike — indistinguishable in the logs.
          console.error("[Media Upload] File failed:", {
            fileName: file.originalname || "Unknown file",
            mimetype: file.mimetype,
            bytes: file.size ?? file.buffer?.length ?? null,
            name: fileError?.name,
            message: fileError?.message,
            // pg surfaces constraint violations here; undefined elsewhere.
            code: fileError?.code,
            constraint: fileError?.constraint,
            column: fileError?.column,
            table: fileError?.table,
            detail: fileError?.detail,
            stack: fileError?.stack,
          });
          const err = new Error("Failed to process image", {
            cause: fileError,
          });
          err.fileName = file.originalname || "Unknown file";
          throw err;
        }
      }

      // ===================================================================
      // PHASE 2 — the transaction. Database statements only, no network I/O
      // to anything but Postgres, so it holds a connection for milliseconds
      // instead of tens of seconds.
      //
      // FAILURE SEMANTICS — WHAT THIS TRADE COSTS, AND WHY IT IS THE RIGHT
      // DIRECTION.
      //
      // Before: bytes and rows were written under one transaction, so a
      // failed insert rolled the rows back and the catch below deleted the
      // objects — at the price of the pool problem above.
      //
      // After: the object exists in R2 before the row exists in Postgres, so
      // the two can now diverge. The three ways to handle that:
      //
      //   (a) Write a placeholder row before uploading, then fill it in.
      //       Rejected. It replaces an invisible orphan with a VISIBLE one:
      //       a row in `images` whose storage_key resolves to nothing renders
      //       as a broken frame in the book, breaks comp-card composition
      //       (which fetches pixels by key), and would need its own reaper
      //       plus a schema-level "incomplete" state that every read path in
      //       the app would have to learn about.
      //
      //   (b) Compensating delete. CHOSEN. Ordering the writes
      //       object-then-row makes the dangerous divergence — a row with no
      //       object — impossible, and leaves only the harmless one: an
      //       object with no row. Nothing in the product reads R2 by prefix;
      //       every read path starts from an `images` row, so an unreferenced
      //       object is invisible to talent, to agencies, to the PDF renderer
      //       and to account deletion's key derivation. The catch below (and
      //       the post-commit verification after it) deletes exactly the
      //       objects whose rows did not land, which closes the common cases:
      //       a failed insert, a rolled-back batch, a lost commit.
      //
      //   (c) Accept and document only. Rejected as the whole answer, but it
      //       is the honest residual: if the process dies between the R2 put
      //       and the compensating delete — a Lambda timeout, an OOM — the
      //       object survives unreferenced and nothing reclaims it today.
      //       Bounded (a few hundred KB per file, only on hard failures) and
      //       already the accepted outcome for moderation-rejected uploads,
      //       whose purge is likewise best-effort. A sweeper comparing the
      //       `profiles/<id>/` prefix against `images.storage_key` is the
      //       proper fix and is deliberately NOT in this change.
      // ===================================================================
      if (prepared.length > 0) {
        await knex.transaction(async (trx) => {
          // Read inside the transaction, not before phase 1: seconds of
          // encoding and uploading now sit between the two, and this value
          // decides the one-hero invariant.
          const currentPrimary = await trx("images")
            .where({ is_primary: true, profile_id: profile.id })
            .first();
          const hasValidHero = !!currentPrimary;

          const maxSortRow = await trx("images")
            .where({ profile_id: profile.id })
            .max({ maxSort: "sort" })
            .first();
          let nextSort = Number(maxSortRow?.maxSort || 0) + 1;

          for (const item of prepared) {
            const { imageId, stored, initialMetadata, moderation, csamScreen } =
              item;
            const sort = nextSort++;
            item.sort = sort;

            await trx("images").insert({
              id: imageId,
              profile_id: profile.id,
              path: stored.path,
              public_url: stored.public_url,
              storage_key: stored.storage_key,
              absolute_path: stored.absolute_path,
              delivery_mime_type: stored.delivery_mime_type,
              delivery_size_bytes: stored.delivery_size_bytes,
              delivery_width_px: stored.delivery_width_px,
              delivery_height_px: stored.delivery_height_px,
              delivery_metadata_recorded_at: trx.fn.now(),
              label: "Portfolio image",
              sort: sort,
              metadata: JSON.stringify(initialMetadata),
              // Recency honesty (audit P0 #3): never silently stamp
              // captured_at = now(). A real shoot date comes only from the
              // client (structuredInsert.captured_at, spread below); otherwise
              // it stays NULL and the UI prompts for it later.
              ...(hasModerationColumns
                ? {
                    moderation_status: item.effectiveModStatus,
                    moderation_reason: moderation.reason || null,
                    moderated_at: trx.fn.now(),
                  }
                : {}),
              ...structuredInsert,
              // Safety override: wins over any client-declared exclude_* flags.
              ...forcedPrivate,
            });

            if (hasImageRightsTable) {
              await trx("image_rights")
                .insert({
                  id: uuidv4(),
                  image_id: imageId,
                  copyright_owner: null,
                  photographer_name: null,
                  license_type: null,
                  usage_scope: null,
                  territory: null,
                  start_at: null,
                  expires_at: null,
                  exclusive: false,
                  model_release_ref: null,
                  rights_status: null,
                  notes: null,
                  created_at: trx.fn.now(),
                  updated_at: trx.fn.now(),
                })
                .onConflict("image_id")
                .ignore();
            }

            // Images flagged for review are not visible to agencies/public
            // until a moderator approves them — enqueue for human review
            // (WS10: `review` must always be a visible, actionable queue
            // state, never silent limbo).
            if (item.isReview && hasModerationQueue) {
              const queueFlags = {
                ...(moderation.flags || {}),
                ...(csamScreen.flags || {}),
                ...(csamScreen.shouldEscalate ? { csam_escalation: true } : {}),
              };
              await enqueueImageForReview(trx, {
                imageId,
                profileId: profile.id,
                flags: queueFlags,
              });
            }

            if (csamScreen.shouldEscalate) {
              await recordCsamEscalation(trx, {
                imageId,
                profileId: profile.id,
                provider: csamScreen.provider,
                severity: csamScreen.severity,
                flags: csamScreen.flags,
              });
            }

            // Only auto-promote a visible (approved/pending) image to hero —
            // a flagged image must never surface on the public profile.
            if (!hasValidHero && !heroSet && !item.isReview) {
              // Two plain updates, not a CASE with bound booleans: Postgres
              // types untyped binds inside CASE as text, so the single-statement
              // form failed with 42804 "column is_primary is of type boolean but
              // expression is of type text" and broke every first upload. Both
              // statements share the transaction, so the one-hero invariant
              // still holds atomically. Matches the idiom in casting.js.
              await trx("images")
                .where({ profile_id: profile.id })
                .update({ is_primary: false });
              await trx("images")
                .where({ id: imageId })
                .update({ is_primary: true });
              heroSet = true;
            }

            if (!firstUploadedImageId) firstUploadedImageId = imageId;
          }

          // Fallback: if every uploaded image was flagged for review the in-loop
          // promotion was skipped for all of them, leaving heroSet false. Guarantee
          // the DB invariant (exactly one is_primary) by promoting the first
          // uploaded image regardless of its moderation status. The visibility
          // filter already hides review images from agencies/public, so this is
          // safe — it only ensures the owner's profile has a cover image.
          if (!hasValidHero && !heroSet && firstUploadedImageId) {
            await trx("images")
              .where({ profile_id: profile.id })
              .update({ is_primary: false });
            await trx("images")
              .where({ id: firstUploadedImageId })
              .update({ is_primary: true });
          }

          await normalizeProfileImageSort(trx, profile.id);

          // TEMP DIAGNOSTIC: rows visible INSIDE the transaction, pre-COMMIT.
          const inTxnRows = await trx("images")
            .where({ profile_id: profile.id })
            .count({ n: "*" })
            .first();
          diag.inTxnCount = Number(inTxnRows?.n ?? -1);
        });
      }
      // Reached only if knex resolved the transaction (i.e. it believes COMMIT
      // succeeded); a rollback or failed commit rejects and lands in catch.
      diag.txnResolved = true;
    } catch (batchError) {
      console.error(
        "[Media Upload] Batch upload failed:",
        batchError,
        "cause:",
        batchError?.cause?.message || batchError?.cause || "(none)",
      );
      // Compensating delete for every object this request wrote. Routed
      // through purgeStoredImageArtifacts rather than a bare DeleteObject on
      // storage_key: phase 1 writes three objects per file (processed,
      // thumbnail, original) and only the processed key is recorded here, so
      // deleting that one alone left the other two permanently unreferenced —
      // the exact orphan this cleanup exists to prevent. The helper derives
      // the sibling keys the same way account-deletion does.
      if (processedArtifacts.length > 0) {
        await Promise.allSettled(
          processedArtifacts.map((artifact) =>
            purgeStoredImageArtifacts(artifact),
          ),
        );
      }
      failedFiles.push({
        name: batchError.fileName || "Unknown file",
        message: "Failed to process image",
      });
      return res.status(500).json({
        success: false,
        message: "Upload failed. No images were saved.",
        failedFiles,
      });
    }

    // Post-commit verification — and the source of truth for the response.
    //
    // A resolved transaction only means knex believes COMMIT succeeded. The
    // open defect above is exactly the case where that belief was wrong, and a
    // 200 carrying image ids that do not exist is the one failure the client
    // cannot detect: the UI renders them, then the next page load loses them
    // silently. One indexed SELECT on a fresh connection proves the rows are
    // readable before we claim success. It also supplies the authoritative
    // `sort` and `is_primary`, which the in-transaction values could not — both
    // are rewritten afterwards by normalizeProfileImageSort and by the
    // all-review hero fallback.
    let committedRows = [];
    if (prepared.length > 0) {
      try {
        committedRows = await knex("images")
          .where({ profile_id: profile.id })
          .whereIn(
            "id",
            prepared.map((item) => item.imageId),
          )
          .select("id", "sort", "is_primary");
      } catch (verifyErr) {
        // Treated as "nothing is provably committed" — the branch below then
        // fails the request rather than reporting an unverified success.
        console.error(
          "[Media Upload] Post-commit verification query failed:",
          verifyErr?.message || verifyErr,
        );
        committedRows = [];
      }
    }
    const committedById = new Map(committedRows.map((row) => [row.id, row]));
    // afterCommitCount is now scoped to THIS request's ids rather than every
    // row on the profile, so `inTxnCount vs afterCommitCount` still answers the
    // original question ("did the COMMIT land?") without the profile's existing
    // images masking a zero.
    diag.afterCommitCount = committedRows.length;

    for (const item of prepared) {
      const row = committedById.get(item.imageId);
      if (!row) continue;
      uploadedImages.push({
        id: item.imageId,
        path: item.stored.path,
        public_url: item.stored.public_url,
        is_primary: !!row.is_primary,
        metadata: item.initialMetadata,
        label: "Portfolio image",
        sort: row.sort ?? item.sort,
        profile_id: profile.id,
        created_at: new Date().toISOString(),
        classification_status: classificationStatusFromMetadata(
          item.initialMetadata,
        ),
        moderation_status: hasModerationColumns
          ? item.effectiveModStatus
          : undefined,
        ...structuredFieldsFromImageRow({
          ...structuredInsert,
          ...forcedPrivate,
        }),
      });
      uploadedImageIds.push(item.imageId);
    }

    console.error("[Media Upload][DIAG]", {
      profileId: profile.id,
      uploadedIds: uploadedImageIds,
      uploadedCount: uploadedImages.length,
      preparedCount: prepared.length,
      rejectedCount: rejectedArtifacts.length,
      inTxnCount: diag.inTxnCount,
      txnResolved: diag.txnResolved,
      afterCommitCount: diag.afterCommitCount,
      pgClient: knex.client?.config?.client,
      poolUsed: knex.client?.pool?.numUsed?.(),
      poolFree: knex.client?.pool?.numFree?.(),
    });

    const lostItems = prepared.filter((item) => !committedById.has(item.imageId));
    if (lostItems.length > 0) {
      // The transaction said it committed and the rows are not there. Fail
      // loudly instead of returning 200 for images that do not exist, and
      // compensate for ONLY the unreferenced objects — a partial commit must
      // never delete the bytes behind rows that did land.
      console.error(
        "[Media Upload][COMMIT LOST] Transaction resolved but rows are not readable:",
        {
          profileId: profile.id,
          expected: prepared.length,
          found: committedRows.length,
          missingIds: lostItems.map((item) => item.imageId),
        },
      );
      await Promise.allSettled(
        [...lostItems.map((item) => item.artifact), ...rejectedArtifacts].map(
          (artifact) => purgeStoredImageArtifacts(artifact),
        ),
      );
      return res.status(500).json({
        success: false,
        message:
          committedRows.length > 0
            ? `Upload failed. ${lostItems.length} image${lostItems.length > 1 ? "s" : ""} could not be saved.`
            : "Upload failed. No images were saved.",
        failedFiles: [
          ...failedFiles,
          ...lostItems.map((item) => ({
            name: item.fileName || "Unknown file",
            message: "Failed to process image",
          })),
        ],
      });
    }

    // Purge bytes for images rejected by moderation (best-effort, post-commit).
    if (rejectedArtifacts.length > 0) {
      await Promise.allSettled(
        rejectedArtifacts.map((artifact) =>
          purgeStoredImageArtifacts(artifact),
        ),
      );
    }

    if (uploadedImages.length > 0) {
      const totalImagesResult = await knex("images")
        .where({ profile_id: profile.id })
        .count({ total: "*" })
        .first();
      const totalImages = Number(
        totalImagesResult?.total || uploadedImages.length,
      );

      // Fetch latest primary image path for response
      const primary =
        (await knex("images")
          .where({ profile_id: profile.id, is_primary: true })
          .first()) || uploadedImages[0];

      await logActivity(req.session.userId, "image_uploaded", {
        profileId: profile.id,
        imageCount: uploadedImages.length,
        totalImages: totalImages,
      });

      for (const imageId of uploadedImageIds) {
        scheduleImageClassification(profile, imageId);
      }

      // Sensitive image AI (measurements / casting analysis) now lives here in
      // the media domain after profile.js's masterVisionAnalysis trigger was
      // removed. Runs on the primary image only, and only when consent allows.
      if (primary && primary.is_primary) {
        runSensitiveImageAnalysisIfAllowed(profile.id, primary);
      }

      return res.json({
        success: true,
        images: uploadedImages,
        failedFiles,
        heroImagePath: primary.path,
        totalImages: totalImages,
        message:
          failedFiles.length > 0
            ? `Uploaded ${uploadedImages.length} image${uploadedImages.length > 1 ? "s" : ""}. ${failedFiles.length} file${failedFiles.length > 1 ? "s" : ""} failed.`
            : `Successfully uploaded ${uploadedImages.length} image${uploadedImages.length > 1 ? "s" : ""}.`,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Failed to upload images.",
        failedFiles,
      });
    }
  }),
);

// ... [reorder route remains mostly the same, ensuring profile check] ...
router.put(
  "/reorder",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { imageIds } = req.body;
    if (!Array.isArray(imageIds)) {
      return res
        .status(400)
        .json({ success: false, message: "imageIds must be an array" });
    }
    if (imageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "imageIds must include at least one item",
      });
    }
    if (!imageIds.every((id) => isUuid(id))) {
      return res.status(400).json({
        success: false,
        message: "imageIds must contain valid UUIDs",
      });
    }
    if (new Set(imageIds).size !== imageIds.length) {
      return res.status(400).json({
        success: false,
        message: "imageIds must not contain duplicates",
      });
    }

    const userId = req.session.userId;
    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile)
      return res
        .status(404)
        .json({ success: false, message: "Profile not found" });
    const profileImageIds = await knex("images")
      .where({ profile_id: profile.id })
      .pluck("id");
    const expectedIds = new Set(profileImageIds);
    const submittedIds = new Set(imageIds);
    if (
      expectedIds.size === 0 ||
      submittedIds.size !== expectedIds.size ||
      profileImageIds.some((id) => !submittedIds.has(id))
    ) {
      return res.status(400).json({
        success: false,
        message: "imageIds must include every profile image exactly once",
      });
    }

    await knex.transaction(async (trx) => {
      const updates = imageIds.map((id, index) => {
        return trx("images")
          .where({ id: id, profile_id: profile.id })
          .update({ sort: index + 1 });
      });
      await Promise.all(updates);
    });

    return res.json({
      success: true,
      message: "Images reordered successfully",
    });
  }),
);

/**
 * GET /api/talent/media/:id/rights
 */
router.get(
  "/:id/rights",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const imageId = req.params.id;
    const userId = req.session.userId;

    const image = await knex("images")
      .select("images.id")
      .leftJoin("profiles", "images.profile_id", "profiles.id")
      .where("images.id", imageId)
      .where("profiles.user_id", userId)
      .first();

    if (!image) {
      return res
        .status(404)
        .json({ success: false, message: "Image not found" });
    }

    const row = await knex("image_rights").where({ image_id: imageId }).first();
    const releaseOnFile = await imageReleaseOnFile(imageId);

    return res.json({
      success: true,
      rights: imageRightsRowToApi(row),
      release_on_file: releaseOnFile,
    });
  }),
);

/**
 * PUT /api/talent/media/:id/rights
 * Partial update of rights row (upsert). Ownership enforced via profile.user_id.
 */
router.put(
  "/:id/rights",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const imageId = req.params.id;
    const userId = req.session.userId;

    const image = await knex("images")
      .select("images.id")
      .leftJoin("profiles", "images.profile_id", "profiles.id")
      .where("images.id", imageId)
      .where("profiles.user_id", userId)
      .first();

    if (!image) {
      return res
        .status(404)
        .json({ success: false, message: "Image not found" });
    }

    const pr = parseImageRightsPatchFromBody(req.body);
    if (!pr.ok) {
      return res.status(400).json({ success: false, message: pr.error });
    }
    if (!pr.patch || Object.keys(pr.patch).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No rights fields to update",
      });
    }

    const existingRightsRow = await knex("image_rights")
      .where({ image_id: imageId })
      .first();
    const mergedRights = {
      ...(existingRightsRow || {}),
      ...pr.patch,
    };
    const mergedStatus = normalizeRightsStatus(mergedRights.rights_status);
    if (mergedStatus === "cleared") {
      const hasLicenseType = hasText(mergedRights.license_type);
      const hasCredit = hasText(mergedRights.copyright_owner)
        || hasText(mergedRights.photographer_name);
      if (!hasLicenseType || !hasCredit) {
        return res.status(400).json({
          success: false,
          message:
            "rights_status 'cleared' requires license_type and either copyright_owner or photographer_name.",
        });
      }
    }

    await knex.transaction(async (trx) => {
      const existing = existingRightsRow;
      if (existing) {
        await trx("image_rights")
          .where({ image_id: imageId })
          .update({
            ...pr.patch,
            updated_at: trx.fn.now(),
          });
      } else {
        await trx("image_rights").insert({
          image_id: imageId,
          id: uuidv4(),
          copyright_owner: null,
          photographer_name: null,
          license_type: null,
          usage_scope: null,
          territory: null,
          start_at: null,
          expires_at: null,
          exclusive: false,
          model_release_ref: null,
          rights_status: null,
          notes: null,
          ...pr.patch,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
      }
    });

    const row = await knex("image_rights").where({ image_id: imageId }).first();
    const releaseOnFile = await imageReleaseOnFile(imageId);

    return res.json({
      success: true,
      rights: imageRightsRowToApi(row),
      release_on_file: releaseOnFile,
    });
  }),
);

/**
 * GET /api/talent/media/:id/model-release
 * Fetch the model-release artifact for an image (P1 #6).
 */
router.get(
  "/:id/model-release",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const imageId = req.params.id;
    const userId = req.session.userId;

    const image = await knex("images")
      .select("images.id")
      .leftJoin("profiles", "images.profile_id", "profiles.id")
      .where("images.id", imageId)
      .where("profiles.user_id", userId)
      .first();

    if (!image) {
      return res
        .status(404)
        .json({ success: false, message: "Image not found" });
    }

    const hasReleasesTable = await knex.schema.hasTable("image_model_releases");
    const row = hasReleasesTable
      ? await knex("image_model_releases").where({ image_id: imageId }).first()
      : null;

    return res.json({
      success: true,
      release: imageModelReleaseRowToApi(row),
    });
  }),
);

/**
 * PUT /api/talent/media/:id/model-release
 * Attach / record a model-release artifact (upsert). Ownership via profile.user_id.
 */
router.put(
  "/:id/model-release",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const imageId = req.params.id;
    const userId = req.session.userId;

    const image = await knex("images")
      .select("images.id")
      .leftJoin("profiles", "images.profile_id", "profiles.id")
      .where("images.id", imageId)
      .where("profiles.user_id", userId)
      .first();

    if (!image) {
      return res
        .status(404)
        .json({ success: false, message: "Image not found" });
    }

    const hasReleasesTable = await knex.schema.hasTable("image_model_releases");
    if (!hasReleasesTable) {
      return res.status(503).json({
        success: false,
        message: "Model release storage is not available",
      });
    }

    const pr = parseImageModelReleasePatchFromBody(req.body);
    if (!pr.ok) {
      return res.status(400).json({ success: false, message: pr.error });
    }
    if (!pr.patch || Object.keys(pr.patch).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No model release fields to update",
      });
    }

    await knex.transaction(async (trx) => {
      const existing = await trx("image_model_releases")
        .where({ image_id: imageId })
        .first();
      if (existing) {
        await trx("image_model_releases")
          .where({ image_id: imageId })
          .update({ ...pr.patch, updated_at: trx.fn.now() });
      } else {
        await trx("image_model_releases").insert({
          id: uuidv4(),
          image_id: imageId,
          release_ref: null,
          release_url: null,
          signer_name: null,
          signer_role: null,
          signed_at: null,
          parties: null,
          notes: null,
          ...pr.patch,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
      }

      // Mirror a pointer into image_rights.model_release_ref when present so the
      // rights "cleared" logic and release_on_file stay consistent.
      const ref = pr.patch.release_ref || pr.patch.release_url || null;
      if (ref) {
        const hasRights = await trx.schema.hasTable("image_rights");
        if (hasRights) {
          const rightsRow = await trx("image_rights")
            .where({ image_id: imageId })
            .first();
          if (rightsRow) {
            await trx("image_rights")
              .where({ image_id: imageId })
              .update({ model_release_ref: ref, updated_at: trx.fn.now() });
          } else {
            await trx("image_rights")
              .insert({
                id: uuidv4(),
                image_id: imageId,
                model_release_ref: ref,
                exclusive: false,
                created_at: trx.fn.now(),
                updated_at: trx.fn.now(),
              })
              .onConflict("image_id")
              .ignore();
          }
        }
      }
    });

    const row = await knex("image_model_releases")
      .where({ image_id: imageId })
      .first();

    return res.json({
      success: true,
      release: imageModelReleaseRowToApi(row),
    });
  }),
);

/**
 * POST /api/talent/media/video
 * Record a motion (video) asset by URL reference (P2 video). The image binary
 * pipeline is untouched; this stores a row with asset_kind='video'.
 * Body: { video_url, video_mime?, video_duration_seconds?, captured_at?, label?, set_id? }
 */
router.post(
  "/video",
  requireRole("TALENT"),
  ensureProfile,
  asyncHandler(async (req, res) => {
    const profile = req.profile;

    const hasAssetKind = await knex.schema.hasColumn("images", "asset_kind");
    const hasVideoUrl = await knex.schema.hasColumn("images", "video_url");
    if (!hasAssetKind || !hasVideoUrl) {
      return res.status(503).json({
        success: false,
        message: "Motion assets are not available",
      });
    }

    const parsed = parseVideoAssetFromBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    // Optional set association, validated against the profile.
    const structuredParsed = parseImageStructuredFieldsFromBody(req.body);
    if (!structuredParsed.ok) {
      return res
        .status(400)
        .json({ success: false, message: structuredParsed.error });
    }
    const setId = structuredParsed.values.set_id || null;
    if (setId) {
      const setRow = await knex("image_sets")
        .where({ id: setId, profile_id: profile.id })
        .first();
      if (!setRow) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid set_id for this profile" });
      }
    }

    const hasDurationColumn = await knex.schema.hasColumn(
      "images",
      "video_duration_seconds",
    );
    const hasCapturedAtColumn = await knex.schema.hasColumn(
      "images",
      "captured_at",
    );

    const imageId = uuidv4();
    const maxSortRow = await knex("images")
      .where({ profile_id: profile.id })
      .max({ maxSort: "sort" })
      .first();
    const sort = Number(maxSortRow?.maxSort || 0) + 1;

    const insertRow = {
      id: imageId,
      profile_id: profile.id,
      path: null,
      public_url: null,
      label: parsed.values.label || "Motion asset",
      sort,
      metadata: JSON.stringify({}),
      asset_kind: "video",
      video_url: parsed.values.video_url,
      // A video is never a portfolio hero image.
      is_primary: false,
      ...(structuredParsed.values.image_type
        ? { image_type: structuredParsed.values.image_type }
        : {}),
      ...(setId ? { set_id: setId } : {}),
      ...(hasDurationColumn && parsed.values.video_duration_seconds != null
        ? { video_duration_seconds: parsed.values.video_duration_seconds }
        : {}),
      ...(hasCapturedAtColumn && parsed.values.captured_at != null
        ? { captured_at: parsed.values.captured_at }
        : {}),
    };

    await knex("images").insert(insertRow);

    const fresh = await knex("images").where({ id: imageId }).first();

    await logActivity(req.session.userId, "video_asset_added", {
      profileId: profile.id,
      imageId,
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: "Motion asset added",
      image: toPublicImagePayload(fresh, undefined, { release_on_file: false }),
    });
  }),
);

router.put(
  "/:id",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const imageId = req.params.id;
    const userId = req.session.userId;

    const image = await knex("images")
      .select(
        "images.*",
        "profiles.date_of_birth",
        "profiles.guardian_consent_at",
        "profiles.work_permit_on_file",
        "profiles.ai_processing_consent",
      )
      .leftJoin("profiles", "images.profile_id", "profiles.id")
      .where("images.id", imageId)
      .where("profiles.user_id", userId)
      .first();

    if (!image)
      return res
        .status(404)
        .json({ success: false, message: "Image not found" });

    const patch = {};

    const currentMetadata = parseImageMetadataFromDb(image.metadata);
    let updatedMetadata = currentMetadata;

    if (req.body.metadata !== undefined) {
      const incoming = normalizeIncomingMetadataPatch(req.body);
      const sanitizedIncoming = sanitizeIncomingMetadataPatch(incoming);
      updatedMetadata = mergeMetadataWithAi(currentMetadata, sanitizedIncoming);
      const metadataSizeBytes = Buffer.byteLength(
        JSON.stringify(updatedMetadata),
        "utf8",
      );
      if (metadataSizeBytes > IMAGE_METADATA_MAX_BYTES) {
        return res.status(400).json({
          success: false,
          message: "Image metadata is too large",
        });
      }
      patch.metadata = updatedMetadata;
    }

    const structuredParsed = parseImageStructuredFieldsFromBody(req.body);
    if (!structuredParsed.ok) {
      return res.status(400).json({
        success: false,
        message: structuredParsed.error,
      });
    }
    // Resolve the post-update state (existing row + patch + merged metadata) so
    // the minor gate evaluates what the image WOULD become — including the PITS
    // body_visibility signal and whether it stays agency/public-visible.
    const sv = structuredParsed.values;
    const resolvedShot = Object.hasOwn(sv, "shot_type")
      ? sv.shot_type
      : image.shot_type;
    const resolvedStyle = Object.hasOwn(sv, "style_type")
      ? sv.style_type
      : image.style_type;
    const resolvedExcludeAgency = Object.hasOwn(sv, "exclude_from_agency")
      ? sv.exclude_from_agency
      : !!image.exclude_from_agency;
    const resolvedExcludePublic = Object.hasOwn(sv, "exclude_from_public")
      ? sv.exclude_from_public
      : !!image.exclude_from_public;
    const resolvedAgencyVisible =
      !resolvedExcludeAgency || !resolvedExcludePublic;
    const patchBlock = minorBlocksSensitiveImage(image, {
      shot_type: resolvedShot,
      style_type: resolvedStyle,
      role: updatedMetadata?.role,
      body_visibility: bodyVisibilitySignalFromMetadata(updatedMetadata),
      agencyVisible: resolvedAgencyVisible,
    });
    if (patchBlock) {
      return respondMinorImageBlock(res, patchBlock);
    }
    if (structuredParsed.values.set_id) {
      const setRow = await knex("image_sets")
        .where({
          id: structuredParsed.values.set_id,
          profile_id: image.profile_id,
        })
        .first();
      if (!setRow) {
        return res.status(400).json({
          success: false,
          message: "Invalid set_id for this image",
        });
      }
    }
    Object.assign(patch, structuredParsed.values);

    if (Object.hasOwn(structuredParsed.values, "shot_type")) {
      const confirmedClassification = {
        ...(updatedMetadata?.ai?.classification || {}),
        source: "user",
        confirmed: true,
        band: "confirmed",
      };

      if (structuredParsed.values.shot_type) {
        confirmedClassification.shot_type = {
          value: structuredParsed.values.shot_type,
          confidence: 1,
        };
      } else {
        // Clearing a talent-selected frame must also remove any stale AI frame
        // suggestion. The registry matcher will then report the fact unknown.
        delete confirmedClassification.shot_type;
      }

      updatedMetadata = {
        ...updatedMetadata,
        ai: {
          ...(updatedMetadata?.ai || {}),
          classification: confirmedClassification,
        },
      };

      const metadataSizeBytes = Buffer.byteLength(
        JSON.stringify(updatedMetadata),
        "utf8",
      );
      if (metadataSizeBytes > IMAGE_METADATA_MAX_BYTES) {
        return res.status(400).json({
          success: false,
          message: "Image metadata is too large",
        });
      }
      patch.metadata = updatedMetadata;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No updatable fields provided",
      });
    }

    if (typeof patch.metadata === "object") {
      patch.metadata = JSON.stringify(patch.metadata);
    }

    await knex("images").where({ id: imageId }).update(patch);

    const fresh = await knex("images").where({ id: imageId }).first();

    await logClassificationFeedback(knex, {
      imageId,
      profileId: image.profile_id,
      beforeMeta: currentMetadata,
      afterRow: fresh,
    }).catch(() => {});

    const releaseOnFile = await imageReleaseOnFile(imageId);

    return res.json({
      success: true,
      message: "Image details updated",
      image: toPublicImagePayload(
        fresh,
        parseImageMetadataFromDb(fresh.metadata),
        { release_on_file: releaseOnFile },
      ),
    });
  }),
);

// ... [hero update remains same] ...
router.put(
  "/:id/hero",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const imageId = req.params.id;
    const userId = req.session.userId;

    const image = await knex("images")
      .select(
        "images.*",
        "profiles.id as profile_id",
        "profiles.date_of_birth",
        "profiles.guardian_consent_at",
        "profiles.work_permit_on_file",
        "profiles.ai_processing_consent",
      )
      .leftJoin("profiles", "images.profile_id", "profiles.id")
      .where("images.id", imageId)
      .where("profiles.user_id", userId)
      .first();

    if (!image) {
      return res
        .status(404)
        .json({ success: false, message: "Image not found" });
    }

    await knex.transaction(async (trx) => {
      // 1. Reset all images for this profile to NOT primary
      await trx("images")
        .where({ profile_id: image.profile_id })
        .update({ is_primary: false });

      // 2. Set the selected image as primary
      await trx("images").where({ id: imageId }).update({ is_primary: true });
    });

    // Sensitive image AI re-runs when the hero changes (relocated from
    // profile.js), consent-gated for minors / unverifiable age.
    runSensitiveImageAnalysisIfAllowed(image.profile_id, image);

    return res.json({
      success: true,
      heroImagePath: image.path,
      message: "Hero image updated",
    });
  }),
);

/**
 * DELETE /api/talent/media/:id
 * Delete an image (local and R2)
 */
router.delete(
  "/:id",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const mediaId = req.params.id;
    const userId = req.session.userId;
    let newHeroImagePath = null;

    const media = await knex("images")
      .select("images.*", "profiles.user_id")
      .leftJoin("profiles", "images.profile_id", "profiles.id")
      .where("images.id", mediaId)
      .first();

    if (!media)
      return res
        .status(404)
        .json({ success: false, message: "Image not found" });
    if (media.user_id !== userId)
      return res.status(403).json({ success: false, message: "Unauthorized" });

    const wasSubmissionReady = await captureSubmissionReadiness(
      media.profile_id,
    );

    // 1. Delete from R2 if storage_key exists
    if (media.storage_key) {
      try {
        // Delete original, processed, and thumbnail
        const uuid = path.basename(
          media.storage_key,
          path.extname(media.storage_key),
        );
        const prefix =
          media.storage_key.split("/processed/")[0] ||
          media.storage_key.split("/originals/")[0] ||
          media.storage_key.split("/thumbnails/")[0];

        const deletions = [
          s3.send(
            new DeleteObjectCommand({
              Bucket: config.r2.bucket,
              Key: media.storage_key,
            }),
          ),
          // We try to delete based on standard naming if we can derive it
          s3.send(
            new DeleteObjectCommand({
              Bucket: config.r2.bucket,
              Key: `${prefix}/originals/${uuid}.jpg`,
            }),
          ),
          s3.send(
            new DeleteObjectCommand({
              Bucket: config.r2.bucket,
              Key: `${prefix}/originals/${uuid}.png`,
            }),
          ),
          s3.send(
            new DeleteObjectCommand({
              Bucket: config.r2.bucket,
              Key: `${prefix}/originals/${uuid}.jpeg`,
            }),
          ),
          s3.send(
            new DeleteObjectCommand({
              Bucket: config.r2.bucket,
              Key: `${prefix}/thumbnails/${uuid}_400w.webp`,
            }),
          ),
        ];
        await Promise.allSettled(deletions);
      } catch (s3Err) {
        console.warn("[Media Delete] R2 deletion warning:", s3Err.message);
      }
    }

    // 2. Delete local file if absolute_path exists
    if (media.absolute_path) {
      try {
        await fs.unlink(media.absolute_path).catch(() => {});
        // Also try to unlink original and thumbnail if we can guess them
        const base = media.absolute_path.replace(".webp", "");
        await fs.unlink(`${base}_400w.webp`).catch(() => {});
      } catch (e) {
        console.warn(`[Media Delete] File unlink warning: ${e.message}`);
      }
    }

    // Handle Primary Image replacement
    if (media.is_primary) {
      const nextImage = await knex("images")
        .where({ profile_id: media.profile_id })
        .whereNot("id", mediaId)
        .orderBy("sort", "asc")
        .first();

      if (nextImage) {
        await knex("images")
          .where({ id: nextImage.id })
          .update({ is_primary: true });
        newHeroImagePath = nextImage.path;
      } else {
        newHeroImagePath = null;
      }
    } else {
      // If not primary, hero path for response remains the same
      const currentPrimary = await knex("images")
        .where({ profile_id: media.profile_id, is_primary: true })
        .first();
      newHeroImagePath = currentPrimary ? currentPrimary.path : null;
    }

    await knex("images").where({ id: mediaId }).delete();

    await notifyIfSubmissionReadinessLost(media.profile_id, wasSubmissionReady);

    return res.json({
      success: true,
      deleted: mediaId,
      heroImagePath: newHeroImagePath,
      message: "Image deleted",
    });
  }),
);

// ... [role patch remains same] ...
router.patch(
  "/:id/role",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const imageId = req.params.id;
    const userId = req.session.userId;
    const { role } = req.body;

    const VALID_ROLES = ["headshot", "full_body", "editorial", "lifestyle"];
    if (role !== null && role !== undefined && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role.` });
    }

    const image = await knex("images")
      .select(
        "images.*",
        "profiles.user_id",
        "profiles.date_of_birth",
        "profiles.guardian_consent_at",
        "profiles.work_permit_on_file",
        "profiles.ai_processing_consent",
      )
      .leftJoin("profiles", "images.profile_id", "profiles.id")
      .where("images.id", imageId)
      .where("profiles.user_id", userId)
      .first();

    if (!image)
      return res
        .status(404)
        .json({ success: false, message: "Image not found" });

    const roleBlock = minorBlocksSensitiveImage(image, {
      role,
      shot_type: image.shot_type,
      style_type: image.style_type,
      body_visibility: bodyVisibilitySignalFromMetadata(
        parseImageMetadataFromDb(image.metadata),
      ),
      agencyVisible:
        !image.exclude_from_agency || !image.exclude_from_public,
    });
    if (roleBlock) {
      return respondMinorImageBlock(res, roleBlock);
    }

    const isPostgres =
      knex.client.config.client === "pg" ||
      knex.client.config.client === "postgresql";
    if (isPostgres) {
      if (!role) {
        await knex("images")
          .where({ id: imageId })
          .update({ metadata: knex.raw(`COALESCE(metadata, '{}') - 'role'`) });
      } else {
        await knex("images")
          .where({ id: imageId })
          .update({
            metadata: knex.raw(
              `jsonb_set(COALESCE(metadata, '{}'), '{role}', ?)`,
              [JSON.stringify(role)],
            ),
          });
      }
    } else {
      let existing = parseImageMetadataFromDb(image.metadata);
      if (!role) delete existing.role;
      else existing.role = role;
      await knex("images")
        .where({ id: imageId })
        .update({ metadata: JSON.stringify(existing) });
    }

    return res.json({ success: true, id: imageId, role: role || null });
  }),
);

/**
 * POST /api/talent/media/:id/replace
 * Replace the file of an existing image in-place (same ID, same sort position).
 * On the first replacement the original file paths are stored in original_* columns so
 * the talent can later restore them. Subsequent replacements keep original_* pointing to
 * the very first uploaded file and delete the prior intermediate version from storage.
 */
router.post(
  "/:id/replace",
  requireRole("TALENT"),
  requirePersistentUploadStorage,
  upload.single("media"),
  asyncHandler(async (req, res) => {
    const imageId = req.params.id;
    if (!isUuid(imageId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid image id" });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const userId = req.session.userId;

    const image = await knex("images")
      .select(
        "images.*",
        "profiles.id as _profile_id",
        "profiles.date_of_birth",
        "profiles.guardian_consent_at",
        "profiles.ai_processing_consent",
      )
      .leftJoin("profiles", "images.profile_id", "profiles.id")
      .where("images.id", imageId)
      .where("profiles.user_id", userId)
      .first();

    if (!image) {
      return res
        .status(404)
        .json({ success: false, message: "Image not found" });
    }

    let processed;
    try {
      processed = await processImage(req.file, image.profile_id);
    } catch (err) {
      // processImage now fails closed rather than handing back the unprocessed
      // original, and it says why. Pass its own words and status through — "we
      // could not use this file, try another" is actionable, where a blanket
      // 500 tells the person nothing they can do anything about.
      return res.status(err.status || 500).json({
        success: false,
        message:
          err.status === 422 ? err.message : "Failed to process uploaded file",
      });
    }

    // Track whether the current (pre-replace) file needs to be cleaned up after the DB update.
    // Only intermediate edits are deleted; the very first original is always preserved.
    let intermediateToDelete = null;

    const stored = fieldsFromProcessed(processed);

    await knex.transaction(async (trx) => {
      const currentMeta = parseImageMetadataFromDb(image.metadata);
      const userLocked = currentMeta?.ai?.classification?.source === "user";
      const initialMetadata = buildInitialUploadMetadata(stored.imageIntel, {
        classificationPending: imageAiProcessingAllowed({
          id: image.profile_id,
          date_of_birth: image.date_of_birth,
          ai_processing_consent: image.ai_processing_consent,
        }),
      });
      const mergedMeta = {
        ...currentMeta,
        width: initialMetadata.width ?? currentMeta.width,
        height: initialMetadata.height ?? currentMeta.height,
        forensics: initialMetadata.forensics ?? currentMeta.forensics,
        ai: initialMetadata.ai,
      };
      // Pixels changed: any cached comp-card subject matte is stale. Drop it
      // so the post-replace precompute (or the PDF route's lazy path) can
      // recompute against the new bytes instead of serving the old mask.
      delete mergedMeta.matte;

      const updatePatch = {
        path: stored.path,
        public_url: stored.public_url,
        storage_key: stored.storage_key,
        absolute_path: stored.absolute_path,
        delivery_mime_type: stored.delivery_mime_type,
        delivery_size_bytes: stored.delivery_size_bytes,
        delivery_width_px: stored.delivery_width_px,
        delivery_height_px: stored.delivery_height_px,
        delivery_metadata_recorded_at: trx.fn.now(),
        metadata: JSON.stringify(mergedMeta),
      };

      if (!userLocked) {
        updatePatch.shot_type = null;
        updatePatch.style_type = null;
        updatePatch.image_type = null;
      }

      if (!image.original_path) {
        // First replacement: save the original file references — do NOT delete them.
        updatePatch.original_path = image.path;
        updatePatch.original_public_url = image.public_url || null;
        updatePatch.original_storage_key = image.storage_key || null;
        updatePatch.original_absolute_path = image.absolute_path || null;
        updatePatch.original_delivery_mime_type =
          image.delivery_mime_type || null;
        updatePatch.original_delivery_size_bytes =
          image.delivery_size_bytes ?? null;
        updatePatch.original_delivery_width_px =
          image.delivery_width_px ?? null;
        updatePatch.original_delivery_height_px =
          image.delivery_height_px ?? null;
        updatePatch.original_delivery_metadata_recorded_at =
          image.delivery_metadata_recorded_at || null;
      } else {
        // Subsequent replacement: current file is an intermediate edit → schedule for deletion.
        // original_* remains pointing to the very first file.
        intermediateToDelete = {
          storage_key: image.storage_key || null,
          absolute_path: image.absolute_path || null,
        };
      }

      await trx("images").where({ id: imageId }).update(updatePatch);
    });

    // After the DB transaction commits, clean up the intermediate file (best-effort).
    if (intermediateToDelete) {
      if (intermediateToDelete.storage_key) {
        s3.send(
          new DeleteObjectCommand({
            Bucket: config.r2.bucket,
            Key: intermediateToDelete.storage_key,
          }),
        ).catch((e) =>
          console.warn("[Media Replace] Intermediate S3 cleanup:", e.message),
        );
      }
      if (intermediateToDelete.absolute_path) {
        fs.unlink(intermediateToDelete.absolute_path).catch(() => {});
      }
    }

    const fresh = await knex("images").where({ id: imageId }).first();

    scheduleImageClassification(
      {
        id: image.profile_id,
        date_of_birth: image.date_of_birth,
        ai_processing_consent: image.ai_processing_consent,
      },
      imageId,
    );

    // Replacing the pixels of the current primary is a "primary changed" moment:
    // re-run sensitive image AI (consent-gated) on the fresh bytes.
    if (fresh && fresh.is_primary) {
      runSensitiveImageAnalysisIfAllowed(image.profile_id, fresh);
    }

    const releaseOnFile = await imageReleaseOnFile(imageId);

    return res.json({
      success: true,
      message: "Image replaced",
      image: toPublicImagePayload(fresh, undefined, {
        release_on_file: releaseOnFile,
      }),
    });
  }),
);

/**
 * POST /api/talent/media/:id/restore
 * Restore the original pre-edit file for an image that has been replaced.
 * Swaps original_* values back to path/public_url/storage_key/absolute_path,
 * clears original_* columns, and deletes the edited file from storage.
 */
router.post(
  "/:id/restore",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const imageId = req.params.id;
    if (!isUuid(imageId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid image id" });
    }

    const userId = req.session.userId;

    const image = await knex("images")
      .select("images.*")
      .leftJoin("profiles", "images.profile_id", "profiles.id")
      .where("images.id", imageId)
      .where("profiles.user_id", userId)
      .first();

    if (!image) {
      return res
        .status(404)
        .json({ success: false, message: "Image not found" });
    }

    if (!image.original_path) {
      return res.status(400).json({
        success: false,
        message:
          "No original version to restore — this image has not been edited",
      });
    }

    // The edited (current) file will be deleted after the DB update.
    const editedToDelete = {
      storage_key: image.storage_key || null,
      absolute_path: image.absolute_path || null,
    };

    await knex("images")
      .where({ id: imageId })
      .update({
        path: image.original_path,
        public_url: image.original_public_url || null,
        storage_key: image.original_storage_key || null,
        absolute_path: image.original_absolute_path || null,
        delivery_mime_type: image.original_delivery_mime_type || null,
        delivery_size_bytes: image.original_delivery_size_bytes ?? null,
        delivery_width_px: image.original_delivery_width_px ?? null,
        delivery_height_px: image.original_delivery_height_px ?? null,
        delivery_metadata_recorded_at:
          image.original_delivery_metadata_recorded_at || null,
        original_path: null,
        original_public_url: null,
        original_storage_key: null,
        original_absolute_path: null,
        original_delivery_mime_type: null,
        original_delivery_size_bytes: null,
        original_delivery_width_px: null,
        original_delivery_height_px: null,
        original_delivery_metadata_recorded_at: null,
      });

    // Delete the edited version from storage (best-effort).
    if (editedToDelete.storage_key) {
      s3.send(
        new DeleteObjectCommand({
          Bucket: config.r2.bucket,
          Key: editedToDelete.storage_key,
        }),
      ).catch((e) =>
        console.warn("[Media Restore] Edited file S3 cleanup:", e.message),
      );
    }
    if (editedToDelete.absolute_path) {
      fs.unlink(editedToDelete.absolute_path).catch(() => {});
    }

    const fresh = await knex("images").where({ id: imageId }).first();
    const releaseOnFile = await imageReleaseOnFile(imageId);
    return res.json({
      success: true,
      message: "Original image restored",
      image: toPublicImagePayload(fresh, undefined, {
        release_on_file: releaseOnFile,
      }),
    });
  }),
);

// --- Submission packages (media + comp-card intent snapshot) ---

const SUBMISSION_PACKAGE_MAX_IMAGES = 50;
const SUBMISSION_PACKAGE_MAX_LABEL = 200;
const SUBMISSION_PACKAGE_MAX_NOTES = 2000;
const SUBMISSION_PACKAGE_MAX_METADATA_BYTES = 24 * 1024;
const SUBMISSION_PACKAGE_LIST_DEFAULT = 20;
const SUBMISSION_PACKAGE_LIST_MAX = 50;

function parseSubmissionPackagePayloadFromDb(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return {};
    try {
      const parsed = JSON.parse(t);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return { ...parsed };
      }
    } catch {
      /* ignore */
    }
    return {};
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { ...raw };
  }
  return {};
}

function normalizeSubmissionPackageMetadata(bodyMetadata) {
  if (bodyMetadata == null) return { ok: true, value: {} };
  if (typeof bodyMetadata !== "object" || Array.isArray(bodyMetadata)) {
    return { ok: false, error: "metadata must be a plain object" };
  }
  let encoded;
  try {
    encoded = JSON.stringify(bodyMetadata);
  } catch {
    return { ok: false, error: "metadata is not JSON-serializable" };
  }
  if (encoded.length > SUBMISSION_PACKAGE_MAX_METADATA_BYTES) {
    return { ok: false, error: "metadata exceeds maximum size" };
  }
  return { ok: true, value: JSON.parse(encoded) };
}

function dedupeUuidImageIds(rawIds) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(rawIds)) {
    return { ok: false, error: "imageIds must be an array", ids: [] };
  }
  for (const raw of rawIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!isUuid(id)) {
      return {
        ok: false,
        error: "Each imageIds entry must be a valid UUID",
        ids: [],
      };
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length === 0) {
    return { ok: false, error: "At least one image id is required", ids: [] };
  }
  if (out.length > SUBMISSION_PACKAGE_MAX_IMAGES) {
    return {
      ok: false,
      error: `At most ${SUBMISSION_PACKAGE_MAX_IMAGES} images per package`,
      ids: [],
    };
  }
  return { ok: true, ids: out };
}

function submissionPackageRowToApi(row) {
  return {
    id: row.id,
    label: row.label,
    payload: parseSubmissionPackagePayloadFromDb(row.payload),
    createdAt: row.created_at,
  };
}

/**
 * POST /api/talent/media/submission-packages
 * Body: { imageIds: string[], metadata?: object, includeCompCard?: boolean, label?: string, notes?: string }
 */
router.post(
  "/submission-packages",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    const deduped = dedupeUuidImageIds(req.body?.imageIds);
    if (!deduped.ok) {
      return res.status(400).json({ success: false, message: deduped.error });
    }

    const metaResult = normalizeSubmissionPackageMetadata(req.body?.metadata);
    if (!metaResult.ok) {
      return res
        .status(400)
        .json({ success: false, message: metaResult.error });
    }

    const labelRaw =
      typeof req.body?.label === "string" ? req.body.label.trim() : "";
    const label = labelRaw.slice(0, SUBMISSION_PACKAGE_MAX_LABEL) || null;

    const notesRaw =
      typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
    const notes = notesRaw.slice(0, SUBMISSION_PACKAGE_MAX_NOTES) || null;

    const includeCompCard = Boolean(req.body?.includeCompCard);

    const owned = await knex("images")
      .where({ profile_id: profile.id })
      .whereIn("id", deduped.ids)
      .select("id");

    if (owned.length !== deduped.ids.length) {
      return res.status(400).json({
        success: false,
        message:
          "One or more images were not found or do not belong to your profile",
      });
    }

    const packageId = uuidv4();
    const payload = {
      version: 1,
      imageIds: deduped.ids,
      metadata: metaResult.value,
      includeCompCard,
      notes,
    };

    await knex("talent_submission_packages").insert({
      id: packageId,
      user_id: userId,
      profile_id: profile.id,
      label,
      payload,
      created_at: knex.fn.now(),
      retention_expires_at: submissionRetentionExpiry().toISOString(),
    });

    await logActivity(userId, "submission_package_created", {
      submissionPackageId: packageId,
      profileId: profile.id,
      imageCount: deduped.ids.length,
      includeCompCard,
      label: label || undefined,
    });

    const row = await knex("talent_submission_packages")
      .where({ id: packageId, user_id: userId })
      .first();

    return res.status(201).json({
      success: true,
      data: submissionPackageRowToApi(row),
    });
  }),
);

/**
 * GET /api/talent/media/submission-packages
 * Query: limit (optional, default 20, max 50)
 */
router.get(
  "/submission-packages",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    let limit = parseInt(String(req.query?.limit || ""), 10);
    if (!Number.isFinite(limit) || limit < 1) {
      limit = SUBMISSION_PACKAGE_LIST_DEFAULT;
    }
    limit = Math.min(limit, SUBMISSION_PACKAGE_LIST_MAX);

    const rows = await knex("talent_submission_packages")
      .where({ user_id: userId, profile_id: profile.id })
      .orderBy("created_at", "desc")
      .limit(limit)
      .select("id", "label", "payload", "created_at");

    return res.json({
      success: true,
      data: rows.map((r) => submissionPackageRowToApi(r)),
    });
  }),
);

/**
 * GET /api/talent/media/submission-packages/:id
 */
router.get(
  "/submission-packages/:id",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const packageId = req.params.id;
    if (!isUuid(packageId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid package id" });
    }

    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found",
        message: "Profile not found",
      });
    }

    const row = await knex("talent_submission_packages")
      .where({
        id: packageId,
        user_id: userId,
        profile_id: profile.id,
      })
      .first();

    if (!row) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "Submission package not found",
      });
    }

    return res.json({
      success: true,
      data: submissionPackageRowToApi(row),
    });
  }),
);

/**
 * GET /api/talent/media/classification-status
 * Lightweight endpoint to poll classification status of all images
 */
router.get(
  "/classification-status",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return res.json({ success: true, images: [] });
    }

    // Owner poll surface also carries the moderation state so the media UI
    // can show a plain-text "Under review" state (WS10). hasColumn-guarded
    // for the deploy-before-migrate window.
    const hasModerationColumn = await knex.schema.hasColumn(
      "images",
      "moderation_status",
    );
    const columns = ["id", "metadata", "shot_type", "image_type", "style_type"];
    if (hasModerationColumn) columns.push("moderation_status");

    const images = await knex("images")
      .where({ profile_id: profile.id })
      .select(columns);

    return res.json({
      success: true,
      images: images.map((img) => {
        const metadata = parseImageMetadataFromDb(img.metadata);
        return {
          id: img.id,
          classification_status: classificationStatusFromMetadata(metadata),
          moderation_status: hasModerationColumn
            ? (img.moderation_status ?? null)
            : null,
          shot_type: img.shot_type,
          image_type: img.image_type,
          style_type: img.style_type,
          metadata: {
            ai: metadata.ai || null,
          },
        };
      }),
    });
  }),
);

/**
 * POST /api/talent/media/bulk-delete
 * Delete multiple images (local and R2)
 */
router.post(
  "/bulk-delete",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { imageIds } = req.body;
    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "imageIds must be a non-empty array",
      });
    }
    if (!imageIds.every((id) => isUuid(id))) {
      return res.status(400).json({
        success: false,
        message: "imageIds must contain valid UUIDs",
      });
    }

    const userId = req.session.userId;
    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    const images = await knex("images")
      .where({ profile_id: profile.id })
      .whereIn("id", imageIds);

    if (images.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No matching images found",
      });
    }

    const wasSubmissionReady = await captureSubmissionReadiness(profile.id);

    // 1. Delete from R2 & local storage
    for (const media of images) {
      if (media.storage_key) {
        try {
          const uuid = path.basename(media.storage_key, path.extname(media.storage_key));
          const prefix =
            media.storage_key.split("/processed/")[0] ||
            media.storage_key.split("/originals/")[0] ||
            media.storage_key.split("/thumbnails/")[0];

          const deletions = [
            s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: media.storage_key })),
            s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: `${prefix}/originals/${uuid}.jpg` })),
            s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: `${prefix}/originals/${uuid}.png` })),
            s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: `${prefix}/originals/${uuid}.jpeg` })),
            s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: `${prefix}/thumbnails/${uuid}_400w.webp` })),
          ];
          await Promise.allSettled(deletions);
        } catch (s3Err) {
          console.warn("[Media Bulk Delete] R2 deletion warning:", s3Err.message);
        }
      }

      if (media.absolute_path) {
        try {
          await fs.unlink(media.absolute_path).catch(() => {});
          const base = media.absolute_path.replace(".webp", "");
          await fs.unlink(`${base}_400w.webp`).catch(() => {});
        } catch (e) {
          console.warn(`[Media Bulk Delete] File unlink warning: ${e.message}`);
        }
      }
    }

    // Check if primary image is among deleted ones
    const deletedPrimary = images.find((img) => img.is_primary);
    let newHeroImagePath = null;

    await knex.transaction(async (trx) => {
      // Delete images from DB
      await trx("images")
        .where({ profile_id: profile.id })
        .whereIn("id", imageIds)
        .delete();

      if (deletedPrimary) {
        const nextImage = await trx("images")
          .where({ profile_id: profile.id })
          .orderBy("sort", "asc")
          .first();

        if (nextImage) {
          await trx("images")
            .where({ id: nextImage.id })
            .update({ is_primary: true });
          newHeroImagePath = nextImage.path;
        }
      } else {
        const currentPrimary = await trx("images")
          .where({ profile_id: profile.id, is_primary: true })
          .first();
        newHeroImagePath = currentPrimary ? currentPrimary.path : null;
      }

      await normalizeProfileImageSort(trx, profile.id);
    });

    await notifyIfSubmissionReadinessLost(profile.id, wasSubmissionReady);

    await logActivity(userId, "images_bulk_deleted", {
      profileId: profile.id,
      deletedCount: images.length,
    }).catch(() => {});

    return res.json({
      success: true,
      message: `${images.length} images deleted`,
      heroImagePath: newHeroImagePath,
    });
  }),
);

/**
 * POST /api/talent/media/bulk-update
 * Bulk update metadata / categories for multiple images at once
 */
router.post(
  "/bulk-update",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { imageIds, patch } = req.body;
    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "imageIds must be a non-empty array",
      });
    }
    if (!imageIds.every((id) => isUuid(id))) {
      return res.status(400).json({
        success: false,
        message: "imageIds must contain valid UUIDs",
      });
    }

    const userId = req.session.userId;
    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    // Fetch images owned by profile
    const images = await knex("images")
      .where({ profile_id: profile.id })
      .whereIn("id", imageIds);

    if (images.length !== imageIds.length) {
      return res.status(400).json({
        success: false,
        message: "Some images were not found or do not belong to your profile",
      });
    }

    // Parse patch structured fields
    const structuredParsed = parseImageStructuredFieldsFromBody(patch);
    if (!structuredParsed.ok) {
      return res.status(400).json({
        success: false,
        message: structuredParsed.error,
      });
    }
    const updateValues = { ...structuredParsed.values };

    if (updateValues.set_id) {
      const setRow = await knex("image_sets")
        .where({ id: updateValues.set_id, profile_id: profile.id })
        .first();
      if (!setRow) {
        return res.status(400).json({
          success: false,
          message: "Invalid set_id for this profile",
        });
      }
    }

    // Check minor safety block for each image to prevent unauthorized body imagery exposure
    for (const image of images) {
      const currentMetadata = parseImageMetadataFromDb(image.metadata);
      const resolvedShot = Object.hasOwn(updateValues, "shot_type") ? updateValues.shot_type : image.shot_type;
      const resolvedStyle = Object.hasOwn(updateValues, "style_type") ? updateValues.style_type : image.style_type;
      const resolvedExcludeAgency = Object.hasOwn(updateValues, "exclude_from_agency") ? updateValues.exclude_from_agency : !!image.exclude_from_agency;
      const resolvedExcludePublic = Object.hasOwn(updateValues, "exclude_from_public") ? updateValues.exclude_from_public : !!image.exclude_from_public;
      const resolvedAgencyVisible = !resolvedExcludeAgency || !resolvedExcludePublic;

      const patchBlock = minorBlocksSensitiveImage(profile, {
        shot_type: resolvedShot,
        style_type: resolvedStyle,
        role: currentMetadata?.role,
        body_visibility: bodyVisibilitySignalFromMetadata(currentMetadata),
        agencyVisible: resolvedAgencyVisible,
      });

      if (patchBlock) {
        return respondMinorImageBlock(res, patchBlock);
      }
    }

    const hasShotTypePatch = Object.hasOwn(updateValues, "shot_type");
    const perImageUpdates = hasShotTypePatch
      ? images.map((image) => {
          const metadata = parseImageMetadataFromDb(image.metadata);
          const classification = {
            ...(metadata?.ai?.classification || {}),
            source: "user",
            confirmed: true,
            band: "confirmed",
          };
          if (updateValues.shot_type) {
            classification.shot_type = {
              value: updateValues.shot_type,
              confidence: 1,
            };
          } else {
            delete classification.shot_type;
          }
          const updatedMetadata = {
            ...metadata,
            ai: {
              ...(metadata?.ai || {}),
              classification,
            },
          };
          const serialized = JSON.stringify(updatedMetadata);
          if (Buffer.byteLength(serialized, "utf8") > IMAGE_METADATA_MAX_BYTES) {
            return null;
          }
          return {
            id: image.id,
            values: { ...updateValues, metadata: serialized },
          };
        })
      : null;

    if (perImageUpdates?.some((entry) => entry === null)) {
      return res.status(400).json({
        success: false,
        message: "Image metadata is too large",
      });
    }

    // Update DB. A bulk talent-selected frame remains a direct declaration on
    // every row; do not leave an old AI suggestion paired with the new slug.
    await knex.transaction(async (trx) => {
      if (perImageUpdates) {
        for (const entry of perImageUpdates) {
          await trx("images")
            .where({ id: entry.id, profile_id: profile.id })
            .update(entry.values);
        }
      } else {
        await trx("images")
          .where({ profile_id: profile.id })
          .whereIn("id", imageIds)
          .update(updateValues);
      }
    });

    return res.json({
      success: true,
      message: `${imageIds.length} images updated successfully`,
    });
  }),
);

module.exports = router;
// Exposed for unit tests (minor-image protection, audit P0-8 / P0-5).
module.exports.__testables = {
  minorForcesPrivate,
  forcedPrivateColumns,
  imageAiProcessingAllowed,
  sensitiveImageAiAllowed: imageAiProcessingAllowed,
  buildInitialUploadMetadata,
  classificationStatusFromMetadata,
  scheduleImageClassification,
  prepareUploadedFile,
};
