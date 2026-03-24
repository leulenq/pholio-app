/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const client = knex.client.config.client;
  const isPostgres = client === "pg" || client === "postgresql";

  if (!isPostgres) {
    console.warn(
      "[Migration] retarget_agency_foreign_keys_to_agencies only rewires existing FK constraints on PostgreSQL. Fresh schemas already reference agencies directly.",
    );
    return;
  }

  const foreignKeys = [
    { table: "profiles", column: "partner_agency_id", onDelete: "SET NULL" },
    { table: "profiles", column: "source_agency_id", onDelete: "SET NULL" },
    { table: "commissions", column: "agency_id", onDelete: "CASCADE" },
    { table: "applications", column: "agency_id", onDelete: "CASCADE" },
    { table: "applications", column: "invited_by_agency_id", onDelete: "SET NULL" },
    { table: "boards", column: "agency_id", onDelete: "CASCADE" },
    { table: "filter_presets", column: "agency_id", onDelete: "CASCADE" },
    { table: "interviews", column: "agency_id", onDelete: "CASCADE" },
    { table: "reminders", column: "agency_id", onDelete: "CASCADE" },
    { table: "application_activities", column: "agency_id", onDelete: "NO ACTION" },
  ];

  for (const foreignKey of foreignKeys) {
    await retargetForeignKey(knex, foreignKey, "users", "agencies");
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const client = knex.client.config.client;
  const isPostgres = client === "pg" || client === "postgresql";

  if (!isPostgres) {
    return;
  }

  const foreignKeys = [
    { table: "profiles", column: "partner_agency_id", onDelete: "SET NULL" },
    { table: "profiles", column: "source_agency_id", onDelete: "SET NULL" },
    { table: "commissions", column: "agency_id", onDelete: "CASCADE" },
    { table: "applications", column: "agency_id", onDelete: "CASCADE" },
    { table: "applications", column: "invited_by_agency_id", onDelete: "SET NULL" },
    { table: "boards", column: "agency_id", onDelete: "CASCADE" },
    { table: "filter_presets", column: "agency_id", onDelete: "CASCADE" },
    { table: "interviews", column: "agency_id", onDelete: "CASCADE" },
    { table: "reminders", column: "agency_id", onDelete: "CASCADE" },
    { table: "application_activities", column: "agency_id", onDelete: "NO ACTION" },
  ];

  for (const foreignKey of foreignKeys) {
    await retargetForeignKey(knex, foreignKey, "agencies", "users");
  }
};

async function retargetForeignKey(knex, foreignKey, fromTable, toTable) {
  const hasTable = await knex.schema.hasTable(foreignKey.table);
  if (!hasTable) {
    return;
  }

  const hasColumn = await knex.schema.hasColumn(foreignKey.table, foreignKey.column);
  if (!hasColumn) {
    return;
  }

  const constraintsResult = await knex.raw(
    `
      SELECT con.conname
      FROM pg_constraint con
      INNER JOIN pg_class rel ON rel.oid = con.conrelid
      INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      INNER JOIN pg_attribute attr
        ON attr.attrelid = rel.oid
       AND attr.attnum = ANY(con.conkey)
      INNER JOIN pg_class confrel ON confrel.oid = con.confrelid
      WHERE con.contype = 'f'
        AND nsp.nspname = current_schema()
        AND rel.relname = ?
        AND attr.attname = ?
        AND confrel.relname = ?
    `,
    [foreignKey.table, foreignKey.column, fromTable],
  );

  for (const row of constraintsResult.rows) {
    await knex.raw(
      "ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??",
      [foreignKey.table, row.conname],
    );
  }

  const existingTargetResult = await knex.raw(
    `
      SELECT 1
      FROM pg_constraint con
      INNER JOIN pg_class rel ON rel.oid = con.conrelid
      INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      INNER JOIN pg_attribute attr
        ON attr.attrelid = rel.oid
       AND attr.attnum = ANY(con.conkey)
      INNER JOIN pg_class confrel ON confrel.oid = con.confrelid
      WHERE con.contype = 'f'
        AND nsp.nspname = current_schema()
        AND rel.relname = ?
        AND attr.attname = ?
        AND confrel.relname = ?
      LIMIT 1
    `,
    [foreignKey.table, foreignKey.column, toTable],
  );

  if (existingTargetResult.rows.length === 0) {
    const constraintName = `${foreignKey.table}_${foreignKey.column}_foreign`;
    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY (??) REFERENCES ?? (id) ON DELETE ${foreignKey.onDelete}`,
      [foreignKey.table, constraintName, foreignKey.column, toTable],
    );
  }
}
