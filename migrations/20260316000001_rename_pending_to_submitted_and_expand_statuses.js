/**
 * Renames the 'pending' application status to 'submitted' and adds
 * three new pipeline statuses: 'shortlisted', 'booked', 'passed'.
 *
 * Valid statuses after migration:
 *   submitted, shortlisted, booked, passed, accepted, declined, archived
 *
 * SQLite: TEXT column with CHECK — data is updated, old constraint is left
 *   in place (SQLite can't ALTER CHECK constraints without table recreation;
 *   app-level validation enforces valid values going forward).
 * PostgreSQL: data is updated, old CHECK constraint is dropped and replaced.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  // Step 1 — backfill data (both DBs)
  await knex('applications').where('status', 'pending').update({ status: 'submitted' })

  // Step 2 — PostgreSQL only: replace CHECK constraint to allow all 7 values
  const isPg = knex.client.config.client === 'pg'
  if (isPg) {
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
    `)
    await knex.raw(`
      ALTER TABLE applications
        ADD CONSTRAINT applications_status_check
        CHECK (status IN (
          'submitted', 'shortlisted', 'booked', 'passed',
          'accepted', 'declined', 'archived'
        ))
    `)
  }
}

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  // Rename submitted back to pending
  await knex('applications').where('status', 'submitted').update({ status: 'pending' })

  // The statuses added by this migration ('shortlisted', 'booked', 'passed') have no
  // equivalent in the pre-migration schema. Rolling back is a LOSSY operation:
  //   shortlisted → pending  (still under review, not yet decided)
  //   booked      → accepted (closest positive outcome in old schema)
  //   passed      → declined (closest negative outcome in old schema)
  // This preserves constraint integrity at the cost of semantic fidelity.
  await knex('applications').where('status', 'shortlisted').update({ status: 'pending' })
  await knex('applications').where('status', 'booked').update({ status: 'accepted' })
  await knex('applications').where('status', 'passed').update({ status: 'declined' })

  const isPg = knex.client.config.client === 'pg'
  if (isPg) {
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
    `)
    await knex.raw(`
      ALTER TABLE applications
        ADD CONSTRAINT applications_status_check
        CHECK (status IN ('pending', 'accepted', 'archived', 'declined'))
    `)
  }
}
