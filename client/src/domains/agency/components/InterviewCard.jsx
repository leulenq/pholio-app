import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Clock, Video, Phone, MapPin, User, MoreVertical, Edit2, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cancelInterview, updateInterview } from '../api/agency';

/**
 * InterviewCard Component
 * Display individual interview with actions
 */
export default function InterviewCard({ interview }) {
  const queryClient = useQueryClient();
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    proposed_datetime: interview.proposed_datetime?.substring(0, 16) || '',
    notes: interview.notes || ''
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelInterview(interview.id),
    onSuccess: () => {
      toast.success('Interview cancelled');
      queryClient.invalidateQueries(['interviews']);
      queryClient.invalidateQueries(['application', interview.application_id]);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to cancel interview');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data) => updateInterview(interview.id, data),
    onSuccess: () => {
      toast.success('Interview updated');
      queryClient.invalidateQueries(['interviews']);
      queryClient.invalidateQueries(['application', interview.application_id]);
      setIsEditing(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update interview');
    }
  });

  const handleCancel = () => {
    if (confirm('Are you sure you want to cancel this interview?')) {
      cancelMutation.mutate();
    }
    setShowMenu(false);
  };

  const handleSaveEdit = () => {
    updateMutation.mutate(editData);
  };

  const formatDateTime = (datetime) => {
    if (!datetime) return '';
    const date = new Date(datetime);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'accepted':
        return 'bg-green-100 text-green-800';
      case 'declined':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'video_call':
        return <Video className="w-4 h-4" />;
      case 'phone_call':
        return <Phone className="w-4 h-4" />;
      case 'in_person':
        return <MapPin className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'video_call':
        return 'Video Call';
      case 'phone_call':
        return 'Phone Call';
      case 'in_person':
        return 'In Person';
      default:
        return type;
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-amber-300 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{interview.talent_name || 'Unknown'}</h3>
            <p className="text-sm text-gray-500">{interview.talent_email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(interview.status)}`}>
            {interview.status}
          </span>
          {interview.status !== 'cancelled' && interview.status !== 'completed' && (
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
                    onClick={() => {
                      setIsEditing(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    Reschedule
                  </button>
                  <button
                    onClick={handleCancel}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Interview Details */}
      {isEditing ? (
        <div className="space-y-3 bg-gray-50 p-3 rounded-lg">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">New Date & Time</label>
            <input
              type="datetime-local"
              value={editData.proposed_datetime}
              onChange={(e) => setEditData(prev => ({ ...prev, proposed_datetime: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={editData.notes}
              onChange={(e) => setEditData(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              className="flex-1 px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>{formatDateTime(interview.proposed_datetime)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>{interview.duration_minutes} minutes</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              {getTypeIcon(interview.interview_type)}
              <span>{getTypeLabel(interview.interview_type)}</span>
            </div>
            {interview.meeting_url && (
              <div className="flex items-center gap-2 text-sm">
                <ExternalLink className="w-4 h-4 text-gray-400" />
                <a
                  href={interview.meeting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-600 hover:underline"
                >
                  Join Meeting
                </a>
              </div>
            )}
            {interview.location && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span>{interview.location}</span>
              </div>
            )}
          </div>

          {interview.notes && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs font-medium text-gray-700 mb-1">Notes</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{interview.notes}</p>
            </div>
          )}

          {interview.response_message && (
            <div className="bg-amber-50 p-3 rounded-lg mt-3">
              <p className="text-xs font-medium text-amber-900 mb-1">Talent Response</p>
              <p className="text-sm text-amber-800">{interview.response_message}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
