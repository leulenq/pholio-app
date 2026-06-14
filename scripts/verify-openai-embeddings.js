/**
 * Verify OPENAI_API_KEY and embedding connectivity.
 *
 * Usage: node scripts/verify-openai-embeddings.js
 */
"use strict";

require("dotenv").config();

const {
  embed,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} = require("../src/domains/ai/embeddings");

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error(
      "[verify-embeddings] OPENAI_API_KEY is not set. Add it to .env — see README.",
    );
    process.exit(1);
  }

  console.log(
    `[verify-embeddings] Testing ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dims)...`,
  );

  const vector = await embed("editorial model with sharp jawline, Paris based");
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
    console.error(
      `[verify-embeddings] Unexpected response: got ${vector?.length} dims, expected ${EMBEDDING_DIMENSIONS}`,
    );
    process.exit(1);
  }

  console.log("[verify-embeddings] OK — embedding API is working.");
  console.log(
    `[verify-embeddings] Sample vector: [${vector
      .slice(0, 3)
      .map((n) => n.toFixed(4))
      .join(", ")}, ...]`,
  );

  const isPg =
    (process.env.DB_CLIENT || "sqlite3").toLowerCase() === "pg" ||
    (process.env.DATABASE_URL || "").startsWith("postgres");
  if (!isPg) {
    console.log(
      "[verify-embeddings] SQLite dev — semantic search uses talent_embedding_cache. Run: npm run migrate && npm run backfill:discover",
    );
  } else {
    console.log(
      "[verify-embeddings] Postgres detected. Run: node scripts/backfill-discover-embeddings.js",
    );
  }
}

main().catch((err) => {
  console.error("[verify-embeddings] Failed:", err.message);
  process.exit(1);
});
