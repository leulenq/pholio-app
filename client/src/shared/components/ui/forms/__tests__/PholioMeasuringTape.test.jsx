import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import PholioMeasuringTape from '../PholioMeasuringTape';
import styles from '../PholioMeasuringTape.module.css';

describe('PholioMeasuringTape', () => {
  test('does not emit an edit while synchronizing a numeric string value', () => {
    const onChange = vi.fn();

    render(
      <PholioMeasuringTape
        aria-label="Weight"
        value="57.00"
        onChange={onChange}
        min={30}
        max={150}
        unit="kg"
      />,
    );

    const tape = screen
      .getByRole('slider', { name: 'Weight' })
      .querySelector(`.${styles.tapeContainer}`);

    fireEvent.scroll(tape);

    expect(onChange).not.toHaveBeenCalled();
  });

  test('ignores programmatic positioning for an empty value but records user scrolling', () => {
    const onChange = vi.fn();

    render(
      <PholioMeasuringTape
        aria-label="Weight"
        value=""
        onChange={onChange}
        min={30}
        max={150}
        unit="kg"
      />,
    );

    const tape = screen
      .getByRole('slider', { name: 'Weight' })
      .querySelector(`.${styles.tapeContainer}`);

    fireEvent.scroll(tape);
    expect(onChange).not.toHaveBeenCalled();

    tape.scrollLeft += 10;
    fireEvent.scroll(tape);

    expect(onChange).toHaveBeenCalledWith(91);
  });

  test('commits half-inch circumference edits without interpreting them as height', () => {
    const onChange = vi.fn();

    render(
      <PholioMeasuringTape
        aria-label="Waist circumference"
        value={33}
        onChange={onChange}
        min={8}
        max={100}
        step={0.5}
        majorStep={2}
        unit="in"
      />,
    );

    fireEvent.click(screen.getByText('33'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '33.5' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(33.5);
  });

  test('keeps feet-and-inches parsing opt-in for the height tape', () => {
    const onChange = vi.fn();

    render(
      <PholioMeasuringTape
        aria-label="Height"
        value={70}
        onChange={onChange}
        min={50}
        max={90}
        unit="in"
        allowFeetInches
      />,
    );

    fireEvent.click(screen.getByText('70'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: `5'11"` } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(71);
  });

  test('keeps a widened empty tape at its explicit resting value', () => {
    const onChange = vi.fn();

    render(
      <PholioMeasuringTape
        aria-label="Chest circumference"
        value=""
        onChange={onChange}
        min={8}
        max={100}
        step={0.5}
        unsetValue={39.5}
        unit="in"
      />,
    );

    const tape = screen
      .getByRole('slider', { name: 'Chest circumference' })
      .querySelector(`.${styles.tapeContainer}`);

    fireEvent.scroll(tape);
    expect(onChange).not.toHaveBeenCalled();

    tape.scrollLeft += 8;
    fireEvent.scroll(tape);

    expect(onChange).toHaveBeenCalledWith(40);
  });

  test('uses one padded scale instead of browser-dependent flex spacers', () => {
    render(
      <PholioMeasuringTape
        aria-label="Weight"
        value={150}
        onChange={vi.fn()}
        min={30}
        max={150}
        unit="kg"
      />,
    );

    const slider = screen.getByRole('slider', { name: 'Weight' });
    const tape = slider.querySelector(`.${styles.tapeContainer}`);
    const scale = slider.querySelector(`.${styles.scale}`);

    expect(tape.children).toHaveLength(1);
    expect(tape.firstElementChild).toBe(scale);
    expect(scale).toHaveStyle({ '--tape-tick-width': '10px' });
  });
});
