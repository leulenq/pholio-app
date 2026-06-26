'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { v4: uuidv4 } = require('uuid');
const knex = require('../../../shared/db/knex');
const { requireAuth } = require('../../auth/middleware/require-auth');
const { isModerator, VALID_REPORT_REASONS } = require('../../../shared/lib/moderation');
const {
  MODERATION_STATUS,
  MODERATION_QUEUE_STATUS,
} = require('../../../shared/lib/content-moderation');
const {
  CSAM_ESCALATION_STATUS,
} = require('../../../shared/lib/csam-moderation');

const VALID_TARGET_TYPES = new Set(['profile', 'image', 'message', 'agency', 'user']);
const VALID_STATUSES = new Set(['pending', 'reviewed', 'actioned', 'dismissed']);
const VALID_QUEUE_STATUSES = new Set(Object.values(MODERATION_QUEUE_STATUS));
const VALID_QUEUE_ACTIONS = new Set(['approve', 'reject']);
const VALID_CSAM_STATUSES = new Set(Object.values(CSAM_ESCALATION_STATUS));

function parseModerationFlags(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function requireModerator(req, res, next) {
  // req.session.email is never populated in the auth flow, so we must look up
  // the user's email from the DB to make isModerator's @pholio.studio rule work.
  // Wrap in try/catch so DB errors are forwarded to Express error handling
  // (Express 4 does not catch rejected async middleware promises automatically).
  try {
    const dbUser = await knex('users')
      .where({ id: req.session.userId })
      .select('id', 'email')
      .first();
    const user = { id: req.session.userId, email: dbUser ? dbUser.email : undefined };
    if (!isModerator(user)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Moderator access required.',
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/reports
 * Submit a new report. Requires authentication.
 */
router.post(
  '/reports',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { target_type, target_id, reason, details } = req.body;

    if (!target_type || !VALID_TARGET_TYPES.has(target_type)) {
      return res.status(400).json({
        error: 'Validation error',
        message: `target_type must be one of: ${[...VALID_TARGET_TYPES].join(', ')}`,
      });
    }

    if (!target_id || typeof target_id !== 'string' || !target_id.trim()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'target_id is required',
      });
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'reason is required',
      });
    }

    if (!VALID_REPORT_REASONS.includes(reason.trim())) {
      return res.status(400).json({
        error: 'Validation error',
        message: `reason must be one of: ${VALID_REPORT_REASONS.join(', ')}`,
      });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await knex('reports').insert({
      id,
      reporter_user_id: req.session.userId,
      target_type: target_type.trim(),
      target_id: target_id.trim(),
      reason: reason.trim(),
      details: details ? String(details).trim().slice(0, 1000) || null : null,
      status: 'pending',
      created_at: now,
      updated_at: now,
    });

    return res.status(201).json({
      success: true,
      data: { id },
    });
  }),
);

/**
 * GET /api/reports
 * List all reports. Moderator only.
 */
router.get(
  '/reports',
  requireAuth,
  requireModerator,
  asyncHandler(async (req, res) => {
    const { status, target_type, limit = 50, offset = 0 } = req.query;

    const query = knex('reports')
      .select(
        'reports.*',
        knex.raw('u1.email as reporter_email'),
        knex.raw('u2.email as reviewer_email'),
      )
      .leftJoin('users as u1', 'reports.reporter_user_id', 'u1.id')
      .leftJoin('users as u2', 'reports.reviewed_by', 'u2.id')
      .orderBy('reports.created_at', 'desc')
      .limit(Math.min(parseInt(limit, 10) || 50, 200))
      .offset(parseInt(offset, 10) || 0);

    if (status && VALID_STATUSES.has(status)) {
      query.where('reports.status', status);
    }

    if (target_type && VALID_TARGET_TYPES.has(target_type)) {
      query.where('reports.target_type', target_type);
    }

    const [reports, [{ total }]] = await Promise.all([
      query,
      knex('reports')
        .count('id as total')
        .modify((q) => {
          if (status && VALID_STATUSES.has(status)) q.where('status', status);
          if (target_type && VALID_TARGET_TYPES.has(target_type)) q.where('target_type', target_type);
        }),
    ]);

    return res.json({
      success: true,
      data: reports,
      meta: { total: Number(total) },
    });
  }),
);

