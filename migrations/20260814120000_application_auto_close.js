/**
 * Auto-close — Part B3 of the August 2026 product plan.
 *
 * Agencies deliberately do not respond to most applications, and several
 * publish that policy. The product answer is not to ask bookers to change
 * behaviour; it is to make silence resolve on its own so the talent gets
 * certainty without anyone doing anything.
 *
 * Three pieces of schema:
 *
 * - `agencies.application_review_window_days` — how long the agency's silence
 *   should mean "still deciding". Defaults to 30 for every agency, including
 *   existing ones, because a default nobody sets is the whole feature. `0`
 *   turns auto-close off for that agency.
 *
 * - `applications.status_changed_at` — the clock the window runs against. It
 *   answers "how long has the agency been sitting on this", which neither
 *   `created_at` (never moves) nor `updated_at` (moves for talent-side and
 *   system writes too) can answer honestly. Backfilled from what we have.
 *
 * - `applications.auto_closed_at` — set only when the system closed it. An
 *   agency that never acted has not "passed"; keeping the automatic close
 *   distinguishable from a decision it made is the difference between
 *   reporting a fact and putting words in a booker's mouth.
 *
 * And one new status, `closed_no_response`, which for the same reason is
 * deliberately absent from `WRITABLE_APPLICATION_STATUSES`: the system may
 * write it, an agency may not.
 */

exports.config = { transaction: false };

const ALLOWED = [
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
  "closed_no_response",
];

const PRIOR = ALLOWED.filter((status) => status !== "closed_no_response");

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

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const isPg = knex.client.config.client === "pg";

  if (!(await knex.schema.hasColumn("agencies", "application_review_window_days"))) {
    await knex.schema.alterTable("agencies", (table) => {
      table.integer("application_review_window_days").notNullable().defaultTo(30);
    });
  }

  const hasStatusChangedAt = await knex.schema.hasColumn(
    "applications",
    "status_changed_at",
  );
  if (!hasStatusChangedAt) {
    await knex.schema.alterTable("applications", (table) => {
      table.timestamp("status_changed_at").nullable();
      table.timestamp("auto_closed_at").nullable();
    });
    // Best available anchor for rows that predate the column. `updated_at`
    // overstates how long some have been waiting and understates others, but
    // it is the only evidence on the row; the alternative is closing a
    // five-month-old application tomorrow because the clock started today.
    await knex("applications")
      .whereNull("status_changed_at")
      .update({
        status_changed_at: knex.raw("COALESCE(updated_at, created_at)"),
      });
  }

  // The daily job scans by (status, status_changed_at).
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_applications_open_status_changed ON applications (status, status_changed_at)",
  );

  if (isPg) await replacePgStatusCheck(knex, ALLOWED);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const isPg = knex.client.config.client === "pg";

  // Lossy but honest: an auto-closed application is closer to `archived` than
  // to any decision the agency made.
  await knex("applications")
    .where({ status: "closed_no_response" })
    .update({ status: "archived" });

  if (isPg) await replacePgStatusCheck(knex, PRIOR);

  await knex.raw("DROP INDEX IF EXISTS idx_applications_open_status_changed");

  if (await knex.schema.hasColumn("applications", "status_changed_at")) {
    await knex.schema.alterTable("applications", (table) => {
      table.dropColumn("status_changed_at");
      table.dropColumn("auto_closed_at");
    });
  }
  if (await knex.schema.hasColumn("agencies", "application_review_window_days")) {
    await knex.schema.alterTable("agencies", (table) => {
      table.dropColumn("application_review_window_days");
    });
  }
};
