const crypto = require("crypto");

async function existingColumns(knex, tableName) {
  if (knex.client.config.client === "pg") {
    const rows = await knex("information_schema.columns")
      .where({ table_name: tableName, table_schema: "public" })
      .select("column_name");
    return new Set(rows.map((row) => row.column_name));
  }
  // SQLite: information_schema does not exist.
  const rows = await knex.raw(`PRAGMA table_info(${tableName})`);
  return new Set(rows.map((row) => row.name));
}

function pickExisting(source, columns) {
  const picked = {};
  for (const column of columns) {
    if (source[column] !== undefined) {
      picked[column] = source[column];
    }
  }
  return picked;
}

/**
 * Migration: Move social media fields to a separate social_accounts table.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  console.log("[Migration] Refactoring social media columns...");

  // 1. Create social_accounts table
  const hasTable = await knex.schema.hasTable("social_accounts");
  if (!hasTable) {
    await knex.schema.createTable("social_accounts", (table) => {
      table.uuid("id").primary();
      table.uuid("profile_id").nullable().references("id").inTable("profiles").onDelete("CASCADE");
      table.uuid("agency_id").nullable().references("id").inTable("agencies").onDelete("CASCADE");
      table.string("platform", 50).notNullable();
      table.string("handle", 255).nullable();
      table.string("url", 500).nullable();
      table.integer("follower_count").nullable();
      table.decimal("engagement_rate", 5, 2).nullable();
      table.boolean("is_oauth_connected").defaultTo(false);
      table.text("oauth_token_encrypted").nullable();
      table.jsonb("metrics_data").nullable();
      table.timestamp("metrics_updated_at").nullable();
      table.timestamps(true, true);

      table.unique(["profile_id", "platform"]);
      table.unique(["agency_id", "platform"]);
    });
    console.log("[Migration] Created social_accounts table");
  }

  // 2. Add social_reach column to profiles (cached column for quick sorting/match scoring)
  const hasSocialReach = await knex.schema.hasColumn("profiles", "social_reach");
  if (!hasSocialReach) {
    await knex.schema.alterTable("profiles", (table) => {
      table.integer("social_reach").defaultTo(0).notNullable();
    });
    console.log("[Migration] Added profiles.social_reach column");
  }

  // 3. Extract and backfill data (only columns that still exist on this database)
  const profileColumnSet = await existingColumns(knex, "profiles");
  const agencyColumnSet = await existingColumns(knex, "agencies");

  const profileColumns = [
    "id",
    "instagram_handle",
    "instagram_url",
    "twitter_handle",
    "twitter_url",
    "tiktok_handle",
    "tiktok_url",
    "youtube_handle",
    "youtube_url",
    "onlyfans_url",
    "portfolio_url",
  ].filter((column) => profileColumnSet.has(column));

  const agencyColumns = [
    "id",
    "instagram_handle",
    "tiktok_handle",
    "twitter_handle",
    "youtube_handle",
    "video_reel_url",
  ].filter((column) => agencyColumnSet.has(column));

  const profiles = profileColumns.length > 1
    ? await knex("profiles").select(profileColumns)
    : [];

  const agencies = agencyColumns.length > 1
    ? await knex("agencies").select(agencyColumns)
    : [];

  const socialAccounts = [];

  for (const profile of profiles) {
    const profileData = pickExisting(profile, profileColumns);
    if (profileData.instagram_handle || profileData.instagram_url) {
      socialAccounts.push({
        id: crypto.randomUUID(),
        profile_id: profile.id,
        platform: "instagram",
        handle: profileData.instagram_handle || null,
        url: profileData.instagram_url || null,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    if (profileData.tiktok_handle || profileData.tiktok_url) {
      socialAccounts.push({
        id: crypto.randomUUID(),
        profile_id: profile.id,
        platform: "tiktok",
        handle: profileData.tiktok_handle || null,
        url: profileData.tiktok_url || null,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    if (profileData.twitter_handle || profileData.twitter_url) {
      socialAccounts.push({
        id: crypto.randomUUID(),
        profile_id: profile.id,
        platform: "twitter",
        handle: profileData.twitter_handle || null,
        url: profileData.twitter_url || null,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    if (profileData.youtube_handle || profileData.youtube_url) {
      socialAccounts.push({
        id: crypto.randomUUID(),
        profile_id: profile.id,
        platform: "youtube",
        handle: profileData.youtube_handle || null,
        url: profileData.youtube_url || null,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    if (profileData.onlyfans_url) {
      socialAccounts.push({
        id: crypto.randomUUID(),
        profile_id: profile.id,
        platform: "onlyfans",
        handle: null,
        url: profileData.onlyfans_url,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    if (profileData.portfolio_url) {
      socialAccounts.push({
        id: crypto.randomUUID(),
        profile_id: profile.id,
        platform: "portfolio",
        handle: null,
        url: profileData.portfolio_url,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }

  for (const agency of agencies) {
    const agencyData = pickExisting(agency, agencyColumns);
    if (agencyData.instagram_handle) {
      socialAccounts.push({
        id: crypto.randomUUID(),
        agency_id: agency.id,
        platform: "instagram",
        handle: agencyData.instagram_handle,
        url: `https://instagram.com/${agencyData.instagram_handle}`,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    if (agencyData.tiktok_handle) {
      socialAccounts.push({
        id: crypto.randomUUID(),
        agency_id: agency.id,
        platform: "tiktok",
        handle: agencyData.tiktok_handle,
        url: `https://tiktok.com/@${agencyData.tiktok_handle}`,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    if (agencyData.twitter_handle) {
      socialAccounts.push({
        id: crypto.randomUUID(),
        agency_id: agency.id,
        platform: "twitter",
        handle: agencyData.twitter_handle,
        url: `https://x.com/${agencyData.twitter_handle}`,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    if (agencyData.youtube_handle) {
      socialAccounts.push({
        id: crypto.randomUUID(),
        agency_id: agency.id,
        platform: "youtube",
        handle: agencyData.youtube_handle,
        url: `https://youtube.com/${agencyData.youtube_handle}`,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    if (agencyData.video_reel_url) {
      socialAccounts.push({
        id: crypto.randomUUID(),
        agency_id: agency.id,
        platform: "video_reel",
        handle: null,
        url: agencyData.video_reel_url,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }

  if (socialAccounts.length > 0) {
    await knex.batchInsert("social_accounts", socialAccounts, 100);
    console.log(`[Migration] Backfilled ${socialAccounts.length} social accounts`);
  }

  // 4. Drop obsolete columns from profiles (only if they still exist)
  const profileDropColumns = [
    "instagram_handle",
    "instagram_url",
    "tiktok_handle",
    "tiktok_url",
    "twitter_handle",
    "twitter_url",
    "youtube_handle",
    "youtube_url",
    "onlyfans_url",
    "portfolio_url",
  ].filter((column) => profileColumnSet.has(column));

  if (profileDropColumns.length > 0) {
    await knex.schema.alterTable("profiles", (table) => {
      for (const column of profileDropColumns) {
        table.dropColumn(column);
      }
    });
    console.log("[Migration] Dropped old columns from profiles table");
  }

  // 5. Drop obsolete columns from agencies (only if they still exist)
  const agencyDropColumns = [
    "instagram_handle",
    "tiktok_handle",
    "twitter_handle",
    "youtube_handle",
    "video_reel_url",
  ].filter((column) => agencyColumnSet.has(column));

  if (agencyDropColumns.length > 0) {
    await knex.schema.alterTable("agencies", (table) => {
      for (const column of agencyDropColumns) {
        table.dropColumn(column);
      }
    });
    console.log("[Migration] Dropped old columns from agencies table");
  }

  console.log("[Migration] Social media columns refactored successfully!");
};

/**
 * Rollback: Revert the migration
 *
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  console.log("[Migration] Rolling back social media columns refactoring...");

  // 1. Re-add social columns to profiles
  await knex.schema.alterTable("profiles", (table) => {
    table.string("instagram_handle", 100).nullable();
    table.string("instagram_url", 255).nullable();
    table.string("twitter_handle", 100).nullable();
    table.string("twitter_url", 255).nullable();
    table.string("tiktok_handle", 100).nullable();
    table.string("tiktok_url", 255).nullable();
    table.string("youtube_handle", 100).nullable();
    table.string("youtube_url", 255).nullable();
    table.string("onlyfans_url", 500).nullable();
    table.string("portfolio_url", 255).nullable();
  });
  console.log("[Migration] Re-added profiles columns");

  // 2. Re-add social columns to agencies
  await knex.schema.alterTable("agencies", (table) => {
    table.string("instagram_handle", 255).nullable();
    table.string("tiktok_handle", 255).nullable();
    table.string("twitter_handle", 255).nullable();
    table.string("youtube_handle", 255).nullable();
    table.string("video_reel_url", 500).nullable();
  });
  console.log("[Migration] Re-added agencies columns");

  // 3. Move data back to profiles
  const profileAccounts = await knex("social_accounts").whereNotNull("profile_id");
  for (const account of profileAccounts) {
    const updateData = {};
    if (account.platform === "instagram") {
      updateData.instagram_handle = account.handle;
      updateData.instagram_url = account.url;
    } else if (account.platform === "tiktok") {
      updateData.tiktok_handle = account.handle;
      updateData.tiktok_url = account.url;
    } else if (account.platform === "twitter") {
      updateData.twitter_handle = account.handle;
      updateData.twitter_url = account.url;
    } else if (account.platform === "youtube") {
      updateData.youtube_handle = account.handle;
      updateData.youtube_url = account.url;
    } else if (account.platform === "onlyfans") {
      updateData.onlyfans_url = account.url;
    } else if (account.platform === "portfolio") {
      updateData.portfolio_url = account.url;
    }

    if (Object.keys(updateData).length > 0) {
      await knex("profiles").where({ id: account.profile_id }).update(updateData);
    }
  }

  // 4. Move data back to agencies
  const agencyAccounts = await knex("social_accounts").whereNotNull("agency_id");
  for (const account of agencyAccounts) {
    const updateData = {};
    if (account.platform === "instagram") {
      updateData.instagram_handle = account.handle;
    } else if (account.platform === "tiktok") {
      updateData.tiktok_handle = account.handle;
    } else if (account.platform === "twitter") {
      updateData.twitter_handle = account.handle;
    } else if (account.platform === "youtube") {
      updateData.youtube_handle = account.handle;
    } else if (account.platform === "video_reel") {
      updateData.video_reel_url = account.url;
    }

    if (Object.keys(updateData).length > 0) {
      await knex("agencies").where({ id: account.agency_id }).update(updateData);
    }
  }
  console.log("[Migration] Restored data back to profiles and agencies");

  // 5. Drop social_accounts table
  await knex.schema.dropTableIfExists("social_accounts");
  console.log("[Migration] Dropped social_accounts table");

  // 6. Drop social_reach column from profiles
  await knex.schema.alterTable("profiles", (table) => {
    table.dropColumn("social_reach");
  });
  console.log("[Migration] Dropped profiles.social_reach column");

  console.log("[Migration] Rollback completed successfully!");
};
