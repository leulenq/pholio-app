import applicationDraftSchema from '../../../../../../shared/application-draft-schema.json';

const STORAGE_PREFIX = 'pholio:apply-draft:v2';
const LEGACY_STORAGE_PREFIX = 'pholio:apply-draft:v1';
const CLIENT_ID_KEY = 'pholio:apply-draft:client-id';
const LOCAL_RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOMBSTONE_CLOCK_CUSHION_MS = 5 * 60 * 1000;
const MAX_LOCAL_RECORDS = 20;

function acquireLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

function safeParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function expiresAtFrom(value, fallbackMs) {
  const parsed = value ? new Date(value) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date(Date.now() + fallbackMs).toISOString();
}

function isExpired(value) {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now();
}

function tombstoneLocalExpiresAt(value) {
  const recoverableUntil = value?.recoverableUntil
    ? new Date(value.recoverableUntil)
    : null;
  if (recoverableUntil && !Number.isNaN(recoverableUntil.getTime())) {
    return new Date(
      recoverableUntil.getTime() + TOMBSTONE_CLOCK_CUSHION_MS,
    ).toISOString();
  }
  return expiresAtFrom(value?.localExpiresAt, TOMBSTONE_TTL_MS);
}

function recordTimestamp(record) {
  const value = record?.storedAt || record?.modifiedAt || record?.serverUpdatedAt;
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : 0;
}

function draftKeys(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (
      key?.startsWith(`${STORAGE_PREFIX}:`) ||
      key?.startsWith(`${LEGACY_STORAGE_PREFIX}:`)
    ) {
      keys.push(key);
    }
  }
  return keys;
}

function pruneLocalDrafts(storage) {
  const records = [];
  for (const key of draftKeys(storage)) {
    const record = safeParse(storage.getItem(key));
    const localExpiresAt = record?.localExpiresAt || (
      record?.modifiedAt
        ? expiresAtFrom(
            new Date(new Date(record.modifiedAt).getTime() + LOCAL_RECORD_TTL_MS),
            LOCAL_RECORD_TTL_MS,
          )
        : null
    );
    if (!record || (localExpiresAt && isExpired(localExpiresAt))) {
      storage.removeItem(key);
      continue;
    }
    records.push({ key, record });
  }

  records
    .sort((a, b) => recordTimestamp(b.record) - recordTimestamp(a.record))
    .slice(MAX_LOCAL_RECORDS)
    .forEach(({ key }) => storage.removeItem(key));
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return null;

  if (record.kind === 'tombstone') {
    return {
      ...record,
      kind: 'tombstone',
      generation: Number(record.generation) || 0,
    };
  }

  if (!record.document || typeof record.document !== 'object') return null;
  return {
    ...record,
    kind: 'draft',
    baseVersion: Number(record.baseVersion) || 0,
    baseGeneration: Number(record.baseGeneration) || 0,
  };
}

export function getDraftClientId() {
  try {
    const storage = acquireLocalStorage();
    if (!storage) return 'browser:unavailable';
    const existing = storage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const random =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const clientId = `browser:${random}`;
    storage.setItem(CLIENT_ID_KEY, clientId);
    return clientId;
  } catch {
    return 'browser:restricted';
  }
}

