/**
 * WS8.4 — Pre-launch channel ablation: single-channel launch scoring vs the
 * hybrid multi-channel RRF path, over the golden brief set on the SAME staged
 * database. Produces the number the single-vs-multi-channel launch decision is
 * made on (spec §7: "channels must earn their per-query calls before launch").
 *
 * What it runs, per golden brief:
 *   A (launch)  — launchModeSearch: constraint tiers + ONE dense cosine leg
 *                 (soft_query embedding vs discover_index embedding)
 *   B (hybrid)  — searchDiscoverableTalent with DISCOVER_ENGINE=hybrid: the
 *                 five-leg pgvector + FTS retrieval fused by RRF (+ rerank)
 *
 * What it reports, per brief and aggregate:
 *   overlap@10      — |top10(A) ∩ top10(B)| / min(|A|, |B|, 10)
 *   spearman_rho    — Spearman rank correlation over the UNION of both top-10
 *                     lists; an id missing from one list is assigned rank 11
 *                     (i.e. "below the fold") in that list. 1.0 = same order,
 *                     0 ≈ unrelated, negative = inverted.
 *   only_in_A/B     — per-brief name diffs for manual inspection.
 *
 * Reading the number: high overlap + high rho ⇒ the multi-channel fan-out is
 * not changing what bookers see — single-channel wins on cost/latency. Low
 * overlap is not automatically a hybrid win: pair this output with the
 * Layer-2 judge (scripts/eval-discover-layer2.js) to see WHICH list is right.
 *
 * Usage:
 *   npm run eval:discover:ablation
 *   node scripts/ablate-discover-channels.js --limit-briefs 5
 *   node scripts/ablate-discover-channels.js --dry            # no trendfile write
 *   node scripts/ablate-discover-channels.js --agency-email agency@example.com
 *
 * Requirements (no-ops with a message when absent):
 *   OPENAI_API_KEY  — REQUIRED: query embeddings for both legs
 *   GROQ_API_KEY    — REQUIRED: live parse (launch) + query decomposition (hybrid)
 *   DATABASE_URL    — the staged DB (Postgres/Neon for the full pgvector+FTS
 *                     hybrid path; SQLite exercises the fallback legs only)
 *
 * Trendfile: tests/eval/trend/ablation.jsonl (one JSON line per run, git SHA +
 * timestamp). The decision itself gets recorded in
 * tasks/discover-search-implementation-plan.md per WS8.4.
 */
"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const FIX_DIR = path.join(__dirname, "..", "tests", "fixtures", "discover-golden");
const TREND_FILE = path.join(__dirname, "..", "tests", "eval", "trend", "ablation.jsonl");
const K = 10;

function arg(flag) {
  return process.argv.includes(flag);
}
function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// ── env gate ─────────────────────────────────────────────────────────────────

