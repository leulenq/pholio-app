import React from 'react';
import { Controller } from 'react-hook-form';
import PholioMultiSelect from '../../../../shared/components/ui/forms/PholioMultiSelect';
import CityAutocompleteField from '../../../../shared/components/ui/forms/CityAutocompleteField';
import CountrySelectField from '../../../../shared/components/ui/forms/CountrySelectField';
import { Section } from '../../components/Section';
import { IdentitySection as PersonalDetailsFields } from '../../components/profile-index';
import styles from './ProfilePage.module.css';

const ETHNICITY_OPTIONS = [
  { value: 'Black/African Descent', label: 'Black / African Descent' },
  { value: 'East Asian', label: 'East Asian' },
  { value: 'South Asian', label: 'South Asian' },
  { value: 'Southeast Asian', label: 'Southeast Asian' },
  { value: 'Hispanic/Latino', label: 'Hispanic / Latino' },
  { value: 'Middle Eastern', label: 'Middle Eastern' },
  { value: 'Native American/First Nations', label: 'Native American / First Nations' },
  { value: 'Pacific Islander', label: 'Pacific Islander' },
  { value: 'White/Caucasian', label: 'White / Caucasian' },
  { value: 'Mixed Heritage', label: 'Mixed Heritage' }
];

/**
 * Profile page identity block: core personal details + heritage & background.
 */
export function IdentitySection({
  register,
  control,
  errors,
  isImproving,
  previousBio,
  handleAIImprove,
  handleUndoAI,
  watchDob
}) {
  return (
    <>
      <PersonalDetailsFields
        register={register}
        control={control}
        errors={errors}
        isImproving={isImproving}
        previousBio={previousBio}
        handleAIImprove={handleAIImprove}
        handleUndoAI={handleUndoAI}
        watchDob={watchDob}
      />

      <Section id="heritage" title="Heritage & Background" description="Helps match you with diverse casting calls.">
        <div className={styles.formRow}>
          <Controller
            name="ethnicity"
            control={control}
            render={({ field }) => (
              <PholioMultiSelect
                label="Ethnicity / Heritage"
                id="ethnicity"
                options={ETHNICITY_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                error={errors.ethnicity}
                placeholder="Select ethnicity (multi-select)"
              />
            )}
          />
        </div>
        <div className={`${styles.formGrid2} ${styles.formRow}`}>
          <Controller
            name="nationality"
            control={control}
            render={({ field }) => (
              <CountrySelectField
                label="Nationality"
                placeholder="Choose or type (e.g. American, dual citizenship…)"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.nationality}
              />
            )}
          />
          <Controller
            name="place_of_birth"
            control={control}
            render={({ field }) => (
              <CityAutocompleteField
                label="Place of Birth"
                placeholder="City, country"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.place_of_birth}
              />
            )}
          />
        </div>
        <div className={`${styles.formGrid2} ${styles.formRow}`}>
          <Controller
            name="city_secondary"
            control={control}
            render={({ field }) => (
              <CityAutocompleteField
                label="Secondary City"
                placeholder="Also based in…"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.city_secondary}
              />
            )}
          />
        </div>
      </Section>
    </>
  );
}
