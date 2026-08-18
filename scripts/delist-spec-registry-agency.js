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
  const args = {
    series: [],
    organization: null,
    like: null,
    reason: null,
    relist: false,
    list: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[(index += 1)];
    if (token === "--series") args.series.push(next());
    else if (token === "--organization" || token === "--org") args.organization = next();
    else if (token === "--like") args.like = next();
    else if (token === "--reason") args.reason = next();
    else if (token === "--relist") args.relist = true;
    else if (token === "--list") args.list = true;
    else if (token === "--dry-run") args.dryRun = true;
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
      "  --like <text>          every organization whose key contains <text> (e.g. elite)",
      "  --series <id>          one series id; repeatable",
      "  --reason <text>        why, in the agency's terms (recorded, not shown to talent)",
      "  --relist               undo a delisting",
      "  --list                 show what is currently delisted",
      "  --dry-run              show what would change, change nothing",
      "",
      "One agency network can hold several organizations. Elite publishes three —",
      "elite-model-management (global), elite-models (North America) and",
      "elite-model-japan — on three domains, with different requirements. Each is",
      "its own key, so --organization takes one of them. This prints the others",
      "as possible siblings; confirm which the agency meant before sweeping them",
      "with --like.",
      "",
    ].join("\n"),
  );
}

const SERIES_COLUMNS = [
  "series_id",
  "organization_key",
  "delisted_at",
  "delisted_reason",
];

/**
 * The series a request names.
 *
 * `organization_key` groups every market and channel one organization
 * publishes, so `--organization` never leaves a second entry live because it
 * was researched under a different office.
 */
async function resolveSeries({ organization, like, series }, db = knex) {
  const query = db("spec_registry_series").select(SERIES_COLUMNS);
  if (organization) query.where("organization_key", organization);
  if (like) query.where("organization_key", "like", `%${like}%`);
  if (series.length) query.whereIn("series_id", series);
  return query.orderBy("series_id");
}

/**
 * Organizations that look like they belong to the same agency network as the
 * ones being delisted, but were not named.
 *
 * A network is not one organization. Elite Model Management, Elite Models and
 * Elite Model Japan sit on three domains with genuinely different published
 * requirements — three shots against six — so the registry holds them apart and
 * must keep doing so. But an agency writing in to be delisted is writing on
 * behalf of a brand, not a key, and the operator acting on that request should
 * not have to already know the other two rows exist.
 *
 * This only ever *reports*. Pholio has not established that these are one legal
 * entity — `legalName` is null on all three — and quietly delisting a sibling on
 * a shared name prefix would assert a corporate relationship nobody verified,
 * which is the same failure as inventing a crop target. The operator decides.
 */
async function siblingCandidates(targets, db = knex) {
  const targetKeys = new Set(targets.map((row) => row.organization_key));
  const stems = [...targetKeys]
    .map((key) => String(key).split("-")[0])
    .filter((stem) => stem.length >= 3);
  if (!stems.length) return [];

  const rows = await db("spec_registry_series")
    .whereNull("delisted_at")
    .select(SERIES_COLUMNS);
  return rows.filter(
    (row) =>
      !targetKeys.has(row.organization_key) &&
      stems.some((stem) => String(row.organization_key).startsWith(`${stem}-`) ||
        String(row.organization_key) === stem),
  );
}

function reportSiblings(siblings) {
  if (!siblings.length) return;
  console.log(
    "\nStill listed, and possibly the same agency network — confirm which the",
    "\nagency meant before sweeping them with --like:",
  );
  for (const row of siblings) {
    console.log(`  ${row.series_id}  (${row.organization_key})`);
  }
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

  if (!args.organization && !args.like && !args.series.length) {
    usage();
    console.error("Name an --organization, a --like pattern, or at least one --series.");
    return 1;
  }

  const targets = await resolveSeries(args);
  if (!targets.length) {
    console.error("No matching series. Check the key with --list or against the manifest.");
    return 1;
  }

  const siblings = args.relist ? [] : await siblingCandidates(targets);

  if (args.dryRun) {
    console.log(`Would ${args.relist ? "relist" : "delist"} ${targets.length} series:`);
    for (const row of targets) console.log(`  ${row.series_id}  (${row.organization_key})`);
    reportSiblings(siblings);
    return 0;
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
  reportSiblings(siblings);
  if (!args.relist) {
    console.log(
      "\nThese routes are now absent from the directory, the requirements check, the",
      "\nexport and every application snapshot path. Nothing was deleted.",
    );
  }
  return 0;
}

// Only run when invoked as a command, so the argument and sibling logic can be
// tested without the script executing against whatever database is configured.
if (require.main === module) {
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
}

module.exports = { parseArgs, siblingCandidates, resolveSeries };
