import { useQuery } from '@tanstack/react-query';
import { getTimeline } from '../../api/agency';
import { formatDistanceToNow } from 'date-fns';
import {
  Clock,
  CheckCircle,
  XCircle,
  Archive,
  MessageSquare,
  Tag,
  Edit,
  Trash2,
  UserPlus,
  FileText
} from 'lucide-react';

/**
 * ActivityTimeline Component
 * Displays chronological timeline of all activities for an application
 */
export default function ActivityTimeline({ applicationId }) {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['timeline', applicationId],
    queryFn: () => getTimeline(applicationId),
    enabled: !!applicationId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading timeline...
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="w-12 h-12 mx-auto mb-2 text-gray-400" />
        <p className="text-gray-500">No activity yet</p>
        <p className="text-sm text-gray-400">Activity will appear here as actions are taken</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-gray-600" />
        <h3 className="font-semibold text-gray-900">Activity Timeline</h3>
        <span className="text-sm text-gray-500">({activities.length})</span>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-4">
          {activities.map((activity, index) => (
            <ActivityItem
              key={activity.id}
              activity={activity}
              isLast={index === activities.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * ActivityItem Component
 * Individual activity entry in the timeline
 */
function ActivityItem({ activity, isLast }) {
  const { icon, color, bgColor } = getActivityStyle(activity.activity_type);
  const Icon = icon;

  return (
    <div className="relative pl-10">
      {/* Icon */}
      <div
        className={`absolute left-0 w-8 h-8 rounded-full ${bgColor} ${color} flex items-center justify-center z-10`}
      >
        <Icon className="w-4 h-4" />
      </div>

      {/* Content */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">
              {activity.description}
            </p>
            {activity.metadata && Object.keys(activity.metadata).length > 0 && (
              <ActivityMetadata metadata={activity.metadata} activityType={activity.activity_type} />
            )}
          </div>
          <div className="text-xs text-gray-500 whitespace-nowrap">
            {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ActivityMetadata Component
 * Displays additional details for specific activity types
 */
function ActivityMetadata({ metadata, activityType }) {
  if (!metadata) return null;

  return (
    <div className="mt-2 text-xs text-gray-600 space-y-1">
      {activityType === 'status_change' && metadata.old_status && (
        <p>
          Changed from <span className="font-medium">{metadata.old_status}</span> to{' '}
          <span className="font-medium">{metadata.new_status}</span>
        </p>
      )}

      {activityType === 'note_added' && metadata.note_preview && (
        <p className="italic">"{metadata.note_preview}..."</p>
      )}

      {activityType === 'tag_added' && metadata.tag_name && (
        <p>
          Tag: <span className="font-medium">{metadata.tag_name}</span>
        </p>
      )}

      {activityType === 'tag_removed' && metadata.tag_name && (
        <p>
          Tag: <span className="font-medium">{metadata.tag_name}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Get icon and colors for activity type
 */
function getActivityStyle(activityType) {
  const styles = {
    status_change: {
      icon: CheckCircle,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    note_added: {
      icon: MessageSquare,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    note_edited: {
      icon: Edit,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
    },
    note_deleted: {
      icon: Trash2,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
    tag_added: {
      icon: Tag,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100',
    },
    tag_removed: {
      icon: Tag,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
    },
    application_created: {
      icon: UserPlus,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100',
    },
    profile_viewed: {
      icon: FileText,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-100',
    },
  };

  return styles[activityType] || {
    icon: Clock,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  };
}
