import { describe, expect, it } from 'vitest';

import {
  createLatestDraftSaveQueue,
  draftFingerprint,
  draftMaterialFingerprint,
  reconcileDraftDocuments,
} from '../applicationDraftStorage';

function doc(payload = {}, currentStepId = 'message') {
  return {
    currentStepId,
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
      ...payload,
    },
  };
}

function conflict(latest) {
  const error = new Error('conflict');
  error.status = 409;
  error.latest = latest;
  return error;
}

class MemoryDraftServer {
  constructor(initial = null) {
    this.document = initial;
    this.version = initial ? 1 : 0;
    this.generation = initial ? 1 : 0;
    this.online = true;
    this.dropNextResponse = false;
    this.calls = 0;
  }

  snapshot() {
    if (!this.document) return null;
    return {
      document: structuredClone(this.document),
      version: this.version,
      generation: this.generation,
    };
  }

  async save({ document, expectedVersion, expectedGeneration }) {
    this.calls += 1;
    if (!this.online) throw new Error('offline');
    if (!this.document) {
      if (expectedVersion !== 0 || expectedGeneration !== 0) throw conflict(null);
      this.document = structuredClone(document);
      this.version = 1;
      this.generation = 1;
    } else if (draftFingerprint(document) === draftFingerprint(this.document)) {
      // Idempotent retry/lost response: acknowledge the already-applied write.
    } else if (expectedVersion !== this.version || expectedGeneration !== this.generation) {
      throw conflict(this.snapshot());
    } else {
      this.document = structuredClone(document);
      this.version += 1;
    }
    const result = this.snapshot();
    if (this.dropNextResponse) {
      this.dropNextResponse = false;
      throw new Error('response lost');
    }
    return result;
  }
}

class DraftActor {
  constructor(server, snapshot = server.snapshot()) {
    this.server = server;
    this.base = snapshot?.document || doc();
    this.local = structuredClone(this.base);
    this.version = snapshot?.version || 0;
    this.generation = snapshot?.generation || 0;
    this.dirty = false;
    this.chooser = false;
    this.journal = null;
    this.queue = createLatestDraftSaveQueue((document) => this.saveOne(document));
  }

  edit(document) {
    this.local = structuredClone(document);
    this.dirty = draftFingerprint(this.local) !== draftFingerprint(this.base);
    this.journal = this.dirty
      ? { base: structuredClone(this.base), document: structuredClone(this.local) }
      : null;
  }

  crashAndReload() {
    const actor = new DraftActor(this.server, this.server.snapshot());
    if (this.journal) {
      const merged = reconcileDraftDocuments({
        base: this.journal.base,
        local: this.journal.document,
        remote: actor.base,
      });
      if (merged.status === 'conflict') actor.chooser = true;
      else actor.edit(merged.document);
    }
    return actor;
  }

  async saveOne(requestDocument) {
    try {
      const saved = await this.server.save({
        document: requestDocument,
        expectedVersion: this.version,
        expectedGeneration: this.generation,
      });
      this.base = saved.document;
      this.version = saved.version;
      this.generation = saved.generation;
      const reconciliation = reconcileDraftDocuments({
        base: requestDocument,
        local: this.local,
        remote: saved.document,
      });
      if (reconciliation.status === 'conflict') {
        this.chooser = true;
        return false;
      }
      this.local = reconciliation.document;
      this.dirty = draftFingerprint(this.local) !== draftFingerprint(this.base);
      this.journal = this.dirty
        ? { base: structuredClone(this.base), document: structuredClone(this.local) }
        : null;
      if (this.dirty) this.queue.replacePending(this.local);
      return true;
    } catch (error) {
      if (error.status !== 409 || !error.latest) return false;
      const reconciliation = reconcileDraftDocuments({
        base: this.base,
        local: this.local,
        remote: error.latest.document,
      });
      if (reconciliation.status === 'conflict') {
        this.chooser = true;
        return false;
      }
      this.base = error.latest.document;
      this.version = error.latest.version;
      this.generation = error.latest.generation;
      this.local = reconciliation.document;
      this.journal = { base: structuredClone(this.base), document: structuredClone(this.local) };
      this.queue.replacePending(this.local);
      return true;
    }
  }

