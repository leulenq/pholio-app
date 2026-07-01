import React from 'react';
import { Controller } from 'react-hook-form';
import PholioCustomSelect from '../../../../shared/components/ui/forms/PholioCustomSelect';
import PholioMultiSelect from '../../../../shared/components/ui/forms/PholioMultiSelect';
import { Section } from '../../components/profile-index';
import { BOOKING_LANES, normalizeBookingLaneSlug } from '../../../../shared/constants/bookingLanes';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import styles from './ProfilePage.module.css';

export function DisciplineSection({
  control,
  errors,
  watch,
  setValue,
}) {
  const disciplineValue = watch('discipline');
  const primaryLaneValue = watch('booking_primary_lane');
  const secondaryLanesValue = watch('booking_secondary_lanes') || [];

  // Build discipline options
  const disciplineOptions = [
    { value: 'Model', label: 'Model' },
    { value: 'Performer', label: 'Performer' },
    { value: 'Creator', label: 'Creator' },
  ];

  // Build stats track options (only shown for Model discipline)
  const statsTrackOptions = [
    { value: 'Womenswear', label: 'Womenswear' },
    { value: 'Menswear', label: 'Menswear' },
    { value: 'Ungendered', label: 'Ungendered' },
  ];

  // Filter booking lanes for selection
  const availableLanes = BOOKING_LANES.filter(lane => lane.slug !== primaryLaneValue);

  return (
    <Section
      id="discipline"
      title="Discipline & Focus"
      description="Your primary discipline and work interests."
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

      <div className={styles.formRow}>
        <div style={{ flex: 1 }}>
          <label className={styles.label} htmlFor="booking_primary_lane">
            Primary Work Interest
          </label>
          <Controller
            name="booking_primary_lane"
            control={control}
            render={({ field }) => (
              <PholioCustomSelect
                id="booking_primary_lane"
                options={BOOKING_LANES}
                value={field.value}
                onChange={(val) => {
                  field.onChange(val);
                  // Remove primary from secondary lanes if present
                  const updated = secondaryLanesValue.filter(lane => lane !== val);
                  setValue('booking_secondary_lanes', updated, { shouldDirty: true });
                }}
                error={errors.booking_primary_lane}
                placeholder="Select primary work interest"
              />
            )}
          />
        </div>
      </div>

      <div className={styles.formRow}>
        <div style={{ flex: 1 }}>
          <label className={styles.label} htmlFor="booking_secondary_lanes">
            Secondary Work Interests (up to 3)
          </label>
          <Controller
            name="booking_secondary_lanes"
            control={control}
            render={({ field }) => (
              <PholioMultiSelect
                id="booking_secondary_lanes"
                options={availableLanes}
                value={field.value}
                onChange={field.onChange}
                error={errors.booking_secondary_lanes}
                placeholder="Select secondary interests"
                maxItems={3}
              />
            )}
          />
        </div>
      </div>
    </Section>
  );
}
