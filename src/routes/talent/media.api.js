const express = require('express');
const router = express.Router();
const knex = require('../../shared/db/knex');
const { requireRole } = require('../../domains/auth/middleware/require-auth');
const { upload, processImage, s3 } = require('../../shared/lib/uploader');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');
const { ensureUniqueSlug } = require('../../shared/lib/slugify');
const { logActivity } = require('../../lib/dashboard/shared-utils');
const { asyncHandler } = require('../../shared/middleware/error-handler');

/**
 * Middleware to ensure profile exists for the current user
 * and attach it to req.profile for use in multer/S3 naming.
 */
const ensureProfile = async (req, res, next) => {
  const userId = req.session.userId;
  if (!userId) return next();

  let profile = await knex('profiles').where({ user_id: userId }).first();
  
  if (!profile) {
    const user = await knex('users').where({ id: userId }).first();
    const emailParts = user.email.split('@')[0];
    const placeholderFirstName = emailParts.charAt(0).toUpperCase() + emailParts.slice(1).split('.')[0];
    const placeholderLastName = 'User';
    const profileId = uuidv4();
    const slug = await ensureUniqueSlug(knex, 'profiles', `${placeholderFirstName}-${placeholderLastName}`);
    
    await knex('profiles').insert({
      id: profileId,
      user_id: userId,
      slug,
      first_name: placeholderFirstName,
      last_name: placeholderLastName,
      city: 'Not specified',
      height_cm: 0,
      bio_raw: '',
      bio_curated: '',
      is_pro: false
    });
    
    profile = await knex('profiles').where({ id: profileId }).first();
  }

  req.profile = profile;
  next();
};

/**
 * GET /api/talent/media/recent
 * Get 8 most recent uploads for dashboard gallery
 */
router.get('/recent', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const profile = await knex('profiles').where({ user_id: userId }).first();

  if (!profile) return res.json({ success: true, images: [] });

  const images = await knex('images')
    .where({ profile_id: profile.id })
    .orderBy('created_at', 'desc')
    .limit(8)
    .select('id', 'path', 'public_url', 'is_primary', 'metadata', 'sort', 'created_at');

  return res.json({
    success: true,
    images: images.map(img => ({
      id: img.id,
      url: img.public_url || img.path,
      uploaded_at: img.created_at
    }))
  });
}));

/**
 * POST /api/talent/media
 * Upload multiple images (max 12)
 */
router.post('/', requireRole('TALENT'), ensureProfile, upload.array('media', 12), asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'Please select at least one image to upload.' });
  }

  const profile = req.profile;
  const countResult = await knex('images')
    .where({ profile_id: profile.id })
    .count({ total: '*' })
    .first();
  let nextSort = Number(countResult?.total || 0) + 1;

  // Check if current primary image exists
  const currentPrimary = await knex('images').where({ is_primary: true, profile_id: profile.id }).first();
  const hasValidHero = !!currentPrimary;

  const uploadedImages = [];
  let heroSet = false;

  for (const file of req.files) {
    try {
      const processed = await processImage(file, profile.id);
      
      const imageId = uuidv4();
      const sort = nextSort++;
      
      await knex('images').insert({
        id: imageId,
        profile_id: profile.id,
        path: processed.path,
        public_url: processed.public_url,
        storage_key: processed.storage_key,
        absolute_path: processed.absolute_path,
        label: 'Portfolio image',
        sort: sort
      });

      console.log('[Media Upload] Inserted image:', { imageId, profileId: profile.id, path: processed.path, sort });

      // Set first uploaded image as primary if no VALID primary exists
      if (!hasValidHero && !heroSet && uploadedImages.length === 0) {
        console.log('[Media Upload] Setting initial primary image:', processed.path);
        await knex('images').where({ id: imageId }).update({ is_primary: true });
        heroSet = true;
      }

      uploadedImages.push({
        id: imageId,
        path: processed.path,
        public_url: processed.public_url,
        is_primary: !!heroSet,
        metadata: {},
        label: 'Portfolio image',
        sort: sort,
        profile_id: profile.id,
        created_at: new Date().toISOString()
      });
    } catch (fileError) {
      console.error('[Media Upload] Error processing file:', fileError);
    }
  }

  if (uploadedImages.length > 0) {
    const totalImages = Number(countResult?.total || 0) + uploadedImages.length;
    
    // Fetch latest primary image path for response
    const primary = await knex('images').where({ profile_id: profile.id, is_primary: true }).first() || uploadedImages[0];
    
    await logActivity(req.session.userId, 'image_uploaded', {
      profileId: profile.id,
      imageCount: uploadedImages.length,
      totalImages: totalImages
    });
    
    return res.json({
      success: true,
      images: uploadedImages,
      heroImagePath: primary.path,
      totalImages: totalImages,
      message: `Successfully uploaded ${uploadedImages.length} image${uploadedImages.length > 1 ? 's' : ''}.`
    });
  } else {
    return res.status(500).json({ success: false, message: 'Failed to upload images.' });
  }
}));

// ... [reorder route remains mostly the same, ensuring profile check] ...
router.put('/reorder', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const { imageIds } = req.body;
  if (!Array.isArray(imageIds)) {
    return res.status(400).json({ success: false, message: 'imageIds must be an array' });
  }

  const userId = req.session.userId;
  const profile = await knex('profiles').where({ user_id: userId }).first();
  if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

  await knex.transaction(async (trx) => {
    const updates = imageIds.map((id, index) => {
      return trx('images')
        .where({ id: id, profile_id: profile.id })
        .update({ sort: index + 1 });
    });
    await Promise.all(updates);
  });

  return res.json({ success: true, message: 'Images reordered successfully' });
}));

