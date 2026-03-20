/**
 * Media Routes for Talent Dashboard
 * 
 * Handles image upload, deletion, and hero image management
 */

const express = require('express');
const knex = require('../../db/knex');
const { requireRole } = require('../../middleware/auth');
const { upload, processImage } = require('../../lib/uploader');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');
const { ensureUniqueSlug } = require('../../lib/slugify');
const { logActivity } = require('../../lib/dashboard/shared-utils');
const { asyncHandler, createErrorResponse, createSuccessResponse } = require('../../middleware/error-handler');

const router = express.Router();

/**
 * POST /dashboard/talent/media
 * Upload multiple images (max 12)
 */
router.post('/dashboard/talent/media', requireRole('TALENT'), upload.array('media', 12), asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json(createErrorResponse(
      new Error('Please select at least one image to upload.')
    ));
  }

  if (!req.session || !req.session.userId) {
    return res.status(401).json(createErrorResponse(
      new Error('Session expired. Please log in again.')
    ));
  }

  let profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  // If profile doesn't exist, create a minimal one
  if (!profile) {
    console.log('[Dashboard/Media Upload] Profile not found, creating minimal profile for user:', req.session.userId);
    
    try {
      const currentUser = await knex('users').where({ id: req.session.userId }).first();
      if (!currentUser) {
        return res.status(404).json(createErrorResponse(
          new Error('User not found.')
        ));
      }
      
      const emailParts = currentUser.email.split('@')[0];
      const placeholderFirstName = emailParts.charAt(0).toUpperCase() + emailParts.slice(1).split('.')[0];
      const placeholderLastName = 'User';
      
      const profileId = uuidv4();
      const slug = await ensureUniqueSlug(knex, 'profiles', `${placeholderFirstName}-${placeholderLastName}`);
      
      await knex('profiles').insert({
        id: profileId,
        user_id: req.session.userId,
        slug,
        first_name: placeholderFirstName,
        last_name: placeholderLastName,
        city: 'Not specified',
        height_cm: 0,
        bio_raw: '',
        bio_curated: '',
        is_pro: false,
        pdf_theme: null,
        pdf_customizations: null
      });
      
      profile = await knex('profiles').where({ id: profileId }).first();
      
      if (!profile) {
        return res.status(500).json(createErrorResponse(
          new Error('Failed to create profile. Please try again.')
        ));
      }
      
      await logActivity(req.session.userId, 'profile_created', {
        profileId: profileId,
        slug: slug,
        action: 'created_via_upload'
      });
    } catch (createError) {
      console.error('[Dashboard/Media Upload] Error creating profile:', createError);
      return res.status(500).json(createErrorResponse(createError));
    }
  }

  const countResult = await knex('images')
    .where({ profile_id: profile.id })
    .count({ total: '*' })
    .first();
  let nextSort = Number(countResult?.total || 0) + 1;

  const uploadedImages = [];
  let heroSet = false;

  for (const file of req.files) {
    try {
      const { publicUrl: storedPath } = await processImage(file, profile.id);
      const imageId = uuidv4();
      await knex('images').insert({
        id: imageId,
        profile_id: profile.id,
        path: storedPath,
        label: 'Portfolio image',
        sort: nextSort++
      });

      // Set first uploaded image as primary if no primary exists
      const currentPrimary = await knex('images').where({ profile_id: profile.id, is_primary: true }).first();
      if (!currentPrimary && !heroSet && uploadedImages.length === 0) {
        await knex('images').where({ id: imageId }).update({ is_primary: true });
        heroSet = true;
      }

      uploadedImages.push({
        id: imageId,
        path: storedPath,
        label: 'Portfolio image',
        sort: nextSort - 1,
        profile_id: profile.id,
        created_at: new Date().toISOString()
      });
    } catch (fileError) {
      console.error('[Dashboard/Media Upload] Error processing file:', fileError);
      // Continue with other files even if one fails
    }
  }

  if (uploadedImages.length > 0) {
    const updatedProfile = await knex('profiles').where({ id: profile.id }).first();
    const totalImages = Number(countResult?.total || 0) + uploadedImages.length;
    
    await logActivity(req.session.userId, 'image_uploaded', {
      profileId: profile.id,
      imageCount: uploadedImages.length,
      totalImages: totalImages
    });
    
    // Fetch latest primary image path for response
    const primary = await knex('images').where({ profile_id: profile.id, is_primary: true }).first() || uploadedImages[0];
    
    return res.json(createSuccessResponse({
      images: uploadedImages,
      heroImagePath: primary.path,
      totalImages: totalImages
    }, `Successfully uploaded ${uploadedImages.length} image${uploadedImages.length > 1 ? 's' : ''}.`));
  } else {
    return res.status(500).json(createErrorResponse(
      new Error('Failed to upload images. Please try again.')
    ));
  }
}));

/**
 * PUT /dashboard/talent/media/:id/hero
 * Set an image as the hero image
 */
