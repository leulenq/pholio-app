import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { SeasonMemory } from '../SeasonMemory';

/**
 * Every signal season-memory.js hands the client is either a declared value
 * or a capture date (never image comparison — see the compliance rationale
 * in src/domains/agency/services/season-memory.js). This suite only checks
 * that the component renders exactly what it is given, plainly, without
 * inventing a badge/chip/dot for any of it.
 */

function dossier(seasonMemory) {
  return { seasonMemory };
}

describe('SeasonMemory — nothing to compare', () => {
  test('renders nothing for a first-time applicant', () => {
    const { container } = render(<SeasonMemory dossier={dossier(null)} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when the dossier carries no seasonMemory key at all', () => {
    const { container } = render(<SeasonMemory dossier={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SeasonMemory — a re-application with nothing changed', () => {
  test('states plainly that nothing has changed, rather than an empty diff', () => {
    render(
      <SeasonMemory
        dossier={dossier({
          priorApplicationId: 'app-1',
          priorSubmittedAt: '2026-02-01T00:00:00.000Z',
          currentApplicationId: 'app-2',
          measurements: [],
          declared: [],
          digitals: { kind: 'same_set', newestBefore: '2026-01-01', newestAfter: '2026-01-01' },
          representation: null,
          hasMovement: false,
        })}
      />,
    );

    expect(screen.getByText(/applied before/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing has changed since/i)).toBeInTheDocument();
    // No fabricated change rows for a no-movement season.
    expect(screen.queryByText(/digitals/i)).not.toBeInTheDocument();
  });
});

describe('SeasonMemory — real movement', () => {
  const movedMemory = {
    priorApplicationId: 'app-1',
    priorSubmittedAt: '2026-02-01T00:00:00.000Z',
    currentApplicationId: 'app-2',
    measurements: [
      { key: 'height_cm', label: 'Height', unit: 'cm', kind: 'changed', before: 172, after: 174, delta: 2 },
    ],
    declared: [
      { key: 'hair_color', label: 'Hair', kind: 'changed', before: 'brown', after: 'blonde' },
    ],
    digitals: { kind: 'reshot', newestBefore: '2026-01-01', newestAfter: '2026-06-15' },
    representation: { kind: 'signed', count: 1, named: ['Milan Model Co'] },
    hasMovement: true,
  };

  test('renders every declared and dated change as plain text', () => {
    render(<SeasonMemory dossier={dossier(movedMemory)} />);

    expect(screen.getByText('Height')).toBeInTheDocument();
    expect(screen.getByText(/172 → 174cm \(\+2cm\)/)).toBeInTheDocument();

    expect(screen.getByText('Hair')).toBeInTheDocument();
    expect(screen.getByText('brown → blonde')).toBeInTheDocument();

    expect(screen.getByText(/new digitals since last time/i)).toBeInTheDocument();
    expect(screen.getByText(/shot/i)).toBeInTheDocument();

    expect(screen.getByText(/signed since last time/i)).toBeInTheDocument();
    expect(screen.getByText(/milan model co/i)).toBeInTheDocument();
  });

  test('never names an undisclosed agency', () => {
    render(
      <SeasonMemory
        dossier={dossier({
          ...movedMemory,
          representation: { kind: 'signed', count: 1, named: [] },
        })}
      />,
    );

    expect(screen.getByText(/signed since last time/i)).toBeInTheDocument();
    expect(screen.getByText(/undisclosed/i)).toBeInTheDocument();
  });

  test('states a newly-given measurement as newly given, not as growth from zero', () => {
    render(
      <SeasonMemory
        dossier={dossier({
          ...movedMemory,
          measurements: [
            { key: 'inseam_cm', label: 'Inseam', unit: 'cm', kind: 'newly_given', before: null, after: 81 },
          ],
        })}
      />,
    );

    expect(screen.getByText(/newly given — 81cm/i)).toBeInTheDocument();
    expect(screen.queryByText(/\+81/)).not.toBeInTheDocument();
  });

  test('a released representation with no disclosed name stays plain', () => {
    render(
      <SeasonMemory
        dossier={dossier({
          ...movedMemory,
          representation: { kind: 'released', count: 0, named: [] },
        })}
      />,
    );

    expect(screen.getByText(/no longer represented as before/i)).toBeInTheDocument();
  });
});
