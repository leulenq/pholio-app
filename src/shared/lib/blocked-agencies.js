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
 * each entry to agency IDs via the agencies table (name or slug, case-insensitive).
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
        this.orWhereRaw("LOWER(name) = ?", [term]);
        this.orWhereRaw("LOWER(slug) = ?", [term]);
      }
    })
    .select("id");

  return new Set(agencies.map((a) => a.id));
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
  isAgencyBlockedForTalent,
  validateHttpsAttachmentUrl,
};
