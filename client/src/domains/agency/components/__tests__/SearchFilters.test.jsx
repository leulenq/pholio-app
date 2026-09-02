import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchFilters from '../SearchFilters';

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

describe('SearchFilters', () => {
  test('loading state renders skeleton chips only', () => {
    const { container } = render(<SearchFilters loading brief="" filters={[]} onAmend={() => {}} />);
    expect(container.querySelectorAll('.sf-skeleton').length).toBeGreaterThan(0);
    expect(container.querySelector('.sf-chip')).toBeNull();
  });

  test('renders one chip per filter, showing the server text only', () => {
    const { container } = render(
      <SearchFilters brief={brief} filters={filters} notes={[]} roles={[]} onAmend={() => {}} />,
    );
    expect(container.querySelectorAll('.sf-chip').length).toBe(4);
    expect(screen.getByText('Women')).toBeInTheDocument();
    expect(screen.getByText('5\'9" and up')).toBeInTheDocument();
    expect(screen.getByText('New York')).toBeInTheDocument();
    // no field labels, no provenance, no confidence flag
    expect(screen.queryByText(/height/i)).toBeNull();
    expect(screen.queryByText(/check/i)).toBeNull();
    expect(container.querySelector('.bu-brief-mark')).toBeNull();
  });

  test('notes render as plain lines beneath the strip', () => {
    render(
      <SearchFilters
        brief={brief}
        filters={filters}
        notes={["Union status isn't listed on any profile yet."]}
        roles={[]}
        onAmend={() => {}}
      />,
    );
    expect(screen.getByText("Union status isn't listed on any profile yet.")).toBeInTheDocument();
  });

  test('numeric chip edits in place and re-queries with the spliced brief', () => {
    const onAmend = vi.fn();
    const { container } = render(
      <SearchFilters brief={brief} filters={filters} notes={[]} roles={[]} onAmend={onAmend} />,
    );
    fireEvent.click(screen.getByText('5\'9" and up').closest('.sf-chip'));
    const input = container.querySelector('.sf-chip-input');
    expect(input).not.toBeNull();
    expect(input.value).toBe('175');
    fireEvent.change(input, { target: { value: '178' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onAmend).toHaveBeenCalledTimes(1);
    expect(onAmend.mock.calls[0][0]).toBe('black women 178cm and up in nyc');
  });

  test('Escape reverts a numeric edit without re-querying', () => {
    const onAmend = vi.fn();
    const { container } = render(
      <SearchFilters brief={brief} filters={filters} notes={[]} roles={[]} onAmend={onAmend} />,
    );
    fireEvent.click(screen.getByText('5\'9" and up').closest('.sf-chip'));
    const input = container.querySelector('.sf-chip-input');
    fireEvent.change(input, { target: { value: '190' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onAmend).not.toHaveBeenCalled();
    expect(screen.getByText('5\'9" and up')).toBeInTheDocument();
  });

  test('date chip opens two date inputs', () => {
    const { container } = render(
      <SearchFilters brief={brief} filters={filters} notes={[]} roles={[]} onAmend={() => {}} />,
    );
    fireEvent.click(screen.getByText('Available Jul 9 to 14').closest('.sf-chip'));
    expect(container.querySelectorAll('.sf-chip-date').length).toBe(2);
  });

  test('× removes a filter by amending the brief', () => {
    const onAmend = vi.fn();
    render(
      <SearchFilters brief={brief} filters={filters} notes={[]} roles={[]} onAmend={onAmend} />,
    );
    fireEvent.click(screen.getByLabelText('Remove 5\'9" and up'));
    expect(onAmend).toHaveBeenCalledTimes(1);
    expect(onAmend.mock.calls[0][0]).not.toContain('5\'9"');
  });

  test('role switcher only appears for more than one role', () => {
    const { container, rerender } = render(
      <SearchFilters brief={brief} filters={filters} notes={[]} roles={[roles[0]]} onAmend={() => {}} />,
    );
    expect(container.querySelector('.sf-roles')).toBeNull();

    const onRoleChange = vi.fn();
    rerender(
      <SearchFilters
        brief={brief} filters={filters} notes={[]} roles={roles} role={0}
        onAmend={() => {}} onRoleChange={onRoleChange}
      />,
    );
    const buttons = container.querySelectorAll('.sf-role');
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByText('Man, 40s'));
    expect(onRoleChange).toHaveBeenCalledWith(1);
  });

  test('renders nothing when there is no filter, note or second role', () => {
    const { container } = render(
      <SearchFilters brief={brief} filters={[]} notes={[]} roles={[]} onAmend={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
