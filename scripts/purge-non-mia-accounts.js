#!/usr/bin/env node
/**
 * Delete all Pholio accounts except Mia Voss (slug: mia-voss).
 * - Removes non-Mia rows from Neon via deleteUserAccount()
 * - Deletes every Firebase Auth user (Mia has no firebase_uid in DB)
 *
 * Usage: node scripts/purge-non-mia-accounts.js
 */

require("dotenv").config();
const knex = require("../src/shared/db/knex");
const { deleteUserAccount } = require("../src/shared/lib/account-deletion");
const {
  initializeFirebaseAdmin,
  getAuth,
  deleteUser,
} = require("../src/domains/auth/services/firebase-admin");

const MIA_SLUG = "mia-voss";

async function resolveMiaUserId() {
  const profile = await knex("profiles")
    .where({ slug: MIA_SLUG })
    .select("id", "user_id", "first_name", "last_name")
    .first();

  if (!profile) {
    throw new Error(`Mia Voss profile not found (slug: ${MIA_SLUG})`);
  }

  const user = await knex("users").where({ id: profile.user_id }).first();
  if (!user) {
    throw new Error(`Mia Voss user row missing (user_id: ${profile.user_id})`);
  }

  return { profile, user };
}

async function purgeDatabaseUsers(keepUserId) {
  const users = await knex("users").select("id", "email", "role", "firebase_uid");
  const toDelete = users.filter((row) => row.id !== keepUserId);

  console.log(`\n[DB] Keeping: ${keepUserId}`);
  console.log(`[DB] Deleting ${toDelete.length} user(s)...`);

  const results = [];
  for (const row of toDelete) {
    console.log(`  → ${row.email} (${row.role})`);
    try {
      const result = await deleteUserAccount(knex, row.id);
      results.push({ email: row.email, ...result });
      if (!result.deleted) {
        console.warn(`    ⚠ not deleted (userFound=${result.userFound})`);
      } else if (!result.fullyErased) {
        console.warn(
          `    ⚠ deleted with pending provider cleanup (pending=${result.pendingFailureIds.length})`,
        );
      } else {
        console.log("    ✓ deleted");
      }
    } catch (error) {
      console.error(`    ✗ failed: ${error.message}`);
      results.push({ email: row.email, error: error.message });
    }
  }

  return results;
}

async function purgeAllFirebaseUsers() {
  initializeFirebaseAdmin();
  const auth = getAuth();
  if (!auth) {
    throw new Error("Firebase Admin not initialized — check FIREBASE_* env vars");
  }

  let pageToken;
  const deleted = [];
  const failed = [];

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const record of page.users) {
      try {
        await deleteUser(record.uid);
        deleted.push({ uid: record.uid, email: record.email || "(no email)" });
        console.log(`  ✓ Firebase: ${record.email || record.uid}`);
      } catch (error) {
        failed.push({
          uid: record.uid,
          email: record.email || "(no email)",
          error: error.message,
        });
        console.error(`  ✗ Firebase ${record.email || record.uid}: ${error.message}`);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return { deleted, failed };
}

async function main() {
  const { profile, user } = await resolveMiaUserId();
  console.log(
    `[Keep] Mia Voss — ${user.email} (user ${user.id}, profile ${profile.id})`,
  );

  const dbResults = await purgeDatabaseUsers(user.id);
  const firebaseResults = await purgeAllFirebaseUsers();

  const remainingUsers = await knex("users").select("id", "email", "role");
  const remainingProfiles = await knex("profiles").select("slug", "first_name", "last_name");

  console.log("\n[Summary]");
  console.log(`  DB users remaining: ${remainingUsers.length}`);
  for (const row of remainingUsers) {
    console.log(`    - ${row.email} (${row.role})`);
  }
  console.log(`  Profiles remaining: ${remainingProfiles.length}`);
  for (const row of remainingProfiles) {
    console.log(`    - ${row.first_name} ${row.last_name} (${row.slug})`);
  }
  console.log(`  Firebase deleted: ${firebaseResults.deleted.length}`);
  if (firebaseResults.failed.length) {
    console.log(`  Firebase failed: ${firebaseResults.failed.length}`);
  }

  const dbFailed = dbResults.filter((row) => row.error || row.deleted === false);
  if (dbFailed.length || firebaseResults.failed.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("\n[Purge] Fatal:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await knex.destroy();
  });
