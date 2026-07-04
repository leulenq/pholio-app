/**
 * Adds the 'kept_on_file' application status — a soft outcome where the agency
 * keeps a talent for future consideration instead of a hard decline.
 *
 * Valid statuses after migration:
 *   pending, submitted, shortlisted, booked, passed, accepted, declined,
 *   archived, withdrawn, kept_on_file
 *
 * SQLite: CHECK can't be altered without table recreation; app-level validation
 *   enforces valid values (no-op here). PostgreSQL: drop & replace the CHECK.
 */

const ALLOWED = [
  "pending",
  "submitted",
  "shortlisted",
  "booked",
  "passed",
  "accepted",
  "declined",
  "archived",
  "withdrawn",
  "kept_on_file",
];

async function replaceStatusCheck(knex, allowed) {
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

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  if (knex.client.config.client === "pg") {
    await replaceStatusCheck(knex, ALLOWED);
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  // Lossy: collapse kept_on_file into archived to satisfy the prior constraint.
  await knex("applications")
    .where("status", "kept_on_file")
    .update({ status: "archived" });

  if (knex.client.config.client === "pg") {
    await replaceStatusCheck(knex, ALLOWED.filter((s) => s !== "kept_on_file"));
  }
};
