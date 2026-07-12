/**
 * SEC-0.8 — Hash talent magic-link reply tokens at rest.
 *
 * Previously `message_reply_tokens.token` stored the raw magic-link token in
 * PLAINTEXT, so a database leak let an attacker replay any live reply link. This
 * migration moves the table to a hashed-at-rest model: only the sha256 hex digest
 * of the token is persisted (`token_hash`), matching the idiom already used by
 * `guardian_consent_requests`. The raw token now only ever exists inside the
 * emailed URL.
 *
 * Backfill: existing rows are preserved by hashing their current raw `token` into
 * `token_hash`, so magic links already delivered to talent keep working.
 *
 * Dialect-safety decision (SQLite dev/test + Postgres prod):
 *   We DROP the plaintext `token` column in `up` after backfilling the hash. This
 *   is the task's primary directive and it fully eliminates the plaintext at rest
 *   (the security goal). It is safe on both dialects:
 *     - Postgres drops the column natively.
 *     - Knex's SQLite3 schema builder implements column drops via a full
 *       table REBUILD (create temp table without the column, copy rows, swap),
 *       NOT via native `ALTER TABLE DROP COLUMN`. That matters here because the
 *       `token` column carried a UNIQUE constraint + index, and native SQLite
 *       DROP COLUMN refuses to drop a column referenced by an index. The rebuild
 *       path sidesteps that entirely and preserves the remaining columns, the FKs
 *       and the other indexes.
 *   The alternative (keep `token` but null it out) was rejected: it still requires
 *   a SQLite table rebuild to relax the existing NOT NULL constraint, so it buys
 *   no dialect-safety while leaving a dead plaintext column behind.
 */

const crypto = require("crypto");

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

exports.up = async function up(knex) {
  // 1) Add the hash column (indexed, nullable so it can exist before backfill).
  const hasTokenHash = await knex.schema.hasColumn(
    "message_reply_tokens",
    "token_hash",
  );
  if (!hasTokenHash) {
    await knex.schema.alterTable("message_reply_tokens", (table) => {
      // sha256 hex of the raw token; the raw token only ever lives in the email link.
      table.string("token_hash", 64).nullable();
      table.index("token_hash", "message_reply_tokens_token_hash_idx");
    });
  }

  // 2) Backfill from any existing plaintext tokens, then drop the plaintext column.
  const hasToken = await knex.schema.hasColumn(
    "message_reply_tokens",
    "token",
  );
  if (hasToken) {
    const rows = await knex("message_reply_tokens")
      .whereNotNull("token")
      .select("id", "token");

    for (const row of rows) {
      await knex("message_reply_tokens")
        .where({ id: row.id })
        .update({ token_hash: sha256Hex(row.token) });
    }

    // Remove the plaintext column now that hashes are populated. On SQLite this
    // triggers a Knex table rebuild (see dialect note above); on Postgres it is a
    // native DROP COLUMN. The UNIQUE constraint + index on `token` go with it.
    await knex.schema.alterTable("message_reply_tokens", (table) => {
      table.dropColumn("token");
    });
  }
};

exports.down = async function down(knex) {
  // Re-add the plaintext column so the schema shape is restored.
  //
  // NOTE (irreversible data): raw tokens CANNOT be recovered from their sha256
  // hashes, so restored rows have a NULL `token`. The column is therefore re-added
  // as nullable and WITHOUT the original UNIQUE/NOT NULL constraints. Any links
  // issued under the hashed scheme cannot be validated after a rollback and must
  // be reissued.
  const hasToken = await knex.schema.hasColumn(
    "message_reply_tokens",
    "token",
  );
  if (!hasToken) {
    await knex.schema.alterTable("message_reply_tokens", (table) => {
      table.string("token", 128).nullable();
    });
  }

  const hasTokenHash = await knex.schema.hasColumn(
    "message_reply_tokens",
    "token_hash",
  );
  if (hasTokenHash) {
    await knex.schema.alterTable("message_reply_tokens", (table) => {
      table.dropColumn("token_hash");
    });
  }
};
