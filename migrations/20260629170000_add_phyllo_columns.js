exports.up = async function (knex) {
  if (await knex.schema.hasTable("profiles")) {
    if (!(await knex.schema.hasColumn("profiles", "phyllo_user_id"))) {
      await knex.schema.alterTable("profiles", (t) => {
        t.string("phyllo_user_id", 255).nullable();
      });
    }
  }

  if (await knex.schema.hasTable("social_accounts")) {
    if (!(await knex.schema.hasColumn("social_accounts", "phyllo_account_id"))) {
      await knex.schema.alterTable("social_accounts", (t) => {
        t.string("phyllo_account_id", 255).nullable();
      });
    }
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasTable("profiles")) {
    if (await knex.schema.hasColumn("profiles", "phyllo_user_id")) {
      await knex.schema.alterTable("profiles", (t) => {
        t.dropColumn("phyllo_user_id");
      });
    }
  }

  if (await knex.schema.hasTable("social_accounts")) {
    if (await knex.schema.hasColumn("social_accounts", "phyllo_account_id")) {
      await knex.schema.alterTable("social_accounts", (t) => {
        t.dropColumn("phyllo_account_id");
      });
    }
  }
};
