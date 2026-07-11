/**
 * WS8.3 — Layer-2 relevance evaluation: LLM-as-judge binary relevance over the
 * golden brief set, against a STAGED database (real profiles + embeddings).
 *
 * Companion to scripts/eval-discover-quality.js (the hybrid-vs-legacy harness):
 * this script drives the LAUNCH-mode engine end-to-end with the LIVE parse
 * model (no mocked contracts — that is Layer-1's job, tests/eval/), judges each
 * returned result as relevant/not-relevant to the brief, and records
 * precision@10 per brief plus the aggregate into a checked-in trendfile so the
 * number is comparable across prompt/embedding changes.
 *
 * Usage:
 *   npm run eval:discover:layer2                 # full golden set
 *   node scripts/eval-discover-layer2.js --limit-briefs 5   # quick pass
 *   node scripts/eval-discover-layer2.js --dry              # no trendfile write
 *   node scripts/eval-discover-layer2.js --gate             # exit 1 if aggregate < 0.8
 *
 * Requirements (no-ops with a message when absent):
 *   GROQ_API_KEY    — REQUIRED: live brief parsing + the judge model
 *   OPENAI_API_KEY  — recommended: soft-similarity scoring inside the engine
 *                     (without it ordering degrades to constraint counts only;
 *                     the run is still recorded, flagged soft_scoring:false)
 *   DATABASE_URL    — the staged DB to evaluate against
 *
 * Trendfile: tests/eval/trend/layer2-precision.jsonl — one JSON line per run
 * carrying git SHA + timestamp (spec §7; launch exit criterion: aggregate
 * precision@10 ≥ 0.8 on the human-spot-validated judge).
 */
"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const FIX_DIR = path.join(__dirname, "..", "tests", "fixtures", "discover-golden");
const TREND_FILE = path.join(
  __dirname,
  "..",
  "tests",
  "eval",
  "trend",
  "layer2-precision.jsonl",
);
const GATE_THRESHOLD = 0.8;
const K = 10;

function arg(flag) {
  return process.argv.includes(flag);
}
function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// ── env gate ─────────────────────────────────────────────────────────────────

if (!process.env.GROQ_API_KEY) {
  console.log(
    "[eval:discover:layer2] GROQ_API_KEY is not set — Layer-2 needs the live " +
      "parse model and the LLM judge. Nothing to do (this is a no-op, not a " +
      "failure). Set GROQ_API_KEY (and ideally OPENAI_API_KEY + DATABASE_URL " +
      "pointing at the staged DB) and re-run.",
  );
  process.exit(0);
}
const softScoring = Boolean(process.env.OPENAI_API_KEY);
if (!softScoring) {
  console.warn(
    "[eval:discover:layer2] OPENAI_API_KEY not set — engine runs without " +
      "soft-similarity scoring (ordering = constraint passes only). Run will " +
      "be recorded with soft_scoring:false.",
  );
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

// ── judge ────────────────────────────────────────────────────────────────────

const JUDGE_SCHEMA = {
  name: "discover_relevance_judgment",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      relevant: { type: "boolean" },
      reason: { type: "string" },
    },
    required: ["relevant", "reason"],
  },
};

const JUDGE_SYSTEM = `You are judging a talent-search engine for a modeling/creative agency.
Given a casting BRIEF and one candidate's FACT SHEET, answer with a single binary judgment:
relevant=true only if a working booker would consider this candidate a plausible submission for the brief.
Judge ONLY from the fact sheet — do not invent attributes. Aesthetic/vibe language is satisfiable
by board and profile facts; hard numbers (height, ages, sizes) must actually be compatible when stated.
Ethnicity/heritage/skin-tone language in a brief must be IGNORED (never a relevance criterion).`;

function factSheet(p) {
  const lines = [];
  const push = (label, v) => {
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      lines.push(`${label}: ${v}`);
    }
  };
  push("gender", p.gender);
  push("height_cm", p.height_cm);
  push("boards", p.modeling_categories || p.archetype);
  push("market", p.market || p.city);
  push(
    "playing_age",
    p.playing_age_min != null || p.playing_age_max != null
      ? `${p.playing_age_min ?? "?"}-${p.playing_age_max ?? "?"}`
      : null,
  );
  push("hair", p.hair_color);
  push("eyes", p.eye_color);
  push("dress_size", p.dress_size);
  push("suit_size", p.suit_size);
  push("shoe_size", p.shoe_size);
  push("waist_cm", p.waist_cm);
  push("hips_cm", p.hips_cm);
  push("union", p.union_membership);
  push("tattoos", p.tattoos);
  push("availability_status", p.availability_status);
  push("experience_level", p.experience_level);
  return lines.join("\n") || "(no structured facts on file)";
}

