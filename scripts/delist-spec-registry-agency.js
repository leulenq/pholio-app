#!/usr/bin/env node
"use strict";

/**
 * The removal path.
 *
 * Guardrail 3 of `docs/spec-correct-export-brief.md`: Pholio carries agency
 * names as plain text under nominative fair use, and an agency that asks to
 * come off the registry has to come off it immediately, without negotiation and
 * without a code change.
 *
 *   npm run delist:spec-registry -- --organization elite-model-management \
 *     --reason "Requested by email 2026-08-14"
 *
 *   npm run delist:spec-registry -- --series elite-model-management-global:online
 *   npm run delist:spec-registry -- --organization ford-models --relist
 *   npm run delist:spec-registry -- --list
 *
 * Delisting flags the series rather than deleting it — the editorial dataset is
 * hash-locked as one package, and application snapshots already cite its
 * revisions as evidence. The route stops being served everywhere; the record of
 * what was published stays intact.
 */

const knex = require("../src/shared/db/knex");

function parseArgs(argv) {
  const args = { series: [], organization: null, reason: null, relist: false, list: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[(index += 1)];
    if (token === "--series") args.series.push(next());
    else if (token === "--organization" || token === "--org") args.organization = next();
    else if (token === "--reason") args.reason = next();
    else if (token === "--relist") args.relist = true;
    else if (token === "--list") args.list = true;
    else if (token === "--help" || token === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function usage() {
  console.log(
    [
      "Delist an agency from the Spec Registry.",
      "",
      "  --organization <key>   every series for one organization (e.g. elite-model-management)",
      "  --series <id>          one series id; repeatable",
      "  --reason <text>        why, in the agency's terms (recorded, not shown to talent)",
      "  --relist               undo a delisting",
      "  --list                 show what is currently delisted",
      "",
    ].join("\n"),
  );
}

/**
 * The series a request names.
 *
 * `organization_key` is the column the registry itself groups by, so one flag
 * removes every market and channel an agency publishes rather than leaving a
 * second entry live because it was researched under a different office.
 */
async function resolveSeries({ organization, series }) {
  const query = knex("spec_registry_series").select(
    "series_id",
    "organization_key",
    "delisted_at",
    "delisted_reason",
  );
  if (organization) query.where("organization_key", organization);
  if (series.length) query.whereIn("series_id", series);
  return query.orderBy("series_id");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return 0;
  }

  const hasColumn = await knex.schema.hasColumn("spec_registry_series", "delisted_at");
  if (!hasColumn) {
    console.error(
      "spec_registry_series.delisted_at is missing. Run `npm run migrate` first.",
    );
    return 1;
  }

  if (args.list) {
    const rows = await knex("spec_registry_series")
      .whereNotNull("delisted_at")
      .orderBy("series_id")
      .select("series_id", "organization_key", "delisted_at", "delisted_reason");
    if (!rows.length) {
      console.log("No series are delisted.");
      return 0;
    }
    for (const row of rows) {
      console.log(
        `${row.series_id}  (${row.organization_key})  ${row.delisted_at}  ${row.delisted_reason || "no reason recorded"}`,
      );
    }
    return 0;
  }

  if (!args.organization && !args.series.length) {
    usage();
    console.error("Name an --organization or at least one --series.");
    return 1;
  }

  const targets = await resolveSeries(args);
  if (!targets.length) {
    console.error("No matching series. Check the key with --list or against the manifest.");
    return 1;
  }

  const update = args.relist
    ? { delisted_at: null, delisted_reason: null }
    : { delisted_at: new Date().toISOString(), delisted_reason: args.reason || null };

  const changed = await knex("spec_registry_series")
    .whereIn(
      "series_id",
      targets.map((row) => row.series_id),
    )
    .update(update);

  console.log(
    `${args.relist ? "Relisted" : "Delisted"} ${changed} series:`,
  );
  for (const row of targets) console.log(`  ${row.series_id}`);
  if (!args.relist) {
    console.log(
      "\nThese routes are now absent from the directory, the requirements check, the",
      "\nexport and every application snapshot path. Nothing was deleted.",
    );
  }
  return 0;
}

main()
  .then(async (code) => {
    await knex.destroy();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(error.message);
    await knex.destroy();
    process.exit(1);
  });
