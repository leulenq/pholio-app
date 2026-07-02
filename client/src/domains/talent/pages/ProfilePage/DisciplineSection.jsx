import React from 'react';
import { Controller } from 'react-hook-form';
import PholioCustomSelect from '../../../../shared/components/ui/forms/PholioCustomSelect';
import { Section } from '../../components/profile-index';
import { BookingLanesControl } from './BookingLanesControl';
import { getLaneFitSignals } from './bookingLaneSignals';
import styles from './ProfilePage.module.css';

export function DisciplineSection({
  control,
  errors,
  watch,
}) {
  const disciplineValue = watch('discipline');
  const profileValues = watch();

  const disciplineOptions = [
    { value: 'Model', label: 'Model' },
    { value: 'Performer', label: 'Performer' },
    { value: 'Creator', label: 'Creator' },
  ];

  const statsTrackOptions = [
    { value: 'Womenswear', label: 'Womenswear' },
    { value: 'Menswear', label: 'Menswear' },
    { value: 'Ungendered', label: 'Ungendered' },
  ];

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
              options={disciplineOptions}
              value={field.value}
              onChange={field.onChange}
              error={errors.discipline}
              placeholder="Select your primary discipline"
            />
          )}
        />

        {disciplineValue === 'Model' && (
          <Controller
            name="stats_track"
            control={control}
            render={({ field }) => (
              <PholioCustomSelect
                label="Stats Track"
                id="stats_track"
                options={statsTrackOptions}
                value={field.value}
                onChange={field.onChange}
                error={errors.stats_track}
                placeholder="Select your stats track"
              />
            )}
          />
        )}
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