  sync() {
    return this.queue.enqueue(this.local);
  }
}

describe('adversarial draft lifecycle model', () => {
  it('does not create a server draft for an untouched workspace', () => {
    const server = new MemoryDraftServer();
    const actor = new DraftActor(server);
    expect(actor.dirty).toBe(false);
    expect(actor.journal).toBeNull();
    expect(server.calls).toBe(0);
  });

  it('survives offline edits, a failed request, reconnect, and a lost acknowledgement', async () => {
    const server = new MemoryDraftServer(doc({ note: 'saved' }));
    const actor = new DraftActor(server);
    actor.edit(doc({ note: 'edited offline' }));
    server.online = false;
    expect(await actor.sync()).toBe(false);
    expect(actor.journal.document.payload.note).toBe('edited offline');

    server.online = true;
    server.dropNextResponse = true;
    expect(await actor.queue.retry()).toBe(false);
    expect(server.document.payload.note).toBe('edited offline');
    expect(actor.journal).not.toBeNull();

    actor.queue.replacePending(actor.local);
    expect(await actor.queue.retry()).toBe(true);
    expect(actor.journal).toBeNull();
    expect(server.version).toBe(2);
  });

  it('recovers a crash-window edit and merges it over a compatible remote save', async () => {
    const base = doc({ note: 'base', boards: ['editorial'] });
    const server = new MemoryDraftServer(base);
    const tabA = new DraftActor(server);
    const tabB = new DraftActor(server);
    tabA.edit(doc({ note: 'typed before crash', boards: ['editorial'] }));
    tabB.edit(doc({ note: 'base', boards: ['editorial', 'commercial'] }));
    await tabB.sync();

    const recovered = tabA.crashAndReload();
    expect(recovered.chooser).toBe(false);
    expect(recovered.local.payload).toMatchObject({
      note: 'typed before crash',
      boards: ['commercial', 'editorial'],
    });
    await recovered.sync();
    expect(server.document.payload).toMatchObject({
      note: 'typed before crash',
      boards: ['commercial', 'editorial'],
    });
  });

  it('auto-merges compatible two-device changes but stops on a genuine same-atom conflict', async () => {
    const server = new MemoryDraftServer(doc({ note: 'base' }));
    const tabA = new DraftActor(server);
    const tabB = new DraftActor(server);
    tabA.edit(doc({ note: 'base', digitalSlotPicks: { headshot: 'a' } }));
    tabB.edit(doc({ note: 'base', digitalSlotPicks: { profile: 'b' } }));
    await tabA.sync();
    await tabB.sync();
    expect(tabB.chooser).toBe(false);
    expect(server.document.payload.digitalSlotPicks).toEqual({ headshot: 'a', profile: 'b' });

    const deviceC = new DraftActor(server);
    const deviceD = new DraftActor(server);
    deviceC.edit(doc({ note: 'device C', digitalSlotPicks: server.document.payload.digitalSlotPicks }));
    deviceD.edit(doc({ note: 'device D', digitalSlotPicks: server.document.payload.digitalSlotPicks }));
    await deviceC.sync();
    expect(await deviceD.sync()).toBe(false);
    expect(deviceD.chooser).toBe(true);
    expect(server.document.payload.note).toBe('device C');
    expect(deviceD.journal.document.payload.note).toBe('device D');
  });

  it('treats reordered/duplicate set data as the same material package across retries', async () => {
    const saved = doc({
      boards: ['commercial', 'editorial'],
      excludedImageIds: ['a', 'b'],
      digitalSlotPicks: { headshot: '1', profile: '2' },
    });
    const reordered = doc({
      boards: ['editorial', 'commercial', 'editorial'],
      excludedImageIds: ['b', 'a', 'a'],
      digitalSlotPicks: { profile: '2', headshot: '1' },
    });
    expect(draftMaterialFingerprint(reordered)).toBe(draftMaterialFingerprint(saved));
    expect(draftFingerprint(reordered)).toBe(draftFingerprint(saved));

    const server = new MemoryDraftServer(saved);
    const actor = new DraftActor(server);
    actor.edit(reordered);
    expect(actor.dirty).toBe(false);
    expect(server.calls).toBe(0);
  });
});
