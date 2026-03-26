import React, { useState, useEffect } from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import { getDueRemindersCount } from '../api/agency';

export default function DueReminders({ limit = 10 }) {
  const [dueData, setDueData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDue() {
      try {
        const data = await getDueRemindersCount();
        setDueData(data);
      } catch (err) {
        console.error('[DueReminders] Error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchDue();
  }, []);

  if (loading) {
    return (
      <div style={{
        background: 'var(--agency-bg-surface)',
        border: '1px solid var(--agency-border)',
        borderRadius: 'var(--agency-radius-md)',
        padding: 20,
        textAlign: 'center',
        color: 'var(--agency-text-tertiary)',
        fontSize: 13
      }}>
        Loading...
      </div>
    );
  }

  const count = dueData?.count || dueData?.due_count || (Array.isArray(dueData) ? dueData.length : 0);

  return (
    <div style={{
      background: count > 0 ? 'rgba(220, 38, 38, 0.04)' : 'var(--agency-bg-surface)',
      border: `1px solid ${count > 0 ? 'rgba(220, 38, 38, 0.2)' : 'var(--agency-border)'}`,
      borderRadius: 'var(--agency-radius-md)',
      padding: 24,
      textAlign: 'center'
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, margin: '0 auto 12px',
        background: count > 0 ? 'rgba(220, 38, 38, 0.1)' : 'var(--agency-primary-light)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: count > 0 ? 'var(--agency-danger)' : 'var(--agency-primary)'
      }}>
        {count > 0 ? <AlertCircle size={24} /> : <Clock size={24} />}
      </div>

      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700,
        color: count > 0 ? 'var(--agency-danger)' : 'var(--agency-text-primary)',
        marginBottom: 4
      }}>
        {count}
      </div>

      <div style={{
        fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--agency-text-tertiary)', fontWeight: 600
      }}>
        {count === 1 ? 'Due Reminder' : 'Due Reminders'}
      </div>

      {count > 0 && (
        <div style={{
          marginTop: 12, fontSize: 12, color: 'var(--agency-danger)', fontWeight: 500
        }}>
          Action needed
        </div>
      )}
    </div>
  );
}
