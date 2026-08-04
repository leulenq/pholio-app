"use strict";

/**
 * Tombstone for an applied migration that disappeared from the repository.
 *
 * Production databases may already record this exact filename. Restoring it
 * keeps Knex migration-list validation intact without recreating the obsolete
 * true-default column that 20260728200000 intentionally removed. The current
 * default-off consent model is established by 20260804090000.
 */
exports.up = async function up() {};
exports.down = async function down() {};
