import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Selection for a wall of faces — the signing board and the submissions desk.
 *
 * Both surfaces render the same set two ways (book/wall and ledger), so
 * selection lives above the views and is keyed by application id.
 * `orderedIds` is the visible order of the surface — the board's wall order,
 * the desk's filtered order; shift-ranges and focus movement walk that order,
 * so a range picked in the book means the same thing in the ledger.
 *
 * Selection is deliberately NOT in the URL (§2.3): it is a working state of
 * this sitting, not a shareable address.
 *
 * Ids that leave `orderedIds` — a tile that moved to a shelf after a decision,
 * a row that left the tab — are pruned from the selection, the focus and the anchor,
 * because a verdict bar acting on a face nobody can see is the one way this
 * surface could decide something silently.
 */
export function useTalentSelection(orderedIds) {
  const ids = useMemo(() => (Array.isArray(orderedIds) ? orderedIds : []), [orderedIds]);
  const idSet = useMemo(() => new Set(ids), [ids]);

  const [rawSelected, setRawSelected] = useState(() => new Set());
  const [rawFocused, setRawFocused] = useState(null);
  const [rawAnchor, setRawAnchor] = useState(null);

  // The latest order, read by callbacks without re-subscribing them.
  const idsRef = useRef(ids);
  const idSetRef = useRef(idSet);
  useEffect(() => {
    idsRef.current = ids;
    idSetRef.current = idSet;
  });

  // ---- pruning ----------------------------------------------------------
  // Derived, not synchronised: an id that left the wall is simply not part of
  // the selection this render, which is one fewer piece of state to keep true.
  const selectedIds = useMemo(() => {
    if (rawSelected.size === 0) return rawSelected;
    let dropped = false;
    const next = new Set();
    rawSelected.forEach((id) => {
      if (idSet.has(id)) next.add(id);
      else dropped = true;
    });
    return dropped ? next : rawSelected;
  }, [rawSelected, idSet]);
  const focusedId = rawFocused != null && idSet.has(rawFocused) ? rawFocused : null;
  const anchorId = rawAnchor != null && idSet.has(rawAnchor) ? rawAnchor : null;

  /** Every write starts from the pruned selection, so a decided face can never
   *  come back under a verdict by being undecided later. */
  const writeSelection = useCallback((fn) => {
    setRawSelected((prev) => {
      const live = new Set();
      prev.forEach((id) => { if (idSetRef.current.has(id)) live.add(id); });
      return fn(live);
    });
  }, []);

  // ---- reads ------------------------------------------------------------
  const isSelected = useCallback((id) => selectedIds.has(id), [selectedIds]);

  const selectedInOrder = useCallback(
    () => idsRef.current.filter((id) => selectedIds.has(id)),
    [selectedIds],
  );

  // ---- writes -----------------------------------------------------------
  const selectOnly = useCallback((id) => {
    if (id == null) return;
    setRawSelected(new Set([id]));
    setRawFocused(id);
    setRawAnchor(id);
  }, []);

  const toggle = useCallback((id) => {
    if (id == null) return;
    writeSelection((live) => {
      const next = new Set(live);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setRawFocused(id);
    setRawAnchor(id);
  }, [writeSelection]);

  /**
   * `range` selects everything between the anchor and `id` along the wall
   * order, replacing the selection (the listbox convention: a shift-click is a
   * restatement of one run, not an accumulation of runs). With no anchor yet it
   * degrades to a plain select.
   */
  const selectRange = useCallback((id) => {
    writeSelection((live) => {
      const order = idsRef.current;
      const from = anchorId != null && order.includes(anchorId) ? anchorId : null;
      if (from == null) return new Set([id]);
      const a = order.indexOf(from);
      const b = order.indexOf(id);
      if (a === -1 || b === -1) return live;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return new Set(order.slice(lo, hi + 1));
    });
    setRawFocused(id);
  }, [anchorId, writeSelection]);

  const select = useCallback((id, { additive = false, range = false } = {}) => {
    if (id == null) return;
    if (range) selectRange(id);
    else if (additive) toggle(id);
    else selectOnly(id);
  }, [selectRange, toggle, selectOnly]);

  const clear = useCallback(() => {
    setRawSelected((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const setFocused = useCallback((id) => {
    setRawFocused(id != null && idSetRef.current.has(id) ? id : null);
  }, []);

  /** Move focus one step along the wall order; entering from either end. */
  const moveFocus = useCallback((delta) => {
    const order = idsRef.current;
    if (order.length === 0) return;
    setRawFocused((prev) => {
      const at = prev == null || !idSetRef.current.has(prev) ? -1 : order.indexOf(prev);
      if (at === -1) return delta < 0 ? order[order.length - 1] : order[0];
      const next = Math.min(order.length - 1, Math.max(0, at + (delta < 0 ? -1 : 1)));
      return order[next];
    });
  }, []);

  return {
    selectedIds,
    focusedId,
    anchorId,
    isSelected,
    select,
    toggle,
    selectOnly,
    clear,
    setFocused,
    moveFocus,
    selectedInOrder,
  };
}

export default useTalentSelection;
