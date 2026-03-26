const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { upload, processImage, s3 } = require("../../../shared/lib/uploader");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs").promises;
const path = require("path");
const config = require("../../../config");
const { ensureUniqueSlug } = require("../../../shared/lib/slugify");
const { logActivity } = require("../services/shared-utils");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const {
  parseImageStructuredFieldsFromBody,
  parseImageRightsPatchFromBody,
  imageRightsRowToApi,
} = require("../../../shared/lib/validation");

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
    };
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
  };
}

function toPublicImagePayload(image, metadataOverride) {
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
    metadata:
      metadataOverride !== undefined
        ? metadataOverride
        : parseImageMetadataFromDb(image.metadata),
    ...structuredFieldsFromImageRow(image),
  };
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

    const images = await knex("images")
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

/**
 * POST /api/talent/media
 * Upload multiple images (max 12)
 */
router.post(
  "/",
  requireRole("TALENT"),
  ensureProfile,
  upload.array("media", 12),
  asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one image to upload.",
      });
    }

    const profile = req.profile;
    // Check if current primary image exists
    const currentPrimary = await knex("images")
      .where({ is_primary: true, profile_id: profile.id })
      .first();
    const hasValidHero = !!currentPrimary;

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

    const uploadedImages = [];
    const failedFiles = [];
    let heroSet = false;
    const processedArtifacts = [];
    try {
      await knex.transaction(async (trx) => {
        const maxSortRow = await trx("images")
          .where({ profile_id: profile.id })
          .max({ maxSort: "sort" })
          .first();
        let nextSort = Number(maxSortRow?.maxSort || 0) + 1;

        for (const file of req.files) {
          try {
            const processed = await processImage(file, profile.id);
            processedArtifacts.push({
              storage_key: processed.storage_key,
              absolute_path: processed.absolute_path,
            });
            const imageId = uuidv4();
            const sort = nextSort++;

            await trx("images").insert({
              id: imageId,
              profile_id: profile.id,
              path: processed.path,
              public_url: processed.public_url,
              storage_key: processed.storage_key,
              absolute_path: processed.absolute_path,
              label: "Portfolio image",
              sort: sort,
              ...structuredInsert,
            });

            let becamePrimary = false;
            if (!hasValidHero && !heroSet && uploadedImages.length === 0) {
              await trx("images")
                .where({ profile_id: profile.id })
                .update({
                  is_primary: knex.raw("CASE WHEN id = ? THEN ? ELSE ? END", [
                    imageId,
                    true,
                    false,
                  ]),
                });
              heroSet = true;
              becamePrimary = true;
            }

            uploadedImages.push({
              id: imageId,
              path: processed.path,
              public_url: processed.public_url,
              is_primary: becamePrimary,
              metadata: {},
              label: "Portfolio image",
              sort: sort,
              profile_id: profile.id,
              created_at: new Date().toISOString(),
              ...structuredFieldsFromImageRow({
                ...structuredInsert,
              }),
            });
          } catch (fileError) {
            const err = new Error("Failed to process image");
            err.fileName = file.originalname || "Unknown file";
            throw err;
          }
        }
        await normalizeProfileImageSort(trx, profile.id);
      });
    } catch (batchError) {
      console.error("[Media Upload] Batch upload failed:", batchError);
      if (processedArtifacts.length > 0) {
        const cleanupOps = [];
        for (const artifact of processedArtifacts) {
          if (artifact.storage_key) {
            cleanupOps.push(
              s3.send(
                new DeleteObjectCommand({
                  Bucket: config.r2.bucket,
                  Key: artifact.storage_key,
                }),
              ),
            );
          }
          if (artifact.absolute_path) {
            cleanupOps.push(fs.unlink(artifact.absolute_path));
          }
        }
        await Promise.allSettled(cleanupOps);
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

    return res.json({
      success: true,
      rights: imageRightsRowToApi(row),
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

    await knex.transaction(async (trx) => {
      const existing = await trx("image_rights")
        .where({ image_id: imageId })
        .first();
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

    return res.json({
      success: true,
      rights: imageRightsRowToApi(row),
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
      .select("images.*")
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
      updatedMetadata = { ...currentMetadata, ...sanitizedIncoming };
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

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No updatable fields provided",
      });
    }

    await knex("images").where({ id: imageId }).update(patch);

    const fresh = await knex("images").where({ id: imageId }).first();

    return res.json({
      success: true,
      message: "Image details updated",
      image: toPublicImagePayload(fresh, updatedMetadata),
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
      .select("images.*", "profiles.id as profile_id")
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
      .select("images.*", "profiles.user_id")
      .leftJoin("profiles", "images.profile_id", "profiles.id")
      .where("images.id", imageId)
      .where("profiles.user_id", userId)
      .first();

    if (!image)
      return res
        .status(404)
        .json({ success: false, message: "Image not found" });

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

module.exports = router;
