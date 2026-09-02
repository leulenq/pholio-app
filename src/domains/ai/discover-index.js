"use strict";

/**
 * Discover semantic layer — the indexer.
 *
 * Builds a profile's `discover_chunks` from talent-authored text and photo
 * descriptions, embeds only what changed, deletes what no longer applies, and
 * stamps `profiles.discover_indexed_at`. Everything here is gated on the
 * talent's embedding consent re-read from the database at the boundary; when
 * consent is absent the profile's chunks are purged instead of built.
 *
 * Corpus rules (tasks/discover-semantic-2026-09.md §3.1): only the talent's
 * own words and attribute-neutral photo descriptions. No name, measurement,
 * heritage, age, skin tone, or body judgement is ever rendered here.
 */

const crypto = require("crypto");
const {
  isProfileEmbeddingAllowed,
  toVectorLiteral,
  isPostgresKnex,
} = require("./embeddings");
const provider = require("./embedding-provider");
const { AUDIENCE } = require("../../shared/lib/audience-dto");
const { applyImageVisibility } = require("../../shared/lib/profile-visibility");
const {
  BOOKING_LANES,
  normalizeBookingLaneList,
} = require("../../shared/constants/booking-lanes");
const { MARKET_LABELS } = require("../talent/services/market-resolve");

const LANE_LABEL = Object.fromEntries(BOOKING_LANES.map((l) => [l.slug, l.label]));
const BIO_CHUNK_WORDS = 60;
const MAX_BIO_CHUNKS = 6;
const MAX_PHOTO_CHUNKS = 30;

// ── text helpers ─────────────────────────────────────────────────────────────

function parseList(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean);
  const text = String(raw).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
  } catch {
    // not JSON
  }
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

function hashText(text) {
  return crypto
    .createHash("sha256")
    .update(String(text).trim().replace(/\s+/g, " ").toLowerCase())
    .digest("hex");
}

/** Split a bio into sentence groups of roughly BIO_CHUNK_WORDS words. */
function splitBio(bio) {
  const text = String(bio || "").replace(/\s+/g, " ").trim();
  if (!text || /^demo talent profile\.?$/i.test(text)) return [];
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks = [];
  let current = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const merged = current ? `${current} ${sentence}` : sentence;
    if (current && merged.split(/\s+/).length > BIO_CHUNK_WORDS) {
      chunks.push(current);
      current = sentence;
    } else {
      current = merged;
    }
  }
  if (current) chunks.push(current);
  return chunks.slice(0, MAX_BIO_CHUNKS);
}

const EXPERIENCE_PROSE = {
  new_face: "New face.",
  developing: "Developing.",
  experienced: "Experienced.",
  established: "Established.",
};

