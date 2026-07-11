#!/usr/bin/env node
/**
 * Moderation review queue — ops CLI (WS10 / PR 12).
 *
 * Flagged uploads (images.moderation_status = 'review') land in the
 * moderation_queue as visible, actionable pending items. This CLI is the ops
 * counterpart to the moderator HTTP API (src/domains/moderation/routes/reports.js).
 *
 * Usage:
 *   npm run moderation:queue -- list [--status pending|approved|rejected] [--limit 50]
 *   npm run moderation:queue -- approve <image_id>
 *   npm run moderation:queue -- reject <image_id> [--reason "why"]
 *   npm run moderation:queue -- stats
 *
 * Notes:
 *   - approve/reject act on the IMAGE id (as shown by `list`), updating both
 *     images.moderation_status and every pending queue row for that image.
 *   - `list --status pending` also surfaces "orphaned" review-status images
 *     that have no pending queue row (legacy/limbo rows), so nothing flagged
 *     can hide from the queue.
 *   - Reject does NOT purge stored bytes (mirrors the moderator API): the
 *     visibility filters hide rejected images everywhere, and evidence
 *     preservation is required by tasks/csam-escalation-runbook.md. The R2
 *     storage key is printed so ops can purge deliberately when appropriate.
 *   - Dual-dialect (SQLite + PostgreSQL) via Knex; date math is done in JS.
 */

const knex = require("../src/shared/db/knex");
const crypto = require("crypto");
const {
  MODERATION_STATUS,
  MODERATION_QUEUE_STATUS,
} = require("../src/shared/lib/content-moderation");

const VALID_LIST_STATUSES = new Set(Object.values(MODERATION_QUEUE_STATUS));

