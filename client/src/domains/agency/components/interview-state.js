import { Video, Phone, MapPin } from 'lucide-react';

/* Lifecycle derivation — shared by the page (bucketing) and the row (action). */
export function deriveInterviewState(interview, now = Date.now()) {
  const status = interview.status || 'pending';
  const dt = Date.parse(interview.proposed_datetime);
  const isPast = !Number.isNaN(dt) && dt < now;
  const open = status === 'pending' || status === 'accepted';

  if (status === 'cancelled') return { bucket: 'cancelled', tone: 'cancelled', primary: null };
  if (status === 'completed') return { bucket: 'completed', tone: 'completed', primary: null };

  if (status === 'declined')
    return { bucket: 'action', tone: 'action', reason: 'Declined — propose a new time', primary: 'reschedule' };
  if (status === 'rescheduled')
    return { bucket: 'action', tone: 'action', reason: 'Reschedule requested', primary: 'reschedule' };
  if (open && isPast)
    return { bucket: 'action', tone: 'action', reason: 'Past — mark complete or follow up', primary: 'complete' };
  if (open && interview.interview_type === 'video_call' && !interview.meeting_url)
    return { bucket: 'action', tone: 'action', reason: 'Add a meeting link', primary: 'addlink' };

  if (status === 'accepted')
    return { bucket: 'scheduled', tone: 'scheduled', primary: interview.meeting_url ? 'join' : null };
  return { bucket: 'awaiting', tone: 'awaiting', primary: null };
}

export const TYPE_META = {
  video_call: { icon: Video, label: 'Video' },
  phone_call: { icon: Phone, label: 'Phone' },
  in_person: { icon: MapPin, label: 'In person' },
};

export const monogram = (name) =>
  (name || 'Talent')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '').join('') || 'T';

export function formatWhen(value) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'Time TBD';
  const date = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(dt) - startOfDay(new Date())) / 86400000);
  let rel = date;
  if (days === 0) rel = 'Today';
  else if (days === 1) rel = 'Tomorrow';
  else if (days === -1) rel = 'Yesterday';
  return `${rel} · ${time}`;
}
