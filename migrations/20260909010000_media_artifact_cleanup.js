"use strict";

/** Bind moderation decisions to the exact processed bytes that were reviewed. */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("images")) {
    const hasContentHash = await knex.schema.hasColumn("images", "content_sha256");
    const hasOriginalHash = await knex.schema.hasColumn(
      "images",
      "original_content_sha256",
    );
    if (!hasContentHash || !hasOriginalHash) {
      await knex.schema.alterTable("images", (table) => {
        if (!hasContentHash) table.string("content_sha256", 64).nullable();
        if (!hasOriginalHash) {
          table.string("original_content_sha256", 64).nullable();
        }
      });
    }
  }

  if (await knex.schema.hasTable("account_deletion_failures")) {
    const columns = {};
    for (const name of [
      "next_attempt_at",
      "last_attempt_at",
      "lease_token",
      "lease_expires_at",
    ]) {
      columns[name] = await knex.schema.hasColumn(
        "account_deletion_failures",
        name,
      );
    }
    if (Object.values(columns).some((exists) => !exists)) {
      await knex.schema.alterTable("account_deletion_failures", (table) => {
        if (!columns.next_attempt_at) table.timestamp("next_attempt_at").nullable();
        if (!columns.last_attempt_at) table.timestamp("last_attempt_at").nullable();
        if (!columns.lease_token) table.string("lease_token", 64).nullable();
        if (!columns.lease_expires_at) table.timestamp("lease_expires_at").nullable();
      });
    }
    await knex.schema.alterTable("account_deletion_failures", (table) => {
      table.index(
        ["status", "next_attempt_at"],
        "account_deletion_failures_retry_due_idx",
      );
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable("account_deletion_failures")) {
    await knex.schema.alterTable("account_deletion_failures", (table) => {
      table.dropIndex(
        ["status", "next_attempt_at"],
        "account_deletion_failures_retry_due_idx",
      );
    });
    for (const column of [
      "lease_expires_at",
      "lease_token",
      "last_attempt_at",
      "next_attempt_at",
    ]) {
      if (await knex.schema.hasColumn("account_deletion_failures", column)) {
        await knex.schema.alterTable("account_deletion_failures", (table) =>
          table.dropColumn(column),
        );
      }
    }
  }
  if (await knex.schema.hasTable("images")) {
    for (const column of ["original_content_sha256", "content_sha256"]) {
      if (await knex.schema.hasColumn("images", column)) {
        await knex.schema.alterTable("images", (table) => table.dropColumn(column));
      }
    }
  }
};