function experienceProse(level) {
  const raw = String(level || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const map = {
    new_face: "new_face",
    fresh_face: "new_face",
    emerging: "developing",
    developing: "developing",
    experienced: "experienced",
    professional: "experienced",
    seasoned: "experienced",
    established: "established",
    signed: "established",
    veteran: "established",
  };
  const slug = map[raw];
  return slug ? EXPERIENCE_PROSE[slug] : "";
}

/** The talent's declared facts as one readable paragraph. Never a number. */
function profileProse(profile, lanes) {
  const parts = [];
  const laneLabels = (lanes || []).map((slug) => LANE_LABEL[slug] || slug);
  if (laneLabels.length === 1) parts.push(`${laneLabels[0]} board.`);
  else if (laneLabels.length > 1) {
    parts.push(`${laneLabels.slice(0, -1).join(", ")} and ${laneLabels[laneLabels.length - 1]} boards.`);
  }
  const specialties = [...new Set([...parseList(profile.specialties), ...parseList(profile.specializations)])];
  if (specialties.length) parts.push(`Specialties: ${specialties.join(", ")}.`);
  const exp = experienceProse(profile.experience_level);
  if (exp) parts.push(exp);
  const market = profile.market && MARKET_LABELS[profile.market];
  if (market) parts.push(`Based in ${market}.`);
  const languages = parseList(profile.languages);
  if (languages.length) parts.push(`Languages: ${languages.join(", ")}.`);
  const discipline = String(profile.discipline || "").trim().toLowerCase();
  if (discipline && discipline !== "model") parts.push(`Discipline: ${discipline}.`);
  return parts.join(" ").trim();
}

/**
 * Pure: build the chunk list for a profile.
 * @param {object} profile — profiles row
 * @param {string[]} lanes — booking lane slugs
 * @param {Array<{id:string, description?:string|null}>} images — visible images with their description
 * @returns {Array<{kind:'bio'|'profile'|'photo', chunk_key:string, image_id:string|null, text:string}>}
 */
function buildChunks(profile, lanes, images) {
  const out = [];
  splitBio(profile.bio_curated || profile.bio_raw).forEach((text, i) => {
    out.push({ kind: "bio", chunk_key: `bio:${i}`, image_id: null, text });
  });
  const prose = profileProse(profile, lanes);
  if (prose) out.push({ kind: "profile", chunk_key: "profile:0", image_id: null, text: prose });
  let photos = 0;
  for (const image of images || []) {
    const text = String(image.description || "").trim();
    if (!text) continue;
    if (photos >= MAX_PHOTO_CHUNKS) break;
    photos += 1;
    out.push({ kind: "photo", chunk_key: `photo:${image.id}`, image_id: image.id, text });
  }
  return out;
}

// ── database ─────────────────────────────────────────────────────────────────

async function loadLanes(knex, profileId) {
  try {
    if (!(await knex.schema.hasTable("profile_booking_lanes"))) return [];
    const rows = await knex("profile_booking_lanes")
      .where({ profile_id: profileId })
      .orderBy("priority", "asc")
      .select("lane_slug");
    return normalizeBookingLaneList(rows.map((r) => r.lane_slug));
  } catch {
    return [];
  }
}

async function loadVisibleImagesWithDescriptions(knex, profileId) {
  const query = knex("images").where({ "images.profile_id": profileId });
  applyImageVisibility(query, AUDIENCE.AGENCY_DISCOVERY, { table: "images" });
  const images = await query.orderBy(["images.sort", "images.created_at"]).select("images.id");
  if (!images.length) return [];
  let descriptions = new Map();
  try {
    if (
      (await knex.schema.hasTable("image_signals")) &&
      (await knex.schema.hasColumn("image_signals", "description"))
    ) {
      const rows = await knex("image_signals")
        .whereIn("image_id", images.map((i) => i.id))
        .select("image_id", "description");
      descriptions = new Map(rows.map((r) => [r.image_id, r.description]));
    }
  } catch {
    descriptions = new Map();
  }
  return images.map((i) => ({ id: i.id, description: descriptions.get(i.id) || null }));
}

async function purgeDiscoverChunks(knex, profileId, { kinds } = {}) {
  if (!(await knex.schema.hasTable("discover_chunks"))) return;
  const q = knex("discover_chunks").where({ profile_id: profileId });
  if (Array.isArray(kinds) && kinds.length) q.whereIn("kind", kinds);
  await q.del();
}

/** Mark a profile as needing a reindex (cheap; safe from any write path). */
async function markProfileStale(knex, profileId) {
  try {
    if (!(await knex.schema.hasColumn("profiles", "discover_indexed_at"))) return;
    await knex("profiles").where({ id: profileId }).update({ discover_indexed_at: null });
  } catch {
    // best-effort
  }
}

/**
 * Rebuild a profile's chunks. Embeds only new or changed text.
 * @param {import('knex').Knex} knex
 * @param {string} profileId
 * @param {{ embedTexts?: typeof provider.embedTexts, env?: object, now?: Date }} [opts]
 * @returns {Promise<{ status: 'indexed'|'purged'|'skipped', chunks: number, embedded: number }>}
 */
async function reindexProfile(knex, profileId, opts = {}) {
  const env = opts.env || process.env;
  const embedTexts = opts.embedTexts || provider.embedTexts;
  if (!(await knex.schema.hasTable("discover_chunks"))) {
    return { status: "skipped", chunks: 0, embedded: 0 };
  }

  const profile = await knex("profiles").where({ id: profileId }).first();
  if (!profile || !isProfileEmbeddingAllowed(profile, env)) {
    await purgeDiscoverChunks(knex, profileId);
    return { status: "purged", chunks: 0, embedded: 0 };
  }

  const [lanes, images] = await Promise.all([
    loadLanes(knex, profileId),
    loadVisibleImagesWithDescriptions(knex, profileId),
  ]);
  const chunks = buildChunks(profile, lanes, images).map((c) => ({
    ...c,
    text_hash: hashText(c.text),
  }));

  const existing = await knex("discover_chunks")
    .where({ profile_id: profileId })
    .select("id", "chunk_key", "text_hash");
  const existingByKey = new Map(existing.map((r) => [r.chunk_key, r]));
  const wantedKeys = new Set(chunks.map((c) => c.chunk_key));

  const stale = existing.filter((r) => !wantedKeys.has(r.chunk_key)).map((r) => r.id);
  if (stale.length) await knex("discover_chunks").whereIn("id", stale).del();

  const toEmbed = chunks.filter((c) => {
    const row = existingByKey.get(c.chunk_key);
    return !row || row.text_hash !== c.text_hash;
  });

  let embedded = 0;
  if (toEmbed.length) {
    const vectors = await embedTexts(toEmbed.map((c) => c.text), { kind: "document", env });
    // Consent may have been withdrawn while the provider call was in flight.
    const fresh = await knex("profiles").where({ id: profileId }).first();
    if (!fresh || !isProfileEmbeddingAllowed(fresh, env)) {
      await purgeDiscoverChunks(knex, profileId);
      return { status: "purged", chunks: 0, embedded: 0 };
    }
    const pg = isPostgresKnex(knex);
    const model = provider.modelName();
    for (let i = 0; i < toEmbed.length; i += 1) {
      const chunk = toEmbed[i];
      const vector = vectors[i];
      if (!Array.isArray(vector) || !vector.length) continue;
      const row = existingByKey.get(chunk.chunk_key);
      const id = row ? row.id : crypto.randomUUID();
      if (pg) {
        // eslint-disable-next-line no-await-in-loop
        await knex.raw(
          `INSERT INTO discover_chunks (id, profile_id, image_id, kind, chunk_key, text, text_hash, model, embedding, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::vector, NOW(), NOW())
           ON CONFLICT (profile_id, chunk_key) DO UPDATE SET
             image_id = EXCLUDED.image_id, text = EXCLUDED.text, text_hash = EXCLUDED.text_hash,
             model = EXCLUDED.model, embedding = EXCLUDED.embedding, updated_at = NOW()`,
          [id, profileId, chunk.image_id, chunk.kind, chunk.chunk_key, chunk.text, chunk.text_hash, model, toVectorLiteral(vector)],
        );
      } else {
        const payload = {
          profile_id: profileId,
          image_id: chunk.image_id,
          kind: chunk.kind,
          chunk_key: chunk.chunk_key,
          text: chunk.text,
          text_hash: chunk.text_hash,
          model,
          embedding_json: JSON.stringify(vector),
          updated_at: knex.fn.now(),
        };
        if (row) {
          // eslint-disable-next-line no-await-in-loop
          await knex("discover_chunks").where({ id: row.id }).update(payload);
        } else {
          // eslint-disable-next-line no-await-in-loop
          await knex("discover_chunks").insert({ id, created_at: knex.fn.now(), ...payload });
        }
      }
      embedded += 1;
    }
  }

  if (await knex.schema.hasColumn("profiles", "discover_indexed_at")) {
    await knex("profiles").where({ id: profileId }).update({ discover_indexed_at: knex.fn.now() });
  }
  return { status: "indexed", chunks: chunks.length, embedded };
}

/** Profiles whose index is stale: never indexed, or touched since. */
async function findStaleProfileIds(knex, { limit = 25 } = {}) {
  if (!(await knex.schema.hasColumn("profiles", "discover_indexed_at"))) return [];
  const rows = await knex("profiles")
    .where({ is_discoverable: true, embedding_processing_consent: true })
    .where(function stale() {
      this.whereNull("discover_indexed_at").orWhereRaw(
        "discover_indexed_at < updated_at",
      );
    })
    .orderBy("updated_at", "asc")
    .limit(limit)
    .select("id");
  return rows.map((r) => r.id);
}

module.exports = {
  buildChunks,
  splitBio,
  profileProse,
  reindexProfile,
  markProfileStale,
  purgeDiscoverChunks,
  findStaleProfileIds,
  hashText,
  BIO_CHUNK_WORDS,
};
