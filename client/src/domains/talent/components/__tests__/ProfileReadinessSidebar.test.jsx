import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import ProfileReadinessSidebar from '../ProfileReadinessSidebar';
import {
  PROFILE_STRENGTH_SCROLL_TARGETS,
  getStrengthUI,
} from '../../../../shared/utils/profileScoring';

/** Everything the checklist can score, all satisfied. */
const ALL_COMPLETE = Object.keys(PROFILE_STRENGTH_SCROLL_TARGETS).reduce(
  (acc, key) => ({ ...acc, [key]: true }),
  {},
);

function makeReadiness({ score = 40, isRequiredComplete = false, fieldCompletion = {} } = {}) {
  return {
    score,
    isRequiredComplete,
    fieldCompletion,
    scrollTargetByKey: PROFILE_STRENGTH_SCROLL_TARGETS,
  };
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

describe('ProfileReadinessSidebar', () => {
  test('anchors the rail with the numeric score under the module title', () => {
    renderSidebar({ readiness: makeReadiness({ score: 72, isRequiredComplete: true }) });

    expect(screen.getByRole('complementary', { name: /profile completeness/i })).toBeInTheDocument();
    expect(screen.getByText('Profile readiness')).toBeInTheDocument();
    // The score mounts at its final value; the count-up only runs on change.
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  test('reports the score through a progressbar with the threshold labels', () => {
    renderSidebar({ readiness: makeReadiness({ score: 88, isRequiredComplete: true }) });

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '88');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');

    expect(screen.getByText('Core')).toBeInTheDocument();
    expect(screen.getByText('Strong')).toBeInTheDocument();
  });

  test('states the band with the shared getStrengthUI message', () => {
    const { rerender } = renderSidebar({ readiness: makeReadiness({ score: 30 }) });
    expect(screen.getByText(getStrengthUI(30, false).message)).toBeInTheDocument();

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
        readiness={makeReadiness({ score: 70, isRequiredComplete: true })}
      />,
    );
    expect(screen.getByText(getStrengthUI(70, true).message)).toBeInTheDocument();

    rerender(
      <ProfileReadinessSidebar
        {...props}
        readiness={makeReadiness({ score: 92, isRequiredComplete: true })}
      />,
    );
    expect(screen.getByText(getStrengthUI(92, true).message)).toBeInTheDocument();
  });

  test('lists the next gaps and jumps to the matching profile section', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();
    renderSidebar({ readiness: makeReadiness({ score: 20 }), onItemClick });

    expect(screen.getByText('Next up')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /legal name/i }));
    expect(onItemClick).toHaveBeenCalledWith('identity');
  });

  test('swaps the gap list for the complete brief once nothing is outstanding', () => {
    renderSidebar({
      readiness: makeReadiness({
        score: 100,
        isRequiredComplete: true,
        fieldCompletion: ALL_COMPLETE,
      }),
    });

    expect(
      screen.getByText('Submission package complete — ready for agency review.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Next up')).not.toBeInTheDocument();
  });

  test('opens the full checklist into Core and Strengthen sections', async () => {
    const user = userEvent.setup();
    const onToggleAudit = vi.fn();
    const readiness = makeReadiness({ score: 15 });

    const { rerender } = renderSidebar({ readiness, onToggleAudit });

    await user.click(screen.getByRole('button', { name: /view full checklist/i }));
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
    // "Core" is both the section label and the per-row tier marker.
    expect(within(panel).getAllByText('Core').length).toBeGreaterThan(0);
    expect(within(panel).getByText('Strengthen')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /professional bio/i })).toBeInTheDocument();
  });

  test('flags unsaved changes so a stale score is explained', () => {
    renderSidebar({ readiness: makeReadiness({ score: 55 }), hasChanges: true });

    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save profile/i })).toBeEnabled();
  });
});
