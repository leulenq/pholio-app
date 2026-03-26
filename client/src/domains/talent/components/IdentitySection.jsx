import React from 'react';
import { Controller } from 'react-hook-form';
import { Sparkles } from 'lucide-react';
import { PholioInput, PholioTextarea } from '../../../shared/components/ui/forms';
import PholioCustomSelect from '../../../shared/components/ui/forms/PholioCustomSelect';
import CityAutocompleteField from '../../../shared/components/ui/forms/CityAutocompleteField';
import { Section } from './Section';
import styles from '../pages/ProfilePage/ProfilePage.module.css';

function computeAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age > 0 && age < 120 ? age : null;
}

/**
 * Identity Section
 * Personal details form section including name, city, DOB, gender, and bio
 */
export const IdentitySection = ({
  register,
  control,
  errors,
  isImproving,
  previousBio,
  handleAIImprove,
  handleUndoAI,
  watchDob
}) => {
  const age = computeAge(watchDob);
  return (
    <Section
      id="identity"
      title="Personal Details"
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

      <div className={styles.formRow}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderRow}>
            <h3 className={styles.sectionTitle} style={{ fontSize: '18px' }}>
              About You
            </h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              {previousBio && (
                <button
                  type="button"
                  onClick={handleUndoAI}
                  className={styles.aiButton}
                  style={{ borderColor: '#6B6B6B', color: '#6B6B6B' }}
                >
                  Undo
                </button>
              )}
              <button
                type="button"
                onClick={handleAIImprove}
                disabled={isImproving}
                className={styles.aiButton}
              >
                {isImproving ? (
                  <>
                    <Sparkles size={14} className={styles.animateSpin} />
                    Refining...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    AI Refine
                  </>
                )}
              </button>
            </div>
          </div>
          <p className={styles.sectionDescription}>Tell agencies what makes you unique.</p>
        </div>
        <PholioTextarea
          label=""
          placeholder="Tell us about yourself, your passions, and what drives your career..."
          rows={5}
          error={errors.bio}
          {...register('bio')}
        />
      </div>
    </Section>
  );
};
