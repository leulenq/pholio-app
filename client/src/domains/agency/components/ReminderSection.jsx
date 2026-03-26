import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Plus, Loader2 } from 'lucide-react';
import { getApplicationReminders } from '../api/agency';
import ReminderCreator from './ReminderCreator';
import ReminderCard from './ReminderCard';

/**
 * ReminderSection Component
 * Shows reminders for a specific application with creation capability
 */
export default function ReminderSection({ applicationId, talentName }) {
  const [showCreator, setShowCreator] = useState(false);

  const { data: reminders, isLoading } = useQuery({
    queryKey: ['application-reminders', applicationId],
    queryFn: () => getApplicationReminders(applicationId),
    enabled: !!applicationId
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-600" />
          <h3 className="font-semibold text-gray-900">Reminders</h3>
        </div>
        <button
          onClick={() => setShowCreator(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Reminder
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : reminders && reminders.length > 0 ? (
          <div className="space-y-3">
            {reminders.map((reminder) => (
              <ReminderCard key={reminder.id} reminder={reminder} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Bell className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No reminders set</p>
            <button
              onClick={() => setShowCreator(true)}
              className="text-sm text-amber-600 hover:underline mt-2"
            >
              Create your first reminder
            </button>
          </div>
        )}
      </div>

      {/* Creator Modal */}
      {showCreator && (
        <ReminderCreator
          applicationId={applicationId}
          talentName={talentName}
          onClose={() => setShowCreator(false)}
        />
      )}
    </div>
  );
}
