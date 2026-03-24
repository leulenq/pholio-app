const express = require('express');
const { v4: uuidv4 } = require('uuid');
const knex = require('../shared/db/knex');
const { upload, processImage } = require('../shared/lib/uploader');
const { requireRole } = require('../middleware/auth');
const { imageUploadSchema } = require('../shared/lib/schemas');
const { cleanString } = require('../shared/lib/sanitize');

const router = express.Router();

router.post('/upload', requireRole('TALENT'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File required' });
    }

    // Validate metadata
    const parsed = imageUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid metadata', details: parsed.error.flatten() });
    }

    const { publicUrl } = await processImage(req.file, profile.id);
    const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Calculate sort order
    const countResult = await knex('images')
      .where({ profile_id: profile.id })
      .count({ total: '*' })
      .first();
    const nextSort = Number(countResult?.total || 0) + 1;
    const imageId = uuidv4();

    // Insert into modern 'images' table
    console.log('Attempting DB Insert:', { profile_id: profile.id, path: publicUrl });
    
    try {
      await knex('images').insert({
        id: imageId,
        profile_id: profile.id,
        path: publicUrl,
        label: 'Polaroid',
        sort: nextSort,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('CRITICAL DB INSERT FAILED:', error.message, error.code, error.detail);
      throw error;
    }

    console.log('[Upload Legacy] Inserted image:', { imageId, profileId: profile.id, path: publicUrl });

    // Set as primary if no primary exists
    const currentPrimary = await knex('images').where({ profile_id: profile.id, is_primary: true }).first();
    if (!currentPrimary) {
      console.log('[Upload Legacy] Setting primary image:', publicUrl);
      await knex('images').where({ id: imageId }).update({ is_primary: true });
    }

    return res.json({ ok: true, path: publicUrl, id: imageId });
  } catch (error) {
    return next(error);
  }
});

router.post('/media/reorder', requireRole('TALENT'), async (req, res, next) => {
  const order = Array.isArray(req.body.order) ? req.body.order : [];
  if (!order.length) {
    return res.status(400).json({ error: 'Order is required' });
  }

  try {
    const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const images = await knex('images').where({ profile_id: profile.id });
    const allowedIds = new Set(images.map((image) => image.id));
    if (order.some((id) => !allowedIds.has(id))) {
      return res.status(400).json({ error: 'Invalid media selection' });
    }

    await knex.transaction(async (trx) => {
      await Promise.all(
        order.map((id, index) =>
          trx('images')
            .where({ id })
            .update({ sort: index + 1 })
        )
      );
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/media/:id/delete', requireRole('TALENT'), async (req, res, next) => {
  const { id } = req.params;
  try {
    const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const image = await knex('images').where({ id, profile_id: profile.id }).first();
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    await knex.transaction(async (trx) => {
      await trx('images').where({ id }).delete();

      const remaining = await trx('images').where({ profile_id: profile.id }).orderBy('sort');
      await Promise.all(
        remaining.map((item, index) =>
          trx('images')
            .where({ id: item.id })
            .update({ sort: index + 1 })
        )
      );

      if (image.is_primary) {
        const nextHero = remaining[0];
        if (nextHero) {
          await trx('images').where({ id: nextHero.id }).update({ is_primary: true });
        }
      }
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/media/:id/label', requireRole('TALENT'), async (req, res, next) => {
  const { id } = req.params;
  const label = cleanString(req.body.label || '').slice(0, 80);
  if (!label) {
    return res.status(400).json({ error: 'Label required' });
  }

  try {
    const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const updated = await knex('images')
      .where({ id, profile_id: profile.id })
      .update({ label });

    if (!updated) {
      return res.status(404).json({ error: 'Image not found' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
