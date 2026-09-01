import React from 'react';
import {
  BOOKING_LANES,
  normalizeBookingLaneList,
  normalizeBookingLaneSlug,
} from '../../../../shared/constants/bookingLanes';
import styles from './ProfilePage.module.css';

export function BookingLanesControl({ primaryField, secondaryField, fitSignals = [] }) {
  const primaryLane = normalizeBookingLaneSlug(primaryField.value);
  const secondaryLanes = normalizeBookingLaneList(secondaryField.value)
    .filter((laneSlug) => laneSlug !== primaryLane)
    .slice(0, 3);

  const handlePrimaryChange = (laneSlug) => {
    primaryField.onChange(laneSlug);
    secondaryField.onChange(secondaryLanes.filter((current) => current !== laneSlug));
  };

  const handleSecondaryToggle = (laneSlug) => {
    if (laneSlug === primaryLane) return;
    if (secondaryLanes.includes(laneSlug)) {
      secondaryField.onChange(secondaryLanes.filter((current) => current !== laneSlug));
      return;
    }
    if (secondaryLanes.length >= 3) {
      secondaryField.onChange([...secondaryLanes.slice(1), laneSlug]);
      return;
    }
    secondaryField.onChange([...secondaryLanes, laneSlug]);
  };

  return (
    <div className={styles.bookingLanes}>
      <div className={styles.bookingLaneGroup}>
        <div className={styles.bookingLaneHead}>
          <h4>Primary Lane</h4>
          <span>Choose one</span>
        </div>
        <div
          className={styles.bookingLaneGrid}
          role="radiogroup"
          aria-label="Primary booking lane"
        >
          {BOOKING_LANES.map((lane) => {
            const isActive = primaryLane === lane.slug;
            return (
              <button
                key={lane.slug}
                type="button"
                data-button-exception="booking-lanes"
                role="radio"
                aria-checked={isActive}
                className={`${styles.bookingLaneOption} ${isActive ? styles.bookingLaneOptionActive : ''}`}
                onClick={() => handlePrimaryChange(lane.slug)}
              >
                <span className={styles.bookingLaneLabel}>{lane.label}</span>
                <span className={styles.bookingLaneDescription}>{lane.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.bookingLaneGroup}>
        <div className={styles.bookingLaneHead}>
          <h4>Secondary Lanes</h4>
          <span>{secondaryLanes.length}/3</span>
        </div>
        <div
          className={styles.bookingLaneSecondaryGrid}
          role="group"
          aria-label="Secondary booking lanes"
        >
          {BOOKING_LANES.map((lane) => {
            const isPrimary = primaryLane === lane.slug;
            const isActive = secondaryLanes.includes(lane.slug);
            return (
              <button
                key={lane.slug}
                type="button"
                data-button-exception="booking-lanes"
                aria-pressed={isActive}
                disabled={isPrimary}
                className={`${styles.bookingLaneMini} ${isActive ? styles.bookingLaneMiniActive : ''}`}
                onClick={() => handleSecondaryToggle(lane.slug)}
              >
                {lane.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.bookingLaneNote}>
        <p>
          Booking lanes are market routes. Special Skills remain separate: languages, movement,
          sports, instruments, licenses, and other capabilities.
        </p>
        {fitSignals.length > 0 ? (
          <div className={styles.bookingLaneSignal} aria-label="Pholio lane signal">
            <span>Pholio signal</span>
            <p>{fitSignals.map((item) => `${item.lane.label} ${item.score}`).join(' · ')}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
