import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import { getDueRemindersCount } from '../api/agency';
import { EmptyErrorState } from '../../../shared/components/states';

/**
 * DueReminders — standalone due-count widget.
 *
 * Not currently mounted anywhere in the app (RemindersPage folds due /
 * overdue reminders into ReminderList's lanes instead). Kept on --ag-*
 * tokens via the `rm-due-widget` classes in RemindersPage.css in case a
 * future surface (e.g. an overview card) wants a compact due-count tile.
 */
export default function DueReminders() {
  const [dueData, setDueData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchDue = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getDueRemindersCount();
      setDueData(data);
    } catch (err) {
      console.error('[DueReminders] Error:', err);
      setLoadError(err);
      setDueData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDue();
  }, [fetchDue]);

  if (loading) {
    return <div className="rm-due-widget rm-due-widget--loading">Loading…</div>;
  }

  if (loadError) {
    return (
      <EmptyErrorState
        variant="compact"
        title="Due count unavailable"
        body="We could not load due reminders. Try again to refresh the count."
        retry={{ label: 'Try again', onClick: fetchDue }}
      />
    );
  }

  const count = dueData?.count || dueData?.due_count || (Array.isArray(dueData) ? dueData.length : 0);

  return (
    <div className={`rm-due-widget${count > 0 ? ' rm-due-widget--alert' : ''}`}>
      <div className="rm-due-widget-icon">
        {count > 0 ? <AlertCircle size={24} /> : <Clock size={24} />}
      </div>

      <div className="rm-due-widget-count">{count}</div>

      <div className="rm-due-widget-label">
        {count === 1 ? 'Due Reminder' : 'Due Reminders'}
      </div>

      {count > 0 && <div className="rm-due-widget-action">Action needed</div>}
    </div>
  );
}
