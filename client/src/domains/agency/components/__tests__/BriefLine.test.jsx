import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BriefLine from '../BriefLine';

const brief = 'black women 5\'9" and up in nyc';

// spans follow the brief above: height at [12, 23], location at [27, 30]
const filters = [
  {
    id: 'gender_presentation', field: 'gender_presentation', op: null,
    value: ['female'], text: 'Women', span: null,
    editable: null, unit: null, edit_value: null,
  },
  {
    id: 'height_cm', field: 'height_cm', op: 'min',
    value: { a: 175, b: null }, text: '5\'9" and up', span: [12, 23],
    editable: 'number', unit: 'cm', edit_value: '175',
  },
  {
    id: 'location', field: 'location', op: null,
    value: 'new-york', text: 'New York', span: [27, 30],
    editable: null, unit: null, edit_value: null,
  },
  {
    id: 'availability', field: 'availability', op: null,
    value: [], text: 'Available Jul 9 to 14', span: null,
    editable: 'date', unit: null, edit_value: null,
  },
];

const roles = [
  { index: 0, label: 'role 1', count: 3, summary: 'Women, 5\'9" and up, New York' },
  { index: 1, label: 'role 2', count: 1, summary: 'Man, 40s' },
];

describe('BriefLine', () => {
  test('loading renders one shimmer line and no phrases', () => {
    const { container } = render(<BriefLine loading brief="" filters={[]} onAmend={() => {}} />);
    expect(container.querySelectorAll('.bl-shimmer').length).toBe(1);
    expect(container.querySelector('.bl-phrase')).toBeNull();
  });

  test('renders one sentence with a phrase per filter and no boxes', () => {
    const { container } = render(
      <BriefLine brief={brief} filters={filters} notes={[]} roles={[]} onAmend={() => {}} />,
    );
    expect(container.querySelectorAll('.bl-phrase').length).toBe(4);
    expect(container.querySelector('.bl-line').textContent).toContain('Showing');
    expect(screen.getByText('Women')).toBeInTheDocument();
    expect(screen.getByText('5\'9" and up')).toBeInTheDocument();
    expect(screen.getByText('New York')).toBeInTheDocument();
    // no chips, no field labels, no confidence flag
    expect(container.querySelector('.sf-chip')).toBeNull();
    expect(screen.queryByText(/height/i)).toBeNull();
    expect(screen.queryByText(/check/i)).toBeNull();
  });

  test('notes render beneath the line as plain sentences', () => {
    render(
      <BriefLine
        brief={brief}
        filters={filters}
        notes={["Union status isn't listed on any profile yet.", 'Second note.', 'Third note.']}
        roles={[]}
        onAmend={() => {}}
      />,
    );
    expect(screen.getByText("Union status isn't listed on any profile yet.")).toBeInTheDocument();
    // at most two
    expect(screen.queryByText('Third note.')).toBeNull();
  });

  test('a numeric phrase edits inline and re-queries with the spliced brief', () => {
    const onAmend = vi.fn();
    const { container } = render(
      <BriefLine brief={brief} filters={filters} notes={[]} roles={[]} onAmend={onAmend} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit 5\'9" and up' }));
    const input = container.querySelector('.bl-input');
    expect(input).not.toBeNull();
    expect(input.value).toBe('175');
    expect(container.querySelector('.bl-unit').textContent).toBe('cm');
    fireEvent.change(input, { target: { value: '178' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onAmend).toHaveBeenCalledTimes(1);
    expect(onAmend.mock.calls[0][0]).toBe('black women 178cm and up in nyc');
  });

  test('Escape reverts a numeric edit without re-querying', () => {
    const onAmend = vi.fn();
    const { container } = render(
      <BriefLine brief={brief} filters={filters} notes={[]} roles={[]} onAmend={onAmend} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit 5\'9" and up' }));
    const input = container.querySelector('.bl-input');
    fireEvent.change(input, { target: { value: '190' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);

    expect(onAmend).not.toHaveBeenCalled();
    expect(screen.getByText('5\'9" and up')).toBeInTheDocument();
  });

  test('a numeric phrase commits on blur', () => {
    const onAmend = vi.fn();
    const { container } = render(
      <BriefLine brief={brief} filters={filters} notes={[]} roles={[]} onAmend={onAmend} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit 5\'9" and up' }));
    const input = container.querySelector('.bl-input');
    fireEvent.change(input, { target: { value: '180' } });
    fireEvent.blur(input);

    expect(onAmend).toHaveBeenCalledTimes(1);
    expect(onAmend.mock.calls[0][0]).toBe('black women 180cm and up in nyc');
  });

  test('a date phrase opens two native date inputs inline', () => {
    const { container } = render(
      <BriefLine brief={brief} filters={filters} notes={[]} roles={[]} onAmend={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit Available Jul 9 to 14' }));
    expect(container.querySelectorAll('.bl-date').length).toBe(2);
  });

  test('× removes one requirement by amending the brief', () => {
    const onAmend = vi.fn();
    render(
      <BriefLine brief={brief} filters={filters} notes={[]} roles={[]} onAmend={onAmend} />,
    );
    fireEvent.click(screen.getByLabelText('Remove 5\'9" and up'));
    expect(onAmend).toHaveBeenCalledTimes(1);
    expect(onAmend.mock.calls[0][0]).not.toContain('5\'9"');
  });

  test('every phrase carries its own remove control', () => {
    render(<BriefLine brief={brief} filters={filters} notes={[]} roles={[]} onAmend={() => {}} />);
    expect(screen.getByLabelText('Remove Women')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove New York')).toBeInTheDocument();
  });

  test('the role line only appears for more than one role', () => {
    const { container, rerender } = render(
      <BriefLine brief={brief} filters={filters} notes={[]} roles={[roles[0]]} onAmend={() => {}} />,
    );
    expect(container.querySelector('.bl-roles')).toBeNull();

    const onRoleChange = vi.fn();
    rerender(
      <BriefLine
        brief={brief} filters={filters} notes={[]} roles={roles} role={0}
        onAmend={() => {}} onRoleChange={onRoleChange}
      />,
    );
    const buttons = container.querySelectorAll('.bl-role');
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].className).toContain('bl-role--on');
    fireEvent.click(screen.getByText('Man, 40s'));
    expect(onRoleChange).toHaveBeenCalledWith(1);
  });

  test('renders nothing when there is no filter, note or second role', () => {
    const { container } = render(
      <BriefLine brief={brief} filters={[]} notes={[]} roles={[]} onAmend={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders no Showing line when a brief ran with zero filters', () => {
    const { container } = render(
      <BriefLine
        brief={brief}
        filters={[]}
        notes={['Skin tone is not a profile field, so it was not used.']}
        roles={[]}
        onAmend={() => {}}
      />,
    );
    expect(container.querySelector('.bl-line')).toBeNull();
    expect(container.querySelectorAll('.bl-note').length).toBe(1);
  });
});
