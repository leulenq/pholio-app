/**
 * Account avatar layer — OAuth provider pictures (Google, Instagram, etc.).
 *
 * Provider avatars belong on `users.avatar_url` only. They must never be
 * ingested into the talent book / digitals / curated media (`images` table).
 */

/**
 * True when an `images` row looks like a legacy OAuth provider seed:
 * remote URL, no local file, no curated image_type.
 *
 * @param {Object|null|undefined} row
 * @returns {boolean}
 */
function isProviderAccountAvatarImage(row) {
  if (!row || typeof row !== "object") return false;
  if (row.absolute_path) return false;
  if (row.image_type) return false;
  if (row.asset_kind && row.asset_kind !== "image") return false;

  const path = typeof row.path === "string" ? row.path.trim() : "";
  const publicUrl =
    typeof row.public_url === "string" ? row.public_url.trim() : "";
  const candidate = path || publicUrl;
  if (!candidate) return false;
  return /^https?:\/\//i.test(candidate);
}

/**
 * Drop legacy OAuth seeds from any media / book image list.
 *
 * @template T
 * @param {T[]|null|undefined} rows
 * @returns {T[]}
 */
function excludeProviderAccountAvatarImages(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => !isProviderAccountAvatarImage(row));
}

/**
 * Persist a provider picture on the account avatar layer only.
 * Never writes to `images`.
 *
 * @param {import('knex').Knex} db
 * @param {string} userId
 * @param {string|null|undefined} pictureUrl
 * @returns {Promise<string|null>} The URL written (or existing), else null
 */
async function syncProviderAccountAvatar(db, userId, pictureUrl) {
  if (!userId || !pictureUrl || typeof pictureUrl !== "string") return null;
  const url = pictureUrl.trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;

  if (!(await db.schema.hasColumn("users", "avatar_url"))) {
    return null;
  }

  const user = await db("users").where({ id: userId }).first("id", "avatar_url");
  if (!user) return null;

  if (user.avatar_url === url) return url;

  await db("users").where({ id: userId }).update({ avatar_url: url });
  return url;
}

/**
 * Move legacy OAuth-seeded `images` rows onto `users.avatar_url` and delete them
 * from the book. Safe to call repeatedly.
 *
 * @param {import('knex').Knex} db
 * @param {{ userId?: string, profileId?: string }} [scope]
 * @returns {Promise<number>} Number of image rows removed
 */
async function reclaimProviderAccountAvatarSeeds(db, scope = {}) {
  if (!(await db.schema.hasTable("images"))) return 0;

  let query = db("images").select(
    "images.id",
    "images.profile_id",
    "images.path",
    "images.public_url",
    "images.absolute_path",
    "images.image_type",
    "images.asset_kind",
    "profiles.user_id",
  );

  if (await db.schema.hasTable("profiles")) {
    query = query.leftJoin("profiles", "profiles.id", "images.profile_id");
  }

  if (scope.profileId) {
    query = query.where("images.profile_id", scope.profileId);
  }
  if (scope.userId) {
    query = query.where("profiles.user_id", scope.userId);
  }

  const rows = await query;
  const seeds = rows.filter(isProviderAccountAvatarImage);
  if (seeds.length === 0) return 0;

  const hasAvatarCol = await db.schema.hasColumn("users", "avatar_url");

  await db.transaction(async (trx) => {
    for (const seed of seeds) {
      const url = (seed.path || seed.public_url || "").trim();
      if (hasAvatarCol && seed.user_id && url) {
        const user = await trx("users")
          .where({ id: seed.user_id })
          .first("id", "avatar_url");
        if (user && !user.avatar_url) {
          await trx("users")
            .where({ id: seed.user_id })
            .update({ avatar_url: url });
        }
      }
      await trx("images").where({ id: seed.id }).del();
    }
  });

  return seeds.length;
}

module.exports = {
  isProviderAccountAvatarImage,
  excludeProviderAccountAvatarImages,
  syncProviderAccountAvatar,
  reclaimProviderAccountAvatarSeeds,
};
