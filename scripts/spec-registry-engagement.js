#!/usr/bin/env node
"use strict";

/**
 * What to say to an agency that is not on Pholio yet.
 *
 * Guardrail 4 of `docs/spec-correct-export-brief.md`. Prints, per registry
 * route, how many people prepared a set to that agency's published
 * requirements and how many of them went on to the agency's own site.
 *
 *   npm run report:spec-registry-engagement
 *   npm run report:spec-registry-engagement -- --since 2026-05-01 --label "last quarter"
 *   npm run report:spec-registry-engagement -- --series elite-model-management-global:online
 */

const knex = require("../src/shared/db/knex");
const {
  engagementSentence,
  summarizeEngagement,
} = require("../src/domains/spec-registry/engagement-service");

function parseArgs(argv) {
  const args = { since: null, until: null, seriesId: null, label: "recently" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[(index += 1)];
    if (token === "--since") args.since = next();
    else if (token === "--until") args.until = next();
    else if (token === "--series") args.seriesId = next();
    else if (token === "--label") args.label = next();
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function isoBound(value) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await summarizeEngagement(knex, {
    seriesId: args.seriesId,
    since: isoBound(args.since),
    until: isoBound(args.until),
  });

  if (!rows.length) {
    console.log("No registry engagement recorded for that window.");
    return 0;
  }

  for (const row of rows) {
    console.log(`${row.agencyName || row.seriesId}  (${row.seriesId})`);
    console.log(
      `  exports ${row.exports} by ${row.talentWhoExported} talent` +
        `   outbound clicks ${row.outboundClicks} by ${row.talentWhoClickedThrough} talent`,
    );
    const sentence = engagementSentence(row, args.label);
    if (sentence) console.log(`  → ${sentence}`);
    console.log("");
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
