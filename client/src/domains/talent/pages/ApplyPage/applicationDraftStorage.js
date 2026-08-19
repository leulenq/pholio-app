import applicationDraftSchema from '../../../../../../shared/application-draft-schema.json';

const STORAGE_PREFIX = 'pholio:apply-draft:v3';
const LEGACY_STORAGE_PREFIXES = [
  'pholio:apply-draft:v2',
  'pholio:apply-draft:v1',
];
const CLIENT_ID_KEY = 'pholio:apply-draft:client-id';
const TAB_ID_KEY = 'pholio:apply-draft:tab-id';
const LOCAL_RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOMBSTONE_CLOCK_CUSHION_MS = 5 * 60 * 1000;
const MAX_LOCAL_RECORDS = 20;

export function applicationDraftQueryOptions(agencyId, loadDraft) {
  return {
    queryKey: ['application-draft', agencyId],
    queryFn: () => loadDraft(agencyId),
    enabled: !!agencyId,
    // Returning from Market must never hydrate against a cached null/old OCC
    // base while the authoritative request is still in flight.
    staleTime: 0,
    refetchOnMount: 'always',
    retry: 0,
  };
}

export function provisionalDraftState({ local, cachedServer = null, fallbackDocument }) {
  const cachedDocument = cachedServer?.document || null;
  const hasDirtyLocal = local?.kind === 'draft' && local.dirty && local.document;
  return {
    document: hasDirtyLocal ? local.document : cachedDocument || fallbackDocument,
    baseDocument: hasDirtyLocal
      ? local.baseDocument || cachedDocument || fallbackDocument
      : cachedDocument || fallbackDocument,
    version: Number(hasDirtyLocal ? local.baseVersion : cachedServer?.version) || 0,
    generation: Number(hasDirtyLocal ? local.baseGeneration : cachedServer?.generation) || 0,
    revisionToken: hasDirtyLocal
      ? local.baseRevisionToken || cachedServer?.revisionToken || null
      : cachedServer?.revisionToken || null,
    dirty: Boolean(hasDirtyLocal),
  };
}

export function draftRetryDelay(attempt) {
  const boundedAttempt = Math.max(0, Math.min(Number(attempt) || 0, 5));
  return Math.min(30_000, 1000 * (2 ** boundedAttempt));
}

function acquireLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

function acquireSessionStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage || null;
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
      LEGACY_STORAGE_PREFIXES.some((prefix) => key?.startsWith(`${prefix}:`))
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
    // An unacknowledged edit is a write journal, not a cache entry. Never
    // expire or LRU-prune it merely because the user was away for a week.
    if (!record || (record.dirty !== true && localExpiresAt && isExpired(localExpiresAt))) {
      storage.removeItem(key);
      continue;
    }
    records.push({ key, record });
  }

  records
    .filter(({ record }) => record.dirty !== true)
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

