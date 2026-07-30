/**
 * Migration: mark the submitted cover note inside the messages table
 * Date: 2026-07-29
 *
 * The talent's submission note is written into `messages` so it opens the
 * agency's thread, but nothing distinguished it from ordinary chat. The
 * applications list therefore re-derived it as "the earliest TALENT message",
 * so any talent who messaged an agency after a note-less submission saw their
 * chat surface as "Your note". Flag the note explicitly instead.
 */

// A note row is written inside the same transaction as its submission, so it
// lands within a second of the submission anchor. 60s is generous slack for a
// slow transaction while staying well below the time it takes a person to open
// a thread and type a reply.
const NOTE_ANCHOR_WINDOW_MS = 60 * 1000;

// SQLite caps bound parameters per statement, so every whereIn is chunked.
const CHUNK = 200;

function chunk(values) {
  const out = [];
  for (let i = 0; i < values.length; i += CHUNK) out.push(values.slice(i, i + CHUNK));
  return out;
}

function toMillis(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

exports.up = async function (knex) {
  const flagged = await knex.schema.hasColumn("messages", "is_submission_note");
  if (!flagged) {
    await knex.schema.table("messages", (table) => {
      table.boolean("is_submission_note").notNullable().defaultTo(false);
      table.index(["application_id", "is_submission_note"]);
    });
  }

  // Backfill. The earliest TALENT message on an application is its note only if
  // it was written at submission time, so each candidate is checked against the
  // submission snapshots (one row per send, which covers resubmissions) and the
  // application's own creation for rows that predate snapshots. Candidates that
  // match no anchor are ordinary chat and stay unflagged.
  const talentMessages = await knex("messages")
    .where({ sender_type: "TALENT" })
    .orderBy("application_id")
    .orderBy("created_at", "asc")
    .select("id", "application_id", "created_at");
  if (talentMessages.length === 0) return;

  const earliestByApplication = new Map();
  for (const row of talentMessages) {
    if (!earliestByApplication.has(row.application_id)) {
      earliestByApplication.set(row.application_id, row);
    }
  }
  const applicationIds = [...earliestByApplication.keys()];

  const anchors = new Map();
  const addAnchor = (applicationId, value) => {
    const ms = toMillis(value);
    if (ms === null) return;
    if (!anchors.has(applicationId)) anchors.set(applicationId, []);
    anchors.get(applicationId).push(ms);
  };

  for (const ids of chunk(applicationIds)) {
    const rows = await knex("applications").whereIn("id", ids).select("id", "created_at");
    for (const row of rows) addAnchor(row.id, row.created_at);
  }

  if (await knex.schema.hasTable("talent_submission_packages")) {
    for (const ids of chunk(applicationIds)) {
      const rows = await knex("talent_submission_packages")
        .whereIn("application_id", ids)
        .select("application_id", "created_at");
      for (const row of rows) addAnchor(row.application_id, row.created_at);
    }
  }

  const noteIds = [];
  for (const [applicationId, message] of earliestByApplication) {
    const sentAt = toMillis(message.created_at);
    if (sentAt === null) continue;
    const atSubmission = (anchors.get(applicationId) || []).some(
      (anchor) => Math.abs(sentAt - anchor) <= NOTE_ANCHOR_WINDOW_MS,
    );
    if (atSubmission) noteIds.push(message.id);
  }

  for (const ids of chunk(noteIds)) {
    await knex("messages").whereIn("id", ids).update({ is_submission_note: true });
  }
};

exports.down = async function (knex) {
  const flagged = await knex.schema.hasColumn("messages", "is_submission_note");
  if (!flagged) return;
  await knex.schema.table("messages", (table) => {
    table.dropIndex(["application_id", "is_submission_note"]);
    table.dropColumn("is_submission_note");
  });
};
