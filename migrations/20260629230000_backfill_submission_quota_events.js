"use strict";

const crypto = require("crypto");

/**
 * Count every successful legacy application as one immutable submission event.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (
    !(await knex.schema.hasTable("applications")) ||
    !(await knex.schema.hasTable("application_submission_requests"))
  ) {
    return;
  }

  await knex.schema.alterTable("application_submission_requests", (table) => {
    table.index(
      ["profile_id", "status", "completed_at"],
      "idx_submission_requests_profile_status_completed",
    );
  });

  const applications = await knex("applications as a")
    .leftJoin("application_submission_requests as sr", function joinRequests() {
      this.on("sr.application_id", "=", "a.id").andOn(
        "sr.status",
        "=",
        knex.raw("?", ["completed"]),
      );
    })
    .whereNull("sr.id")
    .select(
      "a.id",
      "a.profile_id",
      "a.agency_id",
      "a.created_at",
      "a.updated_at",
    );

  if (applications.length > 0) {
    await knex("application_submission_requests").insert(
      applications.map((application) => {
        const completedAt = application.created_at || knex.fn.now();
        return {
          id: crypto.randomUUID(),
          profile_id: application.profile_id,
          agency_id: application.agency_id,
          idempotency_key: `legacy:${application.id}`,
          request_hash: crypto
            .createHash("sha256")
            .update(`legacy:${application.id}`)
            .digest("hex"),
          application_id: application.id,
          status: "completed",
          created_at: application.created_at || completedAt,
          completed_at: completedAt,
        };
      }),
    );
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable("application_submission_requests"))) return;
  await knex("application_submission_requests")
    .where("idempotency_key", "like", "legacy:%")
    .delete();
  await knex.schema.alterTable("application_submission_requests", (table) => {
    table.dropIndex(
      ["profile_id", "status", "completed_at"],
      "idx_submission_requests_profile_status_completed",
    );
  });
};
