/**
 * Apply Essentials Wizard Routes - Phase A
 * Handles full-screen wizard for essential model info collection
 *
 * NOT MOUNTED in `src/app.js` (2025+): onboarding is driven by the React SPA +
 * `domains/onboarding/routes/casting.js`.
 * This file is retained for reference or a future EJS wizard; do not assume these URLs are live.
 */

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { addMessage } = require("../../../shared/middleware/context");
const {
  essentialsDraftSchema,
  essentialsSubmitSchema,
} = require("../../../shared/lib/validation");
const { upload, processImage } = require("../../../shared/lib/uploader");
const {
  convertKgToLbs,
  convertLbsToKg,
} = require("../../talent/services/profile-helpers");

// Minimum photos required for essentials wizard submission
const ESSENTIALS_MIN_PHOTOS = 3;

/**
 * GET /apply/essentials
 * Render full-screen essentials wizard
 */
router.get("/apply/essentials", async (req, res, next) => {
  try {
    // If not logged in, redirect to /apply (auth entry point)
    if (!req.session || !req.session.userId) {
      return res.redirect("/onboarding");
    }

    // Load profile
    const profile = await knex("profiles")
      .where({ user_id: req.session.userId })
      .first();

    if (!profile) {
      addMessage(
        req,
        "error",
        "Profile not found. Please start the application process.",
      );
      return res.redirect("/onboarding");
    }

    // Load images
    const images = await knex("images")
      .where({ profile_id: profile.id })
      .orderBy("sort", "asc");

    // Check if user can proceed (must be in essentials stage)
    const canProceed =
      !profile.onboarding_stage ||
      profile.onboarding_stage === "essentials" ||
      profile.onboarding_stage === "draft";

    if (!canProceed && profile.onboarding_stage !== "essentials") {
      // User already completed essentials, redirect to dashboard
      return res.redirect("/dashboard/talent?onboarding=1");
    }

    // Render wizard
    return res.render("apply/essentials-wizard", {
      title: "Complete Your Essentials",
      layout: "layout",
      profile,
      images,
      photoCount: images.length,
      minPhotos: ESSENTIALS_MIN_PHOTOS,
    });
  } catch (error) {
    console.error("[Apply Essentials] Error loading wizard:", error);
    return next(error);
  }
});

/**
 * POST /apply/essentials/save
 * Save partial fields during wizard (draft)
 */
router.post(
  "/apply/essentials/save",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // Validate with permissive draft schema
      const parsed = essentialsDraftSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(422).json({
          error: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const data = parsed.data;
      const updateData = {
        updated_at: knex.fn.now(),
      };

      // Handle each field if provided
      if (data.first_name !== undefined)
        updateData.first_name = data.first_name || null;
      if (data.last_name !== undefined)
        updateData.last_name = data.last_name || null;
      if (data.city !== undefined) updateData.city = data.city || null;
      if (data.gender !== undefined) updateData.gender = data.gender || null;
      if (data.height_cm !== undefined)
        updateData.height_cm = data.height_cm || null;
      if (data.bust !== undefined) updateData.bust_cm = data.bust || null;
      if (data.waist !== undefined) updateData.waist_cm = data.waist || null;
      if (data.hips !== undefined) updateData.hips_cm = data.hips || null;
      if (data.shoe_size !== undefined)
        updateData.shoe_size = data.shoe_size || null;
      if (data.date_of_birth !== undefined) {
        updateData.date_of_birth = data.date_of_birth || null;
      }

      // Update profile (keep onboarding_stage='essentials')
      await knex("profiles").where({ id: profile.id }).update(updateData);

      return res.json({ ok: true });
    } catch (error) {
      console.error("[Apply Essentials Save] Error:", error);
      return next(error);
    }
  },
);

/**
 * POST /apply/essentials/submit
 * Final submit of essentials wizard (strict validation)
 */
router.post(
  "/apply/essentials/submit",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();

      if (!profile) {
        addMessage(
          req,
          "error",
          "Profile not found. Please start the application process.",
        );
        return res.status(404).redirect("/onboarding");
      }

      // Load images for validation
      const images = await knex("images")
        .where({ profile_id: profile.id })
        .orderBy("sort", "asc");

      // Validate required fields
      const parsed = essentialsSubmitSchema.safeParse(req.body);
      if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors;
        addMessage(req, "error", "Please complete all required fields.");
        return res.status(422).redirect("/apply/essentials");
      }

      // Validate minimum photos
      if (images.length < ESSENTIALS_MIN_PHOTOS) {
        addMessage(
          req,
          "error",
          `Please upload at least ${ESSENTIALS_MIN_PHOTOS} photos before submitting.`,
        );
        return res.status(422).redirect("/apply/essentials");
      }

      const data = parsed.data;
      const updateData = {
        first_name: data.first_name,
        last_name: data.last_name,
        city: data.city,
        gender: data.gender || null,
        height_cm: data.height_cm,
        bust_cm: data.bust || null,
        waist_cm: data.waist || null,
        hips_cm: data.hips || null,
        shoe_size: data.shoe_size || null,
        date_of_birth: data.date_of_birth || null,
        onboarding_stage: "completing", // Move to dashboard completion phase
        updated_at: knex.fn.now(),
      };

      // Update profile
      await knex("profiles").where({ id: profile.id }).update(updateData);

      // Redirect to dashboard for completion
      return res.redirect(303, "/dashboard/talent?onboarding=1");
    } catch (error) {
      console.error("[Apply Essentials Submit] Error:", error);
      return next(error);
    }
  },
);

/**
 * POST /apply/media/upload
 * Upload photos during essentials wizard
 */
router.post(
  "/apply/media/upload",
  requireRole("TALENT"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "File required" });
      }

      const profile = await knex("profiles")
        .where({ user_id: req.session.userId })
        .first();
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // Process and store image
      const { publicUrl: storedPath } = await processImage(
        req.file,
        profile.id,
      );
      const countResult = await knex("images")
        .where({ profile_id: profile.id })
        .count({ total: "*" })
        .first();
      const nextSort = Number(countResult?.total || 0) + 1;

      await knex("images").insert({
        id: uuidv4(),
        profile_id: profile.id,
        path: storedPath,
        label: "Portfolio image",
        sort: nextSort,
      });

      // Set primary image if none exists
      const currentPrimary = await knex("images")
        .where({ profile_id: profile.id, is_primary: true })
        .first();
      if (!currentPrimary) {
        await knex("images")
          .where({ path: storedPath, profile_id: profile.id })
          .update({ is_primary: true });
      }

      return res.json({ ok: true, path: storedPath });
    } catch (error) {
      console.error("[Apply Media Upload] Error:", error);
      return next(error);
    }
  },
);

module.exports = router;
