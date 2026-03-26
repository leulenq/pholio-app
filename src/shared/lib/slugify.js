const validator = require('validator');

function slugify(str) {
  if (!str) return '';
  const normalized = validator.trim(str.toString()).toLowerCase();
  return normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .substring(0, 60);
}

async function ensureUniqueSlug(knex, table, base, column = 'slug') {
  const baseSlug = slugify(base) || 'profile';
  let candidate = baseSlug;
  let increment = 1;
  while (true) {
    const existing = await knex(table).where({ [column]: candidate }).first();
    if (!existing) {
      return candidate;
    }
    increment += 1;
    candidate = `${baseSlug}-${increment}`.substring(0, 60);
  }
}

module.exports = {
  slugify,
  ensureUniqueSlug
};
