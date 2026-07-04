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
  bioValue,
  isImproving,
  improveMode,
  previousBio,
  bioOptions,
  onBioOptionsChange,
  onBioRefine,
  onBioGenerate,
  handleUndoAI,
  watchDob,
  guardianStatus,
  onSendGuardianLink,
  guardianSending,
  guardianLinkSent,
  guardianSentTo,
}) {
  return (
    <>
      <PersonalDetailsFields
        register={register}
        control={control}
        errors={errors}
        bioValue={bioValue}
        isImproving={isImproving}
        improveMode={improveMode}
        previousBio={previousBio}
        bioOptions={bioOptions}
        onBioOptionsChange={onBioOptionsChange}
        onBioRefine={onBioRefine}
        onBioGenerate={onBioGenerate}
        handleUndoAI={handleUndoAI}
        watchDob={watchDob}
        guardianStatus={guardianStatus}
        onSendGuardianLink={onSendGuardianLink}
        guardianSending={guardianSending}
        guardianLinkSent={guardianLinkSent}
        guardianSentTo={guardianSentTo}
      />
    </>
  );
}
