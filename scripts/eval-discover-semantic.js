#!/usr/bin/env node
"use strict";

/**
 * Discover semantic layer — golden-brief evaluation and standing fairness audit
 * (tasks/discover-semantic-2026-09.md §3.7).
 *
 * Runs every brief in tests/fixtures/discover-semantic-golden/briefs.json
 * through the real search path (`searchDiscoverableTalent`) against a live
 * database, and reports:
 *
 *   nDCG@10   — how well the order puts the hand-labelled relevant talent first
 *   recall@10 — how many of them the first page contains at all
 *   fairness  — for every LOOK-ONLY brief (one that applied no requirement),
 *               the top-10 distribution of self-declared `ethnicity` and
 *               `gender` against the pool's base rate. A group whose top-10
 *               share exceeds its base rate by more than --tolerance is
 *               FLAGGED and the run exits 1.
 *
 * This is the audit to run before every prompt, model or scoring change.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   PHOLIO_ENABLE_PROFILE_EMBEDDINGS=true DISCOVER_SEMANTIC=on \
 *     npm run eval:discover-semantic -- [options]
 *
 * Both variables are required; the script refuses to run without them, because
 * a run with the semantic layer off measures the lexical engine and says
 * nothing about this work.
 *
 *   --fake              Use the deterministic hash embedder instead of a
 *                       provider. Proves the plumbing end to end with no key
 *                       and no network; the SCORES ARE NOT MEANINGFUL as
 *                       quality numbers — they measure word overlap. Clears
 *                       discover_embed_cache first so real and fake vectors
 *                       never mix.
 *   --index-fake        Implies --fake. Rebuilds `discover_chunks` for every
 *                       discoverable profile with the hash embedder before
 *                       evaluating (dropping each profile's existing chunks
 *                       first, so vectors from another embedder cannot
 *                       survive). Grants `embedding_processing_consent` to the
 *                       demo pool it indexes — an evaluation database only;
 *                       refused when NODE_ENV=production.
 *   --agency <id>       Agency user id to search as. Defaults to the first
 *                       AGENCY user (the seeded agency@example.com).
 *   --tolerance <n>     Absolute share over base rate that counts as skew.
 *                       Default 0.25.
 *   --limit <n>         Cut-off for both metrics and the distribution.
 *                       Default 10.
 *   --briefs <path>     Alternative golden set.
 *   --json              Emit one JSON object instead of the readable report.
 *
 * ── A local, no-key run from scratch ────────────────────────────────────────
 *
 *   DATABASE_URL=sqlite:///tmp/eval.sqlite3 DB_CLIENT=sqlite3 \
 *     NODE_ENV=development npm run migrate && \
 *   DATABASE_URL=sqlite:///tmp/eval.sqlite3 DB_CLIENT=sqlite3 \
 *     NODE_ENV=development npm run seed && \
 *   DATABASE_URL=sqlite:///tmp/eval.sqlite3 DB_CLIENT=sqlite3 \
 *     NODE_ENV=development PHOLIO_ENABLE_PROFILE_EMBEDDINGS=true \
 *     DISCOVER_SEMANTIC=on \
 *     npm run eval:discover-semantic -- --index-fake
 *
 * ── Exit codes ──────────────────────────────────────────────────────────────
 *   0  ran, no group flagged
 *   1  ran, at least one group's top-10 share exceeded the tolerance
 *   2  could not run (missing flags, missing agency, unknown talent name)
 */

const fs = require("fs");
const path = require("path");

// ── arguments ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    fake: false,
    indexFake: false,
    agency: null,
    tolerance: 0.25,
    limit: 10,
    briefs: path.join(
      __dirname,
      "..",
      "tests",
      "fixtures",
      "discover-semantic-golden",
      "briefs.json",
    ),
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--fake") out.fake = true;
    else if (arg === "--index-fake") {
      out.indexFake = true;
      out.fake = true;
    } else if (arg === "--json") out.json = true;
    else if (arg === "--agency") out.agency = argv[++i];
    else if (arg === "--tolerance") out.tolerance = parseFloat(argv[++i]);
    else if (arg === "--limit") out.limit = parseInt(argv[++i], 10);
    else if (arg === "--briefs") out.briefs = path.resolve(argv[++i]);
    else if (arg === "--help" || arg === "-h") out.help = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
  process.exit(0);
}

function refuse(message) {
  console.error(`eval-discover-semantic: ${message}`);
  process.exit(2);
}

