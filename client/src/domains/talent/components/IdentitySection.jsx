import React from 'react';
import { Controller } from 'react-hook-form';
import { PholioInput, PholioToggle } from '../../../shared/components/ui/forms';
import PholioButton from '../../../shared/components/ui/PholioButton';
import PholioCustomSelect from '../../../shared/components/ui/forms/PholioCustomSelect';
import CityAutocompleteField from '../../../shared/components/ui/forms/CityAutocompleteField';
import { Section } from './Section';
import BioWriter from './BioWriter/BioWriter';
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
  previousBio,
  bioOptions = { length: 'standard', person: 'third' },
  onBioOptionsChange,
  onBioRefine,
  onBioGenerate,
  handleUndoAI,
  watchDob,
  guardianStatus = 'none',
  onSendGuardianLink,
  guardianSending = false,
  guardianLinkSent = false,
  guardianSentTo = '',
}) => {
  const age = computeAge(watchDob);
  const isMinor = isMinorProfile({ date_of_birth: watchDob });
  return (
    <Section
      id="identity"
      title="Personal Details"
      titleEmphasis="Details"
      description="What agencies see first: name, bases, age, and your written bio. Keep this current — it influences search and how you’re introduced."
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
              label="Primary Base"
              placeholder="Start typing — e.g. New York, USA"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.city}
            />
          )}
        />
        <Controller
          name="city_secondary"
          control={control}
          render={({ field }) => (
            <CityAutocompleteField
              label="Secondary Base"
              placeholder="Also based in…"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.city_secondary}
            />
          )}
        />
      </div>

      <div className={`${styles.formGrid2} ${styles.formRow}`}>
        <Controller
          name="gender"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Gender"
              id="gender"
              // Values must match CANONICAL_GENDERS in src/shared/lib/gender.js
              // — a value with no matching option renders as the placeholder,
              // which is how mis-cased legacy rows looked blank here.
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

      <div className={`${styles.formGrid2} ${styles.formRow}`}>
        <div className={styles.dobField}>
          <PholioInput
            label="Date of Birth"
            type="date"
            error={errors.date_of_birth}
            {...register('date_of_birth')}
          />
          {age !== null && (
            <span className={styles.dobAge}>
              {age} {age === 1 ? 'year' : 'years'}
            </span>
          )}
        </div>
      </div>

      {isMinor && (
        <div className={`${styles.formRow} ${styles.minorComplianceBlock}`}>
          <p className={styles.minorComplianceCopy}>
            Because this talent is under 18, a parent or legal guardian must verify
            consent before measurements or full-length photos can be collected or
            shared publicly. We email the guardian a secure, one-time link.
          </p>

          {guardianStatus === 'verified' ? (
            <p className={styles.guardianConsentStatus}>
              Guardian consent: <strong>Verified</strong>
            </p>
          ) : (
            <>
              <div className={styles.guardianConsentRow}>
                <PholioInput
                  label="Guardian email"
                  type="email"
                  placeholder="parent@example.com"
                  error={errors.guardian_email}
                  {...register('guardian_email')}
                />
                <PholioButton
                  type="button"
                  variant="secondary"
                  className={styles.guardianConsentBtn}
                  onClick={() => {
                    if (typeof onSendGuardianLink !== 'function') return;
                    void onSendGuardianLink();
                  }}
                  disabled={guardianSending || typeof onSendGuardianLink !== 'function'}
                >
                  {guardianSending
                    ? 'Sending…'
                    : guardianStatus === 'pending'
                      ? 'Resend verification link'
                      : 'Send verification link'}
                </PholioButton>
              </div>
              {guardianLinkSent && (
                <p className={styles.guardianConsentSent} role="status">
                  Verification link sent to{' '}
                  <strong>{guardianSentTo || 'the guardian'}</strong>. Ask them to
                  check their inbox and spam folder — the link expires in 7 days.
                </p>
              )}
              <p className={styles.guardianConsentStatus}>
                Guardian consent:{' '}
                <strong>
                  {guardianStatus === 'pending'
                    ? 'Pending — awaiting guardian'
                    : 'Not yet requested'}
                </strong>
              </p>
            </>
          )}

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
        <BioWriter
          field={register('bio')}
          error={errors.bio}
          value={bioValue}
          isWorking={!!isImproving}
          options={bioOptions}
          onOptionsChange={onBioOptionsChange}
          onWrite={onBioGenerate}
          onRefine={onBioRefine}
          previousBio={previousBio}
          onRevert={handleUndoAI}
        />
      </div>
    </Section>
  );
};
