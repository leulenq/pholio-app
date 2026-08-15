import React, { useState } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Section } from '../../components/profile-index';
import { PholioInput, PholioTextarea } from '../../../../shared/components/ui/forms';
import PholioButton, {
  PholioIconButton,
  PholioToggleButton,
  PholioToggleGroup,
} from '../../../../shared/components/ui/PholioButton';
import { pholioToast } from '../../../../shared/lib/pholio-toast';
import { bookoutSchema } from '../../../../schemas/bookoutSchema';
import {
  useAvailability,
  useBookouts,
  useUpdateAvailability,
  useCreateBookout,
  useDeleteBookout,
} from '../../hooks/useAvailability';
import styles from './ProfilePage.module.css';

const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

// Plain-text labels only — no colored dots/badges (root CLAUDE.md banned
// patterns #4 / #10). "Bookout" is the deliberate industry term for a
// talent-declared unavailability window.
const STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'limited', label: 'Limited availability' },
  { value: 'unavailable', label: 'Unavailable' },
];

function formatDateRange(startsOn, endsOn) {
  const fmt = (value) => {
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };
  return `${fmt(startsOn)} – ${fmt(endsOn)}`;
}

function BookoutRow({ bookout, onDelete, deleting }) {
  const shouldReduce = useReducedMotion();
  return (
    <motion.li
      className={styles.bookoutRow}
      initial={shouldReduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={shouldReduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={SPRING}
    >
      <div className={styles.bookoutRowBody}>
        <span className={styles.bookoutRowDates}>{formatDateRange(bookout.starts_on, bookout.ends_on)}</span>
        {bookout.note ? <span className={styles.bookoutRowNote}>{bookout.note}</span> : null}
      </div>
      <PholioIconButton
        label="Remove bookout"
        danger
        disabled={deleting}
        onClick={() => onDelete(bookout.id)}
      >
        <X size={15} />
      </PholioIconButton>
    </motion.li>
  );
}

function AddBookoutEditor({ onCreate, creating }) {
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});

  const handleSubmit = async () => {
    const result = bookoutSchema.safeParse({ starts_on: startsOn, ends_on: endsOn, note });
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      setErrors({
        starts_on: fieldErrors.starts_on?.[0],
        ends_on: fieldErrors.ends_on?.[0],
        note: fieldErrors.note?.[0],
      });
      return;
    }
    setErrors({});
    try {
      await onCreate({ starts_on: startsOn, ends_on: endsOn, note: note.trim() || null });
      setStartsOn('');
      setEndsOn('');
      setNote('');
    } catch (error) {
      pholioToast.error(error?.message || 'Could not add the bookout');
    }
  };

  const handleKeyDown = (event) => {
    const elementName = event.target?.tagName?.toLowerCase();
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      elementName === 'textarea' ||
      elementName === 'button'
    ) {
      return;
    }

    // This editor lives inside the page-wide profile form. Stop the browser's
    // implicit outer-form submit and treat Enter in either date field as the
    // local "Add bookout" action instead.
    event.preventDefault();
    event.stopPropagation();
    void handleSubmit();
  };

  return (
    <div
      className={styles.bookoutForm}
      role="group"
      aria-label="Add a bookout"
      onKeyDown={handleKeyDown}
    >
      <div className={styles.bookoutFormDates}>
        <PholioInput
          label="Starts"
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
          error={errors.starts_on}
        />
        <PholioInput
          label="Ends"
          type="date"
          value={endsOn}
          onChange={(e) => setEndsOn(e.target.value)}
          error={errors.ends_on}
        />
      </div>
      <PholioTextarea
        label="Note (optional)"
        placeholder="e.g. Editorial shoot on hold"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={errors.note}
      />
      <PholioButton
        type="button"
        variant="secondary"
        loading={creating}
        onClick={() => void handleSubmit()}
      >
        Add bookout
      </PholioButton>
    </div>
  );
}

export function AvailabilitySection({ measurementsLocked = false }) {
  const { data: availabilityData, isLoading: availabilityLoading } = useAvailability();
  const { data: bookoutsData, isLoading: bookoutsLoading } = useBookouts();
  const updateAvailability = useUpdateAvailability();
  const createBookout = useCreateBookout();
  const deleteBookout = useDeleteBookout();
  const [deletingId, setDeletingId] = useState(null);

  if (measurementsLocked) {
    return (
      <Section
        id="availability"
        title="Availability"
        description="Your booking status and any dates you're booked out — shared with agencies that view your profile."
        showDivider={false}
      >
        <div className={styles.measurementsLocked}>
          <p className={styles.measurementsLockedCopy}>
            Availability stays locked until a parent or guardian consents in Personal Details.
          </p>
          <PholioButton as="a" href="#identity" variant="meta" className={styles.measurementsLockedLink}>
            Record guardian consent
          </PholioButton>
        </div>
      </Section>
    );
  }

  const status = availabilityData?.status || 'available';
  const bookouts = Array.isArray(bookoutsData?.bookouts) ? bookoutsData.bookouts : [];

  const handleStatusChange = (nextStatus) => {
    if (nextStatus === status) return;
    updateAvailability.mutate(nextStatus, {
      onError: (error) => pholioToast.error(error?.message || 'Could not update availability'),
    });
  };

  const handleCreateBookout = (data) => createBookout.mutateAsync(data);

  const handleDeleteBookout = async (id) => {
    setDeletingId(id);
    try {
      await deleteBookout.mutateAsync(id);
    } catch (error) {
      pholioToast.error(error?.message || 'Could not remove the bookout');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Section
      id="availability"
      title="Availability"
      description="Your booking status and any dates you're booked out — shared with agencies that view your profile."
      showDivider={false}
    >
      <div className={styles.availabilityStatus}>
        <PholioToggleGroup role="radiogroup" aria-label="Availability status">
          {STATUS_OPTIONS.map((option) => (
            <PholioToggleButton
              key={option.value}
              role="radio"
              aria-checked={status === option.value}
              active={status === option.value}
              disabled={availabilityLoading || updateAvailability.isPending}
              onClick={() => handleStatusChange(option.value)}
            >
              {option.label}
            </PholioToggleButton>
          ))}
        </PholioToggleGroup>
      </div>

      <div className={styles.bookoutsBlock}>
        <h4 className={styles.bookoutsHeading}>Bookouts</h4>
        {bookoutsLoading ? (
          <p className={styles.bookoutsEmpty}>Loading…</p>
        ) : bookouts.length === 0 ? (
          <p className={styles.bookoutsEmpty}>No bookouts on file.</p>
        ) : (
          <ul className={styles.bookoutList}>
            <AnimatePresence initial={false}>
              {bookouts.map((bookout) => (
                <BookoutRow
                  key={bookout.id}
                  bookout={bookout}
                  onDelete={handleDeleteBookout}
                  deleting={deletingId === bookout.id}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
        <AddBookoutEditor onCreate={handleCreateBookout} creating={createBookout.isPending} />
      </div>
    </Section>
  );
}