const missing = [];
if (!process.env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY (query embeddings)");
if (!process.env.GROQ_API_KEY) missing.push("GROQ_API_KEY (parse/decomposition)");
if (missing.length) {
  console.log(
    `[eval:discover:ablation] Missing: ${missing.join(", ")} — both engines ` +
      "need live keys for a meaningful A/B. Nothing to do (this is a no-op, " +
      "not a failure). Set the keys and DATABASE_URL for the staged DB, then re-run.",
  );
  process.exit(0);
}

function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: path.join(__dirname, ".."),
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

// ── metrics ──────────────────────────────────────────────────────────────────

function overlapAtK(a, b, k = K) {
  const ta = a.slice(0, k);
  const tb = new Set(b.slice(0, k));
  const denom = Math.min(a.length, b.length, k);
  if (!denom) return null;
  return ta.filter((id) => tb.has(id)).length / denom;
}

/**
 * Spearman rank correlation over the union of both top-K lists. Ids absent
 * from one list take rank K+1 in that list ("below the fold" penalty).
 */
function spearmanRho(a, b, k = K) {
  const ta = a.slice(0, k);
  const tb = b.slice(0, k);
  const union = [...new Set([...ta, ...tb])];
  if (union.length < 2) return null;
  const rank = (list, id) => {
    const i = list.indexOf(id);
    return i === -1 ? k + 1 : i + 1;
  };
  const ra = union.map((id) => rank(ta, id));
  const rb = union.map((id) => rank(tb, id));
  const n = union.length;
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / n;
  const ma = mean(ra);
  const mb = mean(rb);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i += 1) {
    const da = ra[i] - ma;
    const db = rb[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return null; // a constant ranking has no correlation
  return cov / Math.sqrt(va * vb);
}

// ── engines ──────────────────────────────────────────────────────────────────

async function runLaunch(knex, launchModeSearch, agencyUserId, brief) {
  const prev = process.env.DISCOVER_ENGINE;
  process.env.DISCOVER_ENGINE = "launch";
  try {
    const res = await launchModeSearch({
      knex,
      briefText: brief,
      limit: K,
      agencyUserId,
      now: new Date(),
    });
    return res.profiles.map((p) => p.id);
  } finally {
    process.env.DISCOVER_ENGINE = prev == null ? "" : prev;
  }
}

async function runHybrid(knex, searchDiscoverableTalent, agencyUserId, brief) {
  const prevEngine = process.env.DISCOVER_ENGINE;
  const prevHybrid = process.env.DISCOVER_HYBRID;
  process.env.DISCOVER_ENGINE = "hybrid";
  process.env.DISCOVER_HYBRID = "true";
  try {
    const res = await searchDiscoverableTalent(knex, {
      agencyId: agencyUserId,
      q: brief,
      limit: String(K),
    });
    return res.profiles.map((p) => p.id);
  } finally {
    process.env.DISCOVER_ENGINE = prevEngine == null ? "" : prevEngine;
    process.env.DISCOVER_HYBRID = prevHybrid == null ? "" : prevHybrid;
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dry = arg("--dry");
  const limitBriefs = parseInt(argValue("--limit-briefs", "0"), 10) || 0;

  const knex = require("knex")(require("../knexfile.js"));
  const {
    launchModeSearch,
  } = require("../src/domains/agency/services/discover/engine");
  const {
    searchDiscoverableTalent,
  } = require("../src/domains/agency/services/discover-search");

  const agencyEmail = argValue("--agency-email", null);
  const agency = agencyEmail
    ? await knex("users").where({ email: agencyEmail }).first()
    : await knex("users").where({ role: "AGENCY" }).orderBy("email").first();
  if (!agency) {
    console.error(
      "[eval:discover:ablation] No AGENCY user found in the target DB " +
        "(pass --agency-email <email>). Aborting.",
    );
    await knex.destroy();
    process.exit(1);
  }

  let fixtures = fs
    .readdirSync(FIX_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(FIX_DIR, f), "utf8")));
  if (limitBriefs > 0) fixtures = fixtures.slice(0, limitBriefs);

  console.log("\n=== Discover ablation — launch single-channel vs hybrid RRF ===\n");
  console.log(`briefs=${fixtures.length} agency=${agency.email} k=${K}\n`);

  const nameOf = async (ids) => {
    if (!ids.length) return new Map();
    const rows = await knex("profiles")
      .whereIn("id", ids)
      .select("id", "first_name", "last_name");
    return new Map(rows.map((r) => [r.id, `${r.first_name} ${r.last_name}`]));
  };

  const perBrief = [];

  for (const fx of fixtures) {
    let a = [];
    let b = [];
    let errMsg = null;
    let msA = 0;
    let msB = 0;
    try {
      let t = Date.now();
      a = await runLaunch(knex, launchModeSearch, agency.id, fx.brief);
      msA = Date.now() - t;
      t = Date.now();
      b = await runHybrid(knex, searchDiscoverableTalent, agency.id, fx.brief);
      msB = Date.now() - t;
    } catch (err) {
      errMsg = err.message;
    }

    if (errMsg) {
      console.log(`✗ "${fx.brief}" — ERROR: ${errMsg}`);
      perBrief.push({ name: fx.name, error: errMsg });
      continue;
    }

    const overlap = overlapAtK(a, b);
    const rho = spearmanRho(a, b);
    const names = await nameOf([...new Set([...a, ...b])]);
    const onlyA = a.filter((id) => !b.includes(id)).map((id) => names.get(id) || id);
    const onlyB = b.filter((id) => !a.includes(id)).map((id) => names.get(id) || id);

    perBrief.push({
      name: fx.name,
      launch_n: a.length,
      hybrid_n: b.length,
      overlap_at_10: overlap != null ? Number(overlap.toFixed(3)) : null,
      spearman_rho: rho != null ? Number(rho.toFixed(3)) : null,
      only_in_launch: onlyA,
      only_in_hybrid: onlyB,
      launch_ms: msA,
      hybrid_ms: msB,
    });

    console.log(
      `── "${fx.brief}" [${fx.category}]\n` +
        `   launch=${a.length} (${msA}ms) hybrid=${b.length} (${msB}ms) · ` +
        `overlap@10=${overlap != null ? overlap.toFixed(2) : "n/a"} · ρ=${rho != null ? rho.toFixed(2) : "n/a"}`,
    );
    if (onlyA.length) console.log(`   only launch: ${onlyA.join(", ")}`);
    if (onlyB.length) console.log(`   only hybrid: ${onlyB.join(", ")}`);
  }

  const measured = perBrief.filter((x) => x.overlap_at_10 != null);
  const mean = (key) =>
    measured.length
      ? measured.reduce((s, x) => s + (x[key] ?? 0), 0) / measured.length
      : null;
  const meanOverlap = mean("overlap_at_10");
  const rhoMeasured = perBrief.filter((x) => x.spearman_rho != null);
  const meanRho = rhoMeasured.length
    ? rhoMeasured.reduce((s, x) => s + x.spearman_rho, 0) / rhoMeasured.length
    : null;

  console.log("\n=== Summary ===");
  console.log(
    `measured=${measured.length}/${perBrief.length} briefs · ` +
      `mean overlap@10=${meanOverlap != null ? meanOverlap.toFixed(3) : "n/a"} · ` +
      `mean ρ=${meanRho != null ? meanRho.toFixed(3) : "n/a"}`,
  );
  console.log(
    "Decision guide: overlap ≥ ~0.8 with ρ ≥ ~0.7 ⇒ multi-channel adds little " +
      "— ship single-channel. Lower ⇒ arbitrate with eval:discover:layer2 " +
      "before keeping the extra per-query calls.",
  );

  const record = {
    ts: new Date().toISOString(),
    git_sha: gitSha(),
    k: K,
    briefs: perBrief.length,
    measured: measured.length,
    mean_overlap_at_10: meanOverlap != null ? Number(meanOverlap.toFixed(3)) : null,
    mean_spearman_rho: meanRho != null ? Number(meanRho.toFixed(3)) : null,
    per_brief: perBrief,
  };

  if (!dry) {
    fs.mkdirSync(path.dirname(TREND_FILE), { recursive: true });
    fs.appendFileSync(TREND_FILE, `${JSON.stringify(record)}\n`);
    console.log(`trend → ${path.relative(process.cwd(), TREND_FILE)}`);
  } else {
    console.log("(--dry — trendfile not written)");
  }

  await knex.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
