const { v4: uuidv4 } = require("uuid");

const MAX_PRESET_NAME_LEN = 80;

function toSafeToken(value, maxLen = 64) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const compact = normalized.replace(/\s+/g, "-");
  const safe = compact.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, maxLen);
  return safe || null;
}

function normalizeLockGridIds(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const normalized = source
    .slice(0, 4)
    .map((item) => toSafeToken(item, 64) || null);
  while (normalized.length < 4) normalized.push(null);
  return normalized;
}

function parseJsonColumn(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizePresetInput(input = {}) {
  const nameRaw = input.name == null ? "" : String(input.name).trim();
  if (!nameRaw) {
    const err = new Error("Preset name is required.");
    err.status = 400;
    throw err;
  }
  if (nameRaw.length > MAX_PRESET_NAME_LEN) {
    const err = new Error(
      `Preset name must be ${MAX_PRESET_NAME_LEN} characters or fewer.`,
    );
    err.status = 400;
    throw err;
  }

  return {
    name: nameRaw,
    seed: toSafeToken(input.seed, 128),
    layout_family: toSafeToken(input.layoutFamily, 64),
    style_variant: toSafeToken(input.styleVariant, 64),
    lock_hero_id: toSafeToken(input.lockHeroId, 64),
    lock_grid_ids: normalizeLockGridIds(input.lockGridIds),
    // Purpose: the board/division and market this card is tuned for.
    board: toSafeToken(input.board, 64),
    market: toSafeToken(input.market, 64),
    // Named creative direction (front field structure) this card was saved
    // under; validated against the directions catalog by the route.
    structure: toSafeToken(input.structure, 32),
    // Name-treatment pin (classic/statement/choreography variant).
    treatment: toSafeToken(input.treatment, 16),
  };
}

function mapPresetRow(row) {
  if (!row) return null;
  const gridIds = normalizeLockGridIds(
    parseJsonColumn(row.lock_grid_ids) || [],
  );
  return {
    id: row.id,
    name: row.name,
    seed: row.seed || null,
    layoutFamily: row.layout_family || null,
    styleVariant: row.style_variant || null,
    lockHeroId: row.lock_hero_id || null,
    lockGridIds: gridIds,
    board: row.board || null,
    market: row.market || null,
    structure: row.structure || null,
    treatment: row.treatment || null,
    // A frozen design exists when the plan was captured at save time.
    frozen: Boolean(row.plan_json),
    engineVersion: row.engine_version || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    lastUsedAt: row.last_used_at || null,
    query: toPresetQuery(row),
    payload: toPresetPayload(row),
  };
}

function snapshotFromPresetRow(row) {
  return {
    name: row?.name || null,
    seed: row?.seed || null,
    layoutFamily: row?.layout_family || null,
    styleVariant: row?.style_variant || null,
    lockHeroId: row?.lock_hero_id || null,
    lockGridIds: normalizeLockGridIds(
      parseJsonColumn(row?.lock_grid_ids) || [],
    ),
    board: row?.board || null,
    market: row?.market || null,
    structure: row?.structure || null,
    treatment: row?.treatment || null,
  };
}

function toPresetQuery(row) {
  const gridIds = normalizeLockGridIds(
    parseJsonColumn(row.lock_grid_ids) || [],
  );
  const hasAnyGridLock = gridIds.some(Boolean);
  const serializedGridIds = gridIds
    .map((id) => (id == null ? "" : id))
    .join(",");
  return {
    seed: row.seed || undefined,
    layoutFamily: row.layout_family || undefined,
    styleVariant: row.style_variant || undefined,
    lockHeroId: row.lock_hero_id || undefined,
    lockGridIds: hasAnyGridLock ? serializedGridIds : undefined,
    structure: row.structure || undefined,
    treatment: row.treatment || undefined,
    // Frozen presets render from the stored plan — the preset id is the
    // authoritative query; the parameters above remain as the fallback.
    preset: row.plan_json ? row.id : undefined,
  };
}

function toPresetPayload(row) {
  const gridIds = normalizeLockGridIds(
    parseJsonColumn(row.lock_grid_ids) || [],
  );
  return {
    name: row.name || null,
    seed: row.seed || null,
    layoutFamily: row.layout_family || null,
    styleVariant: row.style_variant || null,
    lockHeroId: row.lock_hero_id || null,
    lockGridIds: gridIds,
    board: row.board || null,
    market: row.market || null,
    structure: row.structure || null,
    treatment: row.treatment || null,
  };
}

function buildPresetInsert(profileId, normalizedInput) {
  return {
    id: uuidv4(),
    profile_id: profileId,
    name: normalizedInput.name,
    seed: normalizedInput.seed,
    layout_family: normalizedInput.layout_family,
    style_variant: normalizedInput.style_variant,
    lock_hero_id: normalizedInput.lock_hero_id,
    lock_grid_ids: JSON.stringify(normalizedInput.lock_grid_ids),
    board: normalizedInput.board,
    market: normalizedInput.market,
    structure: normalizedInput.structure,
    treatment: normalizedInput.treatment,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function mapPresetRevisionRow(row) {
  if (!row) return null;
  const snapshot = row.snapshot
    ? typeof row.snapshot === "string"
      ? parseJsonColumn(row.snapshot) || {}
      : row.snapshot
    : {};
  return {
    id: row.id,
    presetId: row.preset_id,
    revisionNumber: Number(row.revision_number) || 0,
    reason: row.reason || "update",
    snapshot: {
      name: snapshot.name || null,
      seed: snapshot.seed || null,
      layoutFamily: snapshot.layoutFamily || null,
      styleVariant: snapshot.styleVariant || null,
      lockHeroId: snapshot.lockHeroId || null,
      lockGridIds: normalizeLockGridIds(snapshot.lockGridIds || []),
    },
    createdAt: row.created_at || null,
  };
}

module.exports = {
  MAX_PRESET_NAME_LEN,
  normalizePresetInput,
  mapPresetRow,
  snapshotFromPresetRow,
  mapPresetRevisionRow,
  toPresetQuery,
  toPresetPayload,
  buildPresetInsert,
};
