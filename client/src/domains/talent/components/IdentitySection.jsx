import React from 'react';
import { Controller } from 'react-hook-form';
import { Sparkles } from 'lucide-react';
import { PholioInput, PholioTextarea, PholioToggle } from '../../../shared/components/ui/forms';
import PholioCustomSelect from '../../../shared/components/ui/forms/PholioCustomSelect';
import CityAutocompleteField from '../../../shared/components/ui/forms/CityAutocompleteField';
import { Section } from './Section';
import { computeAge, isMinorProfile } from '../../../shared/utils/talentAge';
import styles from '../pages/ProfilePage/ProfilePage.module.css';

/**
 * Identity Section
 * Personal details form section including name, city, DOB, gender, and bio
 */
export const IdentitySection = ({
  register,
  control,
  errors,
  bioValue = '',
  isImproving,
  improveMode,
  previousBio,
  onBioRefine,
  onBioGenerate,
  handleUndoAI,
  watchDob
}) => {
  const age = computeAge(watchDob);
  const isMinor = isMinorProfile({ date_of_birth: watchDob });
  const hasBio = (bioValue || '').trim().length >= 10;
  return (
    <Section
      id="identity"
      title="Personal Details"
      titleEmphasis="Details"
      description="Your core information visible to agencies."
      showDivider={false}
    >
      <div className={styles.formGrid2}>
        <PholioInput
          label="First Name"
          placeholder="Jane"
          error={errors.first_name}
          {...register('first_name')}
        />
        <PholioInput
          label="Last Name"
          placeholder="Doe"
          error={errors.last_name}
          {...register('last_name')}
        />
      </div>

      <div className={`${styles.formGrid2} ${styles.formRow}`}>
        <Controller
          name="city"
          control={control}
          render={({ field }) => (
            <CityAutocompleteField
              label="City"
              placeholder="Start typing — e.g. New York, USA"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.city}
            />
          )}
        />
        <Controller
          name="gender"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Gender"
              id="gender"
              options={[
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
                { value: 'Non-binary', label: 'Non-binary' },
                { value: 'Prefer not to say', label: 'Prefer not to say' }
              ]}
              value={field.value}
              onChange={field.onChange}
              error={errors.gender}
              placeholder="Select gender"
            />
          )}
        />
      </div>

      <div className={`${styles.formGrid2} ${styles.formRow}`}>
        <div style={{ position: 'relative' }}>
          <PholioInput
            label="Date of Birth"
            type="date"
            error={errors.date_of_birth}
            {...register('date_of_birth')}
          />
          {age !== null && (
            <span
              style={{
                position: 'absolute',
                right: '12px',
                top: '38px',
                fontSize: '13px',
                color: 'rgba(255,255,255,0.4)',
                pointerEvents: 'none'
              }}
            >
              {age} yrs
            </span>
          )}
        </div>
        <Controller
          name="pronouns"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Pronouns"
              id="pronouns"
              options={[
                { value: 'He/Him', label: 'He / Him' },
                { value: 'She/Her', label: 'She / Her' },
                { value: 'They/Them', label: 'They / Them' },
                { value: 'He/They', label: 'He / They' },
                { value: 'She/They', label: 'She / They' },
                { value: 'Prefer not to say', label: 'Prefer not to say' }
              ]}
              value={field.value}
              onChange={field.onChange}
              error={errors.pronouns}
              placeholder="Select pronouns"
            />
          )}
        />
      </div>

      {isMinor && (
        <div className={`${styles.formRow} ${styles.minorComplianceBlock}`}>
          <p className={styles.minorComplianceCopy}>
            Guardian consent is required before measurements or full-length photos can be collected or shared publicly.
          </p>
          <Controller
            name="guardian_consent_recorded"
            control={control}
            render={({ field }) => (
              <PholioToggle
                label="Guardian consent on file"
                checked={!!field.value}
                onChange={(event) => field.onChange(event.target.checked)}
              />
            )}
          />
          <Controller
            name="work_permit_on_file"
            control={control}
            render={({ field }) => (
              <PholioToggle
                label="Work permit on file"
                checked={!!field.value}
                onChange={(event) => field.onChange(event.target.checked)}
              />
            )}
          />
        </div>
      )}

      <div className={styles.formRow}>
        <div className={styles.bioHeader}>
          <p className={styles.bioKicker}>Bio</p>
          <div className={styles.bioTitleRow}>
            <h3 className={styles.bioTitle}>
              About <em>you</em>
            </h3>
            {hasBio ? (
              <button
                type="button"
                onClick={onBioRefine}
                disabled={isImproving}
                className={styles.bioRefineBtn}
              >
                <Sparkles size={11} className={isImproving ? styles.animateSpin : ''} />
                {isImproving && improveMode === 'refine' ? 'Refining…' : 'Refine'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onBioGenerate}
                disabled={isImproving}
                className={styles.bioRefineBtn}
              >
                <Sparkles size={11} className={isImproving ? styles.animateSpin : ''} />
                {isImproving && improveMode === 'generate' ? 'Generating…' : 'Generate'}
              </button>
            )}
          </div>
          <p className={styles.bioLede}>
            Tell agencies what makes you unique.
          </p>
        </div>
        <PholioTextarea
          label=""
          placeholder="Tell us about yourself, your passions, and what drives your career..."
          rows={6}
          error={errors.bio}
          {...register('bio')}
        />
        {previousBio && (
          <div className={styles.bioActions}>
            <button
              type="button"
              onClick={handleUndoAI}
              className={styles.bioUndoBtn}
            >
              Revert to original
            </button>
          </div>
        )}
      </div>
    </Section>
  );
};
