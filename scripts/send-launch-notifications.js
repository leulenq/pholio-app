#!/usr/bin/env node
"use strict";

/**
 * Launch day: send the one promised email to every address on the pholio-site
 * notify list, deleting each address as its email goes out.
 *
 *   node scripts/send-launch-notifications.js            # dry run: counts only
 *   node scripts/send-launch-notifications.js --send     # send and delete
 *
 * Refuses to send while the talent launch gate is closed (shared/lib/talent-launch.js),
 * so the email can never announce something the app still refuses.
 *
 * The /opening page and the email both say the address is deleted once the
 * email is sent. A row is deleted only after its own send succeeds; a failed
 * send leaves the row for the next run. Safe to re-run.
 */

const knex = require("../src/shared/db/knex");
const { sendLaunchOpenEmail } = require("../src/shared/lib/email");
const { isTalentLaunchOpen } = require("../src/shared/lib/talent-launch");

const SEND = process.argv.includes("--send");
const BATCH = 50;
const PAUSE_MS = 250;

async function main() {
  const [{ count }] = await knex("launch_notifications").count({ count: "*" });
  console.log(`[launch-notify] ${Number(count)} address(es) on the list.`);

  if (!SEND) {
    console.log("[launch-notify] Dry run. Pass --send to send and delete.");
    return 0;
  }
  if (!isTalentLaunchOpen()) {
    console.error("[launch-notify] The talent launch gate is still closed. Not sending.");
    return 1;
  }

  let sent = 0;
  let failed = 0;
  const failedIds = new Set();
  for (;;) {
    const rows = await knex("launch_notifications")
      .whereNotIn("id", [...failedIds])
      .orderBy("created_at", "asc")
      .limit(BATCH)
      .select("id", "email");
    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        await sendLaunchOpenEmail({ to: row.email });
        await knex("launch_notifications").where({ id: row.id }).del();
        sent += 1;
      } catch {
        // email.js has already logged the recipient domain and reason.
        failedIds.add(row.id);
        failed += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
  }

  console.log(`[launch-notify] Sent and deleted: ${sent}. Failed, kept for a re-run: ${failed}.`);
  return failed > 0 ? 1 : 0;
}

main()
  .then((code) => knex.destroy().then(() => process.exit(code)))
  .catch((error) => {
    console.error("[launch-notify]", error.message);
    knex.destroy().finally(() => process.exit(1));
  });
