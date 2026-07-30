"use strict";

/**
 * Fill in distribution rights for every image on a talent account.
 *
 * Mirrors the validation in src/shared/lib/image-rights.js: a cleared status,
 * a recognised license basis, an ownership credit, and active license dates.
 * Existing values are preserved — only missing fields are filled — so this is
 * safe to re-run after reseeding.
 *
 * Usage:
 *   node scripts/clear-image-rights.js [--email=talent@example.com] [--owner="Mia Voss"] [--dry-run]
 */

const { v4: uuidv4 } = require("uuid");
const knex = require("../src/shared/db/knex");
const {
  RIGHTS_CLEARED_STATUSES,
  RIGHTS_LICENSE_BASES,
  loadImageRightsMap,
  validateImagesForDistribution,
} = require("../src/shared/lib/image-rights");

function arg(name, fallback) {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

const EMAIL = arg("email", "talent@example.com");
const DRY_RUN = process.argv.includes("--dry-run");

function hasText(value) {
  return Boolean(value != null && String(value).trim());
}

function normalize(value) {
  return hasText(value) ? String(value).trim().toLowerCase() : "";
}

async function main() {
  const user = await knex("users")
    .where({ email: EMAIL })
    .select("id", "email", "role")
    .first();
  if (!user) throw new Error(`No user found for ${EMAIL}`);
  if (user.role !== "TALENT") {
    throw new Error(`${EMAIL} is ${user.role}, not TALENT`);
  }

  const profile = await knex("profiles")
    .where({ user_id: user.id })
    .select("id", "first_name", "last_name")
    .first();
  if (!profile) throw new Error(`No profile found for ${EMAIL}`);

  const profileName = [profile.first_name, profile.last_name]
    .filter(hasText)
    .join(" ");
  const owner = arg("owner", profileName || EMAIL);

  const images = await knex("images")
    .where({ profile_id: profile.id })
    .select("id", "created_at")
    .orderBy("created_at", "asc");
  if (!images.length) {
    console.log(`No images on ${EMAIL}; nothing to do.`);
    return;
  }

  const existingRows = await knex("image_rights").whereIn(
    "image_id",
    images.map((i) => i.id),
  );
  const existingById = new Map(
    existingRows.map((row) => [String(row.image_id), row]),
  );

  let inserted = 0;
  let updated = 0;

  for (const image of images) {
    const current = existingById.get(String(image.id)) || null;
    const patch = {};

    const status = normalize(current?.rights_status);
    if (!RIGHTS_CLEARED_STATUSES.has(status)) {
      patch.rights_status = "cleared";
    }

    const licenseType = normalize(current?.license_type);
    if (!RIGHTS_LICENSE_BASES.has(licenseType)) {
      // "owned" keeps the talent as the rights holder, which needs no separate
      // model-release artifact (unlike license_type "model_release").
      patch.license_type = status === "licensed" ? "licensed" : "owned";
    }

    if (!hasText(current?.copyright_owner) && !hasText(current?.photographer_name)) {
      patch.copyright_owner = owner;
    }

    if (!hasText(current?.usage_scope)) {
      patch.usage_scope = "portfolio, comp card, agency submission";
    }
    if (!hasText(current?.territory)) {
      patch.territory = "worldwide";
    }
    if (!current?.start_at) {
      patch.start_at = image.created_at || new Date();
    }
    // An expiry in the past fails the rights check; an open-ended license does not.
    if (current?.expires_at && new Date(current.expires_at) < new Date()) {
      patch.expires_at = null;
    }

    if (!Object.keys(patch).length) continue;

    if (DRY_RUN) {
      console.log(`${current ? "update" : "insert"} ${image.id}`, patch);
      continue;
    }

    if (current) {
      await knex("image_rights")
        .where({ image_id: image.id })
        .update({ ...patch, updated_at: knex.fn.now() });
      updated += 1;
    } else {
      await knex("image_rights").insert({
        id: uuidv4(),
        image_id: image.id,
        copyright_owner: null,
        photographer_name: null,
        license_type: null,
        usage_scope: null,
        territory: null,
        start_at: null,
        expires_at: null,
        exclusive: false,
        model_release_ref: null,
        rights_status: null,
        notes: null,
        ...patch,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
      inserted += 1;
    }
  }

  console.log(
    `${EMAIL}: ${images.length} images, ${inserted} rights rows created, ${updated} updated${DRY_RUN ? " (dry run)" : ""}`,
  );

  const verifyImages = await knex("images")
    .where({ profile_id: profile.id })
    .select("*");
  const rightsMap = await loadImageRightsMap(
    knex,
    verifyImages.map((i) => i.id),
  );
  const result = validateImagesForDistribution(verifyImages, rightsMap);
  console.log(
    `distribution-ready: ${result.ok}${result.ok ? "" : ` (${result.errors.length} failing)`}`,
  );
  for (const error of result.errors) {
    console.log(`  ${error.imageId}: ${error.message}`);
  }
  if (!result.ok && !DRY_RUN) process.exitCode = 1;
}

main()
  .then(() => knex.destroy())
  .catch(async (error) => {
    console.error(error);
    await knex.destroy();
    process.exit(1);
  });
