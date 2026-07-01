import React from 'react';
import { Controller } from 'react-hook-form';
import { Sparkles } from 'lucide-react';
import { PholioInput, PholioTextarea, PholioToggle } from '../../../shared/components/ui/forms';
import PholioButton, {
  PholioToggleButton,
  PholioToggleGroup,
} from '../../../shared/components/ui/PholioButton';
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
  const hasBio = (bioValue || '').trim().length >= 10;
  const bioLength = bioOptions?.length === 'tight' ? 'tight' : 'standard';
  const bioPerson = bioOptions?.person === 'first' ? 'first' : 'third';
  const setBioOption = (patch) => {
    if (onBioOptionsChange) {
      onBioOptionsChange({ length: bioLength, person: bioPerson, ...patch });
    }
  };
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
        <div className={styles.bioHeader}>
          <p className={styles.bioKicker}>Bio</p>
          <div className={styles.bioTitleRow}>
            <h3 className={styles.bioTitle}>
              About <em>you</em>
            </h3>
            {hasBio ? (
              <PholioButton
                type="button"
                variant="secondary"
                onClick={onBioRefine}
                disabled={isImproving}
                className={styles.bioRefineBtn}
              >
                <Sparkles size={11} className={isImproving ? styles.animateSpin : ''} />
                {isImproving && improveMode === 'refine' ? 'Refining…' : 'Refine'}
              </PholioButton>
            ) : (
              <PholioButton
                type="button"
                variant="primary"
                onClick={onBioGenerate}
                disabled={isImproving}
                className={styles.bioRefineBtn}
              >
                <Sparkles size={11} className={isImproving ? styles.animateSpin : ''} />
                {isImproving && improveMode === 'generate' ? 'Generating…' : 'Generate'}
              </PholioButton>
            )}
          </div>
          <p className={styles.bioLede}>
            Tell agencies what makes you unique.
          </p>
          <div className={styles.bioModeControls}>
            <div
              className={styles.bioModeGroup}
              role="group"
              aria-label="Bio length"
            >
              <span className={styles.bioModeLabel}>Length</span>
              <PholioToggleGroup className={styles.bioModeOptions}>
                <PholioToggleButton
                  type="button"
                  onClick={() => setBioOption({ length: 'tight' })}
                  disabled={isImproving}
                  aria-pressed={bioLength === 'tight'}
                  active={bioLength === 'tight'}
                  className={`${styles.bioModeBtn} ${bioLength === 'tight' ? styles.bioModeBtnActive : ''}`}
                >
                  Tight
                </PholioToggleButton>
                <PholioToggleButton
                  type="button"
                  onClick={() => setBioOption({ length: 'standard' })}
                  disabled={isImproving}
                  aria-pressed={bioLength === 'standard'}
                  active={bioLength === 'standard'}
                  className={`${styles.bioModeBtn} ${bioLength === 'standard' ? styles.bioModeBtnActive : ''}`}
                >
                  Standard
                </PholioToggleButton>
              </PholioToggleGroup>
            </div>
            <div
              className={styles.bioModeGroup}
              role="group"
              aria-label="Bio voice"
            >
              <span className={styles.bioModeLabel}>Voice</span>
              <PholioToggleGroup className={styles.bioModeOptions}>
                <PholioToggleButton
                  type="button"
                  onClick={() => setBioOption({ person: 'third' })}
                  disabled={isImproving}
                  aria-pressed={bioPerson === 'third'}
                  active={bioPerson === 'third'}
                  className={`${styles.bioModeBtn} ${bioPerson === 'third' ? styles.bioModeBtnActive : ''}`}
                >
                  Agency
                </PholioToggleButton>
                <PholioToggleButton
                  type="button"
                  onClick={() => setBioOption({ person: 'first' })}
                  disabled={isImproving}
                  aria-pressed={bioPerson === 'first'}
                  active={bioPerson === 'first'}
                  className={`${styles.bioModeBtn} ${bioPerson === 'first' ? styles.bioModeBtnActive : ''}`}
                >
                  Personal
                </PholioToggleButton>
              </PholioToggleGroup>
            </div>
          </div>
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
            <PholioButton
              type="button"
              variant="tertiary"
              onClick={handleUndoAI}
              className={styles.bioUndoBtn}
            >
              Revert to original
            </PholioButton>
          </div>
        )}
      </div>
    </Section>
  );
};