/**
 * PATCH /api/reports/:id
 * Update a report's status. Moderator only.
 */
router.patch(
  '/reports/:id',
  requireAuth,
  requireModerator,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !VALID_STATUSES.has(status)) {
      return res.status(400).json({
        error: 'Validation error',
        message: `status must be one of: ${[...VALID_STATUSES].join(', ')}`,
      });
    }

    const report = await knex('reports').where({ id }).first();
    if (!report) {
      return res.status(404).json({ error: 'Not found', message: 'Report not found' });
    }

    const now = new Date().toISOString();
    await knex('reports').where({ id }).update({
      status,
      updated_at: now,
      reviewed_at: now,
      reviewed_by: req.session.userId,
    });

    return res.json({ success: true, data: { id, status } });
  }),
);

/**
 * GET /api/moderation/me
 * Whether the current user is a moderator.
 */
router.get(
  '/moderation/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await knex('users').where({ id: req.session.userId }).first();
    return res.json({
      success: true,
      data: {
        isModerator: isModerator(user),
      },
    });
  }),
);

/**
 * GET /api/moderation/queue
 * List image content-moderation review items. Moderator only.
 * Query: status (pending|approved|rejected, default pending), limit (<=100)
 */
router.get(
  '/moderation/queue',
  requireAuth,
  requireModerator,
  asyncHandler(async (req, res) => {
    const statusRaw = String(req.query.status || '').toLowerCase().trim();
    const status = VALID_QUEUE_STATUSES.has(statusRaw)
      ? statusRaw
      : MODERATION_QUEUE_STATUS.PENDING;

    let limit = parseInt(String(req.query.limit || ''), 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 50;
    limit = Math.min(limit, 100);

    const rows = await knex('moderation_queue as mq')
      .leftJoin('images as i', 'mq.image_id', 'i.id')
      .where('mq.status', status)
      .orderBy('mq.created_at', 'desc')
      .limit(limit)
      .select(
        'mq.id',
        'mq.image_id',
        'mq.profile_id',
        'mq.status',
        'mq.flags',
        'mq.created_at',
        'mq.reviewed_at',
        'mq.reviewed_by',
        'i.public_url as image_public_url',
        'i.path as image_path',
        'i.moderation_reason',
      );

    return res.json({
      success: true,
      status,
      data: rows.map((row) => ({
        id: row.id,
        imageId: row.image_id,
        profileId: row.profile_id,
        status: row.status,
        flags: parseModerationFlags(row.flags),
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at,
        reviewedBy: row.reviewed_by,
        imageUrl: row.image_public_url || row.image_path || null,
        moderationReason: row.moderation_reason || null,
      })),
      meta: { count: rows.length },
    });
  }),
);

/**
 * PATCH /api/moderation/queue/:id
 * Approve or reject a queued image. Moderator only.
 */
router.patch(
  '/moderation/queue/:id',
  requireAuth,
  requireModerator,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { action, note } = req.body;

    if (!action || !VALID_QUEUE_ACTIONS.has(action)) {
      return res.status(400).json({
        error: 'Validation error',
        message: "action must be 'approve' or 'reject'",
      });
    }

    const row = await knex('moderation_queue').where({ id }).first();
    if (!row) {
      return res.status(404).json({ error: 'Not found', message: 'Queue item not found' });
    }

    const now = new Date().toISOString();
    const queueStatus =
      action === 'approve'
        ? MODERATION_QUEUE_STATUS.APPROVED
        : MODERATION_QUEUE_STATUS.REJECTED;
    const imageStatus =
      action === 'approve'
        ? MODERATION_STATUS.APPROVED
        : MODERATION_STATUS.REJECTED;

    await knex.transaction(async (trx) => {
      await trx('moderation_queue').where({ id }).update({
        status: queueStatus,
        reviewed_at: now,
        reviewed_by: req.session.userId,
        ...(note ? { flags: JSON.stringify({ ...(parseModerationFlags(row.flags)), review_note: note }) } : {}),
      });

      const hasModCol = await trx.schema.hasColumn('images', 'moderation_status');
      if (hasModCol && row.image_id) {
        await trx('images').where({ id: row.image_id }).update({
          moderation_status: imageStatus,
          moderated_at: now,
          ...(note ? { moderation_reason: String(note).slice(0, 500) } : {}),
        });
      }
    });

    return res.json({ success: true, data: { id, action, queueStatus, imageStatus } });
  }),
);

