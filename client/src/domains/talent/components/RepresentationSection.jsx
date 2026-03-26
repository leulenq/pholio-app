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
      title="Representation"
      description="Tell agencies whether you’re signed, looking, or not seeking representation."
    >
      <div className={styles.formStack}>
        <Controller
          name="representation_status"
          control={control}
          render={({ field }) => (
            <fieldset className={styles.representationFieldset}>
              <legend className={styles.representationLegend}>Representation status</legend>
              <div className={styles.representationRadios} role="radiogroup" aria-label="Representation status">
                {[
                  { value: STATUS.SEEKING, label: 'Seeking representation', hint: 'Open to signing with an agency' },
                  { value: STATUS.REPRESENTED, label: 'Currently represented', hint: 'Signed with an agency now' },
                  { value: STATUS.NOT_SEEKING, label: 'Not seeking', hint: 'Freelance or not looking for an agency' }
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`${styles.representationRadioCard} ${
                      field.value === opt.value ? styles.representationRadioCardActive : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name={field.name}
                      value={opt.value}
                      checked={field.value === opt.value}
                      onChange={() => applyStatus(opt.value)}
                      onBlur={field.onBlur}
                      className={styles.representationRadioInput}
                    />
                    <span className={styles.representationRadioText}>
                      <span className={styles.representationRadioTitle}>{opt.label}</span>
                      <span className={styles.representationRadioHint}>{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.representation_status && (
                <p className={styles.representationError} role="alert">
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