if (process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS !== "true") {
  refuse("PHOLIO_ENABLE_PROFILE_EMBEDDINGS=true is required.");
}
if (String(process.env.DISCOVER_SEMANTIC || "").toLowerCase().trim() !== "on") {
  refuse("DISCOVER_SEMANTIC=on is required (shadow and off measure nothing here).");
}
if (!Number.isFinite(args.tolerance) || args.tolerance < 0 || args.tolerance > 1) {
  refuse("--tolerance must be a number between 0 and 1.");
}
if (!Number.isFinite(args.limit) || args.limit < 1) {
  refuse("--limit must be a positive integer.");
}
if (args.indexFake && process.env.NODE_ENV === "production") {
  refuse("--index-fake writes fake vectors and consent; it is refused in production.");
}

const knex = require("../src/shared/db/knex");
const provider = require("../src/domains/ai/embedding-provider");
const { reindexProfile } = require("../src/domains/ai/discover-index");
const {
  searchDiscoverableTalent,
} = require("../src/domains/agency/services/discover-search");

// ── metrics ─────────────────────────────────────────────────────────────────

/** Binary-relevance nDCG at k. */
function ndcgAt(relevanceFlags, totalRelevant, k) {
  const gains = relevanceFlags.slice(0, k);
  const dcg = gains.reduce((sum, rel, i) => sum + rel / Math.log2(i + 2), 0);
  const ideal = Math.min(totalRelevant, k);
  let idcg = 0;
  for (let i = 0; i < ideal; i += 1) idcg += 1 / Math.log2(i + 2);
  return idcg ? dcg / idcg : 0;
}

function recallAt(relevanceFlags, totalRelevant, k) {
  if (!totalRelevant) return 0;
  return relevanceFlags.slice(0, k).reduce((a, b) => a + b, 0) / totalRelevant;
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

// ── the pool and its base rates ─────────────────────────────────────────────

function parseHeritage(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
    if (typeof parsed === "string") return [parsed];
  } catch {
    // a plain string column
  }
  return [String(raw)];
}

/**
 * The searchable pool, as Discover defines it: discoverable and active. Base
 * rates are computed over exactly this set, so the comparison in the fairness
 * report is like for like.
 */
async function loadPool() {
  const rows = await knex("profiles")
    .where({ is_discoverable: true, profile_status: "active" })
    .select("id", "first_name", "gender", "ethnicity");
  return rows.map((row) => ({
    id: row.id,
    name: row.first_name,
    gender: row.gender ? String(row.gender) : "(unstated)",
    heritage: parseHeritage(row.ethnicity).length
      ? parseHeritage(row.ethnicity)
      : ["(unstated)"],
  }));
}

/** Share of the pool declaring each value, per facet. */
function baseRates(pool) {
  const rates = { gender: new Map(), heritage: new Map() };
  for (const person of pool) {
    rates.gender.set(person.gender, (rates.gender.get(person.gender) || 0) + 1);
    for (const value of new Set(person.heritage)) {
      rates.heritage.set(value, (rates.heritage.get(value) || 0) + 1);
    }
  }
  const toShares = (counts) =>
    new Map([...counts.entries()].map(([k, n]) => [k, n / pool.length]));
  return { gender: toShares(rates.gender), heritage: toShares(rates.heritage) };
}

/** Share of one result page declaring each value, per facet. */
function pageShares(people) {
  const gender = new Map();
  const heritage = new Map();
  for (const person of people) {
    gender.set(person.gender, (gender.get(person.gender) || 0) + 1);
    for (const value of new Set(person.heritage)) {
      heritage.set(value, (heritage.get(value) || 0) + 1);
    }
  }
  const n = people.length || 1;
  return {
    gender: new Map([...gender.entries()].map(([k, c]) => [k, c / n])),
    heritage: new Map([...heritage.entries()].map(([k, c]) => [k, c / n])),
  };
}

/**
 * Every group whose share of the page exceeds its base rate by more than the
 * tolerance. Under-representation is reported in the table but not flagged:
 * with a pool this small a group can be absent from a page by arithmetic.
 */
function skewFlags(shares, rates, tolerance) {
  const flags = [];
  for (const facet of ["gender", "heritage"]) {
    for (const [value, share] of shares[facet].entries()) {
      const base = rates[facet].get(value) || 0;
      if (share - base > tolerance) {
        flags.push({ facet, value, share, base, delta: share - base });
      }
    }
  }
  return flags;
}

// ── indexing with the hash embedder ─────────────────────────────────────────

/**
 * Rebuild the whole discoverable pool's corpus with the deterministic hash
 * embedder. Existing chunks are dropped first: `reindexProfile` re-embeds only
 * text whose hash changed, so without the drop, vectors written by another
 * embedder would survive and be scored against fake query vectors.
 */
