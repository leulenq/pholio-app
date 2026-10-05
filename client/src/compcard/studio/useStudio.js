/**
 * Studio state: loads the talent's card data, reads any photos Pholio
 * hasn't analysed yet (in this browser, cached server-side), composes the
 * card in every direction, and autosaves the chosen one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../shared/lib/api-client';
import { analyzeImage, PERCEPTION_VERSION } from '../perception/analyze';
import { composeCard, DEFAULT_SETTINGS } from '../compose';
import { DIRECTIONS } from '../directions';
import { fontsReady } from '../render/fonts';

const SAVE_DELAY = 900;

export function useStudio() {
  const [phase, setPhase] = useState('loading'); // loading | reading | ready | error
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [perceptions, setPerceptions] = useState({});
  const [reading, setReading] = useState({ done: 0, total: 0 });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [fontsOk, setFontsOk] = useState(false);
  // false when the server has no comp card tables yet: compose and edit in
  // memory, but don't try to cache or save.
  const [storage, setStorage] = useState(true);
  const saveTimer = useRef(null);
  const dirty = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiClient.get('/compcard');
        if (!alive) return;
        const p = res.data.profile;
        await fontsReady([p.first_name, p.last_name, p.city, res.data.agency?.name, res.data.agency?.location].filter(Boolean).join(' '));
        if (!alive) return;
        setFontsOk(true);
        setData(res.data);
        const canStore = res.storage !== false;
        setStorage(canStore);
        if (res.card?.settings) setSettings({ ...DEFAULT_SETTINGS, ...res.card.settings });
        const known = {};
        for (const [id, p] of Object.entries(res.perceptions || {})) if (p.version === PERCEPTION_VERSION) known[id] = p;
        setPerceptions(known);
        const todo = res.data.images.filter((img) => !known[img.id] && img.src);
        if (todo.length) {
          setPhase('reading');
          setReading({ done: 0, total: todo.length });
          let done = 0;
          for (const img of todo) {
            try {
              // Read pixels through the same-origin proxy: works for any
              // storage host, CORS or not.
              const p = await analyzeImage(`/api/talent/compcard/images/${img.id}`);
              if (!alive) return;
              setPerceptions((prev) => ({ ...prev, [img.id]: p }));
              if (canStore) apiClient.put(`/compcard/perceptions/${img.id}`, { version: PERCEPTION_VERSION, data: p }).catch(() => null);
            } catch {
              // A photo Pholio can't read is still usable — the crop solver
              // protects the whole frame when it knows nothing.
            }
            done += 1;
            if (alive) setReading({ done, total: todo.length });
          }
        }
        if (alive) setPhase('ready');
      } catch (e) {
        if (!alive) return;
        setError(e?.message || 'Could not load your card');
        setPhase('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Image dimensions come from perception when the server didn't record them.
  const cardData = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      images: data.images.map((img) => ({
        ...img,
        width: img.width || perceptions[img.id]?.width || null,
        height: img.height || perceptions[img.id]?.height || null,
      })),
    };
  }, [data, perceptions]);

  const ready = phase === 'ready' && fontsOk && cardData;

  const result = useMemo(() => (ready ? composeCard(cardData, perceptions, settings) : null), [ready, cardData, perceptions, settings]);

  // Every direction, composed on the talent's own photos, for the chooser.
  const previews = useMemo(() => {
    if (!ready) return [];
    return DIRECTIONS.map((d) => ({
      id: d.id,
      name: d.name,
      summary: d.summary,
      // Other directions keep the talent's front photo choice; slot-level
      // adjustments belong to one layout and don't carry over.
      result:
        d.id === settings.direction
          ? result
          : composeCard(cardData, perceptions, { ...settings, direction: d.id, slots: settings.slots.front?.imageId ? { front: { imageId: settings.slots.front.imageId } } : {} }),
    }));
  }, [ready, cardData, perceptions, settings, result]);

  const save = useCallback(async (res, s) => {
    if (!storage) {
      setSaveState('unavailable');
      return;
    }
    setSaveState('saving');
    try {
      await apiClient.put('/compcard', { settings: s, scene: res.scene, notes: res.notes });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [storage]);

  // Autosave the chosen card shortly after any change.
  useEffect(() => {
    if (!result || !dirty.current) return undefined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(result, settings), SAVE_DELAY);
    return () => clearTimeout(saveTimer.current);
  }, [result, settings, save]);

  // First compose of a card that was never saved: save it, so the link works.
  useEffect(() => {
    if (result && data && !dirty.current) {
      dirty.current = true;
      save(result, settings);
    }
  }, [result, data, settings, save]);

  const update = useCallback((patch) => {
    dirty.current = true;
    setSettings((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  }, []);

  const setSlot = useCallback((slot, patch) => {
    dirty.current = true;
    setSettings((s) => {
      const cur = s.slots[slot] || {};
      const next = patch == null ? undefined : { ...cur, ...patch };
      const slots = { ...s.slots };
      if (next) slots[slot] = next;
      else delete slots[slot];
      return { ...s, slots };
    });
  }, []);

  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (result) await save(result, settings);
  }, [result, settings, save]);

  return { phase, error, reading, data: cardData, perceptions, settings, update, setSlot, result, previews, saveState, flush, storage };
}
