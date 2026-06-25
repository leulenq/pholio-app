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
  {
    value: STATUS.SEEKING,
    label: 'Seeking representation',
    hint: 'Your profile can be routed to agencies and development boards.',
  },
  {
    value: STATUS.REPRESENTED,
    label: 'Represented',
    hint: 'Your current agency should be visible as the booking route.',
  },
  {
    value: STATUS.NOT_SEEKING,
    label: 'Direct bookings',
    hint: 'Inquiries should route directly through your profile contact.',
  }
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
      title="Agency representation"
      titleEmphasis="Agency"
      description="Set the booking path agencies should understand before they shortlist you."
      showDivider={false}
    >
      <div className={styles.repSurface}>
        <Controller
          name="representation_status"
          control={control}
          render={({ field }) => (
            <fieldset className={`${styles.repFieldset} ${styles.repPathGroup}`}>
              <legend className={styles.repLegend}>Representation status</legend>
              <div className={styles.repPathGrid} role="radiogroup" aria-label="Representation status">
                {OPTIONS.map((opt) => {
                  const isActive = field.value === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`${styles.repPathOption} ${isActive ? styles.repPathOptionActive : ''}`}
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
                      <span className={styles.repLabel}>
                        {opt.label}
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
          <div className={styles.repDetailGroup}>
            <PholioInput
              label="Agency name"
              placeholder="e.g. Elite Model Management"
              error={errors.current_agency}
              className={styles.repPremiumField}
              {...register('current_agency')}
            />
          </div>
        )}

        <div className={styles.repDetailGroup}>
          <PholioTextarea
            label="Previous representation"
            placeholder="List previous agencies or management, one per line"
            rows={3}
            className={styles.repPremiumField}
            {...register('previous_representations')}
          />
        </div>
      </div>
    </Section>
  );
};
