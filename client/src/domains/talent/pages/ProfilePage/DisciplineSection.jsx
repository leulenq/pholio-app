import React from 'react';
import { Controller } from 'react-hook-form';
import PholioCustomSelect from '../../../../shared/components/ui/forms/PholioCustomSelect';
import { Section } from '../../components/profile-index';
import { BookingLanesControl } from './BookingLanesControl';
import { getLaneFitSignals } from './bookingLaneSignals';
import { STATS_TRACK_OPTIONS } from '../../../../shared/constants/statsTrack';
import styles from './ProfilePage.module.css';

// Stored lowercase — `profiles.discipline` defaults to "model" (migration
// 20260701100100) and the server enum is ["model","performer","creator"].
// Title-cased values here 400'd the entire profile save and left the select
// showing its placeholder for every existing profile.
const DISCIPLINE_OPTIONS = [
  { value: 'model', label: 'Model' },
  { value: 'performer', label: 'Performer' },
  { value: 'creator', label: 'Creator' },
];

export function DisciplineSection({
  control,
  errors,
  watch,
}) {
  const profileValues = watch();

  return (
    <Section
      id="discipline"
      title="Discipline & Focus"
      titleEmphasis="Focus"
      description="Choose your primary discipline (and track, when relevant). This shapes which fields you see and how agencies filter you."
      showDivider={false}
    >
      <div className={`${styles.formGrid2} ${styles.formRow}`}>
        <Controller
          name="discipline"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Primary Discipline"
              id="discipline"
              options={DISCIPLINE_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              error={errors.discipline}
              placeholder="Select your primary discipline"
            />
          )}
        />

        {/* Shown for every discipline. Gating this on "model" left performers
            and creators with no way to change track, so they were stuck on the
            womenswear fallback with no control to correct it. */}
        <Controller
          name="stats_track"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Stats Track"
              id="stats_track"
              options={STATS_TRACK_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              error={errors.stats_track}
              placeholder="Select your stats track"
            />
          )}
        />
      </div>

      <div className={styles.bookingLaneSection}>
        <Controller
          name="booking_primary_lane"
          control={control}
          render={({ field: primaryField }) => (
            <Controller
              name="booking_secondary_lanes"
              control={control}
              render={({ field: secondaryField }) => (
                <BookingLanesControl
                  primaryField={primaryField}
                  secondaryField={secondaryField}
                  fitSignals={getLaneFitSignals(profileValues)}
                />
              )}
            />
          )}
        />
      </div>
    </Section>
  );
}
