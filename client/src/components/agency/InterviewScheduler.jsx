import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Calendar, Clock, Video, Phone, MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { scheduleInterview } from '../../api/agency';

/**
 * InterviewScheduler Component
 * Modal for agencies to schedule interviews with talent
 */
export default function InterviewScheduler({ applicationId, talentName, onClose }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    proposed_datetime: '',
    duration_minutes: 30,
    interview_type: 'video_call',
    location: '',
    meeting_url: '',
    notes: ''
  });

  const scheduleMutation = useMutation({
    mutationFn: (data) => scheduleInterview(applicationId, data),
    onSuccess: () => {
      toast.success('Interview scheduled successfully');
      queryClient.invalidateQueries(['application', applicationId]);
      queryClient.invalidateQueries(['interviews']);
      onClose();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to schedule interview');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate
    if (!formData.proposed_datetime) {
      toast.error('Please select date and time');
      return;
    }

    if (formData.interview_type === 'video_call' && !formData.meeting_url) {
      toast.error('Please provide meeting URL for video call');
      return;
    }

    if (formData.interview_type === 'in_person' && !formData.location) {
      toast.error('Please provide location for in-person interview');
      return;
    }

    scheduleMutation.mutate(formData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Schedule Interview</h2>
            <p className="text-sm text-gray-500 mt-1">
              With {talentName || 'talent'}
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
          {/* Interview Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Interview Type *
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleChange('interview_type', 'video_call')}
                className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-colors ${
                  formData.interview_type === 'video_call'
                    ? 'border-amber-600 bg-amber-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Video className="w-5 h-5" />
                <span className="text-sm font-medium">Video Call</span>
              </button>
              <button
                type="button"
                onClick={() => handleChange('interview_type', 'phone_call')}
                className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-colors ${
                  formData.interview_type === 'phone_call'
                    ? 'border-amber-600 bg-amber-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Phone className="w-5 h-5" />
                <span className="text-sm font-medium">Phone Call</span>
              </button>
              <button
                type="button"
                onClick={() => handleChange('interview_type', 'in_person')}
                className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-colors ${
                  formData.interview_type === 'in_person'
                    ? 'border-amber-600 bg-amber-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <MapPin className="w-5 h-5" />
                <span className="text-sm font-medium">In Person</span>
              </button>
            </div>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Date & Time *
              </label>
              <input
                type="datetime-local"
                value={formData.proposed_datetime}
                onChange={(e) => handleChange('proposed_datetime', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                Duration (minutes)
              </label>
              <select
                value={formData.duration_minutes}
                onChange={(e) => handleChange('duration_minutes', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
          </div>

          {/* Meeting URL (Video Call) */}
          {formData.interview_type === 'video_call' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Meeting URL *
              </label>
              <input
                type="url"
                value={formData.meeting_url}
                onChange={(e) => handleChange('meeting_url', e.target.value)}
                placeholder="https://zoom.us/j/123456789 or https://meet.google.com/abc-defg-hij"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Provide Zoom, Google Meet, or other video call link
              </p>
            </div>
          )}

          {/* Location (In Person) */}
          {formData.interview_type === 'in_person' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location *
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => handleChange('location', e.target.value)}
                placeholder="123 Main St, New York, NY 10001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
          )}

          {/* Notes/Agenda */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes / Agenda
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Add any notes or agenda items for the interview..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={scheduleMutation.isPending}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={scheduleMutation.isPending}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {scheduleMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                'Schedule Interview'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
