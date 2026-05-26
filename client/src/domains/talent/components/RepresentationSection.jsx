import React from 'react';
import { Controller } from 'react-hook-form';
import { PholioInput, PholioTextarea } from '../../../shared/components/ui/forms';
import { Section } from './Section';
import styles from '../pages/ProfilePage/ProfilePage.module.css';

const STATUS = {
  SEEKING: 'seeking',
  REPRESENTED: 'represented',
  NOT_SEEKING: 'not_seeking'
};

const OPTIONS = [
  { value: STATUS.SEEKING, num: '01', label: 'Seeking', hint: 'Open to representation' },
  { value: STATUS.REPRESENTED, num: '02', label: 'Represented', hint: 'Currently signed' },
  { value: STATUS.NOT_SEEKING, num: '03', label: 'Not seeking', hint: 'Freelance / independent' }
];

/**
 * Representation Section
 * Tri-state status (seeking / represented / not seeking) mapped to seeking_representation + current_agency on save.
 */
export const RepresentationSection = ({ register, control, errors, setValue, watch }) => {
  const representationStatus = watch('representation_status');

  const applyStatus = (next) => {
    setValue('representation_status', next, { shouldDirty: true, shouldValidate: true });
    if (next === STATUS.SEEKING) {
      setValue('seeking_representation', true, { shouldDirty: true });
      setValue('current_agency', null, { shouldDirty: true });
    } else if (next === STATUS.REPRESENTED) {
      setValue('seeking_representation', false, { shouldDirty: true });
    } else {
      setValue('seeking_representation', false, { shouldDirty: true });
      setValue('current_agency', null, { shouldDirty: true });
    }
  };

  return (
    <Section
      id="representation"
      kicker="Agency"
      title="Agency Representation"
      titleEmphasis="Agency"
      description="Tell agencies whether you're signed, looking, or not seeking representation."
      showDivider={false}
    >
      <div className={styles.formStack}>
        <Controller
          name="representation_status"
          control={control}
          render={({ field }) => (
            <fieldset className={styles.repFieldset}>
              <legend className={styles.repLegend}>Status</legend>
              <div className={styles.repOptions} role="radiogroup" aria-label="Representation status">
                {OPTIONS.map((opt) => {
                  const isActive = field.value === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`${styles.repOption} ${isActive ? styles.repOptionActive : ''}`}
                    >
                      <input
                        type="radio"
                        name={field.name}
                        value={opt.value}
                        checked={isActive}
                        onChange={() => applyStatus(opt.value)}
                        onBlur={field.onBlur}
                        className={styles.repRadioHidden}
                      />
                      <span className={styles.repNum}>{opt.num}</span>
                      <span className={styles.repLabel}>
                        {isActive ? <em>{opt.label}</em> : opt.label}
                      </span>
                      <span className={styles.repHint}>{opt.hint}</span>
                    </label>
                  );
                })}
              </div>
              {errors.representation_status && (
                <p className={styles.repError} role="alert">
                  {errors.representation_status.message}
                </p>
              )}
            </fieldset>
          )}
        />

        {representationStatus === STATUS.REPRESENTED && (
          <PholioInput
            label="Current agency"
            placeholder="e.g. Elite Model Management"
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