/**
 * GET /api/moderation/csam-escalations
 */
router.get(
  '/moderation/csam-escalations',
  requireAuth,
  requireModerator,
  asyncHandler(async (req, res) => {
    const hasTable = await knex.schema.hasTable('csam_escalations');
    if (!hasTable) {
      return res.json({ success: true, data: [], meta: { count: 0 } });
    }

    const rows = await knex('csam_escalations')
      .where({ status: CSAM_ESCALATION_STATUS.PENDING_REVIEW })
      .orderBy('created_at', 'desc')
      .limit(100);

    return res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        imageId: row.image_id,
        profileId: row.profile_id,
        provider: row.provider,
        severity: row.severity,
        status: row.status,
        flags: parseModerationFlags(row.flags),
        createdAt: row.created_at,
        notes: row.notes,
      })),
      meta: { count: rows.length },
    });
  }),
);

/**
 * PATCH /api/moderation/csam-escalations/:id
 */
router.patch(
  '/moderation/csam-escalations/:id',
  requireAuth,
  requireModerator,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status || !VALID_CSAM_STATUSES.has(status)) {
      return res.status(400).json({
        error: 'Validation error',
        message: `status must be one of: ${[...VALID_CSAM_STATUSES].join(', ')}`,
      });
    }

    const hasTable = await knex.schema.hasTable('csam_escalations');
    if (!hasTable) {
      return res.status(404).json({ error: 'Not found', message: 'CSAM escalations not enabled' });
    }

    const row = await knex('csam_escalations').where({ id }).first();
    if (!row) {
      return res.status(404).json({ error: 'Not found', message: 'Escalation not found' });
    }

    const now = new Date().toISOString();
    await knex('csam_escalations').where({ id }).update({
      status,
      notes: notes?.trim() || row.notes,
      reviewed_at: now,
      reviewed_by: req.session.userId,
    });

    return res.json({ success: true, data: { id, status } });
  }),
);

/**
 * POST /api/moderation/users/:userId/suspend
 * Suspend a user account. Moderator only.
 */
router.post(
  '/moderation/users/:userId/suspend',
  requireAuth,
  requireModerator,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'reason is required',
      });
    }

    const user = await knex('users').where({ id: userId }).first();
    if (!user) {
      return res.status(404).json({ error: 'Not found', message: 'User not found' });
    }

    if (user.account_status === 'banned') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'User is already banned and cannot be suspended',
      });
    }

    await knex('users').where({ id: userId }).update({
      account_status: 'suspended',
      suspended_at: new Date().toISOString(),
      suspended_reason: reason.trim(),
    });

    return res.json({ success: true, data: { userId, account_status: 'suspended' } });
  }),
);

/**
 * POST /api/moderation/users/:userId/ban
 * Permanently ban a user account. Moderator only.
 */
router.post(
  '/moderation/users/:userId/ban',
  requireAuth,
  requireModerator,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'reason is required',
      });
    }

    const user = await knex('users').where({ id: userId }).first();
    if (!user) {
      return res.status(404).json({ error: 'Not found', message: 'User not found' });
    }

    await knex('users').where({ id: userId }).update({
      account_status: 'banned',
      suspended_at: new Date().toISOString(),
      suspended_reason: reason.trim(),
    });

    return res.json({ success: true, data: { userId, account_status: 'banned' } });
  }),
);

module.exports = router;
