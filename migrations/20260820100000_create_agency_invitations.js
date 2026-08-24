"use strict";

/**
 * An invitation is not an application.
 *
 * `POST /api/agency/discover/:profileId/invite` (and its legacy page-route twin
 * in `roster.js`) recorded an agency's interest by inserting an `applications`
 * row with `status: "pending"` and `invited_by_agency_id` set. The talent had
 * done nothing. Two things followed from that, both wrong:
 *
 * 1. The row satisfied the ownership check in
 *    `GET /api/agency/applications/:applicationId/details`, so the agency was
 *    served the submission-grade profile — `AGENCY_SUBMISSION_SELECT` carries
 *    `AGE_GATING_COLUMNS`, i.e. exact `date_of_birth` — plus the talent's email,
 *    for someone who had never applied to them. The Discover view they invited
 *    from deliberately exposes neither: it shows `age_band` and no contact.
 *
 * 2. `applications.js` derives `alreadyAppliedToTarget` from the existence of an
 *    `applications` row for (profile, agency). The invitation *was* that row, so
 *    the talent was told they had already applied to an agency they had never
 *    applied to.
 *
 * Both are the same modelling error, so both are fixed the same way: an
 * invitation gets its own table, and an `applications` row is created only when
 * the talent actually applies.
 *
 * `applications.invited_by_agency_id` is deliberately KEPT. It stops being a
 * marker of "an agency invited this person" — which is what made it dangerous —
 * and becomes what the agency dossier already reads it as: provenance on a real
 * application, written at apply time when a matching invitation exists. That
 * preserves `talent-dossier.js`'s `invited` flag with its honest meaning ("she
 * applied after we invited her") and costs no schema change.
 *
 * No backfill: production holds zero `applications` rows with
 * `invited_by_agency_id` set, so there is nothing to migrate out and no
 * destructive delete to perform.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("agency_invitations")) return;

  await knex.schema.createTable("agency_invitations", (table) => {
    table.uuid("id").primary();
    table
      .uuid("agency_id")
      .notNullable()
      .references("id")
      .inTable("agencies")
      .onDelete("CASCADE");
    table
      .uuid("profile_id")
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    // One standing invitation per pair. This is what preserves the endpoint's
    // existing 409 ("You have already invited this talent") now that the
    // `applications` row no longer serves as the uniqueness record.
    table.unique(["agency_id", "profile_id"], {
      indexName: "agency_invitations_agency_profile_unique",
    });
    // The talent-side lookup ("has anyone invited me?") keys on profile alone.
    table.index(["profile_id"], "agency_invitations_profile_idx");
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("agency_invitations");
};
