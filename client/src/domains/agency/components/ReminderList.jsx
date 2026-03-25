import React, { useState, useEffect } from 'react';
import { Bell, Clock, CheckCircle, RotateCcw, Trash2, AlertCircle } from 'lucide-react';
import { getReminders, completeReminder, snoozeReminder, deleteReminder } from '../api/agency';
import { AgencyEmptyState } from './ui/AgencyEmptyState';

export default function ReminderList() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReminders = async () => {
    try {
      const data = await getReminders();
      setReminders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[ReminderList] Error:', err);
      setReminders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReminders();
  }, []);

  const handleComplete = async (id) => {
    try {
      await completeReminder(id);
      fetchReminders();
    } catch (err) {
      console.error('Complete reminder failed:', err);
    }
  };

  const handleSnooze = async (id) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    try {
      await snoozeReminder(id, tomorrow.toISOString());
      fetchReminders();
    } catch (err) {
      console.error('Snooze reminder failed:', err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteReminder(id);
      fetchReminders();
    } catch (err) {
      console.error('Delete reminder failed:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 40, justifyContent: 'center', color: 'var(--agency-text-tertiary)' }}>
        <div style={{ width: 18, height: 18, border: '2px solid var(--agency-border)', borderLeftColor: 'var(--agency-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        Loading reminders...
      </div>
    );
  }

  if (reminders.length === 0) {
    return (
      <AgencyEmptyState
        icon={Bell}
        title="No reminders"
        description="Create reminders from the Applicants page to stay on top of follow-ups."
      />
    );
  }

  const isOverdue = (dateStr) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'No date';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = d - now;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays < -1) return `${Math.abs(diffDays)} days ago`;
    if (diffDays < 7) return `In ${diffDays} days`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {reminders.map((reminder) => {
        const overdue = isOverdue(reminder.due_at || reminder.remind_at);
        const completed = reminder.completed || reminder.status === 'completed';

        return (
          <div
            key={reminder.id}
            style={{
              background: 'var(--agency-bg-surface)',
              border: `1px solid ${overdue && !completed ? 'var(--agency-danger)' : 'var(--agency-border)'}`,
              borderRadius: 'var(--agency-radius-md)',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              opacity: completed ? 0.5 : 1,
              transition: 'all 0.2s ease',
            }}
          >
            {/* Icon */}
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: overdue && !completed ? 'rgba(220, 38, 38, 0.1)' : 'var(--agency-primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, color: overdue && !completed ? 'var(--agency-danger)' : 'var(--agency-primary)'
            }}>
              {completed ? <CheckCircle size={18} /> : overdue ? <AlertCircle size={18} /> : <Bell size={18} />}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 500, fontSize: 14, color: 'var(--agency-text-primary)',
                textDecoration: completed ? 'line-through' : 'none',
                marginBottom: 2
              }}>
                {reminder.note || reminder.title || 'Reminder'}
              </div>
              <div style={{ fontSize: 12, color: overdue && !completed ? 'var(--agency-danger)' : 'var(--agency-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={12} />
                {formatDate(reminder.due_at || reminder.remind_at)}
                {reminder.talent_name && ` • ${reminder.talent_name}`}
              </div>
            </div>

            {/* Actions */}
            {!completed && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => handleComplete(reminder.id)}
                  title="Complete"
                  style={{ width: 30, height: 30, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--agency-success)' }}
                >
                  <CheckCircle size={16} />
                </button>
                <button
                  onClick={() => handleSnooze(reminder.id)}
                  title="Snooze 1 day"
                  style={{ width: 30, height: 30, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--agency-text-tertiary)' }}
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  onClick={() => handleDelete(reminder.id)}
                  title="Delete"
                  style={{ width: 30, height: 30, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--agency-text-tertiary)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
