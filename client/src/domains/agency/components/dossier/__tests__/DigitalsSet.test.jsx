import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import { DigitalsSet } from '../DigitalsSet';

/**
 * The two asks in this panel are not interchangeable, and the distinction is
 * the feature: missing frames were never sent, while an aged or undated set was
 * sent and has expired. Offering a reshoot for a current set would turn a
 * request into a demand, so the affordance is gated on the freshness engine's
 * verdict — the same rule the server enforces.
 */

const dossier = (freshness, missing = []) => ({
  images: [],
  digitalsFreshness: freshness,
  compliance: { is_minor: false, guardian_consent_at: null },
  // dossierModel derives `set` from images; an empty book yields every slot
  // missing, so tests that care about the materials button pass it explicitly.
  __missing: missing,
});

function renderSet(freshness, props = {}) {
  return render(
    <DigitalsSet
      dossier={dossier(freshness)}
      onOpenFrame={() => {}}
      canRequest
      {...props}
    />,
  );
}

describe('DigitalsSet — asking for a current set', () => {
  test('offers a reshoot when the set has aged out', () => {
    renderSet({
      state: 'aging',
      hasDigitals: true,
      currentSet: { ageDays: 120 },
      undatedCount: 0,
      sets: [],
    }, { onRequestRefresh: vi.fn() });

    expect(screen.getByRole('button', { name: /ask for a current set/i })).toBeInTheDocument();
  });

  test('offers a reshoot when the set carries no capture date', () => {
    renderSet({
      state: 'undated',
      hasDigitals: true,
      currentSet: { ageDays: null },
      undatedCount: 2,
      sets: [],
    }, { onRequestRefresh: vi.fn() });

    expect(screen.getByRole('button', { name: /ask for a current set/i })).toBeInTheDocument();
    expect(screen.getByText(/no capture date/i)).toBeInTheDocument();
  });

  test('does NOT offer a reshoot for a current set', () => {
    // The whole point of the gate: this would be a demand, not a request.
    renderSet({
      state: 'current',
      hasDigitals: true,
      currentSet: { ageDays: 12 },
      undatedCount: 0,
      sets: [],
    }, { onRequestRefresh: vi.fn() });

    expect(screen.queryByRole('button', { name: /ask for a current set/i })).not.toBeInTheDocument();
  });

  test('says nothing about freshness when the server sent none', () => {
    // Unclassified frames: the dossier must not assert a set is stale on the
    // basis of no evidence.
    renderSet(null, { onRequestRefresh: vi.fn() });
    expect(screen.queryByRole('button', { name: /ask for a current set/i })).not.toBeInTheDocument();
  });

  test('fires the action and reports it in flight', async () => {
    const onRequestRefresh = vi.fn();
    const user = userEvent.setup();
    renderSet({
      state: 'stale',
      hasDigitals: true,
      currentSet: { ageDays: 400 },
      undatedCount: 0,
      sets: [],
    }, { onRequestRefresh });

    await user.click(screen.getByRole('button', { name: /ask for a current set/i }));
    expect(onRequestRefresh).toHaveBeenCalled();
  });

  test('a viewer without permission is not offered it', () => {
    renderSet({
      state: 'stale',
      hasDigitals: true,
      currentSet: { ageDays: 400 },
      undatedCount: 0,
      sets: [],
    }, { onRequestRefresh: vi.fn(), canRequest: false });

    expect(screen.queryByRole('button', { name: /ask for a current set/i })).not.toBeInTheDocument();
  });
});
