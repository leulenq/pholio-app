import React from 'react';
import { Controller, useFieldArray } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { PholioInput, PholioTextarea } from '../../../shared/components/ui/forms';
import PholioButton, {
  PholioIconButton,
} from '../../../shared/components/ui/PholioButton';
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
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'representations',
    keyName: '_formKey',
  });

  const applyStatus = (next) => {
    setValue('representation_status', next, { shouldDirty: true, shouldValidate: true });
    if (next === STATUS.SEEKING) {
      setValue('seeking_representation', true, { shouldDirty: true });
    } else if (next === STATUS.REPRESENTED) {
      setValue('seeking_representation', false, { shouldDirty: true });
    } else {
      setValue('seeking_representation', false, { shouldDirty: true });
    }
  };

  const addRepresentation = () => {
    append({
      agency_id: null,
      external_agency_name: '',
      relationship_type: 'placement',
      market: '',
      territory: '',
      division: '',
      is_exclusive: false,
      started_on: '',
      status: 'active',
    });
    if (representationStatus === STATUS.NOT_SEEKING) {
      applyStatus(STATUS.REPRESENTED);
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

        <div className={styles.repDetailGroup}>
          <div className={styles.repRelationshipsHead}>
            <div>
              <h4>Active relationships</h4>
              <p>Add one mother agency and each market or placement agency separately.</p>
            </div>
            <PholioButton
              type="button"
              variant="secondary"
              className={styles.repAddButton}
              onClick={addRepresentation}
            >
              <Plus size={16} aria-hidden="true" />
              Add agency
            </PholioButton>
          </div>

          {fields.length === 0 ? (
            <p className={styles.repEmpty}>
              No active agency relationships. Add one if an agency currently represents you.
            </p>
          ) : (
            <div className={styles.repRelationshipList}>
              {fields.map((field, index) => {
                const fieldErrors = errors.representations?.[index] || {};
                const isInternal = Boolean(field.agency_id);
                return (
                  <div className={styles.repRelationshipCard} key={field._formKey}>
                    <input type="hidden" {...register(`representations.${index}.id`)} />
                    <input type="hidden" {...register(`representations.${index}.agency_id`)} />
                    <input type="hidden" {...register(`representations.${index}.status`)} />

                    <div className={styles.repRelationshipTop}>
                      <label className={styles.repNativeField}>
                        <span>Relationship</span>
                        <select {...register(`representations.${index}.relationship_type`)}>
                          <option value="mother">Mother agency</option>
                          <option value="placement">Placement agency</option>
                        </select>
                      </label>
                      <PholioIconButton
                        label={`Remove ${field.agency_name || field.external_agency_name || 'agency'}`}
                        danger
                        className={styles.repRemoveButton}
                        onClick={() => remove(index)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </PholioIconButton>
                    </div>

                    <div className={styles.repRelationshipGrid}>
                      {isInternal ? (
                        <>
                          <PholioInput
                            label="Agency name"
                            value={field.agency_name || ''}
                            readOnly
                          />
                          <input
                            type="hidden"
                            {...register(`representations.${index}.external_agency_name`)}
                          />
                        </>
                      ) : (
                        <PholioInput
                          label="Agency name"
                          placeholder="e.g. Women Management"
                          error={fieldErrors.external_agency_name}
                          {...register(`representations.${index}.external_agency_name`)}
                        />
                      )}
                      <PholioInput
                        label="Market"
                        placeholder="e.g. New York"
                        error={fieldErrors.market}
                        {...register(`representations.${index}.market`)}
                      />
                      <PholioInput
                        label="Territory"
                        placeholder="e.g. United States"
                        error={fieldErrors.territory}
                        {...register(`representations.${index}.territory`)}
                      />
                      <PholioInput
                        label="Division"
                        placeholder="e.g. Women / Editorial"
                        error={fieldErrors.division}
                        {...register(`representations.${index}.division`)}
                      />
                      <PholioInput
                        label="Start date"
                        type="date"
                        error={fieldErrors.started_on}
                        {...register(`representations.${index}.started_on`)}
                      />
                      <label className={styles.repExclusive}>
                        <input
                          type="checkbox"
                          {...register(`representations.${index}.is_exclusive`)}
                        />
                        <span>Exclusive in this market or territory</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.repDetailGroup}>
          <PholioTextarea
            label="Legacy representation notes"
            placeholder="Optional historical notes retained from your previous profile"
            rows={3}
            className={styles.repPremiumField}
            {...register('previous_representations')}
          />
        </div>
      </div>
    </Section>
  );
};
