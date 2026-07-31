import React from 'react';
import { Controller } from 'react-hook-form';
import { PholioInput } from '../../../../shared/components/ui/forms';
import PholioMeasuringTape from '../../../../shared/components/ui/forms/PholioMeasuringTape';
import PholioCustomSelect from '../../../../shared/components/ui/forms/PholioCustomSelect';
import { Section } from '../../components/profile-index';
import { getShoeConversions } from '../../../../shared/utils/measurementConversions';
import PholioButton, {
  PholioToggleButton,
  PholioToggleGroup,
} from '../../../../shared/components/ui/PholioButton';
import { BOOKING_LANE_BY_SLUG } from '../../../../shared/constants/bookingLanes';
import {
  resolveStatsTrack,
  coreCircumferenceFor,
  sizingFieldsFor,
} from '../../../../shared/constants/statsTrack';
import {
  circumferenceTapeConfig,
  circumferenceToCentimeters,
  circumferenceToDisplay,
} from '../../../../shared/utils/circumferenceMeasurements';
import styles from './ProfilePage.module.css';

export function MeasurementsSection({
  control,
  errors,
  register,
  watch,
  setValue,
  unitSystem,
  setUnitSystem,
  measurementsLocked = false,
}) {
  const shoeRegion = watch('shoe_region') || 'US';
  const primaryLane = watch('booking_primary_lane');
  const laneInfo = BOOKING_LANE_BY_SLUG[primaryLane];
  const showWeight = !laneInfo || laneInfo.group !== 'fashion';

  // Which measurement set renders. Resolved through the shared helper so the
  // stored lowercase value matches, and so a profile that has never picked a
  // track still falls back through gender exactly as the server does.
  const track = resolveStatsTrack({
    stats_track: watch('stats_track'),
    gender: watch('gender'),
  });
  const core = coreCircumferenceFor(track);
  const sizing = sizingFieldsFor(track);
  const coreCm = watch(core.field);
  const circumferenceTape = circumferenceTapeConfig(unitSystem);
  // Preserve the original tape's unset resting positions after widening its
  // technical range. These are interaction anchors only; no value is stored
  // until the talent actually moves or edits the tape.
  const coreUnsetValue = circumferenceToDisplay(100, unitSystem);
  const waistUnsetValue = circumferenceToDisplay(85, unitSystem);

  if (measurementsLocked) {
    return (
      <Section
        id="appearance"
        title="Stats & Measurements"
        titleEmphasis="Measurements"
        description="Precise stats used in casting search (height, weight, sizing). Keep them current — accuracy prevents mismatches and wasted callbacks."
        showDivider={false}
      >
        <div className={styles.measurementsLocked}>
          <p className={styles.measurementsLockedCopy}>
            Measurements and weight stay locked until a parent or guardian consents in Personal Details.
          </p>
          <PholioButton as="a" href="#identity" variant="meta" className={styles.measurementsLockedLink}>
            Record guardian consent
          </PholioButton>
        </div>
      </Section>
    );
  }

  return (
    <Section
      id="appearance"
      title="Physical Attributes"
      titleEmphasis="Attributes"
      description="Precise stats used in casting search (height, weight, sizing). Keep them current — accuracy prevents mismatches and wasted callbacks."
      showDivider={false}
      headerAction={
        <PholioToggleGroup className={styles.unitToggle} role="group" aria-label="Measurement units">
          <PholioToggleButton
            type="button"
            active={unitSystem === 'metric'}
            aria-pressed={unitSystem === 'metric'}
            className={`${styles.toggleBtn} ${unitSystem === 'metric' ? styles.toggleBtnActive : ''}`}
            onClick={() => setUnitSystem('metric')}
          >
            Metric
          </PholioToggleButton>
          <PholioToggleButton
            type="button"
            active={unitSystem === 'imperial'}
            aria-pressed={unitSystem === 'imperial'}
            className={`${styles.toggleBtn} ${unitSystem === 'imperial' ? styles.toggleBtnActive : ''}`}
            onClick={() => setUnitSystem('imperial')}
          >
            Imperial
          </PholioToggleButton>
        </PholioToggleGroup>
      }
    >
      <div className={`${styles.measurementRow} ${styles.formRow}`} style={{ marginBottom: '32px' }}>
        <div className={styles.measurementField} style={{ gridColumn: showWeight ? 'span 2' : 'span 3' }}>
          <label className={styles.measurementLabel}>Height</label>
          <PholioMeasuringTape
            value={
              unitSystem === 'metric'
                ? watch('height_cm')
                : watch('height_cm')
                  ? Math.round(watch('height_cm') / 2.54)
                  : null
            }
            unit={unitSystem === 'metric' ? 'cm' : 'in'}
            min={unitSystem === 'metric' ? 130 : 50}
            max={unitSystem === 'metric' ? 230 : 90}
            allowFeetInches={unitSystem === 'imperial'}
            formatter={
              unitSystem === 'imperial'
                ? (val) => {
                    const ft = Math.floor(val / 12);
                    const inRemainder = Math.round(val % 12);
                    return `${ft}'${inRemainder}"`;
                  }
                : null
            }
            onChange={(val) => {
              const metricVal = unitSystem === 'metric' ? val : Math.round(val * 2.54);
              setValue('height_cm', metricVal, { shouldDirty: true });
            }}
          />
        </div>

        {showWeight && (
          <div className={styles.measurementField}>
            <label className={styles.measurementLabel}>Weight</label>
            <PholioMeasuringTape
              value={
                unitSystem === 'metric'
                  ? watch('weight_kg')
                  : watch('weight_kg')
                    ? Math.round(watch('weight_kg') * 2.20462)
                    : null
              }
              unit={unitSystem === 'metric' ? 'kg' : 'lbs'}
              min={unitSystem === 'metric' ? 30 : 66}
              max={unitSystem === 'metric' ? 150 : 331}
              onChange={(val) => {
                const metricVal = unitSystem === 'metric' ? val : Math.round(val / 2.20462);
                setValue('weight_kg', metricVal, { shouldDirty: true });
              }}
            />
          </div>
        )}
      </div>

      <div className={`${styles.measurementRow} ${styles.formRow}`} style={{ margin: '32px 0' }}>
        <div className={styles.measurementField} style={{ gridColumn: 'span 3' }}>
          <div className={styles.shoeContainer}>
            <div className={styles.shoeHeader}>
              <label className={styles.measurementLabel} htmlFor="shoe_size">Shoe Size</label>
              <PholioToggleGroup
                className={styles.shoeRegionToggle}
                tone="dark"
                role="group"
                aria-label="Shoe size region"
              >
                {['US', 'UK', 'EU'].map((reg) => (
                  <PholioToggleButton
                    key={reg}
                    type="button"
                    active={shoeRegion === reg}
                    aria-pressed={shoeRegion === reg}
                    onClick={() => setValue('shoe_region', reg, { shouldDirty: true })}
                  >
                    {reg}
                  </PholioToggleButton>
                ))}
              </PholioToggleGroup>
            </div>

            <div className={styles.shoeSelector}>
              <div className={styles.shoeValueGroup}>
                <PholioInput
                  id="shoe_size"
                  type="number"
                  step="0.5"
                  placeholder="9.5"
                  className={styles.shoeMainInput}
                  error={errors.shoe_size}
                  value={watch('shoe_size') || ''}
                  onChange={(e) =>
                    setValue('shoe_size', e.target.value ? parseFloat(e.target.value) : null, {
                      shouldDirty: true
                    })
                  }
                />
                <span className={styles.shoeRegionLabel}>{shoeRegion}</span>
              </div>

              {watch('shoe_size') && (
                <div className={styles.shoeConversions}>
                  <div className={styles.shoeConvItem}>
                    <span className={styles.shoeConvValue}>
                      {getShoeConversions(watch('shoe_size'), shoeRegion)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={`${styles.measurementRow} ${styles.formRow}`} style={{ gap: '16px' }}>
        <div className={styles.measurementField}>
          <label className={styles.measurementLabel}>{core.label}</label>
          <PholioMeasuringTape
            aria-label={`${core.label} circumference`}
            value={circumferenceToDisplay(coreCm, unitSystem)}
            unit={circumferenceTape.unit}
            min={circumferenceTape.min}
            max={circumferenceTape.max}
            step={circumferenceTape.step}
            majorStep={circumferenceTape.majorStep}
            unsetValue={coreUnsetValue}
            size="small"
            onChange={(val) => {
              const metricVal = circumferenceToCentimeters(val, unitSystem);
              setValue(core.field, metricVal, { shouldDirty: true });
            }}
          />
        </div>

        <div className={styles.measurementField}>
          <label className={styles.measurementLabel}>Waist</label>
          <PholioMeasuringTape
            aria-label="Waist circumference"
            value={circumferenceToDisplay(watch('waist_cm'), unitSystem)}
            unit={circumferenceTape.unit}
            min={circumferenceTape.min}
            max={circumferenceTape.max}
            step={circumferenceTape.step}
            majorStep={circumferenceTape.majorStep}
            unsetValue={waistUnsetValue}
            size="small"
            onChange={(val) => {
              const metricVal = circumferenceToCentimeters(val, unitSystem);
              setValue('waist_cm', metricVal, { shouldDirty: true });
            }}
          />
        </div>

        <div className={styles.measurementField}>
          <label className={styles.measurementLabel}>Hips</label>
          <PholioMeasuringTape
            aria-label="Hips circumference"
            value={circumferenceToDisplay(watch('hips_cm'), unitSystem)}
            unit={circumferenceTape.unit}
            min={circumferenceTape.min}
            max={circumferenceTape.max}
            step={circumferenceTape.step}
            majorStep={circumferenceTape.majorStep}
            unsetValue={coreUnsetValue}
            size="small"
            onChange={(val) => {
              const metricVal = circumferenceToCentimeters(val, unitSystem);
              setValue('hips_cm', metricVal, { shouldDirty: true });
            }}
          />
        </div>
      </div>

      {/* Sizing systems per track. `ungendered` collects BOTH — matching
          buildCanonicalStats, which renders whichever the talent filled in
          rather than forcing one system on them. */}
      <div className={`${sizing.dress && sizing.suit ? styles.formGrid3 : styles.formGrid2} ${styles.formRow}`}>
        {sizing.dress && (
          <PholioCustomSelect
            label="Dress Size"
            id="dress_size"
            options={['0', '2', '4', '6', '8', '10', '12', '14', '16', 'XS', 'S', 'M', 'L', 'XL'].map((s) => ({
              value: s,
              label: s
            }))}
            value={watch('dress_size') || ''}
            onChange={(val) => setValue('dress_size', val, { shouldDirty: true })}
            error={errors.dress_size}
            placeholder="Select dress size"
          />
        )}

        {sizing.suit && (
          <PholioInput
            label="Suit Size"
            placeholder="e.g. 40, M, 50"
            {...register('suit_size')}
            error={errors.suit_size}
          />
        )}

        <PholioInput
          label="Inseam"
          type="number"
          placeholder={unitSystem === 'metric' ? 'e.g. 82 cm' : 'e.g. 32 in'}
          value={
            unitSystem === 'metric'
              ? watch('inseam_cm') || ''
              : watch('inseam_cm')
                ? Math.round(watch('inseam_cm') / 2.54)
                : ''
          }
          onChange={(e) => {
            const val = e.target.value ? parseFloat(e.target.value) : null;
            const metricVal = val === null ? null : (unitSystem === 'metric' ? val : Math.round(val * 2.54));
            setValue('inseam_cm', metricVal, { shouldDirty: true });
          }}
          error={errors.inseam_cm}
        />
      </div>

      <div className={`${styles.formGrid2} ${styles.formRow}`}>
        <Controller
          name="eye_color"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Eye Color"
              id="eye_color"
              options={[
                { value: 'Brown', label: 'Brown' },
                { value: 'Blue', label: 'Blue' },
                { value: 'Green', label: 'Green' },
                { value: 'Hazel', label: 'Hazel' },
                { value: 'Gray', label: 'Gray' },
                { value: 'Amber', label: 'Amber' },
                { value: 'Other', label: 'Other' }
              ]}
              value={field.value}
              onChange={field.onChange}
              error={errors.eye_color}
              placeholder="Select eye color"
            />
          )}
        />
        <Controller
          name="hair_color"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Hair Color"
              id="hair_color"
              options={['Black', 'Brown', 'Blonde', 'Red', 'Gray', 'White', 'Other'].map((c) => ({
                value: c,
                label: c
              }))}
              value={field.value}
              onChange={field.onChange}
              error={errors.hair_color}
              placeholder="Select hair color"
            />
          )}
        />
      </div>

      <div className={`${styles.formGrid2} ${styles.formRow}`}>
        <Controller
          name="hair_length"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Hair Length"
              id="hair_length"
              options={['Bald', 'Short', 'Medium', 'Long', 'Very Long'].map((c) => ({ value: c, label: c }))}
              value={field.value}
              onChange={field.onChange}
              error={errors.hair_length}
              placeholder="Select length"
            />
          )}
        />
        <Controller
          name="hair_type"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Hair Type / Texture"
              id="hair_type"
              options={['Straight', 'Wavy', 'Curly', 'Coily', 'Locs', 'Shaved'].map((c) => ({ value: c, label: c }))}
              value={field.value}
              onChange={field.onChange}
              error={errors.hair_type}
              placeholder="Select texture"
            />
          )}
        />
      </div>

      <div className={`${styles.formGrid2} ${styles.formRow}`}>
        <Controller
          name="body_type"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Body Type / Build"
              id="body_type"
              options={['Slim', 'Athletic', 'Average', 'Curvy', 'Curve', 'Muscular'].map((c) => ({
                value: c,
                label: c
              }))}
              value={field.value}
              onChange={field.onChange}
              error={errors.body_type}
              placeholder="Select build"
            />
          )}
        />
        <Controller
          name="skin_tone"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Skin Tone"
              id="skin_tone"
              options={['Fair', 'Light', 'Medium', 'Olive', 'Dark', 'Deep', 'Other'].map((c) => ({
                value: c,
                label: c
              }))}
              value={field.value}
              onChange={field.onChange}
              error={errors.skin_tone}
              placeholder="Select skin tone"
            />
          )}
        />
      </div>

      <div className={`${styles.formGrid2} ${styles.formRow}`}>
        <Controller
          name="tattoos"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Visible Tattoos"
              id="tattoos"
              options={[
                { value: 'true', label: 'Yes' },
                { value: 'false', label: 'No' }
              ]}
              value={field.value ? 'true' : 'false'}
              onChange={(val) => field.onChange(val === 'true')}
              error={errors.tattoos}
              placeholder="Select"
            />
          )}
        />

        <Controller
          name="piercings"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Piercings"
              id="piercings"
              options={[
                { value: 'true', label: 'Yes' },
                { value: 'false', label: 'No' }
              ]}
              value={field.value ? 'true' : 'false'}
              onChange={(val) => field.onChange(val === 'true')}
              error={errors.piercings}
              placeholder="Select"
            />
          )}
        />
      </div>
    </Section>
  );
}