// ... [metadata update remains same] ...
router.put('/:id', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const imageId = req.params.id;
  const userId = req.session.userId;
  const { metadata } = req.body;

  const image = await knex('images')
    .select('images.*')
    .leftJoin('profiles', 'images.profile_id', 'profiles.id')
    .where('images.id', imageId)
    .where('profiles.user_id', userId)
    .first();

  if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

  const currentMetadata = image.metadata || {};
  const updatedMetadata = { ...currentMetadata, ...metadata };

  await knex('images').where({ id: imageId }).update({ metadata: updatedMetadata });

  return res.json({
    success: true,
    message: 'Image details updated',
    image: { ...image, metadata: updatedMetadata }
  });
}));

// ... [hero update remains same] ...
router.put('/:id/hero', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const imageId = req.params.id;
  const userId = req.session.userId;
  
  const image = await knex('images')
    .select('images.*', 'profiles.id as profile_id')
    .leftJoin('profiles', 'images.profile_id', 'profiles.id')
    .where('images.id', imageId)
    .where('profiles.user_id', userId)
    .first();

  if (!image) return res.status(404).json({ success: false, message: 'Image found' });

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

  return res.json({
    success: true,
    heroImagePath: image.path,
    message: 'Hero image updated'
  });
}));

/**
 * DELETE /api/talent/media/:id
 * Delete an image (local and R2)
 */
router.delete('/:id', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const mediaId = req.params.id;
  const userId = req.session.userId;

  const media = await knex('images')
    .select('images.*', 'profiles.user_id')
    .leftJoin('profiles', 'images.profile_id', 'profiles.id')
    .where('images.id', mediaId)
    .first();

  if (!media) return res.status(404).json({ success: false, message: 'Image not found' });
  if (media.user_id !== userId) return res.status(403).json({ success: false, message: 'Unauthorized' });

  // 1. Delete from R2 if storage_key exists
  if (media.storage_key) {
    try {
      // Delete original, processed, and thumbnail
      const uuid = path.basename(media.storage_key, path.extname(media.storage_key));
      const prefix = media.storage_key.split('/processed/')[0] || media.storage_key.split('/originals/')[0] || media.storage_key.split('/thumbnails/')[0];
      
      const deletions = [
        s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: media.storage_key })),
        // We try to delete based on standard naming if we can derive it
        s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: `${prefix}/originals/${uuid}.jpg` })),
        s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: `${prefix}/originals/${uuid}.png` })),
        s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: `${prefix}/originals/${uuid}.jpeg` })),
        s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: `${prefix}/thumbnails/${uuid}_400w.webp` }))
      ];
      await Promise.allSettled(deletions);
    } catch (s3Err) {
      console.warn('[Media Delete] R2 deletion warning:', s3Err.message);
    }
  }

  // 2. Delete local file if absolute_path exists
  if (media.absolute_path) {
    try {
      await fs.unlink(media.absolute_path).catch(() => {});
      // Also try to unlink original and thumbnail if we can guess them
      const base = media.absolute_path.replace('.webp', '');
      await fs.unlink(`${base}_400w.webp`).catch(() => {});
    } catch (e) {
      console.warn(`[Media Delete] File unlink warning: ${e.message}`);
    }
  }

  // Handle Primary Image replacement
  if (media.is_primary) {
    const nextImage = await knex('images')
      .where({ profile_id: media.profile_id })
      .whereNot('id', mediaId)
      .orderBy('sort', 'asc')
      .first();
    
    if (nextImage) {
      await knex('images')
        .where({ id: nextImage.id })
        .update({ is_primary: true });
      newHeroImagePath = nextImage.path;
    } else {
      newHeroImagePath = null;
    }
  } else {
    // If not primary, hero path for response remains the same
    const currentPrimary = await knex('images')
      .where({ profile_id: media.profile_id, is_primary: true })
      .first();
    newHeroImagePath = currentPrimary ? currentPrimary.path : null;
  }

  await knex('images').where({ id: mediaId }).delete();

  return res.json({
    success: true,
    deleted: mediaId,
    heroImagePath: newHeroImagePath,
    message: 'Image deleted'
  });
}));

// ... [role patch remains same] ...
router.patch('/:id/role', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const imageId = req.params.id;
  const userId = req.session.userId;
  const { role } = req.body;

  const VALID_ROLES = ['headshot', 'full_body', 'editorial', 'lifestyle'];
  if (role !== null && role !== undefined && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: `Invalid role.` });
  }

  const image = await knex('images')
    .select('images.*', 'profiles.user_id')
    .leftJoin('profiles', 'images.profile_id', 'profiles.id')
    .where('images.id', imageId)
    .where('profiles.user_id', userId)
    .first();

  if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  if (isPostgres) {
    if (!role) {
      await knex('images').where({ id: imageId }).update({ metadata: knex.raw(`COALESCE(metadata, '{}') - 'role'`) });
    } else {
      await knex('images').where({ id: imageId }).update({ metadata: knex.raw(`jsonb_set(COALESCE(metadata, '{}'), '{role}', ?)`, [JSON.stringify(role)]) });
    }
  } else {
    let existing = image.metadata || {};
    if (!role) delete existing.role; else existing.role = role;
    await knex('images').where({ id: imageId }).update({ metadata: JSON.stringify(existing) });
  }

  return res.json({ success: true, id: imageId, role: role || null });
}));

module.exports = router;
