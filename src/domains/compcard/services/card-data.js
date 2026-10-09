"use strict";

/**
 * Everything the comp card studio needs about one talent, assembled from
 * the outward-facing view of their profile: only images that may appear on
 * a public document (moderation + visibility) and whose rights are not
 * denied, the representing agency, and the booking contact.
 */

const knex = require("../../../shared/db/knex");
const config = require("../../../config");
const { loadProfile } = require("../../pdf/generator");
const { imageHasDistributionRights } = require("../../../shared/lib/image-rights");

const PROFILE_FIELDS = [
  "slug", "first_name", "last_name", "city", "market", "height_cm", "bust_cm", "chest_cm",
  "waist_cm", "hips_cm", "inseam_cm", "shoe_size", "shoe_region", "dress_size", "suit_size",
  "eye_color", "hair_color", "gender", "stats_track", "date_of_birth", "phone", "current_agency",
];

// Whether the studio's tables exist (cached). Lets the studio run read-only
// on a database that hasn't had the comp card migration yet.
let tablesPromise = null;
function studioTables() {
  if (!tablesPromise) {
    tablesPromise = Promise.all([knex.schema.hasTable("comp_cards"), knex.schema.hasTable("image_perceptions"), knex.schema.hasTable("image_cutouts")])
      .then(([cards, perceptions, cutouts]) => {
        const ready = cards && perceptions && cutouts;
        // Re-check later if missing, so running the migration needs no restart.
        if (!ready) setTimeout(() => { tablesPromise = null; }, 30000);
        return ready;
      })
      .catch(() => {
        tablesPromise = null;
        return false;
      });
  }
  return tablesPromise;
}

function parseJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function absoluteUrl(src) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  const base = String(config.appUrl || "").replace(/\/$/, "");
  return `${base}${src.startsWith("/") ? "" : "/"}${src}`;
}

/** Same-origin path for the browser; absolute for the print renderer. */
function imageSrc(img) {
  const src = img.public_url || img.path || "";
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  return src.startsWith("/") ? src : `/${src}`;
}

function shortPortfolioUrl(slug) {
  const host = String(config.appUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `${host}/p/${slug}`;
}

async function loadCardData(slug) {
  const loaded = await loadProfile(slug);
  if (!loaded) return null;
  const { profile } = loaded;
  const images = loaded.images.filter((img) => {
    if (img.asset_kind && img.asset_kind !== "image") return false;
    if (img.video_url) return false;
    return imageHasDistributionRights(img, img);
  });

  let agency = null;
  if (profile.partner_agency_id) {
    agency = await knex("agencies")
      .where({ id: profile.partner_agency_id })
      .first("name", "location", "website", "support_email", "logo_path");
  }
  const user = profile.user_id ? await knex("users").where({ id: profile.user_id }).first("email") : null;

  const storage = await studioTables();
  const ids = images.map((i) => i.id);
  const perceptionRows = storage && ids.length ? await knex("image_perceptions").whereIn("image_id", ids) : [];
  const perceptions = {};
  for (const row of perceptionRows) {
    const data = parseJson(row.data);
    if (data) perceptions[row.image_id] = { ...data, version: row.version, sourceUrl: row.source_url };
  }

  const picked = {};
  for (const f of PROFILE_FIELDS) picked[f] = profile[f] ?? null;
  if (picked.date_of_birth instanceof Date) picked.date_of_birth = picked.date_of_birth.toISOString().slice(0, 10);

  const card = storage ? await knex("comp_cards").where({ profile_id: profile.id }).first() : null;
  const cutoutRows = storage && ids.length ? await knex("image_cutouts").whereIn("image_id", ids).select("image_id", "version", "width", "height") : [];
  const cutouts = {};
  for (const row of cutoutRows) cutouts[row.image_id] = { version: row.version, width: row.width, height: row.height, url: `/api/talent/compcard/cutouts/${row.image_id}?v=${row.version}` };

  return {
    profileId: profile.id,
    profileRow: profile,
    data: {
      profile: picked,
      email: user?.email || null,
      agency: agency
        ? { name: agency.name, location: agency.location, website: agency.website, support_email: agency.support_email }
        : null,
      portfolioUrl: shortPortfolioUrl(profile.slug),
      images: images.map((img) => {
        const meta = parseJson(img.metadata) || {};
        return {
          id: img.id,
          src: imageSrc(img),
          width: img.delivery_width_px || meta.width || null,
          height: img.delivery_height_px || meta.height || null,
          shot_type: img.shot_type || null,
          image_type: img.image_type || null,
          is_primary: Boolean(img.is_primary),
          created_at: img.created_at,
        };
      }),
    },
    perceptions,
    cutouts,
    storage,
    card: card
      ? {
          id: card.id,
          settings: parseJson(card.settings),
          scene: parseJson(card.scene),
          notes: parseJson(card.notes),
          updatedAt: card.updated_at,
        }
      : null,
    absoluteUrl,
  };
}

/** Cutout PNGs as data URLs, for printing (the print browser has no session). */
async function cutoutDataUrls(imageIds) {
  if (!imageIds.length || !(await studioTables())) return {};
  const rows = await knex("image_cutouts").whereIn("image_id", imageIds).select("image_id", "png");
  const out = {};
  for (const r of rows) out[r.image_id] = `data:image/png;base64,${Buffer.from(r.png).toString("base64")}`;
  return out;
}

module.exports = { loadCardData, absoluteUrl, studioTables, cutoutDataUrls };
