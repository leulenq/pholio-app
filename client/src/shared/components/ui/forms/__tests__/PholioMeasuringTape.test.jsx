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
});
