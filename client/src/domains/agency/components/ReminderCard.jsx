import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, User, Check, AlarmClock, Trash2, AlertCircle, MoreVertical, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { completeReminder, snoozeReminder, deleteReminder, updateReminder } from '../api/agency';

/**
 * ReminderCard Component
 * Display individual reminder with actions
 */
export default function ReminderCard({ reminder }) {
  const queryClient = useQueryClient();
  const [showMenu, setShowMenu] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');

  const completeMutation = useMutation({
    mutationFn: () => completeReminder(reminder.id),
    onSuccess: () => {
      toast.success('Reminder completed');
      queryClient.invalidateQueries(['reminders']);
      queryClient.invalidateQueries(['due-reminders-count']);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to complete reminder');
    }
  });

  const snoozeMutation = useMutation({
    mutationFn: (date) => snoozeReminder(reminder.id, date),
    onSuccess: () => {
      toast.success('Reminder snoozed');
      queryClient.invalidateQueries(['reminders']);
      queryClient.invalidateQueries(['due-reminders-count']);
      setShowSnooze(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to snooze reminder');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteReminder(reminder.id),
    onSuccess: () => {
      toast.success('Reminder deleted');
      queryClient.invalidateQueries(['reminders']);
      queryClient.invalidateQueries(['due-reminders-count']);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete reminder');
    }
  });

  const handleComplete = () => {
    completeMutation.mutate();
    setShowMenu(false);
  };

  const handleSnooze = () => {
    if (!snoozeDate) {
      toast.error('Please select a date');
      return;
    }
    snoozeMutation.mutate(snoozeDate);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this reminder?')) {
      deleteMutation.mutate();
    }
    setShowMenu(false);
  };

  const handleQuickSnooze = (hours) => {
    const date = new Date();
    date.setHours(date.getHours() + hours);
    const formatted = date.toISOString().slice(0, 16);
    setSnoozeDate(formatted);
    snoozeMutation.mutate(formatted);
  };

  const formatDateTime = (datetime) => {
    if (!datetime) return '';
    const date = new Date(datetime);
    const now = new Date();
    const diffMs = date - now;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMs < 0) {
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }) + ' (Overdue)';
    } else if (diffHours < 24) {
      return `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Tomorrow at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    } else {
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        hour: 'numeric',
        minute: '2-digit'
      });
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-50';
      case 'normal':
        return 'text-green-600 bg-green-50';
      case 'low':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getTypeLabel = (type) => {
    const labels = {
      follow_up: 'Follow Up',
      callback: 'Callback',
      review: 'Review',
      interview_prep: 'Interview Prep',
      custom: 'Custom'
    };
    return labels[type] || type;
  };

  const isOverdue = new Date(reminder.reminder_date) < new Date();

  return (
    <div className={`border rounded-lg p-4 hover:border-amber-300 transition-colors ${
      isOverdue && reminder.status === 'pending' ? 'border-red-300 bg-red-50' : 'border-gray-200'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase">
              {getTypeLabel(reminder.reminder_type)}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPriorityColor(reminder.priority)}`}>
              {reminder.priority}
            </span>
          </div>
          <h3 className="font-medium text-gray-900">{reminder.title}</h3>
        </div>
        {reminder.status !== 'completed' && reminder.status !== 'cancelled' && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <MoreVertical className="w-4 h-4 text-gray-500" />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <button
                  onClick={handleComplete}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-green-600"
                >
                  <Check className="w-4 h-4" />
                  Complete
                </button>
                <button
                  onClick={() => {
                    setShowSnooze(true);
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <Snooze className="w-4 h-4" />
                  Snooze
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 text-sm">
          <Clock className={`w-4 h-4 ${isOverdue && reminder.status === 'pending' ? 'text-red-600' : 'text-gray-400'}`} />
          <span className={isOverdue && reminder.status === 'pending' ? 'text-red-600 font-medium' : 'text-gray-700'}>
            {formatDateTime(reminder.reminder_date)}
          </span>
        </div>
        {reminder.talent_name && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <User className="w-4 h-4 text-gray-400" />
            <span>{reminder.talent_name}</span>
          </div>
        )}
      </div>

      {reminder.notes && (
        <div className="bg-gray-50 p-3 rounded-lg mb-3">
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{reminder.notes}</p>
        </div>
      )}

      {/* Snooze Interface */}
      {showSnooze && (
        <div className="bg-amber-50 p-3 rounded-lg space-y-3">
          <p className="text-sm font-medium text-amber-900">Snooze until:</p>
          <input
            type="datetime-local"
            value={snoozeDate}
            onChange={(e) => setSnoozeDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleQuickSnooze(1)}
              className="text-xs px-3 py-1 bg-white text-amber-700 border border-amber-300 rounded hover:bg-amber-50"
            >
              1 hour
            </button>
            <button
              onClick={() => handleQuickSnooze(4)}
              className="text-xs px-3 py-1 bg-white text-amber-700 border border-amber-300 rounded hover:bg-amber-50"
            >
              4 hours
            </button>
            <button
              onClick={() => handleQuickSnooze(24)}
              className="text-xs px-3 py-1 bg-white text-amber-700 border border-amber-300 rounded hover:bg-amber-50"
            >
              Tomorrow
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSnooze(false)}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSnooze}
              disabled={snoozeMutation.isPending}
              className="flex-1 px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {snoozeMutation.isPending ? 'Snoozing...' : 'Snooze'}
            </button>
          </div>
        </div>
      )}

      {/* Status badge */}
      {reminder.status === 'completed' && (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
          <Check className="w-4 h-4" />
          <span>Completed {reminder.completed_at ? new Date(reminder.completed_at).toLocaleDateString() : ''}</span>
        </div>
      )}
    </div>
  );
}