router.put('/dashboard/talent/media/:id/hero', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const imageId = req.params.id;
  if (!imageId || typeof imageId !== 'string') {
    return res.status(400).json(createErrorResponse(
      new Error('Invalid image ID')
    ));
  }

  const image = await knex('images')
    .select('images.*', 'profiles.user_id', 'profiles.id as profile_id')
    .leftJoin('profiles', 'images.profile_id', 'profiles.id')
    .where('images.id', imageId)
    .first();

  if (!image) {
    return res.status(404).json(createErrorResponse(
      new Error('Image not found')
    ));
  }

  if (image.user_id !== req.session.userId) {
    return res.status(403).json(createErrorResponse(
      new Error('Unauthorized')
    ));
  }

  await knex.transaction(async (trx) => {
    // 1. Reset all images for this profile to NOT primary
    await trx('images')
      .where({ profile_id: image.profile_id })
      .update({ is_primary: false });

    // 2. Set the selected image as primary
    await trx('images')
      .where({ id: imageId })
      .update({ is_primary: true });
  });

  return res.json(createSuccessResponse({
    heroImagePath: image.path
  }, 'Hero image updated successfully'));
}));

/**
 * DELETE /dashboard/talent/media/:id
 * Delete an image
 */
router.delete('/dashboard/talent/media/:id', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const mediaId = req.params.id;
  if (!mediaId || typeof mediaId !== 'string') {
    return res.status(400).json(createErrorResponse(
      new Error('Invalid media ID')
    ));
  }

  const media = await knex('images')
    .select('images.*', 'profiles.user_id')
    .leftJoin('profiles', 'images.profile_id', 'profiles.id')
    .where('images.id', mediaId)
    .first();

  if (!media) {
    return res.status(404).json(createErrorResponse(
      new Error('Media not found')
    ));
  }

  if (media.user_id !== req.session.userId) {
    return res.status(403).json(createErrorResponse(
      new Error('Unauthorized')
    ));
  }

  // Delete the file from disk
  let filePath;
  if (media.path.startsWith('/uploads/')) {
    const relativePath = media.path.slice(1);
    filePath = path.join(__dirname, '..', '..', relativePath);
  } else if (media.path.startsWith('/')) {
    const relativePath = media.path.slice(1);
    filePath = path.join(__dirname, '..', '..', relativePath);
  } else {
    filePath = path.join(config.uploadsDir, media.path);
  }
  
  try {
    await fs.unlink(filePath);
  } catch (fileError) {
    console.warn(`Could not delete file ${filePath}:`, fileError.message);
  }

  // Handle Primary Image replacement
  if (media.is_primary) {
    const nextImage = await knex('images')
      .where({ profile_id: media.profile_id })
      .whereNot('id', mediaId)
      .orderBy('sort')
      .first();

    if (nextImage) {
      await knex('images')
        .where({ id: nextImage.id })
        .update({ is_primary: true });
      newHeroImagePath = nextImage.path;
    }
  } else {
    const primary = await knex('images')
      .where({ profile_id: media.profile_id, is_primary: true })
      .whereNot('id', mediaId)
      .first();
    newHeroImagePath = primary ? primary.path : null;
  }

  // Delete from database
  await knex('images').where({ id: mediaId }).delete();

  return res.json(createSuccessResponse({
    deleted: mediaId,
    heroImagePath: newHeroImagePath
  }, 'Image deleted successfully'));
}));

/**
 * PATCH /dashboard/talent/media/:id/role
 * Set (or clear) the comp card role for an image.
 * Valid roles: headshot | full_body | editorial | lifestyle | null (clears)
 */
const VALID_ROLES = ['headshot', 'full_body', 'editorial', 'lifestyle'];

router.patch('/dashboard/talent/media/:id/role', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const imageId = req.params.id;
  const { role } = req.body;

  if (role !== null && role !== undefined && !VALID_ROLES.includes(role)) {
    return res.status(400).json(createErrorResponse(
      new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}, or null to clear.`)
    ));
  }

  // Verify ownership
  const image = await knex('images')
    .select('images.*', 'profiles.user_id', 'profiles.id as profile_id')
    .leftJoin('profiles', 'images.profile_id', 'profiles.id')
    .where('images.id', imageId)
    .first();

  if (!image) {
    return res.status(404).json(createErrorResponse(new Error('Image not found')));
  }

  if (image.user_id !== req.session.userId) {
    return res.status(403).json(createErrorResponse(new Error('Unauthorized')));
  }

  // Update metadata with the new role
  // Supports both PostgreSQL (jsonb_set) and SQLite (JSON string merge)
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  if (isPostgres) {
    if (role === null || role === undefined) {
      // Remove the role key
      await knex('images')
        .where({ id: imageId })
        .update({
          metadata: knex.raw(`COALESCE(metadata, '{}') - 'role'`)
        });
    } else {
      await knex('images')
        .where({ id: imageId })
        .update({
          metadata: knex.raw(`jsonb_set(COALESCE(metadata, '{}'), '{role}', ?)`, [JSON.stringify(role)])
        });
    }
  } else {
    // SQLite: load existing metadata, merge, and save as JSON string
    let existing = {};
    if (image.metadata) {
      try {
        existing = typeof image.metadata === 'string' ? JSON.parse(image.metadata) : image.metadata;
      } catch { existing = {}; }
    }
    if (role === null || role === undefined) {
      delete existing.role;
    } else {
      existing.role = role;
    }
    await knex('images').where({ id: imageId }).update({ metadata: JSON.stringify(existing) });
  }

  return res.json(createSuccessResponse({ id: imageId, role: role || null }, 'Image role updated'));
}));

module.exports = router;
