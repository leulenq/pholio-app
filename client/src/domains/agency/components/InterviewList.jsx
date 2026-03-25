import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, MapPin, Video, AlertCircle } from 'lucide-react';
import { getInterviews } from '../api/agency';
import { AgencyEmptyState } from './ui/AgencyEmptyState';

export default function InterviewList() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInterviews() {
      try {
        const data = await getInterviews();
        setInterviews(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('[InterviewList] Error:', err);
        setInterviews([]);
      } finally {
        setLoading(false);
      }
    }
    fetchInterviews();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 40, justifyContent: 'center', color: 'var(--agency-text-tertiary)' }}>
        <div style={{ width: 18, height: 18, border: '2px solid var(--agency-border)', borderLeftColor: 'var(--agency-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        Loading interviews...
      </div>
    );
  }

  if (interviews.length === 0) {
    return (
      <AgencyEmptyState
        icon={Calendar}
        title="No interviews scheduled"
        description="Schedule interviews with talent from the Applicants page to see them here."
      />
    );
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'TBD';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled': return 'var(--agency-info)';
      case 'completed': return 'var(--agency-success)';
      case 'cancelled': return 'var(--agency-danger)';
      case 'no_show': return 'var(--agency-warning)';
      default: return 'var(--agency-text-tertiary)';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {interviews.map((interview) => (
        <div
          key={interview.id}
          style={{
            background: 'var(--agency-bg-surface)',
            border: '1px solid var(--agency-border)',
            borderRadius: 'var(--agency-radius-md)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            transition: 'all 0.2s ease',
          }}
        >
          {/* Date Badge */}
          <div style={{
            width: 56, height: 56, borderRadius: 12,
            background: 'var(--agency-primary-light)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <Calendar size={18} style={{ color: 'var(--agency-primary)', marginBottom: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--agency-primary)', textTransform: 'uppercase' }}>
              {formatDate(interview.scheduled_at).split(',')[0]}
            </span>
          </div>

          {/* Details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--agency-text-primary)', marginBottom: 4 }}>
              {interview.talent_name || interview.profile_name || 'Talent'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13, color: 'var(--agency-text-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={13} /> {formatDate(interview.scheduled_at)} at {formatTime(interview.scheduled_at)}
              </span>
              {interview.location && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={13} /> {interview.location}
                </span>
              )}
              {interview.type === 'video' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Video size={13} /> Video call
                </span>
              )}
            </div>
          </div>

          {/* Status */}
          <span style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
            padding: '4px 10px', borderRadius: 100,
            background: `${getStatusColor(interview.status)}15`,
            color: getStatusColor(interview.status)
          }}>
            {interview.status || 'Scheduled'}
          </span>
        </div>
      ))}
    </div>
  );
}
