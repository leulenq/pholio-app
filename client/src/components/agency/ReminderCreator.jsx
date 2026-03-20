import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Bell, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createReminder } from '../../api/agency';

/**
 * ReminderCreator Component
 * Modal for creating follow-up reminders
 */
export default function ReminderCreator({ applicationId, talentName, onClose }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    reminder_type: 'follow_up',
    reminder_date: '',
    title: '',
    notes: '',
    priority: 'normal'
  });

  const createMutation = useMutation({
    mutationFn: (data) => createReminder(applicationId, data),
    onSuccess: () => {
      toast.success('Reminder created successfully');
      queryClient.invalidateQueries(['reminders']);
      queryClient.invalidateQueries(['application-reminders', applicationId]);
      queryClient.invalidateQueries(['due-reminders-count']);
      onClose();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create reminder');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.reminder_date) {
      toast.error('Please select a reminder date');
      return;
    }

    if (!formData.title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    createMutation.mutate(formData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleQuickDate = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(9, 0, 0, 0); // Set to 9 AM
    const formatted = date.toISOString().slice(0, 16);
    handleChange('reminder_date', formatted);
  };

  const reminderTypes = [
    { value: 'follow_up', label: 'Follow Up', description: 'General follow-up' },
    { value: 'callback', label: 'Callback', description: 'Schedule a call' },
    { value: 'review', label: 'Review', description: 'Review application' },
    { value: 'interview_prep', label: 'Interview Prep', description: 'Prepare for interview' },
    { value: 'custom', label: 'Custom', description: 'Custom reminder' }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Create Reminder</h2>
            <p className="text-sm text-gray-500 mt-1">
              For {talentName || 'talent'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Reminder Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reminder Type *
            </label>
            <div className="grid grid-cols-2 gap-3">
              {reminderTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleChange('reminder_type', type.value)}
                  className={`text-left p-3 border-2 rounded-lg transition-colors ${
                    formData.reminder_type === type.value
                      ? 'border-amber-600 bg-amber-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm">{type.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{type.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="e.g., Follow up on application status"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>

          {/* Date and Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clock className="w-4 h-4 inline mr-1" />
              Reminder Date & Time *
            </label>
            <input
              type="datetime-local"
              value={formData.reminder_date}
              onChange={(e) => handleChange('reminder_date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => handleQuickDate(1)}
                className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate(3)}
                className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                In 3 days
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate(7)}
                className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                In 1 week
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate(14)}
                className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                In 2 weeks
              </button>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              Priority
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleChange('priority', 'low')}
                className={`flex-1 py-2 px-4 border-2 rounded-lg text-sm font-medium transition-colors ${
                  formData.priority === 'low'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                Low
              </button>
              <button
                type="button"
                onClick={() => handleChange('priority', 'normal')}
                className={`flex-1 py-2 px-4 border-2 rounded-lg text-sm font-medium transition-colors ${
                  formData.priority === 'normal'
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => handleChange('priority', 'high')}
                className={`flex-1 py-2 px-4 border-2 rounded-lg text-sm font-medium transition-colors ${
                  formData.priority === 'high'
                    ? 'border-red-600 bg-red-50 text-red-700'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                High
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Add any additional notes or context..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={createMutation.isPending}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4" />
                  Create Reminder
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
