import React from 'react';
import { Controller } from 'react-hook-form';
import { PholioInput, PholioTextarea } from '../../../shared/components/ui/forms';
import PholioCustomSelect from '../../../shared/components/ui/forms/PholioCustomSelect';
import { Section } from './Section';
import styles from '../pages/ProfilePage/ProfilePage.module.css';

/**
 * Representation Section
 * Agency representation status and current agency information
 */
export const RepresentationSection = ({ register, control, errors, values }) => {
  return (
    <Section
      id="representation"
      title="Representation"
      description="Are you currently signed or looking for an agency?"
    >
      <div className={styles.formStack}>
        <Controller
          name="seeking_representation"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Representation Status"
              id="seeking_representation"
              options={[
                { value: true, label: 'Seeking Representation' },
                { value: false, label: 'Not Seeking / Represented' }
              ]}
              value={field.value}
              onChange={field.onChange}
              error={errors.seeking_representation}
              placeholder="Select status"
            />
          )}
        />
        {values.seeking_representation && (
          <PholioInput
            label="Current Agency (Optional)"
            placeholder="e.g. Elite Models"
            error={errors.current_agency}
            {...register('current_agency')}
          />
        )}
        <PholioTextarea
          label="Previous Representation"
          placeholder="List any previous agencies or management (one per line)..."
          rows={3}
          {...register('previous_representations')}
        />
      </div>
    </Section>
  );
};
