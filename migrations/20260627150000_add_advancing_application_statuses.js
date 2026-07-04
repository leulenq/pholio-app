/**
 * Adds two real inbound-lifecycle states that sit between "shortlisted" and a
 * signing outcome — the steps a booker actually takes before deciding:
 *
 *   requested_more    — agency asks for more digitals / specific shots / in-person
 *   meeting_requested — agency invites the talent to a meeting / go-see
 *
 * Both are "advancing" (soft-yes, non-terminal) — never a decline.
 *
 * Valid statuses after migration:
 *   pending, submitted, shortlisted, requested_more, meeting_requested,
 *   booked, passed, accepted, declined, archived, withdrawn, kept_on_file
 *
 * PostgreSQL: drop & replace the CHECK constraint.
 * SQLite: the CHECK is baked into the table at creation and can't be ALTERed in
 *   place, so we rebuild the table (the sanctioned procedure). This also repairs
 *   the prior omission of `withdrawn` and `kept_on_file` from the SQLite CHECK —
 *   those status migrations were PG-only — so dev finally matches production.
 *
 * Transactions are disabled for this migration: the SQLite rebuild must toggle
 * `PRAGMA foreign_keys` (a no-op inside a transaction) and manages its own.
 */

// Knex honours per-migration transaction control via this export.
exports.config = { transaction: false };

const ALLOWED = [
  "pending",
  "submitted",
  "shortlisted",
  "requested_more",
  "meeting_requested",
  "booked",
  "passed",
  "accepted",
  "declined",
  "archived",
  "withdrawn",
  "kept_on_file",
];

const PRIOR = ALLOWED.filter(
  (s) => s !== "requested_more" && s !== "meeting_requested",
);

async function replacePgStatusCheck(knex, allowed) {
  await knex.raw(`
    DO $$
    DECLARE _cname TEXT;
    BEGIN
      SELECT conname INTO _cname
      FROM pg_constraint
      WHERE conrelid = 'applications'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%status%'
      LIMIT 1;
      IF _cname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE applications DROP CONSTRAINT ' || quote_ident(_cname);
      END IF;
    END $$;
  `);
  const list = allowed.map((s) => `'${s}'`).join(", ");
  await knex.raw(`
    ALTER TABLE applications
      ADD CONSTRAINT applications_status_check
      CHECK (status IN (${list}))
  `);
}

// Rebuild the SQLite applications table with a new status CHECK, preserving data,
// foreign keys, and indexes. Foreign keys are disabled during the swap so the
// DROP TABLE does not cascade into child rows (activities, messages, etc.).
async function rebuildSqliteStatusCheck(knex, allowed) {
  const list = allowed.map((s) => `'${s}'`).join(", ");
  await knex.raw("PRAGMA foreign_keys = OFF");
  try {
    await knex.transaction(async (trx) => {
      await trx.raw(`
        CREATE TABLE "applications_new" (
          \`id\` char(36),
          \`profile_id\` char(36) NOT NULL,
          \`agency_id\` char(36) NOT NULL,
          \`status\` text NOT NULL CHECK (\`status\` in (${list})) DEFAULT 'pending',
          \`declined_at\` datetime NULL,
          \`accepted_at\` datetime NULL,
          \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` datetime DEFAULT CURRENT_TIMESTAMP,
          \`viewed_at\` datetime NULL,
          \`invited_by_agency_id\` char(36) NULL,
          \`board_id\` char(36) NULL,
          \`match_score\` integer NULL,
          \`match_calculated_at\` datetime NULL,
          PRIMARY KEY (\`id\`),
          FOREIGN KEY (\`profile_id\`) REFERENCES \`profiles\` (\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`agency_id\`) REFERENCES \`agencies\` (\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`invited_by_agency_id\`) REFERENCES \`agencies\` (\`id\`) ON DELETE SET NULL,
          FOREIGN KEY (\`board_id\`) REFERENCES \`boards\` (\`id\`) ON DELETE SET NULL
        )
      `);
      await trx.raw(`
        INSERT INTO "applications_new"
          (id, profile_id, agency_id, status, declined_at, accepted_at, created_at,
           updated_at, viewed_at, invited_by_agency_id, board_id, match_score, match_calculated_at)
        SELECT
           id, profile_id, agency_id, status, declined_at, accepted_at, created_at,
           updated_at, viewed_at, invited_by_agency_id, board_id, match_score, match_calculated_at
        FROM "applications"
      `);
      await trx.raw('DROP TABLE "applications"');
      await trx.raw('ALTER TABLE "applications_new" RENAME TO "applications"');
      await trx.raw(
        'CREATE UNIQUE INDEX `applications_profile_id_agency_id_unique` ON `applications` (`profile_id`, `agency_id`)',
      );
      await trx.raw(
        "CREATE INDEX `applications_agency_id_index` ON `applications` (`agency_id`)",
      );
      await trx.raw(
        "CREATE INDEX `applications_profile_id_index` ON `applications` (`profile_id`)",
      );
      await trx.raw(
        "CREATE INDEX `applications_status_index` ON `applications` (`status`)",
      );
      await trx.raw(
        "CREATE INDEX applications_board_id_index ON applications(board_id)",
      );
      await trx.raw(
        "CREATE INDEX applications_match_score_index ON applications(match_score)",
      );
    });
    // Note: we intentionally do NOT assert PRAGMA foreign_key_check here. The
    // row copy is faithful (identical ids), so this rebuild cannot introduce new
    // violations; the DB may carry pre-existing orphans (e.g. from the legacy
    // hard-delete withdraw flow) that are unrelated to this migration.
  } finally {
    await knex.raw("PRAGMA foreign_keys = ON");
  }
}

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  if (knex.client.config.client === "pg") {
    await replacePgStatusCheck(knex, ALLOWED);
  } else {
    await rebuildSqliteStatusCheck(knex, ALLOWED);
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  // Lossy: collapse the new advancing states back into shortlisted (the nearest
  // prior advancing state) before re-narrowing the constraint.
  await knex("applications")
    .whereIn("status", ["requested_more", "meeting_requested"])
    .update({ status: "shortlisted" });

  if (knex.client.config.client === "pg") {
    await replacePgStatusCheck(knex, PRIOR);
  } else {
    await rebuildSqliteStatusCheck(knex, PRIOR);
  }
};
