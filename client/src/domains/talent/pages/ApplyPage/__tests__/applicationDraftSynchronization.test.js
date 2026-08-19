import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  applicationDraftQueryOptions,
  clearLocalDraft,
  clearLocalDraftIfFingerprint,
  createLatestDraftSaveQueue,
  draftFingerprint,
  draftMaterialFingerprint,
  draftRetryDelay,
  draftStorageKey,
  readLocalDraft,
  provisionalDraftState,
  reconcileDraftDocuments,
  writeLocalDraft,
} from '../applicationDraftStorage';

function document(overrides = {}) {
  return {
    currentStepId: overrides.currentStepId || 'board',
    payload: {
      schemaVersion: 2,
      boards: [],
      mediaSetId: 'current',
      excludedImageIds: [],
      digitalSlotPicks: {},
      compCardPreset: null,
      externalCompCard: null,
      specRegistryRevisionId: null,
      note: '',
      openCallLinkId: null,
      availability: null,
      walkVideoUrl: null,
      measurementsConfirmed: false,
      consent: false,
      accuracyConfirmed: false,
      adultAuthorityConfirmed: false,
      ...overrides.payload,
    },
  };
}

describe('application draft synchronization', () => {
  beforeAll(() => {
    const values = new Map();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        get length() { return values.size; },
        clear: () => values.clear(),
        getItem: (key) => values.get(key) ?? null,
        key: (index) => [...values.keys()][index] ?? null,
        removeItem: (key) => values.delete(key),
        setItem: (key, value) => values.set(key, String(value)),
      },
    });
  });
  beforeEach(() => window.localStorage.clear());

  it('reopens Apply from Market with a fresh authoritative draft read', () => {
    const loadDraft = () => null;
    expect(applicationDraftQueryOptions('agency-1', loadDraft)).toMatchObject({
      queryKey: ['application-draft', 'agency-1'],
      enabled: true,
      staleTime: 0,
      refetchOnMount: 'always',
      retry: 0,
    });
  });

  it('preserves a Version 1+ local edit when the authoritative GET fails', () => {
    const base = document({ payload: { note: 'Version 4' } });
    const localDocument = document({ payload: { note: 'Offline edit' } });
    const state = provisionalDraftState({
      local: {
        kind: 'draft',
        dirty: true,
        baseVersion: 4,
        baseGeneration: 2,
        baseRevisionToken: 'revision-4',
        baseDocument: base,
        document: localDocument,
      },
      cachedServer: {
        version: 3,
        generation: 2,
        revisionToken: 'stale-cache',
        document: document({ payload: { note: 'stale cache' } }),
      },
      fallbackDocument: document(),
    });

    expect(state).toMatchObject({
      document: localDocument,
      baseDocument: base,
      version: 4,
      generation: 2,
      revisionToken: 'revision-4',
      dirty: true,
    });
  });

  it('uses cached server state provisionally without treating it as a fresh authority', () => {
    const cached = document({ payload: { note: 'cached Version 3' } });
    expect(provisionalDraftState({
      local: null,
      cachedServer: {
        version: 3,
        generation: 1,
        revisionToken: 'cached-token',
        document: cached,
      },
      fallbackDocument: document(),
    })).toMatchObject({
      document: cached,
      baseDocument: cached,
      version: 3,
      generation: 1,
      revisionToken: 'cached-token',
      dirty: false,
    });
  });

  it('uses bounded exponential retry delays for transient failures', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(draftRetryDelay)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
  });

  it('treats a refresh/navigation cursor and confirmations as one material draft', () => {
    const saved = document({
      currentStepId: 'message',
      payload: { note: 'Hello', consent: true, accuracyConfirmed: true },
    });
    const rehydrated = document({
      currentStepId: 'review',
      payload: { note: 'Hello', consent: false, accuracyConfirmed: false },
    });

    expect(draftFingerprint(rehydrated)).not.toBe(draftFingerprint(saved));
    expect(draftMaterialFingerprint(rehydrated)).toBe(draftMaterialFingerprint(saved));
    expect(reconcileDraftDocuments({ base: saved, local: rehydrated, remote: saved })).toMatchObject({
      status: 'merged',
      conflictFields: [],
    });
  });

  it('canonicalizes arrays and slot maps and includes an external comp card', () => {
    const left = document({
      payload: {
        boards: ['commercial', 'editorial'],
        excludedImageIds: ['b', 'a'],
        digitalSlotPicks: { profile: '2', headshot: '1' },
        externalCompCard: { id: 'card-a' },
      },
    });
    const reordered = document({
      payload: {
        boards: ['editorial', 'commercial'],
        excludedImageIds: ['a', 'b'],
        digitalSlotPicks: { headshot: '1', profile: '2' },
        externalCompCard: { id: 'card-a' },
      },
    });
    const otherCard = document({ payload: { ...left.payload, externalCompCard: { id: 'card-b' } } });

    expect(draftMaterialFingerprint(reordered)).toBe(draftMaterialFingerprint(left));
    expect(draftMaterialFingerprint(otherCard)).not.toBe(draftMaterialFingerprint(left));
  });

  it('adopts the server when stale local state made no material edit', () => {
    const base = document({ payload: { note: 'Base' } });
    const remote = document({ payload: { note: 'New server copy' } });
    const result = reconcileDraftDocuments({ base, local: base, remote });

    expect(result.status).toBe('merged');
    expect(result.document.payload.note).toBe('New server copy');
  });

  it('keeps a local edit when the saved base did not change', () => {
    const base = document({ payload: { note: 'Base' } });
    const local = document({ payload: { note: 'Local edit' } });
    const result = reconcileDraftDocuments({ base, local, remote: base });

    expect(result.status).toBe('merged');
    expect(result.document.payload.note).toBe('Local edit');
  });

  it('merges safe changes made in two tabs to different fields', () => {
    const base = document({ payload: { note: 'Base', boards: ['editorial'] } });
    const local = document({ payload: { note: 'Local note', boards: ['editorial'] } });
    const remote = document({ payload: { note: 'Base', boards: ['commercial'] } });
    const result = reconcileDraftDocuments({ base, local, remote });

    expect(result.status).toBe('merged');
    expect(result.document.payload).toMatchObject({
      note: 'Local note',
      boards: ['commercial'],
    });
  });

  it('merges concurrent changes to different map keys and availability endpoints', () => {
    const base = document({
      payload: {
        digitalSlotPicks: { headshot: 'a' },
        availability: { from: '2026-09-01', to: '2026-09-10' },
      },
    });
    const local = document({
      payload: {
        digitalSlotPicks: { headshot: 'a', profile: 'b' },
        availability: { from: '2026-09-02', to: '2026-09-10' },
      },
    });
    const remote = document({
      payload: {
        digitalSlotPicks: { headshot: 'a', full_length: 'c' },
        availability: { from: '2026-09-01', to: '2026-09-12' },
      },
    });

    const result = reconcileDraftDocuments({ base, local, remote });
    expect(result).toMatchObject({ status: 'merged', conflictFields: [] });
    expect(result.document.payload.digitalSlotPicks).toEqual({
      full_length: 'c',
      headshot: 'a',
      profile: 'b',
    });
    expect(result.document.payload.availability).toEqual({
      from: '2026-09-02',
      to: '2026-09-12',
    });
  });

  it('conflicts only when the same logical map entry changed differently', () => {
    const base = document({ payload: { digitalSlotPicks: { headshot: 'a' } } });
    const local = document({ payload: { digitalSlotPicks: { headshot: 'b' } } });
    const remote = document({ payload: { digitalSlotPicks: { headshot: 'c' } } });

    expect(reconcileDraftDocuments({ base, local, remote })).toMatchObject({
      status: 'conflict',
      conflictFields: ['digitalSlotPicks.headshot'],
    });
  });

  it('merges independent set membership changes without a chooser', () => {
    const base = document({ payload: { boards: ['editorial'], excludedImageIds: ['a'] } });
    const local = document({ payload: { boards: ['editorial', 'commercial'], excludedImageIds: [] } });
    const remote = document({ payload: { boards: ['editorial', 'runway'], excludedImageIds: ['a', 'b'] } });

    const result = reconcileDraftDocuments({ base, local, remote });
    expect(result.status).toBe('merged');
    expect(result.document.payload.boards).toEqual(['commercial', 'editorial', 'runway']);
    expect(result.document.payload.excludedImageIds).toEqual(['b']);
  });

  it('reports only a genuine same-field concurrent divergence', () => {
    const base = document({ payload: { note: 'Base' } });
    const local = document({ payload: { note: 'Tab A' } });
    const remote = document({ payload: { note: 'Tab B' } });
    const result = reconcileDraftDocuments({ base, local, remote });

    expect(result).toMatchObject({ status: 'conflict', conflictFields: ['note'] });
  });

  it('recovers a debounce-period edit after leaving Apply or refreshing', () => {
    const profileId = 'profile-1';
    const agencyId = 'agency-1';
    const base = document({ payload: { note: 'Saved' } });
    const local = document({ payload: { note: 'Typed before refresh' } });
    writeLocalDraft(profileId, agencyId, {
      baseVersion: 4,
      baseGeneration: 1,
      baseDocument: base,
      dirty: true,
      document: local,
    });

    expect(readLocalDraft(profileId, agencyId)).toMatchObject({
      kind: 'draft',
      baseVersion: 4,
      baseGeneration: 1,
      dirty: true,
      document: local,
    });
    clearLocalDraft(profileId, agencyId);
    expect(readLocalDraft(profileId, agencyId)).toBeNull();
  });

  it('keeps independent crash journals for two tabs of the same dossier', () => {
    const profileId = 'profile-tabs';
    const agencyId = 'agency-tabs';
    window.sessionStorage.setItem('pholio:apply-draft:tab-id', 'tab:a');
    writeLocalDraft(profileId, agencyId, {
      baseVersion: 1,
      baseGeneration: 1,
      dirty: true,
      document: document({ payload: { note: 'Tab A' } }),
      fingerprint: draftFingerprint(document({ payload: { note: 'Tab A' } })),
    });
    window.sessionStorage.setItem('pholio:apply-draft:tab-id', 'tab:b');
    writeLocalDraft(profileId, agencyId, {
      baseVersion: 1,
      baseGeneration: 1,
      dirty: true,
      document: document({ payload: { note: 'Tab B' } }),
      fingerprint: draftFingerprint(document({ payload: { note: 'Tab B' } })),
    });

    expect(window.localStorage.getItem(draftStorageKey(profileId, agencyId, 'tab:a'))).not.toBeNull();
    expect(window.localStorage.getItem(draftStorageKey(profileId, agencyId, 'tab:b'))).not.toBeNull();
    clearLocalDraft(profileId, agencyId);
    expect(window.localStorage.getItem(draftStorageKey(profileId, agencyId, 'tab:a'))).not.toBeNull();
    expect(window.localStorage.getItem(draftStorageKey(profileId, agencyId, 'tab:b'))).toBeNull();
  });

  it('never clears a newer debounced edit when an older request acknowledges', () => {
    const profileId = 'profile-ack';
    const agencyId = 'agency-ack';
    const first = document({ payload: { note: 'request A' } });
    const newer = document({ payload: { note: 'edit B before A acknowledged' } });
    window.sessionStorage.setItem('pholio:apply-draft:tab-id', 'tab:ack');
    writeLocalDraft(profileId, agencyId, {
      baseVersion: 1,
      baseGeneration: 1,
      dirty: true,
      document: newer,
      fingerprint: draftFingerprint(newer),
    });

    expect(clearLocalDraftIfFingerprint(profileId, agencyId, draftFingerprint(first))).toBe(false);
    expect(readLocalDraft(profileId, agencyId).document).toEqual(newer);
    expect(clearLocalDraftIfFingerprint(profileId, agencyId, draftFingerprint(newer))).toBe(true);
  });

  it('reports when browser storage cannot durably record an edit', () => {
    const storage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        ...storage,
        get length() { return storage.length; },
        getItem: storage.getItem,
        key: storage.key,
        removeItem: storage.removeItem,
        setItem: () => { throw new Error('quota exceeded'); },
      },
    });
    expect(writeLocalDraft('profile-storage', 'agency-storage', {
      dirty: true,
      document: document({ payload: { note: 'must remain in memory' } }),
    })).toBe(false);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
  });

  it('serializes rapid autosaves and coalesces them to the newest document', async () => {
    let releaseFirst;
    const seen = [];
    const queue = createLatestDraftSaveQueue(async (value) => {
      seen.push(value);
      if (value === 'first') {
        await new Promise((resolve) => { releaseFirst = resolve; });
      }
      return true;
    });

    const saving = queue.enqueue('first');
    queue.enqueue('second');
    queue.enqueue('newest');
    expect(seen).toEqual(['first']);
    releaseFirst();
    await saving;

    expect(seen).toEqual(['first', 'newest']);
  });

  it('retains the newest state after a transient failure and retries it once', async () => {
    const seen = [];
    let shouldFail = true;
    const queue = createLatestDraftSaveQueue(async (value) => {
      seen.push(value);
      if (shouldFail) {
        shouldFail = false;
        return false;
      }
      return true;
    });

    expect(await queue.enqueue('offline edit')).toBe(false);
    queue.replacePending('newest offline edit');
    expect(await queue.retry()).toBe(true);
    expect(seen).toEqual(['offline edit', 'newest offline edit']);
  });

  it('disposes a dossier queue without draining its pending state into another scope', async () => {
    let release;
    const seen = [];
    const queue = createLatestDraftSaveQueue(async (value) => {
      seen.push(value);
      if (value === 'agency-a:first') {
        await new Promise((resolve) => { release = resolve; });
      }
      return true;
    });

    const saving = queue.enqueue('agency-a:first');
    queue.enqueue('agency-a:pending');
    queue.dispose();
    release();
    await saving;
    expect(seen).toEqual(['agency-a:first']);
    expect(await queue.enqueue('agency-b:wrong-queue')).toBe(false);
  });
});
