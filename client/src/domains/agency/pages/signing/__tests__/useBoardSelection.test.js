import { act, renderHook } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { useBoardSelection } from '../useBoardSelection';

const IDS = ['a', 'b', 'c', 'd', 'e'];

describe('useBoardSelection', () => {
  test('a plain select replaces the selection and sets the anchor', () => {
    const { result } = renderHook(() => useBoardSelection(IDS));

    act(() => result.current.select('b'));
    expect([...result.current.selectedIds]).toEqual(['b']);

    act(() => result.current.select('d'));
    expect([...result.current.selectedIds]).toEqual(['d']);
    expect(result.current.focusedId).toBe('d');
    expect(result.current.anchorId).toBe('d');
  });

  test('additive select toggles a face in and out without touching the rest', () => {
    const { result } = renderHook(() => useBoardSelection(IDS));

    act(() => result.current.select('b'));
    act(() => result.current.select('d', { additive: true }));
    expect(result.current.selectedInOrder()).toEqual(['b', 'd']);

    act(() => result.current.select('b', { additive: true }));
    expect(result.current.selectedInOrder()).toEqual(['d']);
  });

  test('a range runs along the wall order, in either direction', () => {
    const { result } = renderHook(() => useBoardSelection(IDS));

    act(() => result.current.select('b'));
    act(() => result.current.select('d', { range: true }));
    expect(result.current.selectedInOrder()).toEqual(['b', 'c', 'd']);

    // backwards from the same anchor
    act(() => result.current.select('a', { range: true }));
    expect(result.current.selectedInOrder()).toEqual(['a', 'b']);
  });

  test('a range with no anchor degrades to a plain select', () => {
    const { result } = renderHook(() => useBoardSelection(IDS));
    act(() => result.current.select('c', { range: true }));
    expect(result.current.selectedInOrder()).toEqual(['c']);
  });

  test('selectedInOrder always reads in wall order, never click order', () => {
    const { result } = renderHook(() => useBoardSelection(IDS));
    act(() => result.current.select('e'));
    act(() => result.current.select('a', { additive: true }));
    act(() => result.current.select('c', { additive: true }));
    expect(result.current.selectedInOrder()).toEqual(['a', 'c', 'e']);
  });

  test('focus moves one step and clamps at both ends', () => {
    const { result } = renderHook(() => useBoardSelection(IDS));

    act(() => result.current.moveFocus(1));
    expect(result.current.focusedId).toBe('a');

    act(() => result.current.moveFocus(-1));
    expect(result.current.focusedId).toBe('a');

    act(() => result.current.setFocused('e'));
    act(() => result.current.moveFocus(1));
    expect(result.current.focusedId).toBe('e');
  });

  test('setFocused refuses an id that is not on the wall', () => {
    const { result } = renderHook(() => useBoardSelection(IDS));
    act(() => result.current.setFocused('zz'));
    expect(result.current.focusedId).toBeNull();
  });

  test('ids that leave the wall are pruned from selection, focus and anchor', () => {
    const { result, rerender } = renderHook(({ ids }) => useBoardSelection(ids), {
      initialProps: { ids: IDS },
    });

    act(() => result.current.select('b'));
    act(() => result.current.select('d', { range: true }));
    expect(result.current.selectedInOrder()).toEqual(['b', 'c', 'd']);

    // 'b' and 'd' were decided and moved to a shelf.
    rerender({ ids: ['a', 'c', 'e'] });
    expect(result.current.selectedInOrder()).toEqual(['c']);
    expect(result.current.focusedId).toBeNull();
    expect(result.current.anchorId).toBeNull();
  });

  test('clear empties the selection but the hook stays usable', () => {
    const { result } = renderHook(() => useBoardSelection(IDS));
    act(() => result.current.select('a'));
    act(() => result.current.clear());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isSelected('a')).toBe(false);
    act(() => result.current.select('c'));
    expect(result.current.isSelected('c')).toBe(true);
  });
});
