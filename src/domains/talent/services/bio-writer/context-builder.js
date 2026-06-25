"use strict";

/**
 * Relevance selector: curates profile rows into a compact agency brief.
 * Aggressive exclusion of admin/noise; max ~6 high-signal lines for token efficiency.
 */

const MAX_SIGNALS = 6;
const MAX_CREDIT_LINES = 2;
const MAX_LANES = 3;

const PROFESSIONAL_SIGNAL_KEYS = new Set([
  "lanes",
  "experience",
  "training",
  "credits",
]);

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function truncate(text, maxLen) {
  if (!text || typeof text !== "string") return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trim()}…`;
}

function summarizeCredits(experienceDetails) {
  const parsed = parseJsonArray(experienceDetails);
  if (
    !parsed.length &&
    typeof experienceDetails === "string" &&
    experienceDetails.trim()
  ) {
    return [truncate(experienceDetails, 72)];
  }

  const lines = [];
  for (const entry of parsed) {
    if (lines.length >= MAX_CREDIT_LINES) break;
    if (typeof entry === "string" && entry.trim()) {
      lines.push(truncate(entry, 72));
      continue;
    }
    if (entry && typeof entry === "object") {
      const title =
        entry.title || entry.project || entry.brand || entry.client || "";
      const role = entry.role || entry.type || "";
      const year = entry.year || entry.date || "";
      const bits = [title, role, year].filter(Boolean);
      if (bits.length) lines.push(truncate(bits.join(" · "), 72));
    }
  }
  return lines;
}

function lanesFromProfile(profile) {
  const categories = parseJsonArray(profile.modeling_categories);
  if (categories.length) return categories.slice(0, MAX_LANES);

  if (profile.archetype) {
    return [String(profile.archetype).replace(/ Icon$/, "")];
  }

  return [];
}

function representationFact(profile) {
  if (profile.seeking_representation) {
    return "Open to agency representation";
  }
  if (profile.current_agency) {
    const agency = String(profile.current_agency).trim();
    if (agency.length > 2) return `Represented by ${agency}`;
  }
  return null;
}

function shouldIncludeLanguages(languages) {
  return (
    languages.length >= 2 ||
    languages.some((l) => /mandarin|arabic|japanese|korean|bilingual/i.test(l))
  );
}

/**
 * @param {Object} profile
 * @param {{ existingBio?: string }} [options]
 */
function buildBioContext(profile = {}, options = {}) {
  const signals = [];
  const name = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();

  const market = profile.city ? String(profile.city).trim() : null;
  if (market) {
    signals.push({ key: "market", label: "Market", fact: market, weight: 10 });
  }

  const lanes = lanesFromProfile(profile);
  if (lanes.length) {
    signals.push({
      key: "lanes",
      label: "Booking lanes",
      fact: lanes.join(", "),
      weight: 10,
    });
  }

  const credits = summarizeCredits(profile.experience_details);
  if (credits.length) {
    signals.push({
      key: "credits",
      label: "Credits",
      fact: credits.join(" | "),
      weight: 9,
    });
  } else if (profile.experience_level) {
    const level = String(profile.experience_level).trim();
    const weakOnly = /^(beginner|student)$/i.test(level);
    if (level && (lanes.length || !weakOnly)) {
      signals.push({
        key: "experience",
        label: "Experience",
        fact: level,
        weight: 7,
      });
    }
  }

  if (profile.training) {
    const training = truncate(String(profile.training), 100);
    if (training.length > 8) {
      signals.push({
        key: "training",
        label: "Training",
        fact: training,
        weight: 8,
      });
    }
  }

  const languages = parseJsonArray(profile.languages);
  if (shouldIncludeLanguages(languages)) {
    signals.push({
      key: "languages",
      label: "Languages",
      fact: languages.slice(0, 3).join(", "),
      weight: 6,
    });
  }

  const rep = representationFact(profile);
  if (rep) {
    signals.push({
      key: "representation",
      label: "Representation",
      fact: rep,
      weight: 5,
    });
  }

  const prioritized = signals
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_SIGNALS)
    .map(({ key, label, fact }) => ({ key, label, fact }));

  const hasProfessionalSignal = prioritized.some((s) =>
    PROFESSIONAL_SIGNAL_KEYS.has(s.key),
  );

  const hasMinimumForGenerate =
    !!name && (!!market || lanes.length > 0) && hasProfessionalSignal;

  return {
    name: name || "Talent",
    signals: prioritized,
    signalCount: prioritized.length,
    hasMinimumForGenerate,
    existingBio: options.existingBio
      ? String(options.existingBio).trim()
      : null,
  };
}

/**
 * Compact brief format — no JSON, minimal tokens.
 * @param {{ signals: Array<{label: string, fact: string}> }} context
 */
function formatContextForPrompt(context) {
  if (!context.signals?.length) {
    return "(Limited verified context — write a very short third-person bio using only the talent name if needed.)";
  }
  return context.signals.map((s) => `${s.label}: ${s.fact}`).join("\n");
}

module.exports = {
  buildBioContext,
  formatContextForPrompt,
  parseJsonArray,
  lanesFromProfile,
  summarizeCredits,
};