/** Parse queue flags that may arrive as a JSON string (sqlite) or object (pg). */
function parseFlags(raw) {
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ageLabel(createdAt) {
  const d = toDate(createdAt);
  if (!d) return "unknown age";
  const ms = Date.now() - d.getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return "<1h";
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** One-line human summary of the stored provider verdict. */
function verdictSummary(flags, moderationReason) {
  const parts = [];
  const provider = flags.provider || "heuristic";
  parts.push(`provider=${provider}`);
  if (moderationReason) parts.push(`reason=${moderationReason}`);
  if (Number.isFinite(Number(flags.skinRatio))) {
    parts.push(`skinRatio=${Number(flags.skinRatio).toFixed(3)}`);
  }
  if (flags.hiveScores && typeof flags.hiveScores === "object") {
    const scores = Object.entries(flags.hiveScores)
      .map(([cls, score]) => `${cls}=${Number(score).toFixed(3)}`)
      .join(" ");
    if (scores) parts.push(`hive[${scores}]`);
  }
  if (flags.csam_escalation) parts.push("CSAM-ESCALATION(see runbook)");
  return parts.join(" ");
}

/**
 * List queue items (optionally filtered by queue status). For `pending`, also
 * appends review-status images that have no pending queue row so flagged
 * images can never hide from the queue.
 *
 * @returns {Promise<Array<object>>} plain item objects (also printed by main)
 */
async function listQueue({ status = MODERATION_QUEUE_STATUS.PENDING, limit = 50, db = knex } = {}) {
  const effectiveStatus = VALID_LIST_STATUSES.has(status)
    ? status
    : MODERATION_QUEUE_STATUS.PENDING;
  const effectiveLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);

  const rows = await db("moderation_queue as mq")
    .leftJoin("images as i", "mq.image_id", "i.id")
    .leftJoin("profiles as p", "mq.profile_id", "p.id")
    .where("mq.status", effectiveStatus)
    .orderBy("mq.created_at", "asc")
    .limit(effectiveLimit)
    .select(
      "mq.id as queue_id",
      "mq.image_id",
      "mq.profile_id",
      "mq.status as queue_status",
      "mq.flags",
      "mq.created_at",
      "mq.reviewed_at",
      "i.moderation_status",
      "i.moderation_reason",
      "i.storage_key",
      "i.public_url",
      "i.path",
      "i.created_at as uploaded_at",
      "p.first_name",
      "p.last_name",
      "p.slug",
    );

  const items = rows.map((row) => ({
    queueId: row.queue_id,
    imageId: row.image_id,
    profileId: row.profile_id,
    profileName:
      [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
    profileSlug: row.slug || null,
    queueStatus: row.queue_status,
    imageModerationStatus: row.moderation_status || null,
    flags: parseFlags(row.flags),
    moderationReason: row.moderation_reason || null,
    storageKey: row.storage_key || null,
    imageUrl: row.public_url || row.path || null,
    uploadedAt: row.uploaded_at || row.created_at || null,
    queuedAt: row.created_at || null,
    reviewedAt: row.reviewed_at || null,
    orphaned: false,
  }));

  // Limbo guard: review-status images with no PENDING queue row.
  if (effectiveStatus === MODERATION_QUEUE_STATUS.PENDING) {
    const orphanRows = await db("images as i")
      .leftJoin("profiles as p", "i.profile_id", "p.id")
      .where("i.moderation_status", MODERATION_STATUS.REVIEW)
      .whereNotIn(
        "i.id",
        db("moderation_queue")
          .select("image_id")
          .where("status", MODERATION_QUEUE_STATUS.PENDING)
          .whereNotNull("image_id"),
      )
      .orderBy("i.created_at", "asc")
      .limit(effectiveLimit)
      .select(
        "i.id as image_id",
        "i.profile_id",
        "i.moderation_status",
        "i.moderation_reason",
        "i.storage_key",
        "i.public_url",
        "i.path",
        "i.created_at as uploaded_at",
        "p.first_name",
        "p.last_name",
        "p.slug",
      );

    for (const row of orphanRows) {
      items.push({
        queueId: null,
        imageId: row.image_id,
        profileId: row.profile_id,
        profileName:
          [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
        profileSlug: row.slug || null,
        queueStatus: null,
        imageModerationStatus: row.moderation_status || null,
        flags: {},
        moderationReason: row.moderation_reason || null,
        storageKey: row.storage_key || null,
        imageUrl: row.public_url || row.path || null,
        uploadedAt: row.uploaded_at || null,
        queuedAt: null,
        reviewedAt: null,
        orphaned: true,
      });
    }
  }

  return items;
}

/**
 * Resolve a pending image: update images.moderation_status and every pending
 * queue row for it. If no queue row exists (orphaned review image), a resolved
 * row is inserted so the action is auditable. Shared by approve/reject.
 */
async function resolveImage(imageId, action, { reason = null, db = knex } = {}) {
  if (!imageId) throw new Error("image_id is required");
  const approve = action === "approve";
  const imageStatus = approve
    ? MODERATION_STATUS.APPROVED
    : MODERATION_STATUS.REJECTED;
  const queueStatus = approve
    ? MODERATION_QUEUE_STATUS.APPROVED
    : MODERATION_QUEUE_STATUS.REJECTED;

  const image = await db("images").where({ id: imageId }).first();
  if (!image) {
    throw new Error(`Image not found: ${imageId}`);
  }
  const previousStatus = image.moderation_status || null;
  if (previousStatus !== MODERATION_STATUS.REVIEW) {
    console.warn(
      `[moderation-queue] warning: image ${imageId} has moderation_status='${previousStatus}' (not 'review') — proceeding anyway.`,
    );
  }

  const now = new Date().toISOString();

  await db.transaction(async (trx) => {
    await trx("images")
      .where({ id: imageId })
      .update({
        moderation_status: imageStatus,
        moderated_at: now,
        ...(reason ? { moderation_reason: String(reason).slice(0, 500) } : {}),
      });

    const pendingRows = await trx("moderation_queue")
      .where({ image_id: imageId, status: MODERATION_QUEUE_STATUS.PENDING })
      .select("id", "flags");

    if (pendingRows.length > 0) {
      for (const row of pendingRows) {
        await trx("moderation_queue")
          .where({ id: row.id })
          .update({
            status: queueStatus,
            reviewed_at: now,
            flags: JSON.stringify({
              ...parseFlags(row.flags),
              reviewed_via: "cli",
              ...(reason ? { review_note: String(reason).slice(0, 500) } : {}),
            }),
          });
      }
    } else {
      // Orphaned review image — insert a resolved row for the audit trail.
      await trx("moderation_queue").insert({
        id: crypto.randomUUID(),
        image_id: imageId,
        profile_id: image.profile_id || null,
        status: queueStatus,
        flags: JSON.stringify({
          reviewed_via: "cli",
          orphaned_review_image: true,
          ...(reason ? { review_note: String(reason).slice(0, 500) } : {}),
        }),
        created_at: now,
        reviewed_at: now,
      });
    }
  });

  return {
    imageId,
    action,
    previousStatus,
    imageStatus,
    queueStatus,
    storageKey: image.storage_key || null,
  };
}

function approveImage(imageId, opts = {}) {
  return resolveImage(imageId, "approve", opts);
}

function rejectImage(imageId, opts = {}) {
  return resolveImage(imageId, "reject", opts);
}

/** Counts by queue status / image moderation status, plus pending-age buckets. */
async function stats({ db = knex } = {}) {
  const queueCounts = {};
  for (const row of await db("moderation_queue")
    .select("status")
    .count({ n: "*" })
    .groupBy("status")) {
    queueCounts[row.status] = Number(row.n);
  }

  const imageCounts = {};
  for (const row of await db("images")
    .select("moderation_status")
    .count({ n: "*" })
    .groupBy("moderation_status")) {
    imageCounts[row.moderation_status == null ? "null" : row.moderation_status] =
      Number(row.n);
  }

  const pendingRows = await db("moderation_queue")
    .where({ status: MODERATION_QUEUE_STATUS.PENDING })
    .select("created_at");
  const nowMs = Date.now();
  let over24h = 0;
  let over72h = 0;
  let oldest = null;
  for (const row of pendingRows) {
    const d = toDate(row.created_at);
    if (!d) continue;
    const ageMs = nowMs - d.getTime();
    if (ageMs > 24 * 3600000) over24h += 1;
    if (ageMs > 72 * 3600000) over72h += 1;
    if (!oldest || d < oldest) oldest = d;
  }

  const orphanCount = Number(
    (
      await db("images")
        .where("moderation_status", MODERATION_STATUS.REVIEW)
        .whereNotIn(
          "id",
          db("moderation_queue")
            .select("image_id")
            .where("status", MODERATION_QUEUE_STATUS.PENDING)
            .whereNotNull("image_id"),
        )
        .count({ n: "*" })
        .first()
    )?.n || 0,
  );

  return {
    queue: queueCounts,
    images: imageCounts,
    pending: {
      total: pendingRows.length,
      over24h,
      over72h,
      oldestQueuedAt: oldest ? oldest.toISOString() : null,
      orphanedReviewImages: orphanCount,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI plumbing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        options[key] = next;
        i += 1;
      } else {
        options[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}

function printItem(item) {
  const who = item.profileName
    ? `${item.profileName} (${item.profileSlug || item.profileId})`
    : item.profileId || "unknown profile";
  const lines = [
    `image ${item.imageId}  [${item.orphaned ? "NO QUEUE ROW — orphaned review image" : `queue ${item.queueId}`}]`,
    `  profile:   ${who}`,
    `  uploaded:  ${item.uploadedAt || "unknown"} (${ageLabel(item.uploadedAt)} ago)`,
    `  verdict:   ${verdictSummary(item.flags, item.moderationReason)}`,
    `  r2 key:    ${item.storageKey || "(local/none)"}`,
    `  url:       ${item.imageUrl || "(none)"}`,
  ];
  console.log(lines.join("\n"));
}

function usage() {
  console.log(
    [
      "Moderation review queue CLI",
      "",
      "  node scripts/moderation-queue.js list [--status pending|approved|rejected] [--limit 50]",
      "  node scripts/moderation-queue.js approve <image_id>",
      "  node scripts/moderation-queue.js reject <image_id> [--reason \"why\"]",
      "  node scripts/moderation-queue.js stats",
    ].join("\n"),
  );
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  switch (command) {
    case "list": {
      const items = await listQueue({
        status: options.status,
        limit: options.limit,
      });
      if (items.length === 0) {
        console.log(
          `No ${options.status || "pending"} moderation items. Queue is clear.`,
        );
        break;
      }
      console.log(
        `${items.length} ${options.status || "pending"} item(s) (oldest first):\n`,
      );
      for (const item of items) {
        printItem(item);
        console.log("");
      }
      break;
    }
    case "approve": {
      const imageId = positional[1];
      if (!imageId) throw new Error("usage: approve <image_id>");
      const result = await approveImage(imageId);
      console.log(
        `Approved image ${result.imageId} (was '${result.previousStatus}') — now visible to public/agency surfaces.`,
      );
      break;
    }
    case "reject": {
      const imageId = positional[1];
      if (!imageId) throw new Error("usage: reject <image_id> [--reason \"why\"]");
      const reason =
        typeof options.reason === "string" ? options.reason : null;
      const result = await rejectImage(imageId, { reason });
      console.log(
        `Rejected image ${result.imageId} (was '${result.previousStatus}') — hidden from all viewer surfaces.`,
      );
      if (result.storageKey) {
        console.log(
          `Stored bytes were NOT purged (R2 key: ${result.storageKey}). Purge deliberately if policy requires; see tasks/csam-escalation-runbook.md before destroying potential evidence.`,
        );
      }
      break;
    }
    case "stats": {
      const s = await stats();
      console.log("Queue by status: ", JSON.stringify(s.queue));
      console.log("Images by moderation_status:", JSON.stringify(s.images));
      console.log(
        `Pending: ${s.pending.total} total · ${s.pending.over24h} older than 24h · ${s.pending.over72h} older than 72h`,
      );
      console.log(`Oldest pending queued at: ${s.pending.oldestQueuedAt || "—"}`);
      if (s.pending.orphanedReviewImages > 0) {
        console.log(
          `WARNING: ${s.pending.orphanedReviewImages} review-status image(s) have no pending queue row — run \`list\` to see and action them.`,
        );
      }
      break;
    }
    default:
      usage();
      if (command) throw new Error(`Unknown command: ${command}`);
  }
}

module.exports = { listQueue, approveImage, rejectImage, stats, parseFlags };

if (require.main === module) {
  main()
    .then(() => knex.destroy())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error(`[moderation-queue] ${err.message}`);
      await knex.destroy().catch(() => {});
      process.exit(1);
    });
}
