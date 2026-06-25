import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Video, Phone, MapPin, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { TALENT_NOTIFICATIONS_QUERY_KEY } from '../../../shared/components/NotificationCenter/NotificationCenter';
import { talentApi } from '../api/talent';
import './ApplicationInterviews.css';

const TYPE_META = {
  video_call: { icon: Video, label: 'Video call' },
  phone_call: { icon: Phone, label: 'Phone call' },
  in_person: { icon: MapPin, label: 'In person' },
};

const STATUS_LABEL = {
  pending: 'Awaiting your response',
  rescheduled: 'New time — please confirm',
  accepted: 'You accepted',
  declined: 'You declined',
  cancelled: 'Cancelled by the agency',
  completed: 'Completed',
};

function formatWhen(value) {
  if (!value) return 'Time to be confirmed';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time to be confirmed';
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export default function ApplicationInterviews({ applicationId }) {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState(null); // { id, action }

  const interviewsQuery = useQuery({
    queryKey: ['talent-interviews'],
    queryFn: talentApi.getInterviews,
    staleTime: 1000 * 30,
  });

  const interviews = asList(interviewsQuery.data).filter(
    (iv) => iv.application_id === applicationId,
  );

  const respond = useMutation({
    mutationFn: ({ id, action }) => talentApi.respondToInterview(id, { action }),
    onMutate: (vars) => setPendingAction(vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['talent-interviews'] });
      queryClient.invalidateQueries({ queryKey: TALENT_NOTIFICATIONS_QUERY_KEY });
      toast.success(vars.action === 'accept' ? 'Interview accepted' : 'Interview declined');
    },
    onError: (err) => toast.error(err?.message || 'Could not send your response'),
    onSettled: () => setPendingAction(null),
  });

  if (!interviews.length) return null;

  return (
    <div className="app-iv">
      <span className="app-iv__title">Interviews</span>
      {interviews.map((iv) => {
        const type = TYPE_META[iv.interview_type] || { icon: Calendar, label: iv.interview_type || 'Interview' };
        const TypeIcon = type.icon;
        const canRespond = iv.status === 'pending' || iv.status === 'rescheduled';
        const showLink = iv.meeting_url && iv.status !== 'cancelled' && iv.status !== 'declined';
        const busy = pendingAction?.id === iv.id;

        return (
          <div key={iv.id} className={`app-iv__card app-iv__card--${iv.status}`}>
            <div className="app-iv__when">
              <Calendar size={14} aria-hidden />
              <strong>{formatWhen(iv.proposed_datetime)}</strong>
            </div>

            <div className="app-iv__meta">
              <span>
                <TypeIcon size={13} aria-hidden /> {type.label}
              </span>
              {iv.duration_minutes ? <span>{iv.duration_minutes} min</span> : null}
            </div>

            {iv.location && <p className="app-iv__detail">{iv.location}</p>}
            {showLink && (
              <a className="app-iv__link" href={iv.meeting_url} target="_blank" rel="noreferrer">
                Meeting link
              </a>
            )}
            {iv.notes && <p className="app-iv__notes">{iv.notes}</p>}

            <span className={`app-iv__status app-iv__status--${iv.status}`}>
              {STATUS_LABEL[iv.status] || iv.status}
            </span>

            {canRespond && (
              <div className="app-iv__actions">
                <button
                  type="button"
                  className="app-iv__accept"
                  disabled={busy}
                  onClick={() => respond.mutate({ id: iv.id, action: 'accept' })}
                >
                  {busy && pendingAction?.action === 'accept' ? (
                    <Loader2 size={13} className="app-spin" aria-hidden />
                  ) : (
                    <Check size={13} aria-hidden />
                  )}
                  Accept
                </button>
                <button
                  type="button"
                  className="app-iv__decline"
                  disabled={busy}
                  onClick={() => respond.mutate({ id: iv.id, action: 'decline' })}
                >
                  {busy && pendingAction?.action === 'decline' ? (
                    <Loader2 size={13} className="app-spin" aria-hidden />
                  ) : (
                    <X size={13} aria-hidden />
                  )}
                  Decline
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
