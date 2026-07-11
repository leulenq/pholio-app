import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BriefUnderstanding from '../BriefUnderstanding';

const brief = 'editorial women, 5\'10" and up, available soon';

// span [17,29] covers the constraint phrase 5'10" and up ; availability has no
// span (null → no underline — the honest literal gap)
const understanding = {
  roles: [{ label: 'role 1', count: 1, soft_query: 'clean editorial energy' }],
  applied: [
    { field: 'gender_presentation', op: null, value: ['female'], span: null, needs_confirmation: false, tier: 'client_gate' },
    { field: 'height_cm', op: 'min', value: { a: 178, b: null }, span: [17, 29], needs_confirmation: false, tier: 'client_gate' },
    { field: 'availability', op: null, value: [{ kind: 'window', from: null, to: null }], span: null, needs_confirmation: true, tier: 'operational' },
  ],
  set_aside: [{ text: 'scandinavian', reason: 'not_used_for_filtering' }],
  multi_role_notice: null,
};

describe('BriefUnderstanding', () => {
  test('loading state renders skeletons only', () => {
    const { container } = render(
      <BriefUnderstanding brief="" understanding={null} loading onAmend={() => {}} />,
    );
    expect(container.querySelectorAll('.bu-skeleton').length).toBeGreaterThan(0);
    expect(container.querySelector('.bu-chip')).toBeNull();
  });

  test('provenance underlines only the substrings with a span', () => {
    const { container } = render(
      <BriefUnderstanding brief={brief} understanding={understanding} loading={false} onAmend={() => {}} />,
    );
    const marks = container.querySelectorAll('.bu-brief-mark');
    // exactly one applied entry carries a span (height) → one underline over
    // the full constraint phrase; everything else is a literal gap
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('5\'10" and up');
  });

  test('renders a hard chip per applied constraint with its label', () => {
    render(
      <BriefUnderstanding brief={brief} understanding={understanding} loading={false} onAmend={() => {}} />,
    );
    expect(screen.getByText('Gender')).toBeInTheDocument();
    expect(screen.getByText('Height')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  test('needs_confirmation chip shows the text-level "check" flag', () => {
    const { container } = render(
      <BriefUnderstanding brief={brief} understanding={understanding} loading={false} onAmend={() => {}} />,
    );
    expect(container.querySelector('.bu-chip--check')).not.toBeNull();
    expect(screen.getByText('check')).toBeInTheDocument();
  });

  test('numeric chip edit re-queries with the spliced brief (authoritative)', () => {
    const onAmend = vi.fn();
    const { container } = render(
      <BriefUnderstanding brief={brief} understanding={understanding} loading={false} onAmend={onAmend} />,
    );
    // Click the Height chip to enter edit mode
    fireEvent.click(screen.getByText('Height').closest('.bu-chip'));
    const input = container.querySelector('.bu-chip-input');
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: '182' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onAmend).toHaveBeenCalledTimes(1);
    const amended = onAmend.mock.calls[0][0];
    expect(amended).toContain('182cm');
    expect(amended).not.toContain('5\'10"');
  });

  test('× removes a chip by amending the brief', () => {
    const onAmend = vi.fn();
    render(
      <BriefUnderstanding brief={brief} understanding={understanding} loading={false} onAmend={onAmend} />,
    );
    fireEvent.click(screen.getByLabelText('Remove Height'));
    expect(onAmend).toHaveBeenCalledTimes(1);
    expect(onAmend.mock.calls[0][0]).not.toContain('5\'10"');
  });

  test('disclosure reveals soft + set-aside terms', () => {
    render(
      <BriefUnderstanding brief={brief} understanding={understanding} loading={false} onAmend={() => {}} />,
    );
    // soft_query (1) + set_aside (1) = 2 terms
    fireEvent.click(screen.getByText(/Reading your brief — 2 terms/));
    expect(screen.getByText('clean editorial energy')).toBeInTheDocument();
    expect(screen.getByText('scandinavian')).toBeInTheDocument();
    expect(screen.getByText('not used for filtering')).toBeInTheDocument();
  });
});
