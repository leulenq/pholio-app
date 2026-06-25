/**
 * Adds the 'withdrawn' application status so talent withdrawals are preserved
 * as a state change (and keep their history) instead of hard-deleting the row.
 *
 * Also restores 'pending' to the allowed set: the app inserts new applications
 * as 'pending', but the previous CHECK (from the expand-statuses migration)
 * omitted it, so on PostgreSQL a fresh application could violate the constraint.
 *
 * Valid statuses after migration:
 *   pending, submitted, shortlisted, booked, passed, accepted, declined,
 *   archived, withdrawn
 *
 * SQLite: TEXT column with CHECK — can't ALTER CHECK without table recreation;
 *   app-level validation enforces valid values going forward (no-op here).
 * PostgreSQL: drop and replace the CHECK constraint.
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
  const isPg = knex.client.config.client === "pg";
  if (isPg) {
    await replaceStatusCheck(knex, ALLOWED);
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  // Lossy: collapse withdrawn into archived to satisfy the prior constraint.
  await knex("applications")
    .where("status", "withdrawn")
    .update({ status: "archived" });

  const isPg = knex.client.config.client === "pg";
  if (isPg) {
    await replaceStatusCheck(knex, [
      "submitted",
      "shortlisted",
      "booked",
      "passed",
      "accepted",
      "declined",
      "archived",
    ]);
  }
};
