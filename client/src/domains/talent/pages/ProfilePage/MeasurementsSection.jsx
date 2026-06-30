import React from 'react';
import { Controller } from 'react-hook-form';
import { PenTool, Disc } from 'lucide-react';
import { PholioInput, PholioToggle } from '../../../../shared/components/ui/forms';
import PholioMeasuringTape from '../../../../shared/components/ui/forms/PholioMeasuringTape';
import PholioCustomSelect from '../../../../shared/components/ui/forms/PholioCustomSelect';
import { Section } from '../../components/profile-index';
import { getShoeConversions } from '../../../../shared/utils/measurementConversions';
import PholioButton, {
  PholioToggleButton,
  PholioToggleGroup,
} from '../../../../shared/components/ui/PholioButton';
import styles from './ProfilePage.module.css';

export function MeasurementsSection({
  control,
  errors,
  register,
  watch,
  setValue,
  unitSystem,
  setUnitSystem,
  shoeRegion,
  setShoeRegion,
  measurementsLocked = false,
}) {
  if (measurementsLocked) {
    return (
      <Section
        id="appearance"
        title="Physical Attributes"
        titleEmphasis="Attributes"
        description="Vital statistics for casting searches."
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
      description="Vital statistics for casting searches."
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
        <div className={styles.measurementField} style={{ gridColumn: 'span 2' }}>
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
            min={unitSystem === 'metric' ? 30 : 70}
            max={unitSystem === 'metric' ? 150 : 330}
            onChange={(val) => {
              const metricVal = unitSystem === 'metric' ? val : Math.round(val / 2.20462);
              setValue('weight_kg', metricVal, { shouldDirty: true });
            }}
          />
        </div>
      </div>

      <div className={`${styles.measurementRow} ${styles.formRow}`} style={{ margin: '32px 0' }}>
        <div className={styles.measurementField} style={{ gridColumn: 'span 3' }}>
          <div className={styles.shoeContainer}>
            <div className={styles.shoeHeader}>
              <label className={styles.measurementLabel}>Shoe Size</label>
              <PholioToggleGroup className={styles.shoeRegionToggle} role="group" aria-label="Shoe size region">
                {['US', 'UK', 'EU'].map((reg) => (
                  <PholioToggleButton
                    key={reg}
                    type="button"
                    active={shoeRegion === reg}
                    aria-pressed={shoeRegion === reg}
                    className={`${styles.regionBtn} ${shoeRegion === reg ? styles.regionBtnActive : ''}`}
                    onClick={() => setShoeRegion(reg)}
                  >
                    {reg}
                  </PholioToggleButton>
                ))}
              </PholioToggleGroup>
            </div>

            <div className={styles.shoeSelector}>
              <div className={styles.shoeValueGroup}>
                <PholioInput
                  type="number"
                  step="0.5"
                  placeholder="9.5"
                  className={styles.shoeMainInput}
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
          <label className={styles.measurementLabel}>{watch('gender') === 'Female' ? 'Bust' : 'Chest'}</label>
          <PholioMeasuringTape
            value={
              unitSystem === 'metric'
                ? watch('bust')
                : watch('bust')
                  ? Math.round(watch('bust') / 2.54)
                  : null
            }
            unit={unitSystem === 'metric' ? 'cm' : 'in'}
            min={unitSystem === 'metric' ? 70 : 28}
            max={unitSystem === 'metric' ? 130 : 52}
            size="small"
            onChange={(val) => {
              const metricVal = unitSystem === 'metric' ? val : Math.round(val * 2.54);
              setValue('bust', metricVal, { shouldDirty: true });
            }}
          />
        </div>

        <div className={styles.measurementField}>
          <label className={styles.measurementLabel}>Waist</label>
          <PholioMeasuringTape
            value={
              unitSystem === 'metric'
                ? watch('waist')
                : watch('waist')
                  ? Math.round(watch('waist') / 2.54)
                  : null
            }
            unit={unitSystem === 'metric' ? 'cm' : 'in'}
            min={unitSystem === 'metric' ? 50 : 20}
            max={unitSystem === 'metric' ? 120 : 48}
            size="small"
            onChange={(val) => {
              const metricVal = unitSystem === 'metric' ? val : Math.round(val * 2.54);
              setValue('waist', metricVal, { shouldDirty: true });
            }}
          />
        </div>

        <div className={styles.measurementField}>
          <label className={styles.measurementLabel}>Hips</label>
          <PholioMeasuringTape
            value={
              unitSystem === 'metric'
                ? watch('hips')
                : watch('hips')
                  ? Math.round(watch('hips') / 2.54)
                  : null
            }
            unit={unitSystem === 'metric' ? 'cm' : 'in'}
            min={unitSystem === 'metric' ? 70 : 28}
            max={unitSystem === 'metric' ? 130 : 52}
            size="small"
            onChange={(val) => {
              const metricVal = unitSystem === 'metric' ? val : Math.round(val * 2.54);
              setValue('hips', metricVal, { shouldDirty: true });
            }}
          />
        </div>
      </div>

      <div className={`${styles.formGrid2} ${styles.formRow}`}>
        <PholioInput
          label="Dress / Suit Size"
          placeholder="e.g. 6, M, 38"
          error={errors.dress_size}
          {...register('dress_size')}
        />
        <div className={styles.measurementField}>
          <label className={styles.measurementLabel}>Inseam</label>
          <PholioMeasuringTape
            value={
              unitSystem === 'metric'
                ? watch('inseam_cm')
                : watch('inseam_cm')
                  ? Math.round(watch('inseam_cm') / 2.54)
                  : null
            }
            unit={unitSystem === 'metric' ? 'cm' : 'in'}
            min={unitSystem === 'metric' ? 50 : 20}
            max={unitSystem === 'metric' ? 110 : 44}
            size="small"
            onChange={(val) => {
              const metricVal = unitSystem === 'metric' ? val : Math.round(val * 2.54);
              setValue('inseam_cm', metricVal, { shouldDirty: true });
            }}
          />
        </div>
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
        <PholioInput label="Skin Tone" placeholder="e.g. Fair, Olive, Dark" error={errors.skin_tone} {...register('skin_tone')} />
      </div>

      <div className={`${styles.formGrid2} ${styles.formRow}`}>
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
        <Controller
          name="body_type"
          control={control}
          render={({ field }) => (
            <PholioCustomSelect
              label="Body Type / Build"
              id="body_type"
              options={['Slim', 'Athletic', 'Average', 'Curvy', 'Plus-size', 'Muscular'].map((c) => ({
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
