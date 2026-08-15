import React from 'react';
import { Controller, useFieldArray } from 'react-hook-form';
import { Building2, Plus, Trash2 } from 'lucide-react';
import { PholioInput, PholioTextarea } from '../../../shared/components/ui/forms';
import PholioCustomSelect from '../../../shared/components/ui/forms/PholioCustomSelect';
import PholioButton, {
  PholioIconButton,
} from '../../../shared/components/ui/PholioButton';
import { Section } from './Section';
import styles from '../pages/ProfilePage/ProfilePage.module.css';

const RELATIONSHIP_OPTIONS = [
  { value: 'placement', label: 'Placement agency' },
  { value: 'mother', label: 'Mother agency' },
];

const STATUS = {
  SEEKING: 'seeking',
  REPRESENTED: 'represented',
  NOT_SEEKING: 'not_seeking'
};

const OPTIONS = [
  {
    value: STATUS.SEEKING,
    label: 'Seeking Representation',
    hint: 'Open to agency submissions and development conversations.',
  },
  {
    value: STATUS.REPRESENTED,
    label: 'Represented',
    hint: 'Your agency is the contact route for bookings.',
  },
  {
    value: STATUS.NOT_SEEKING,
    label: 'Direct Bookings',
    hint: 'Booking inquiries come directly to you.',
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
      title="Agency Representation"
      titleEmphasis="Agency"
      description="Set the contact route agencies and clients should use for representation and bookings."
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

        <div className={`${styles.repDetailGroup} ${styles.repRelationshipsPanel}`}>
          <div className={styles.repRelationshipsHead}>
            <div className={styles.repRelationshipsTitle}>
              <Building2 size={18} strokeWidth={1.6} aria-hidden="true" />
              <div>
                <h4>Active Relationships</h4>
                <p>Record one mother agency, then add each market or placement agency.</p>
              </div>
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
            <div className={styles.repEmpty}>
              <Building2 size={22} strokeWidth={1.4} aria-hidden="true" />
              <div>
                <strong>No agency relationships yet</strong>
                <p>Add an agency only if it currently represents you.</p>
              </div>
            </div>
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
                      <div style={{ flex: 1 }}>
                        <Controller
                          name={`representations.${index}.relationship_type`}
                          control={control}
                          render={({ field: selectField }) => (
                            <PholioCustomSelect
                              label="Relationship"
                              id={`relationship_type_${index}`}
                              options={RELATIONSHIP_OPTIONS}
                              value={selectField.value || 'placement'}
                              onChange={selectField.onChange}
                              error={fieldErrors.relationship_type}
                            />
                          )}
                        />
                      </div>
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
