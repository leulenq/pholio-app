/**
 * Discover search quality evaluation — hybrid vs legacy across messy agency queries.
 *
 * Usage:
 *   node scripts/eval-discover-quality.js
 *   node scripts/eval-discover-quality.js --hybrid-only
 */
"use strict";

require("dotenv").config();

const QUERIES = [
  {
    q: "black man",
    expectTop: ["Sofia Marcus"],
    category: "demographic",
  },
  {
    q: "sharp jawline editorial",
    expectTop: ["Noah Ito", "Elena Petrova", "Amara Rossi"],
    category: "visual+casting",
  },
  {
    q: "looks expensive quiet editorial face",
    expectTop: ["Ines Singh", "Elena Petrova", "Priya Novak"],
    category: "subjective",
  },
  {
    q: "tall redhead severe profile",
    expectTop: [],
    category: "compositional-missing-data",
    note: "No redheads in corpus — should return tall/angular alternatives or empty",
  },
  {
    q: "girl next door commercial smile",
    expectTop: ["Zara Petrova", "Aria Singh", "Luca Nguyen"],
    category: "casting-language",
  },
  {
    q: "FW26 show package angular runway walk",
    expectTop: ["Sofia Marcus", "Omar Costa", "Amara Rossi"],
    category: "campaign-context",
  },
  {
    q: "androgynous new york editorial",
    expectTop: ["Mia Khan"],
    category: "multi-attribute",
  },
  {
    q: "black woman beauty luxury",
    expectTop: ["Kai Thompson", "Hana Park"],
    category: "demographic+market",
  },
  {
    q: "fitness athletic activewear toned",
    expectTop: ["Liam Rossi", "Omar Costa"],
    category: "market-fit",
  },
  {
    q: "someone who feels like old Celine campaigns",
    expectTop: ["Ines Singh", "Elena Petrova", "Priya Novak"],
    category: "unexpected-subjective",
  },
  {
    q: "short model beauty close-up porcelain skin",
    expectTop: ["Noah Ito", "Amara Rossi"],
    category: "visual-compositional",
  },
  {
    q: "idk tall guy runway milan energy",
    expectTop: ["Sofia Marcus", "Omar Costa", "Mia Khan"],
    category: "messy-natural",
  },
];

async function runSearch(knex, agencyId, q, hybrid) {
  process.env.DISCOVER_HYBRID = hybrid ? "true" : "false";
  delete require.cache[
    require.resolve("../src/domains/agency/services/discover-search")
  ];
  delete require.cache[
    require.resolve("../src/domains/agency/services/query-understanding")
  ];
  delete require.cache[
    require.resolve("../src/domains/agency/services/discover-retrieval")
  ];
  delete require.cache[
    require.resolve("../src/domains/agency/services/discover-rerank")
  ];

  const {
    searchDiscoverableTalent,
  } = require("../src/domains/agency/services/discover-search");
  const start = Date.now();
  const result = await searchDiscoverableTalent(knex, {
    agencyId,
    q,
    limit: "5",
  });
  const ms = Date.now() - start;
  return { result, ms };
}

function formatProfile(p) {
  const name = `${p.first_name} ${p.last_name}`;
  const score = p.match_score ?? p.vibe_distance;
  const scoreStr =
    p.match_score != null
      ? `match=${p.match_score}`
      : p.vibe_distance != null
        ? `dist=${Number(p.vibe_distance).toFixed(3)}`
        : "—";
  return `${name} (${scoreStr})`;
}

function hitRate(topNames, expectTop) {
  if (!expectTop.length) return null;
  const top3 = topNames.slice(0, 3);
  const hits = expectTop.filter((n) => top3.includes(n));
  return { hits, rate: hits.length / Math.min(3, expectTop.length) };
}

async function main() {
  const hybridOnly = process.argv.includes("--hybrid-only");
  const knex = require("knex")(require("../knexfile.js"));

  const agency = await knex("users")
    .where({ email: "agency@example.com" })
    .first();
  const mem = await knex("agency_memberships")
    .where({ user_id: agency.id })
    .first();
  const agencyId = mem.agency_id;

  const channels = await knex("talent_embedding_cache")
    .select("source")
    .count("* as c")
    .groupBy("source");
  const ftsCount = await knex("profiles_fts").count("* as c");

  console.log("\n=== Discover Quality Evaluation ===\n");
  console.log("Index state:", JSON.stringify({ channels, fts: ftsCount[0].c }));
  console.log(
    "OPENAI:",
    !!process.env.OPENAI_API_KEY,
    "| GROQ:",
    !!process.env.GROQ_API_KEY,
  );
  console.log("");

  const summary = {
    hybrid: { pass: 0, partial: 0, fail: 0, empty: 0 },
    legacy: { pass: 0, partial: 0, fail: 0, empty: 0 },
  };

  for (const spec of QUERIES) {
    console.log(`\n── "${spec.q}" [${spec.category}]`);
    if (spec.note) console.log(`   Note: ${spec.note}`);

    for (const mode of hybridOnly ? ["hybrid"] : ["hybrid", "legacy"]) {
      const hybrid = mode === "hybrid";
      try {
        const { result, ms } = await runSearch(knex, agencyId, spec.q, hybrid);
        const names = result.profiles.map(
          (p) => `${p.first_name} ${p.last_name}`,
        );
        const top = result.profiles.slice(0, 5).map(formatProfile);
        const meta = result.meta || {};

        console.log(
          `  [${mode}] ${ms}ms | ${result.profiles.length} results | semantic=${meta.semantic_search} hybrid=${meta.hybrid_search ?? hybrid}`,
        );
        if (meta.query_understanding?.attributes?.length) {
          console.log(
            `    attrs: ${meta.query_understanding.attributes.map((a) => a.term).join(", ")}`,
          );
        }
        if (meta.retrieval?.legs_used?.length) {
          console.log(`    legs: ${meta.retrieval.legs_used.join(", ")}`);
        }
        console.log(`    top: ${top.length ? top.join(" | ") : "(none)"}`);

        const hr = hitRate(names, spec.expectTop);
        if (hr) {
          const label =
            hr.rate >= 0.67
              ? "PASS"
              : hr.rate >= 0.33
                ? "PARTIAL"
                : names.length === 0
                  ? "EMPTY"
                  : "FAIL";
          console.log(
            `    expected: ${spec.expectTop.join(", ")} → ${label} (${hr.hits.join(", ") || "none"})`,
          );
          const bucket = summary[mode];
          if (label === "PASS") bucket.pass++;
          else if (label === "PARTIAL") bucket.partial++;
          else if (label === "EMPTY") bucket.empty++;
          else bucket.fail++;
        } else if (names.length === 0) {
          console.log(`    (no expected match — got empty)`);
          summary[mode].empty++;
        } else {
          console.log(
            `    (no expected match — got ${names.slice(0, 3).join(", ")})`,
          );
        }
      } catch (err) {
        console.log(`  [${mode}] ERROR: ${err.message}`);
        summary[mode].fail++;
      }
    }
  }

  console.log("\n=== Summary ===");
  for (const mode of hybridOnly ? ["hybrid"] : ["hybrid", "legacy"]) {
    const s = summary[mode];
    console.log(
      `${mode}: pass=${s.pass} partial=${s.partial} fail=${s.fail} empty=${s.empty}`,
    );
  }

  await knex.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