export function createDraftOperationId(prefix = 'submission') {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

export function draftStorageKey(profileId, agencyId) {
  if (!profileId || !agencyId) return null;
  return `${STORAGE_PREFIX}:${profileId}:${agencyId}`;
}

function legacyDraftStorageKey(profileId, agencyId) {
  if (!profileId || !agencyId) return null;
  return `${LEGACY_STORAGE_PREFIX}:${profileId}:${agencyId}`;
}

export function readLocalDraft(profileId, agencyId) {
  const key = draftStorageKey(profileId, agencyId);
  const legacyKey = legacyDraftStorageKey(profileId, agencyId);
  if (!key) return null;
  try {
    const storage = acquireLocalStorage();
    if (!storage) return null;
    pruneLocalDrafts(storage);
    const parsed = normalizeRecord(
      safeParse(storage.getItem(key)) ||
      safeParse(storage.getItem(legacyKey)),
    );
    if (!parsed) return null;

    if (parsed.localExpiresAt && isExpired(parsed.localExpiresAt)) {
      storage.removeItem(key);
      storage.removeItem(legacyKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isLocalDraftTombstoneRecoverable(record, now = Date.now()) {
  if (record?.kind !== 'tombstone') return false;
  if (!record.recoverableUntil) return true;
  const deadline = new Date(record.recoverableUntil);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() > now;
}

export function buildLocalDraftRecoveryRecord({
  currentDocument,
  requestDocument,
  baseVersion = 0,
  baseGeneration = 0,
  submissionIdempotencyKey = null,
  modifiedAt = nowIso(),
}) {
  const document = currentDocument || requestDocument || null;
  return {
    baseVersion: Number(baseVersion) || 0,
    baseGeneration: Number(baseGeneration) || 0,
    dirty: true,
    modifiedAt,
    document,
    fingerprint: draftFingerprint(document),
    submissionIdempotencyKey,
  };
}

export function writeLocalDraft(profileId, agencyId, value) {
  const key = draftStorageKey(profileId, agencyId);
  if (!key) return false;
  try {
    const storage = acquireLocalStorage();
    if (!storage) return false;
    const storedAt = nowIso();
    storage.setItem(key, JSON.stringify({
      ...value,
      kind: 'draft',
      storedAt,
      localExpiresAt: expiresAtFrom(value?.localExpiresAt, LOCAL_RECORD_TTL_MS),
      baseVersion: Number(value?.baseVersion) || 0,
      baseGeneration: Number(value?.baseGeneration) || 0,
    }));
    const legacyKey = legacyDraftStorageKey(profileId, agencyId);
    if (legacyKey) storage.removeItem(legacyKey);
    pruneLocalDrafts(storage);
    return true;
  } catch {
    return false;
  }
}

export function writeLocalDraftTombstone(profileId, agencyId, value = {}) {
  const key = draftStorageKey(profileId, agencyId);
  if (!key) return false;
  try {
    const storage = acquireLocalStorage();
    if (!storage) return false;
    const storedAt = nowIso();
    storage.setItem(key, JSON.stringify({
      kind: 'tombstone',
      lifecycleState: value.lifecycleState || 'deleted',
      generation: Number(value.generation) || 0,
      serverUpdatedAt: value.serverUpdatedAt || storedAt,
      recoverableUntil: value.recoverableUntil || null,
      storedAt,
      localExpiresAt: tombstoneLocalExpiresAt(value),
    }));
    const legacyKey = legacyDraftStorageKey(profileId, agencyId);
    if (legacyKey) storage.removeItem(legacyKey);
    pruneLocalDrafts(storage);
    return true;
  } catch {
    return false;
  }
}

export function clearLocalDraft(profileId, agencyId) {
  const key = draftStorageKey(profileId, agencyId);
  const legacyKey = legacyDraftStorageKey(profileId, agencyId);
  if (!key) return;
  try {
    const storage = acquireLocalStorage();
    if (!storage) return;
    storage.removeItem(key);
    if (legacyKey) storage.removeItem(legacyKey);
  } catch {
    // A restricted storage context should not break the application flow.
  }
}

export function purgeApplyDraftStorage(profileId = null) {
  try {
    const storage = acquireLocalStorage();
    if (!storage) return false;
    const profileMarker = profileId ? `:${profileId}:` : null;
    for (const key of draftKeys(storage)) {
      if (!profileMarker || key.includes(profileMarker)) {
        storage.removeItem(key);
      }
    }
    // Client identity is account/session-adjacent and must not survive logout.
    storage.removeItem(CLIENT_ID_KEY);
    return true;
  } catch {
    return false;
  }
}

export function draftFingerprint(document) {
  if (!document || typeof document !== 'object') return '';
  const payload = document.payload || {};
  return JSON.stringify({
    currentStepId: document.currentStepId || 'board',
    payload: {
      schemaVersion: payload.schemaVersion || applicationDraftSchema.currentVersion,
      boards: Array.isArray(payload.boards) ? [...payload.boards].sort() : [],
      mediaSetId: payload.mediaSetId || 'current',
      excludedImageIds: Array.isArray(payload.excludedImageIds)
        ? [...payload.excludedImageIds].sort()
        : [],
      digitalSlotPicks: payload.digitalSlotPicks || {},
      compCardPresetId: payload.compCardPreset?.id || payload.compCardPresetId || null,
      specRegistryRevisionId: payload.specRegistryRevisionId || null,
      note: typeof payload.note === 'string' ? payload.note : '',
      // Event intake. Without these, changing the availability range or the
      // walk video link would not read as a change and autosave would never
      // fire for the one scene an event application exists to collect.
      openCallLinkId: payload.openCallLinkId || null,
      availability: payload.availability || null,
      walkVideoUrl: payload.walkVideoUrl || null,
      measurementsConfirmed: payload.measurementsConfirmed === true,
      consent: payload.consent === true,
    },
  });
}

export function draftMaterialFingerprint(document) {
  if (!document || typeof document !== 'object') return '';
  const payload = document.payload || {};
  return JSON.stringify({
    boards: Array.isArray(payload.boards) ? [...payload.boards].sort() : [],
    mediaSetId: payload.mediaSetId || 'current',
    excludedImageIds: Array.isArray(payload.excludedImageIds)
      ? [...payload.excludedImageIds].sort()
      : [],
    digitalSlotPicks: payload.digitalSlotPicks || {},
    compCardPresetId: payload.compCardPreset?.id || payload.compCardPresetId || null,
    specRegistryRevisionId: payload.specRegistryRevisionId || null,
    note: typeof payload.note === 'string' ? payload.note : '',
    openCallLinkId: payload.openCallLinkId || null,
    availability: payload.availability || null,
    walkVideoUrl: payload.walkVideoUrl || null,
  });
}
