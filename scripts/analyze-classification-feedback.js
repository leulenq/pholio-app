#!/usr/bin/env node
/**
 * Analyze image_classification_feedback for calibration insights.
 *
 * Usage:
 *   node scripts/analyze-classification-feedback.js
 *   node scripts/analyze-classification-feedback.js --days=30
 */

require("dotenv").config();

const knex = require("../src/shared/db/knex");
const { THRESHOLDS } = require("../src/domains/talent/services/image-classification-policy");

function parseArgs(argv) {
  const opts = { days: null };
  for (const arg of argv) {
    if (arg.startsWith("--days=")) opts.days = Number(arg.split("=")[1]) || null;
  }
  return opts;
}

function fieldCorrections(rows, field) {
  const predKey = `predicted_${field}`;
  const corrKey = `corrected_${field}`;
  let total = 0;
  let correctionCount = 0;
  const byPredicted = new Map();

  for (const row of rows) {
    const predicted = row[predKey];
    const correctedVal = row[corrKey];
    if (predicted == null && correctedVal == null) continue;
    total += 1;
    if (predicted !== correctedVal) {
      correctionCount += 1;
      const key = predicted || "(null)";
      byPredicted.set(key, (byPredicted.get(key) || 0) + 1);
    }
  }

  return {
    total,
    corrections: correctionCount,
    rate: total ? correctionCount / total : 0,
    byPredicted: [...byPredicted.entries()].sort((a, b) => b[1] - a[1]),
  };
}

function suggestThreshold(field, rate, current) {
  if (rate > 0.08) {
    return {
      action: "raise",
      from: current.auto,
      to: Math.min(0.98, Math.round((current.auto + 0.03) * 100) / 100),
      reason: `Correction rate ${(rate * 100).toFixed(1)}% exceeds 8% target`,
    };
  }
  if (rate < 0.02 && rate > 0) {
    return {
      action: "lower",
      from: current.auto,
      to: Math.max(current.suggest + 0.02, Math.round((current.auto - 0.02) * 100) / 100),
      reason: `Correction rate ${(rate * 100).toFixed(1)}% — room to auto-apply more`,
    };
  }
  return {
    action: "hold",
    from: current.auto,
    to: current.auto,
    reason: `Correction rate ${(rate * 100).toFixed(1)}% within target band`,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const hasTable = await knex.schema.hasTable("image_classification_feedback");
  if (!hasTable) {
    console.log("[PITS calibration] image_classification_feedback table not found — run migrations first.");
    await knex.destroy();
    return;
  }

  let q = knex("image_classification_feedback").select("*").orderBy("created_at", "desc");
  if (opts.days) {
    const since = new Date(Date.now() - opts.days * 86400000);
    q = q.where("created_at", ">=", since.toISOString());
  }

  const rows = await q;
  console.log(`[PITS calibration] ${rows.length} feedback row(s)${opts.days ? ` (last ${opts.days} days)` : ""}`);

  if (rows.length === 0) {
    console.log("No corrections logged yet. User edits on auto-tagged images will populate this table.");
    await knex.destroy();
    return;
  }

  const fields = ["shot_type", "style_type", "image_type"];
  const summary = {};

  for (const field of fields) {
    const stats = fieldCorrections(rows, field);
    const threshold = THRESHOLDS[field] || THRESHOLDS.shot_type;
    const suggestion = suggestThreshold(field, stats.rate, threshold);
    summary[field] = { ...stats, suggestion };

    console.log(`\n── ${field} ──`);
    console.log(`  Samples:     ${stats.total}`);
    console.log(`  Corrections: ${stats.corrections} (${(stats.rate * 100).toFixed(1)}%)`);
    if (stats.byPredicted.length) {
      console.log("  Top corrected predictions:");
      for (const [label, count] of stats.byPredicted.slice(0, 5)) {
        console.log(`    ${label}: ${count}`);
      }
    }
    console.log(
      `  Threshold:   ${suggestion.action} auto ${suggestion.from} → ${suggestion.to} (${suggestion.reason})`,
    );
  }

  const models = new Map();
  for (const row of rows) {
    const m = row.model || "unknown";
    models.set(m, (models.get(m) || 0) + 1);
  }
  console.log("\n── Models ──");
  for (const [model, count] of models) {
    console.log(`  ${model}: ${count}`);
  }

  console.log("\nCurrent THRESHOLDS (src/domains/talent/services/image-classification-policy.js):");
  console.log(JSON.stringify(THRESHOLDS, null, 2));

  await knex.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