async function judgeOne(groq, model, brief, profileRow) {
  const res = await groq.chat.completions.create({
    model,
    temperature: 0,
    max_completion_tokens: 700,
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      {
        role: "user",
        content: `BRIEF:\n${brief}\n\nFACT SHEET:\n${factSheet(profileRow)}`,
      },
    ],
    response_format: { type: "json_schema", json_schema: JUDGE_SCHEMA },
  });
  const content = res.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dry = arg("--dry");
  const gate = arg("--gate");
  const limitBriefs = parseInt(argValue("--limit-briefs", "0"), 10) || 0;

  const knex = require("knex")(require("../knexfile.js"));
  const config = require("../src/config");
  const Groq = require("groq-sdk");
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const model = config.groq.textModel;

  const {
    launchModeSearch,
  } = require("../src/domains/agency/services/discover/engine");

  const agencyEmail = argValue("--agency-email", null);
  const agency = agencyEmail
    ? await knex("users").where({ email: agencyEmail }).first()
    : await knex("users").where({ role: "AGENCY" }).orderBy("email").first();
  if (!agency) {
    console.error(
      "[eval:discover:layer2] No AGENCY user found in the target DB " +
        "(pass --agency-email <email> or seed one). Aborting.",
    );
    await knex.destroy();
    process.exit(1);
  }

  let fixtures = fs
    .readdirSync(FIX_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(FIX_DIR, f), "utf8")));
  if (limitBriefs > 0) fixtures = fixtures.slice(0, limitBriefs);

  console.log("\n=== Discover Layer-2 — LLM-judge precision@10 ===\n");
  console.log(
    `briefs=${fixtures.length} agency=${agency.email} model=${model} soft_scoring=${softScoring}\n`,
  );

  const perBrief = [];

  for (const fx of fixtures) {
    let shownRows = [];
    let honestZero = null;
    let errMsg = null;
    try {
      const res = await launchModeSearch({
        knex,
        briefText: fx.brief,
        limit: K,
        agencyUserId: agency.id,
        now: new Date(),
      });
      honestZero = res.discover_v2.honest_zero;
      const ids = res.profiles.slice(0, K).map((p) => p.id);
      if (ids.length) {
        const rows = await knex("profiles").whereIn("id", ids).select("*");
        const byId = new Map(rows.map((r) => [r.id, r]));
        shownRows = ids.map((id) => byId.get(id)).filter(Boolean);
      }
    } catch (err) {
      errMsg = err.message;
    }

    if (errMsg) {
      console.log(`✗ "${fx.brief}" [${fx.category}] — ENGINE ERROR: ${errMsg}`);
      perBrief.push({ name: fx.name, error: errMsg, precision: null, shown: 0 });
      continue;
    }
    if (!shownRows.length) {
      const why = honestZero ? `honest zero (${honestZero.removable_chip || "n/a"})` : "0 results";
      console.log(`○ "${fx.brief}" [${fx.category}] — ${why} — not judged`);
      perBrief.push({ name: fx.name, precision: null, shown: 0, honest_zero: !!honestZero });
      continue;
    }

    let relevant = 0;
    for (const row of shownRows) {
      try {
        const verdict = await judgeOne(groq, model, fx.brief, row);
        if (verdict.relevant) relevant += 1;
      } catch (err) {
        console.warn(`  judge error for ${row.first_name}: ${err.message}`);
      }
    }
    const precision = relevant / shownRows.length;
    perBrief.push({
      name: fx.name,
      precision: Number(precision.toFixed(3)),
      shown: shownRows.length,
      relevant,
    });
    console.log(
      `${precision >= GATE_THRESHOLD ? "✓" : "✗"} "${fx.brief}" [${fx.category}] — p@${shownRows.length}=${precision.toFixed(2)} (${relevant}/${shownRows.length})`,
    );
  }

  const judged = perBrief.filter((b) => b.precision != null);
  const aggregate = judged.length
    ? judged.reduce((s, b) => s + b.precision, 0) / judged.length
    : null;

  console.log("\n=== Summary ===");
  console.log(
    `judged=${judged.length}/${perBrief.length} briefs · aggregate precision@10=${aggregate != null ? aggregate.toFixed(3) : "n/a"} (exit criterion ≥ ${GATE_THRESHOLD})`,
  );

  const record = {
    ts: new Date().toISOString(),
    git_sha: gitSha(),
    engine: "launch",
    model,
    soft_scoring: softScoring,
    briefs: perBrief.length,
    judged_briefs: judged.length,
    aggregate_precision_at_10:
      aggregate != null ? Number(aggregate.toFixed(3)) : null,
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

  if (gate && (aggregate == null || aggregate < GATE_THRESHOLD)) {
    console.error(
      `[eval:discover:layer2] GATE FAILED: aggregate ${aggregate != null ? aggregate.toFixed(3) : "n/a"} < ${GATE_THRESHOLD}`,
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
