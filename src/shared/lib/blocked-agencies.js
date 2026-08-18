function parsePrivacyPreferences(raw) {
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizeBlockedTerms(blockedAgencies) {
  if (!Array.isArray(blockedAgencies)) return [];
  const seen = new Set();
  return blockedAgencies
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean)
    .filter((term) => {
      if (seen.has(term)) return false;
      seen.add(term);
      return true;
    });
}

/**
 * Read talent_user_settings.privacy_preferences.blockedAgencies and resolve
 * each entry to agency IDs via the agencies table. Current settings should store
 * the stable agency ID; name/slug matching remains for legacy preferences.
 */
async function getBlockedAgencyIds(knex, talentUserId) {
  if (!talentUserId) return new Set();

  const settings = await knex("talent_user_settings")
    .where({ user_id: talentUserId })
    .select("privacy_preferences")
    .first();

  if (!settings) return new Set();

  const privacy = parsePrivacyPreferences(settings.privacy_preferences);
  const terms = normalizeBlockedTerms(privacy.blockedAgencies);
  if (!terms.length) return new Set();

  const agencies = await knex("agencies")
    .where(function () {
      for (const term of terms) {
        this.orWhereRaw("LOWER(id) = ?", [term]);
        this.orWhereRaw("LOWER(name) = ?", [term]);
        this.orWhereRaw("LOWER(slug) = ?", [term]);
      }
    })
    .select("id");

  return new Set(agencies.map((a) => a.id));
}

/**
 * Resolve every talent user who has blocked this agency. Discover uses this as
 * an exclusion set before pagination so blocked profiles never affect totals or
 * appear briefly before a later contact check.
 */
async function getTalentUserIdsBlockingAgency(knex, agencyId) {
  if (!agencyId) return new Set();

  const agency = await knex("agencies")
    .where({ id: agencyId })
    .select("id", "name", "slug")
    .first();
  if (!agency) return new Set();

  const identities = new Set(
    [agency.id, agency.name, agency.slug]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const rows = await knex("talent_user_settings")
    .select("user_id", "privacy_preferences");

  return new Set(
    rows
      .filter((row) => {
        const privacy = parsePrivacyPreferences(row.privacy_preferences);
        return normalizeBlockedTerms(privacy.blockedAgencies).some((term) =>
          identities.has(term),
        );
      })
      .map((row) => row.user_id)
      .filter(Boolean),
  );
}

async function isAgencyBlockedForTalent(knex, talentUserId, agencyId) {
  if (!talentUserId || !agencyId) return false;
  const blockedIds = await getBlockedAgencyIds(knex, talentUserId);
  return blockedIds.has(agencyId);
}

function validateHttpsAttachmentUrl(attachmentUrl) {
  if (attachmentUrl == null || attachmentUrl === "") return { ok: true, value: null };
  if (typeof attachmentUrl !== "string") {
    return { ok: false, error: "attachment_url must be a string or null" };
  }
  try {
    const parsed = new URL(attachmentUrl.trim());
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "attachment_url must use https" };
    }
    return { ok: true, value: attachmentUrl.trim() };
  } catch {
    return { ok: false, error: "attachment_url must be a valid https URL" };
  }
}

module.exports = {
  parsePrivacyPreferences,
  normalizeBlockedTerms,
  getBlockedAgencyIds,
  getTalentUserIdsBlockingAgency,
  isAgencyBlockedForTalent,
  validateHttpsAttachmentUrl,
};