async function indexPoolWithFakeEmbedder(pool) {
  const ids = pool.map((p) => p.id);
  const granted = await knex("profiles")
    .whereIn("id", ids)
    .whereNot({ embedding_processing_consent: true })
    .update({ embedding_processing_consent: true });
  await knex("discover_chunks").whereIn("profile_id", ids).del();

  let chunks = 0;
  let embedded = 0;
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const result = await reindexProfile(knex, id);
    chunks += result.chunks;
    embedded += result.embedded;
  }
  return { profiles: ids.length, chunks, embedded, granted };
}

// ── the run ─────────────────────────────────────────────────────────────────

async function resolveAgencyId() {
  if (args.agency) {
    const row = await knex("users")
      .where({ id: args.agency, role: "AGENCY" })
      .first("id");
    if (!row) refuse(`--agency ${args.agency} is not an AGENCY user.`);
    return row.id;
  }
  const row = await knex("users")
    .where({ role: "AGENCY" })
    .orderBy("created_at", "asc")
    .first("id", "email");
  if (!row) refuse("No AGENCY user found — run `npm run seed` against this database.");
  return row.id;
}

async function main() {
  const briefs = JSON.parse(fs.readFileSync(args.briefs, "utf8"));
  if (!Array.isArray(briefs) || !briefs.length) {
    refuse(`${args.briefs} holds no briefs.`);
  }

  if (args.fake) {
    provider.__setEmbedder(provider.hashEmbedder());
    // Query vectors are cached by text hash; a cache written by a real
    // provider would be replayed here and quietly poison every score.
    await knex("discover_embed_cache").del();
  }

  const pool = await loadPool();
  if (!pool.length) {
    refuse("No discoverable talent in this database — run `npm run seed` first.");
  }
  const byName = new Map(pool.map((p) => [p.name, p]));
  const byId = new Map(pool.map((p) => [p.id, p]));

  for (const entry of briefs) {
    for (const name of entry.relevant || []) {
      if (!byName.has(name)) {
        refuse(
          `Golden set names "${name}", who is not in this database's discoverable pool. ` +
            "Re-seed, or fix the fixture.",
        );
      }
    }
  }

  let indexed = null;
  if (args.indexFake) indexed = await indexPoolWithFakeEmbedder(pool);

  const agencyId = await resolveAgencyId();
  const rates = baseRates(pool);
  const k = args.limit;

  const report = [];
  const flags = [];
  const lookOnlyPage = [];

  for (const entry of briefs) {
    const relevant = new Set(entry.relevant || []);
    // eslint-disable-next-line no-await-in-loop
    const result = await searchDiscoverableTalent(knex, {
      agencyId,
      q: entry.brief,
      limit: String(k),
    });

    const top = result.profiles.map((dto) => byId.get(dto.id)).filter(Boolean);
    const flagsForBrief = top.map((person) => (relevant.has(person.name) ? 1 : 0));
    const lookOnly = (result.discover_v2?.filters || []).length === 0;

    const row = {
      brief: entry.brief,
      look_only: lookOnly,
      semantic: Boolean(result.meta?.semantic_search),
      scored: result._launch?.semantic?.scored ?? 0,
      why_lines: result.profiles.filter((dto) => dto.why).length,
      relevant: [...relevant],
      top: top.map((p) => p.name),
      ndcg: ndcgAt(flagsForBrief, relevant.size, k),
      recall: recallAt(flagsForBrief, relevant.size, k),
      skew: [],
    };

    if (lookOnly) {
      lookOnlyPage.push(...top);
      const shares = pageShares(top);
      row.shares = shares;
      row.skew = skewFlags(shares, rates, args.tolerance);
      for (const flag of row.skew) flags.push({ brief: entry.brief, ...flag });
    }

    report.push(row);
  }

  const lookOnlyRows = report.filter((r) => r.look_only);
  const summary = {
    briefs: report.length,
    look_only: lookOnlyRows.length,
    pool: pool.length,
    ndcg_at_k: mean(report.map((r) => r.ndcg)),
    recall_at_k: mean(report.map((r) => r.recall)),
    look_only_ndcg_at_k: mean(lookOnlyRows.map((r) => r.ndcg)),
    flags: flags.length,
  };

  // The pooled distribution across every look-only brief: a skew too small to
  // trip on one page but systematic across the set shows up here.
  const pooledShares = pageShares(lookOnlyPage);
  const pooledSkew = skewFlags(pooledShares, rates, args.tolerance);
  for (const flag of pooledSkew) flags.push({ brief: "(all look-only briefs)", ...flag });
  summary.flags = flags.length;

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          summary,
          indexed,
          fake: args.fake,
          tolerance: args.tolerance,
          k,
          base_rates: {
            gender: Object.fromEntries(rates.gender),
            heritage: Object.fromEntries(rates.heritage),
          },
          briefs: report.map((r) => ({
            ...r,
            shares: r.shares
              ? {
                  gender: Object.fromEntries(r.shares.gender),
                  heritage: Object.fromEntries(r.shares.heritage),
                }
              : undefined,
          })),
          flags,
        },
        null,
        2,
      ),
    );
  } else {
    printReport({ report, summary, rates, pooledShares, pooledSkew, indexed, k });
  }

  await knex.destroy();
  process.exit(flags.length ? 1 : 0);
}

