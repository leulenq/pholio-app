/**
 * Log a submission you made somewhere else.
 *
 * Most submissions a working model makes never touch Pholio — they go through
 * an agency's own form, an email address, or a walk-in. This overlay is how
 * those enter the ledger, so the "30-agency list" lives in one place instead of
 * a notes app. The record is entirely the talent's: no agency reads it, and
 * nothing here is sent anywhere.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import {
  PholioInput,
  PholioSelect,
  PholioTextarea,
} from '../../../../shared/components/ui/forms';
import { DEFAULT_TRACKER_CHANNEL } from '../../../../shared/constants/submissionTracker';
import {
  MAX_TRACKER_AGENCY_NAME,
  MAX_TRACKER_NOTE,
  TRACKER_CHANNEL_OPTIONS,
  todayTrackerDate,
  validateTrackerLogForm,
} from '../../utils/submissionTracker';
import { talentApi } from '../../api/talent';
import styles from './LogSubmissionOverlay.module.css';

function routeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.routes)) return payload.routes;
  return [];
}

function blankForm() {
  return {
    agencyName: '',
    submittedOn: todayTrackerDate(),
    channel: DEFAULT_TRACKER_CHANNEL,
    destinationUrl: '',
    note: '',
  };
}

/**
 * Mounted only while it is open (see ApplicationsView), so the form starts
 * blank every time rather than needing an effect to clear it.
 */
export default function LogSubmissionOverlay({ open, onClose, onLogged }) {
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const [form, setForm] = useState(blankForm);
  const [errors, setErrors] = useState({});
  const listId = `${React.useId().replace(/:/g, '')}-agencies`;

  // The published-requirements directory is already in cache on this page more
  // often than not, so offering its names costs nothing. Free text stays the
  // primary path: most agencies a talent submits to are not in the pack.
  const routesQuery = useQuery({
    queryKey: ['spec-registry-routes'],
    queryFn: talentApi.getSpecRegistryRoutes,
    staleTime: 1000 * 60 * 10,
    retry: 1,
    enabled: open,
  });

  const knownAgencies = useMemo(() => {
    const bySeries = new Map();
    for (const route of routeList(routesQuery.data)) {
      const name = String(route?.agencyName || route?.organization?.name || '').trim();
      if (!name || bySeries.has(name.toLowerCase())) continue;
      bySeries.set(name.toLowerCase(), { name, seriesId: route?.seriesId || null });
    }
    return [...bySeries.values()];
  }, [routesQuery.data]);

  const logMutation = useMutation({
    mutationFn: talentApi.logTrackedSubmission,
    onSuccess: (submission) => {
      queryClient.invalidateQueries({ queryKey: ['tracker'] });
      toast.success('Logged. Only you can see this record.');
      onLogged?.(submission);
      onClose?.();
    },
    onError: (err) => {
      setErrors({ form: err?.message || 'That could not be logged. Try again.' });
    },
  });

  // Escape closes; focus returns where it came from; the page behind does not
  // scroll while the dialog owns the screen.
  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const setField = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] || current.form ? { ...current, [field]: undefined, form: undefined } : current));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validateTrackerLogForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const agencyName = form.agencyName.trim();
    const match = knownAgencies.find(
      (agency) => agency.name.toLowerCase() === agencyName.toLowerCase(),
    );
    const note = form.note.trim();
    const destinationUrl = form.destinationUrl.trim();

    logMutation.mutate({
      agencyName,
      submittedOn: form.submittedOn,
      channel: form.channel,
      ...(match?.seriesId ? { seriesId: match.seriesId } : {}),
      ...(destinationUrl ? { destinationUrl } : {}),
      ...(note ? { note } : {}),
    });
  };

  return createPortal(
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        // Only a click that both starts and ends on the scrim dismisses, so a
        // drag out of a text field does not throw the form away.
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-submission-title"
        tabIndex={-1}
        className={styles.panel}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 18, scale: reduceMotion ? 1 : 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={
          reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 55, damping: 16 }
        }
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <X size={18} strokeWidth={1.5} />
        </button>

        <h2 id="log-submission-title" className={styles.title}>
          Log a <em>submission.</em>
        </h2>
        <p className={styles.standfirst}>
          For anything you sent outside Pholio — their own form, an email, a walk-in. This record is
          private to you, and no agency is contacted.
        </p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <PholioInput
            label="Agency"
            name="agencyName"
            value={form.agencyName}
            onChange={setField('agencyName')}
            error={errors.agencyName}
            maxLength={MAX_TRACKER_AGENCY_NAME}
            autoComplete="off"
            list={knownAgencies.length ? listId : undefined}
            placeholder="Who did you submit to?"
          />
          {knownAgencies.length > 0 && (
            <datalist id={listId}>
              {knownAgencies.map((agency) => (
                <option key={agency.name} value={agency.name} />
              ))}
            </datalist>
          )}

          <div className={styles.row}>
            <PholioInput
              label="Date sent"
              type="date"
              name="submittedOn"
              value={form.submittedOn}
              onChange={setField('submittedOn')}
              error={errors.submittedOn}
              max={todayTrackerDate()}
            />
            <PholioSelect
              label="How you sent it"
              name="channel"
              value={form.channel}
              onChange={setField('channel')}
              options={TRACKER_CHANNEL_OPTIONS}
            />
          </div>

          <PholioInput
            label="Link (optional)"
            type="url"
            name="destinationUrl"
            value={form.destinationUrl}
            onChange={setField('destinationUrl')}
            error={errors.destinationUrl}
            placeholder="https://"
          />

          <PholioTextarea
            label="Note (optional)"
            name="note"
            rows={3}
            value={form.note}
            onChange={setField('note')}
            error={errors.note}
            maxLength={MAX_TRACKER_NOTE}
            placeholder="What you sent, who you addressed it to, anything you want to remember."
          />

          {errors.form && (
            <p className={styles.formError} role="alert">
              {errors.form}
            </p>
          )}

          <div className={styles.actions}>
            <PholioButton type="button" variant="secondary" onClick={onClose}>
              Cancel
            </PholioButton>
            <PholioButton type="submit" variant="primary" disabled={logMutation.isPending}>
              {logMutation.isPending ? 'Logging…' : 'Log submission'}
            </PholioButton>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body,
  );
}
