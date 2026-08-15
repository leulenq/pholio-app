import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ProfileReadinessSidebar from '../ProfileReadinessSidebar';
import { PROFILE_STRENGTH_SCROLL_TARGETS } from '../../../../shared/utils/profileScoring';

const REQUIRED_KEYS = [
  'name',
  'city',
  'dob',
  'gender',
  'height',
  'measurements',
  'photo_headshot',
  'photo_full_body',
];

const originalMatchMedia = window.matchMedia;

function setReducedMotion(enabled) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: enabled && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function makeReadiness({ score = 40, isRequiredComplete = false, fieldCompletion = {} } = {}) {
  return {
    score,
    isRequiredComplete,
    fieldCompletion,
    scrollTargetByKey: PROFILE_STRENGTH_SCROLL_TARGETS,
  };
}

function allRequiredComplete(extra = {}) {
  return REQUIRED_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), { ...extra });
}

function renderSidebar(props = {}) {
  return render(
    <ProfileReadinessSidebar
      readiness={makeReadiness()}
      isSaving={false}
      hasChanges={false}
      onSaveClick={() => {}}
      onItemClick={() => {}}
      auditOpen={false}
      onToggleAudit={() => {}}
      {...props}
    />,
  );
}

function numeralEl(container) {
  return container.querySelector('[data-tone]');
}

describe('ProfileReadinessSidebar', () => {
  beforeEach(() => {
    setReducedMotion(true);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  test('anchors the module with the score, the threshold label, and a text readout', () => {
    const { container } = renderSidebar({ readiness: makeReadiness({ score: 72 }) });

    expect(screen.getByRole('heading', { name: 'Submission readiness' })).toBeInTheDocument();
    // Reduced motion renders the final value instead of counting up.
    expect(numeralEl(container)).toHaveTextContent('72');
    expect(screen.getByText('Core complete')).toBeInTheDocument();
    expect(
      screen.getByText('Submission readiness: 72% — Core complete'),
    ).toBeInTheDocument();
  });

  test('colours the numeral by band and never renders it as a meter widget', () => {
    const { container, rerender } = renderSidebar({ readiness: makeReadiness({ score: 40 }) });
    expect(numeralEl(container)).toHaveAttribute('data-tone', 'ink');
    expect(screen.getByText('In progress')).toBeInTheDocument();

    const props = {
      isSaving: false,
      hasChanges: false,
      onSaveClick: () => {},
      onItemClick: () => {},
      auditOpen: false,
      onToggleAudit: () => {},
    };

    rerender(
      <ProfileReadinessSidebar
        {...props}
        readiness={makeReadiness({ score: 90, isRequiredComplete: true })}
      />,
    );
    expect(numeralEl(container)).toHaveAttribute('data-tone', 'gold');
    expect(screen.getByText('Submission-ready')).toBeInTheDocument();

    rerender(
      <ProfileReadinessSidebar
        {...props}
        readiness={makeReadiness({
          score: 100,
          isRequiredComplete: true,
          fieldCompletion: allRequiredComplete(),
        })}
      />,
    );
    expect(numeralEl(container)).toHaveAttribute('data-tone', 'celebration');

    // The rail is decorative; the number itself carries the accessible value.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  test('counts up to the score when motion is allowed', async () => {
    setReducedMotion(false);
    const { container } = renderSidebar({ readiness: makeReadiness({ score: 64 }) });

    expect(numeralEl(container)).toHaveTextContent('0');
    await waitFor(() => expect(numeralEl(container)).toHaveTextContent('64'), { timeout: 4000 });
  });

  test('missing rows offer a quiet Add action that jumps to the right section', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();
    renderSidebar({ readiness: makeReadiness({ score: 20 }), onItemClick });

    expect(screen.getByText('Next up')).toBeInTheDocument();

    const row = screen.getByRole('button', { name: /legal name/i });
    expect(within(row).getByText('Add')).toBeInTheDocument();

    await user.click(row);
    expect(onItemClick).toHaveBeenCalledWith('identity');
  });

  test('the full checklist shows satisfied required items as completed rows', async () => {
    const user = userEvent.setup();
    const onToggleAudit = vi.fn();
    const readiness = makeReadiness({
      score: 88,
      isRequiredComplete: true,
      fieldCompletion: allRequiredComplete(),
    });

    const { rerender } = renderSidebar({ readiness, onToggleAudit });

    const toggle = screen.getByRole('button', { name: /view full checklist/i });
    await user.click(toggle);
    expect(onToggleAudit).toHaveBeenCalled();

    rerender(
      <ProfileReadinessSidebar
        readiness={readiness}
        isSaving={false}
        hasChanges={false}
        onSaveClick={() => {}}
        onItemClick={() => {}}
        auditOpen
        onToggleAudit={onToggleAudit}
      />,
    );

    const panel = await screen.findByRole('region', { name: /full profile checklist/i });
    expect(within(panel).getByText('Core')).toBeInTheDocument();

    // Satisfied items read as plain completed text, not actionable rows.
    const completed = within(panel).getByText('Legal Name');
    expect(completed.closest('button')).toBeNull();
    expect(within(panel).queryByRole('button', { name: /legal name/i })).toBeNull();
  });

  test('the status line reports missing work and swaps to the complete message at 100', () => {
    const { rerender } = renderSidebar({ readiness: makeReadiness({ score: 30 }) });
    expect(screen.getByText(/required items are still missing\./i)).toBeInTheDocument();

    rerender(
      <ProfileReadinessSidebar
        readiness={makeReadiness({
          score: 100,
          isRequiredComplete: true,
          fieldCompletion: allRequiredComplete(),
        })}
        isSaving={false}
        hasChanges={false}
        onSaveClick={() => {}}
        onItemClick={() => {}}
        auditOpen={false}
        onToggleAudit={() => {}}
      />,
    );

    expect(
      screen.getByText('Every item is in place — your package is ready for agency review.'),
    ).toBeInTheDocument();
  });

  test('flags unsaved changes so a stale numeral is explained', () => {
    renderSidebar({ readiness: makeReadiness({ score: 55 }), hasChanges: true });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save profile/i })).toBeEnabled();
  });
});
