"use strict";

const { v4: uuidv4 } = require("uuid");

/**
 * Backfill division selections for applications that already had a package
 * snapshot before application_submission_boards existed.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (
    !(await knex.schema.hasTable("talent_submission_packages")) ||
    !(await knex.schema.hasTable("application_submission_boards"))
  ) {
    return;
  }

  const packages = await knex("talent_submission_packages")
    .whereNotNull("application_id")
    .orderBy("created_at", "desc")
    .select("application_id", "payload");
  const latestByApplication = new Map();
  for (const packageRow of packages) {
    if (!latestByApplication.has(packageRow.application_id)) {
      latestByApplication.set(packageRow.application_id, packageRow);
    }
  }

  const applicationIds = [...latestByApplication.keys()];
  if (applicationIds.length === 0) return;
  const applications = await knex("applications")
    .whereIn("id", applicationIds)
    .select("id", "agency_id");
  const agencyByApplication = new Map(
    applications.map((application) => [
      application.id,
      application.agency_id,
    ]),
  );

  for (const [applicationId, packageRow] of latestByApplication) {
    const agencyId = agencyByApplication.get(applicationId);
    if (!agencyId) continue;
    const payload = parsePayload(packageRow.payload);
    const boards = [
      ...new Set(
        (Array.isArray(payload.boards) ? payload.boards : [])
          .filter((board) => typeof board === "string")
          .map((board) => board.trim())
          .filter(Boolean),
      ),
    ];
    for (const boardName of boards) {
      const exists = await knex("application_submission_boards")
        .where({
          application_id: applicationId,
          board_name: boardName,
        })
        .first("id");
      if (!exists) {
        await knex("application_submission_boards").insert({
          id: uuidv4(),
          application_id: applicationId,
          agency_id: agencyId,
          board_name: boardName,
          created_at: knex.fn.now(),
        });
      }
    }
  }
};

// Data backfills are intentionally retained on rollback because rows created
// by the migration are indistinguishable from subsequent valid submissions.
exports.down = async function down() {};

function parsePayload(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
