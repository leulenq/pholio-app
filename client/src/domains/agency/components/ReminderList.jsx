import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bell, Check, RotateCcw, Trash2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { getReminders, completeReminder, snoozeReminder, deleteReminder } from '../api/agency';
import { AgencyEmptyState } from './ui/AgencyEmptyState';
import { AgencySkeleton } from './ui/AgencySkeleton';
import { EmptyErrorState, ActionFailureNotice } from '../../../shared/components/states';

const LANES = [
  { key: 'overdue', label: 'Overdue', tone: 'danger' },
  { key: 'dueToday', label: 'Due Today', tone: 'ink' },
  { key: 'upcoming', label: 'Upcoming', tone: 'ink' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (value) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** A reminder that's been snoozed is effectively due on `snoozed_until`. */
function effectiveDue(reminder) {
  if (reminder.status === 'snoozed' && reminder.snoozed_until) return reminder.snoozed_until;
  return reminder.reminder_date || reminder.due_at || reminder.remind_at || null;
}

function reminderTitle(reminder) {
  return reminder.title || reminder.note || 'Reminder';
}

function reminderNote(reminder) {
  return reminder.notes || reminder.description || '';
}

function isCompleted(reminder) {
  return reminder.status === 'completed' || reminder.completed === true;
}

function formatDue(dateStr) {
  if (!dateStr) return 'No date';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'No date';
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / DAY_MS);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays > 1 && diffDays < 7) return `In ${diffDays}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const byDue = (asc) => (a, b) => {
  const ta = Date.parse(effectiveDue(a)) || 0;
  const tb = Date.parse(effectiveDue(b)) || 0;
  return asc ? ta - tb : tb - ta;
};

/**
 * ReminderList — the reminders ledger.
 *
 * Fetches every agency reminder and buckets it into Overdue / Due Today /
 * Upcoming / Completed lanes (Interviews' lane vocabulary). Cancelled
 * (soft-deleted) reminders are dropped. Completed collapses by default.
 */
export default function ReminderList() {
  const qc = useQueryClient();
  const [completedOpen, setCompletedOpen] = useState(false);
  const [actionError, setActionError] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agency-reminders'],
    queryFn: () => getReminders(),
    staleTime: 30000,
  });

  const reminders = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const buckets = useMemo(() => {
    const today = startOfDay(new Date());
    const acc = { overdue: [], dueToday: [], upcoming: [], completed: [] };
    for (const r of reminders) {
      if (r.status === 'cancelled') continue; // soft-deleted
      if (isCompleted(r)) {
        acc.completed.push(r);
        continue;
      }
      const due = effectiveDue(r);
      if (!due) {
        acc.upcoming.push(r);
        continue;
      }
      const dueDay = startOfDay(due);
      if (dueDay < today) acc.overdue.push(r);
      else if (dueDay.getTime() === today.getTime()) acc.dueToday.push(r);
      else acc.upcoming.push(r);
    }
    acc.overdue.sort(byDue(true));
    acc.dueToday.sort(byDue(true));
    acc.upcoming.sort(byDue(true));
    acc.completed.sort(byDue(false));
    return acc;
  }, [reminders]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['agency-reminders'] });

  const complete = useMutation({
    mutationFn: (id) => completeReminder(id),
    onSuccess: () => { toast.success('Reminder completed'); refresh(); },
    onError: (err) => {
      setActionError({ label: 'Complete reminder', message: err?.message || 'Could not complete reminder.' });
      toast.error(err?.message || 'Could not complete reminder');
    },
  });

  const snooze = useMutation({
    mutationFn: (id) => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return snoozeReminder(id, tomorrow.toISOString());
    },
    onSuccess: () => { toast.success('Reminder snoozed a day'); refresh(); },
    onError: (err) => {
      setActionError({ label: 'Snooze reminder', message: err?.message || 'Could not snooze reminder.' });
      toast.error(err?.message || 'Could not snooze reminder');
    },
  });

  const remove = useMutation({
    mutationFn: (id) => deleteReminder(id),
    onSuccess: () => { toast.success('Reminder deleted'); refresh(); },
    onError: (err) => {
      setActionError({ label: 'Delete reminder', message: err?.message || 'Could not delete reminder.' });
      toast.error(err?.message || 'Could not delete reminder');
    },
  });

  const busy = complete.isPending || snooze.isPending || remove.isPending;
  const hasAny = reminders.some((r) => r.status !== 'cancelled');
  const activeCount = buckets.overdue.length + buckets.dueToday.length + buckets.upcoming.length;

  if (isLoading) {
    return (
      <div className="rm-loading-state">
        <AgencySkeleton variant="strip" count={4} />
        <AgencySkeleton variant="row" count={4} />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyErrorState
        variant="compact"
        title="Could not load reminders"
        body="Your reminders did not load. Try again to refresh follow-ups."
        retry={{ label: 'Try again', onClick: () => refetch() }}
      />
    );
  }

  if (!hasAny) {
    return (
      <AgencyEmptyState
        icon={Bell}
        title="No reminders"
        description="No reminders — set follow-ups from a talent's page to stay on top of outreach."
      />
    );
  }

  const ledger = [
    { key: 'overdue', label: 'Overdue', value: buckets.overdue.length, tone: buckets.overdue.length ? 'danger' : 'mute' },
    { key: 'dueToday', label: 'Due Today', value: buckets.dueToday.length, tone: 'ink' },
    { key: 'upcoming', label: 'Upcoming', value: buckets.upcoming.length, tone: 'ink' },
    { key: 'completed', label: 'Completed', value: buckets.completed.length, tone: 'mute' },
  ];

  const renderRow = (reminder, i) => {
    const due = effectiveDue(reminder);
    const completedRow = isCompleted(reminder);
    const overdue = !completedRow && !!due && startOfDay(due) < startOfDay(new Date());
    const title = reminderTitle(reminder);
    const note = reminderNote(reminder);

    return (
      <motion.div
        key={reminder.id}
        className="rm-row"
        data-overdue={overdue ? 'true' : undefined}
        data-completed={completedRow ? 'true' : undefined}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1], delay: Math.min(i * 0.03, 0.24) }}
      >
        <div className="rm-row-body">
          <span className="rm-row-title">{title}</span>
          {(reminder.talent_name || note) && (
            <span className="rm-row-meta">
              {reminder.talent_name && <span className="rm-row-meta-item">{reminder.talent_name}</span>}
              {note && (
                <>
                  {reminder.talent_name && <span className="rm-dot">·</span>}
                  <span className="rm-row-meta-item">{note}</span>
                </>
              )}
            </span>
          )}
        </div>

        <span className="rm-row-due">{formatDue(due)}</span>

        {!completedRow && (
          <div className="rm-row-actions">
            <button
              type="button"
              className="rm-act"
              onClick={() => complete.mutate(reminder.id)}
              disabled={busy}
              aria-label={`Mark "${title}" complete`}
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              className="rm-act"
              onClick={() => snooze.mutate(reminder.id)}
              disabled={busy}
              aria-label={`Snooze "${title}" one day`}
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              className="rm-act rm-act--danger"
              onClick={() => remove.mutate(reminder.id)}
              disabled={busy}
              aria-label={`Delete "${title}"`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="rm-list">
      {actionError && (
        <ActionFailureNotice
          title={`${actionError.label} unavailable`}
          body={actionError.message}
          retry={{ label: 'Dismiss', onClick: () => setActionError(null) }}
        />
      )}

      <div className="rm-ledger">
        {ledger.map((s) => (
          <div key={s.key} className={`rm-stat rm-stat--${s.tone}`}>
            <span className="rm-stat-num">{s.value}</span>
            <span className="rm-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="rm-lanes">
        {LANES.map((lane) => {
          const items = buckets[lane.key];
          if (items.length === 0) return null;
          return (
            <section className="rm-lane" key={lane.key} data-tone={lane.tone}>
              <div className="rm-lane-head">
                <h2 className="rm-lane-title">{lane.label}</h2>
                <span className="rm-lane-count">{items.length}</span>
              </div>
              <div className="rm-lane-rows">
                {items.map((r, i) => renderRow(r, i))}
              </div>
            </section>
          );
        })}

        {activeCount === 0 && buckets.completed.length > 0 && (
          <p className="rm-caughtup">All caught up.</p>
        )}

        {buckets.completed.length > 0 && (
          <section className="rm-lane rm-lane--completed" data-tone="completed">
            <button
              type="button"
              className="rm-lane-head rm-lane-head--toggle"
              onClick={() => setCompletedOpen((v) => !v)}
              aria-expanded={completedOpen}
            >
              <h2 className="rm-lane-title">Completed</h2>
              <span className="rm-lane-count">{buckets.completed.length}</span>
              <ChevronRight size={15} className={`rm-lane-chev${completedOpen ? ' rm-lane-chev--open' : ''}`} />
            </button>
            {completedOpen && (
              <div className="rm-lane-rows rm-lane-rows--muted">
                {buckets.completed.map((r, i) => renderRow(r, i))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