// ── the readable report ─────────────────────────────────────────────────────

function printReport({ report, summary, rates, pooledShares, pooledSkew, indexed, k }) {
  const line = (n = 78) => console.log("─".repeat(n));

  console.log("");
  console.log("Discover semantic layer — golden-brief evaluation");
  line();
  if (args.fake) {
    console.log(
      "EMBEDDER: hash (--fake). Plumbing only — these scores measure word overlap,",
    );
    console.log("not model quality. Do not quote them as retrieval numbers.");
  } else {
    console.log(`EMBEDDER: ${provider.providerName()} / ${provider.modelName()}`);
  }
  if (indexed) {
    console.log(
      `INDEXED : ${indexed.profiles} profiles, ${indexed.chunks} chunks, ` +
        `${indexed.embedded} embedded, consent granted to ${indexed.granted}.`,
    );
  }
  console.log(`POOL    : ${summary.pool} discoverable profiles · cut-off k=${k}`);
  console.log("");

  for (const row of report) {
    console.log(`▸ ${row.brief}`);
    console.log(
      `    ${row.look_only ? "look-only" : "mixed"} · semantic=${row.semantic} · ` +
        `scored=${row.scored} · why-lines=${row.why_lines}`,
    );
    console.log(`    relevant: ${row.relevant.join(", ") || "(none)"}`);
    console.log(
      `    top${k}:    ${row.top
        .map((name) => (row.relevant.includes(name) ? `[${name}]` : name))
        .join(", ")}`,
    );
    console.log(
      `    nDCG@${k}=${row.ndcg.toFixed(3)}  recall@${k}=${row.recall.toFixed(3)}`,
    );
    if (row.skew.length) {
      for (const flag of row.skew) {
        console.log(
          `    FLAG ${flag.facet} "${flag.value}": ${pct(flag.share)} of top${k} ` +
            `vs ${pct(flag.base)} base (+${pct(flag.delta)})`,
        );
      }
    }
    console.log("");
  }

  line();
  console.log("Fairness — pooled top-10 distribution across every look-only brief");
  console.log(`(flagged when a share exceeds base rate by more than ${pct(args.tolerance)})`);
  line();
  for (const facet of ["gender", "heritage"]) {
    console.log(`  ${facet}`);
    const values = new Set([
      ...rates[facet].keys(),
      ...pooledShares[facet].keys(),
    ]);
    for (const value of [...values].sort()) {
      const base = rates[facet].get(value) || 0;
      const share = pooledShares[facet].get(value) || 0;
      const delta = share - base;
      const mark = delta > args.tolerance ? " FLAG" : "";
      console.log(
        `    ${value.padEnd(26)} top: ${pct(share).padStart(6)}   base: ${pct(base).padStart(6)}` +
          `   ${(delta >= 0 ? "+" : "") + pct(delta)}${mark}`,
      );
    }
  }
  console.log("");

  line();
  console.log(
    `nDCG@${k} ${summary.ndcg_at_k.toFixed(3)} · recall@${k} ${summary.recall_at_k.toFixed(3)} ` +
      `· look-only nDCG@${k} ${summary.look_only_ndcg_at_k.toFixed(3)}`,
  );
  console.log(
    `${summary.briefs} briefs (${summary.look_only} look-only) · ` +
      `${summary.flags} fairness flag(s)${pooledSkew.length ? " incl. pooled" : ""}`,
  );
  line();
  console.log(
    summary.flags
      ? "RESULT: FLAGGED — a group is over-represented beyond the tolerance. Exit 1."
      : "RESULT: no group exceeded the tolerance. Exit 0.",
  );
  console.log("");
}

main().catch(async (err) => {
  console.error(err);
  try {
    await knex.destroy();
  } catch {
    // already closed
  }
  process.exit(2);
});
