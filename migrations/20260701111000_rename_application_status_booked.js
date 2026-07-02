/**
 * Rename application status 'booked' to 'represented' and update constraints.
 */

exports.config = { transaction: false };

const ALLOWED_WITH_REPRESENTED = [
  "pending",
  "submitted",
  "shortlisted",
  "requested_more",
  "meeting_requested",
  "development",
  "represented",
  "passed",
  "accepted",
  "declined",
  "archived",
  "withdrawn",
  "kept_on_file",
];

const PRIOR_WITH_BOOKED = [
  "pending",
  "submitted",
  "shortlisted",
  "requested_more",
  "meeting_requested",
  "development",
  "booked",
  "passed",
  "accepted",
  "declined",
  "archived",
  "withdrawn",
  "kept_on_file",
];

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

  const list = allowed.map((status) => `'${status}'`).join(", ");
  await knex.raw(`
    ALTER TABLE applications
      ADD CONSTRAINT applications_status_check
      CHECK (status IN (${list}))
  `);
}

async function rebuildSqliteStatusCheck(knex, allowed, isUp) {
  const list = allowed.map((status) => `'${status}'`).join(", ");
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
      
      const statusMapping = isUp 
        ? "CASE WHEN status = 'booked' THEN 'represented' ELSE status END"
        : "CASE WHEN status = 'represented' THEN 'booked' ELSE status END";

      await trx.raw(`
        INSERT INTO "applications_new"
          (id, profile_id, agency_id, status, declined_at, accepted_at, created_at,
           updated_at, viewed_at, invited_by_agency_id, board_id, match_score, match_calculated_at)
        SELECT
           id, profile_id, agency_id, ${statusMapping}, declined_at, accepted_at, created_at,
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
  } finally {
    await knex.raw("PRAGMA foreign_keys = ON");
  }
}

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  if (knex.client.config.client === "pg") {
    // 1. Drop PG Check constraint temporarily
    await knex.raw(`
      ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check
    `);
    
    // 2. Perform the update
    await knex("applications")
      .where({ status: "booked" })
      .update({ status: "represented" });

    // 3. Re-add PG check constraint
    await replacePgStatusCheck(knex, ALLOWED_WITH_REPRESENTED);
  } else {
    await rebuildSqliteStatusCheck(knex, ALLOWED_WITH_REPRESENTED, true);
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  if (knex.client.config.client === "pg") {
    await knex.raw(`
      ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check
    `);

    await knex("applications")
      .where({ status: "represented" })
      .update({ status: "booked" });

    await replacePgStatusCheck(knex, PRIOR_WITH_BOOKED);
  } else {
    await rebuildSqliteStatusCheck(knex, PRIOR_WITH_BOOKED, false);
  }
};