export function getDraftTabId() {
  const storage = acquireSessionStorage();
  try {
    const existing = storage?.getItem(TAB_ID_KEY);
    if (existing) return existing;
    const random =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tabId = `tab:${random}`;
    storage?.setItem(TAB_ID_KEY, tabId);
    return tabId;
  } catch {
    return `tab:ephemeral:${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function createDraftOperationId(prefix = 'submission') {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

export function draftStorageKey(profileId, agencyId, tabId = getDraftTabId()) {
  if (!profileId || !agencyId) return null;
  return `${STORAGE_PREFIX}:${profileId}:${agencyId}:${tabId}`;
}

function legacyDraftStorageKeys(profileId, agencyId) {
  if (!profileId || !agencyId) return null;
  return LEGACY_STORAGE_PREFIXES.map((prefix) => `${prefix}:${profileId}:${agencyId}`);
}

function candidateDraftKeys(storage, profileId, agencyId) {
  const ownKey = draftStorageKey(profileId, agencyId);
  const prefix = `${STORAGE_PREFIX}:${profileId}:${agencyId}:`;
  const otherKeys = draftKeys(storage).filter((key) => key.startsWith(prefix) && key !== ownKey);
  return [ownKey, ...otherKeys, ...legacyDraftStorageKeys(profileId, agencyId)];
}

export function readLocalDraft(profileId, agencyId) {
  const key = draftStorageKey(profileId, agencyId);
  if (!key) return null;
  try {
    const storage = acquireLocalStorage();
    if (!storage) return null;
    pruneLocalDrafts(storage);
    const candidates = candidateDraftKeys(storage, profileId, agencyId)
      .map((candidateKey) => ({
        key: candidateKey,
        record: normalizeRecord(safeParse(storage.getItem(candidateKey))),
      }))
      .filter(({ record }) => record && !(
        record.dirty !== true && record.localExpiresAt && isExpired(record.localExpiresAt)
      ))
      .sort((left, right) => {
        if (left.key === key) return -1;
        if (right.key === key) return 1;
        return recordTimestamp(right.record) - recordTimestamp(left.record);
      });
    const parsed = candidates[0]?.record || null;
    if (!parsed) return null;
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
    for (const legacyKey of legacyDraftStorageKeys(profileId, agencyId)) {
      storage.removeItem(legacyKey);
    }
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
    for (const legacyKey of legacyDraftStorageKeys(profileId, agencyId)) {
      storage.removeItem(legacyKey);
    }
    pruneLocalDrafts(storage);
    return true;
  } catch {
    return false;
  }
}

export function clearLocalDraft(profileId, agencyId) {
  const key = draftStorageKey(profileId, agencyId);
  if (!key) return;
  try {
    const storage = acquireLocalStorage();
    if (!storage) return;
    storage.removeItem(key);
    for (const legacyKey of legacyDraftStorageKeys(profileId, agencyId)) {
      storage.removeItem(legacyKey);
    }
  } catch {
    // A restricted storage context should not break the application flow.
  }
}

export function clearLocalDraftIfFingerprint(profileId, agencyId, fingerprint) {
  const key = draftStorageKey(profileId, agencyId);
  if (!key || !fingerprint) return false;
  try {
    const storage = acquireLocalStorage();
    if (!storage) return false;
    const current = normalizeRecord(safeParse(storage.getItem(key)));
    if (!current || current.fingerprint !== fingerprint) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
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
      boards: Array.isArray(payload.boards) ? [...new Set(payload.boards)].sort() : [],
      mediaSetId: payload.mediaSetId || 'current',
      excludedImageIds: Array.isArray(payload.excludedImageIds)
        ? [...new Set(payload.excludedImageIds)].sort()
        : [],
      digitalSlotPicks: sortedObject(payload.digitalSlotPicks),
      compCardPresetId: payload.compCardPreset?.id || payload.compCardPresetId || null,
      externalCompCardId: payload.externalCompCard?.id || payload.externalCompCardId || null,
      specRegistryRevisionId: payload.specRegistryRevisionId || null,
      note: typeof payload.note === 'string' ? payload.note : '',
      // Event intake. Without these, changing the availability range or the
      // walk video link would not read as a change and autosave would never
      // fire for the one scene an event application exists to collect.
      openCallLinkId: payload.openCallLinkId || null,
      availability: payload.availability ? sortedObject(payload.availability) : null,
      walkVideoUrl: payload.walkVideoUrl || null,
      measurementsConfirmed: payload.measurementsConfirmed === true,
      consent: payload.consent === true,
      accuracyConfirmed: payload.accuracyConfirmed === true,
      adultAuthorityConfirmed: payload.adultAuthorityConfirmed === true,
    },
  });
}

export function draftMaterialFingerprint(document) {
  const snapshot = draftMaterialSnapshot(document);
  return snapshot ? JSON.stringify(snapshot) : '';
}

function sortedObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function draftMaterialSnapshot(document) {
  if (!document || typeof document !== 'object') return null;
  const payload = document.payload || {};
  return {
    boards: Array.isArray(payload.boards) ? [...new Set(payload.boards)].sort() : [],
    mediaSetId: payload.mediaSetId || 'current',
    excludedImageIds: Array.isArray(payload.excludedImageIds)
      ? [...new Set(payload.excludedImageIds)].sort()
      : [],
    digitalSlotPicks: sortedObject(payload.digitalSlotPicks),
    compCardPresetId: payload.compCardPreset?.id || payload.compCardPresetId || null,
    externalCompCardId: payload.externalCompCard?.id || payload.externalCompCardId || null,
    specRegistryRevisionId: payload.specRegistryRevisionId || null,
    note: typeof payload.note === 'string' ? payload.note : '',
    openCallLinkId: payload.openCallLinkId || null,
    availability: payload.availability ? sortedObject(payload.availability) : null,
    walkVideoUrl: payload.walkVideoUrl || null,
  };
}

const MATERIAL_FIELDS = Object.freeze([
  'boards',
  'mediaSetId',
  'excludedImageIds',
  'digitalSlotPicks',
  'compCardSelection',
  'specRegistryRevisionId',
  'note',
  'openCallLinkId',
  'availability',
  'walkVideoUrl',
]);

function materialField(snapshot, field) {
  if (field === 'compCardSelection') {
    return {
      presetId: snapshot?.compCardPresetId || null,
      externalId: snapshot?.externalCompCardId || null,
    };
  }
  return snapshot?.[field];
}

function fieldEquals(left, right, field) {
  return JSON.stringify(materialField(left, field)) === JSON.stringify(materialField(right, field));
}

function copyMaterialField(targetPayload, sourcePayload, field) {
  if (field === 'compCardSelection') {
    for (const key of [
      'compCardPreset',
      'compCardPresetId',
      'externalCompCard',
      'externalCompCardId',
    ]) {
      if (Object.prototype.hasOwnProperty.call(sourcePayload, key)) targetPayload[key] = sourcePayload[key];
      else delete targetPayload[key];
    }
    return;
  }
  if (Object.prototype.hasOwnProperty.call(sourcePayload, field)) {
    targetPayload[field] = sourcePayload[field];
  } else {
    delete targetPayload[field];
  }
}

function mergeSetField(baseValue, localValue, remoteValue) {
  const base = new Set(Array.isArray(baseValue) ? baseValue : []);
  const local = new Set(Array.isArray(localValue) ? localValue : []);
  const remote = new Set(Array.isArray(remoteValue) ? remoteValue : []);
  const merged = new Set();
  const items = new Set([...base, ...local, ...remote]);
  for (const item of items) {
    const baseHas = base.has(item);
    const localHas = local.has(item);
    const remoteHas = remote.has(item);
    const resolved = localHas !== baseHas ? localHas : remoteHas;
    if (resolved) merged.add(item);
  }
  return [...merged].sort();
}

function mergeMapField(baseValue, localValue, remoteValue) {
  const base = sortedObject(baseValue);
  const local = sortedObject(localValue);
  const remote = sortedObject(remoteValue);
  const merged = { ...remote };
  const conflicts = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    const baseEntry = base[key];
    const localEntry = local[key];
    const remoteEntry = remote[key];
    const localChanged = localEntry !== baseEntry;
    const remoteChanged = remoteEntry !== baseEntry;
    if (localChanged && remoteChanged && localEntry !== remoteEntry) {
      conflicts.push(key);
    } else if (localChanged) {
      if (localEntry === undefined) delete merged[key];
      else merged[key] = localEntry;
    }
  }
  return { value: sortedObject(merged), conflicts };
}

function mergeAvailability(baseValue, localValue, remoteValue) {
  const result = mergeMapField(baseValue, localValue, remoteValue);
  return {
    value: Object.keys(result.value).length > 0 ? result.value : null,
    conflicts: result.conflicts,
  };
}

/**
 * Three-way reconciliation for one application dossier. Cursor position and
 * confirmation checkboxes never make a second business draft. A conflict is
 * returned only when both descendants changed the same material field to
 * different values.
 */
export function reconcileDraftDocuments({ base, local, remote }) {
  if (!local || !remote) {
    return { status: 'conflict', document: null, conflictFields: ['document'] };
  }
  const localSnapshot = draftMaterialSnapshot(local);
  const remoteSnapshot = draftMaterialSnapshot(remote);
  if (JSON.stringify(localSnapshot) === JSON.stringify(remoteSnapshot)) {
    if (draftFingerprint(local) === draftFingerprint(remote)) {
      return { status: 'converged', document: remote, conflictFields: [] };
    }
    return {
      status: 'merged',
      document: {
        ...remote,
        currentStepId: local.currentStepId || remote.currentStepId,
        payload: {
          ...(remote.payload || {}),
          measurementsConfirmed: local.payload?.measurementsConfirmed === true,
          consent: local.payload?.consent === true,
          accuracyConfirmed: local.payload?.accuracyConfirmed === true,
          adultAuthorityConfirmed: local.payload?.adultAuthorityConfirmed === true,
        },
      },
      conflictFields: [],
    };
  }
  if (!base) {
    return { status: 'conflict', document: null, conflictFields: ['unknown-base'] };
  }

  const baseSnapshot = draftMaterialSnapshot(base);
  const merged = {
    ...remote,
    currentStepId: local.currentStepId || remote.currentStepId,
    payload: { ...(remote.payload || {}) },
  };
  const conflicts = [];
  for (const field of MATERIAL_FIELDS) {
    if (field === 'boards' || field === 'excludedImageIds') {
      merged.payload[field] = mergeSetField(
        baseSnapshot?.[field],
        localSnapshot?.[field],
        remoteSnapshot?.[field],
      );
      continue;
    }
    if (field === 'digitalSlotPicks') {
      const mapMerge = mergeMapField(
        baseSnapshot?.digitalSlotPicks,
        localSnapshot?.digitalSlotPicks,
        remoteSnapshot?.digitalSlotPicks,
      );
      merged.payload.digitalSlotPicks = mapMerge.value;
      conflicts.push(...mapMerge.conflicts.map((key) => `digitalSlotPicks.${key}`));
      continue;
    }
    if (field === 'availability') {
      const availabilityMerge = mergeAvailability(
        baseSnapshot?.availability,
        localSnapshot?.availability,
        remoteSnapshot?.availability,
      );
      merged.payload.availability = availabilityMerge.value;
      conflicts.push(...availabilityMerge.conflicts.map((key) => `availability.${key}`));
      continue;
    }
    const localChanged = !fieldEquals(localSnapshot, baseSnapshot, field);
    const remoteChanged = !fieldEquals(remoteSnapshot, baseSnapshot, field);
    if (localChanged && remoteChanged && !fieldEquals(localSnapshot, remoteSnapshot, field)) {
      conflicts.push(field);
      continue;
    }
    if (localChanged) copyMaterialField(merged.payload, local.payload || {}, field);
  }

  return conflicts.length > 0
    ? { status: 'conflict', document: null, conflictFields: conflicts }
    : { status: 'merged', document: merged, conflictFields: [] };
}

export function createLatestDraftSaveQueue(saveDocument) {
  let pending = null;
  let running = null;
  let disposed = false;

  const drain = async () => {
    let succeeded = true;
    while (!disposed && pending && succeeded) {
      const next = pending;
      pending = null;
      succeeded = await saveDocument(next);
      if (!succeeded && !pending) pending = next;
    }
    return succeeded;
  };

  return {
    enqueue(document) {
      if (disposed) return Promise.resolve(false);
      pending = document;
      if (!running) {
        running = drain().finally(() => {
          running = null;
        });
      }
      return running;
    },
    pendingDocument() {
      return pending;
    },
    replacePending(document) {
      pending = document;
    },
    clearPending() {
      pending = null;
    },
    retry() {
      if (disposed || !pending) return Promise.resolve(!disposed);
      if (!running) {
        running = drain().finally(() => {
          running = null;
        });
      }
      return running;
    },
    dispose() {
      disposed = true;
      pending = null;
    },
  };
}
