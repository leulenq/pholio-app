import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Plus, Loader2 } from 'lucide-react';
import { getApplicationInterviews } from '../../api/agency';
import InterviewScheduler from './InterviewScheduler';
import InterviewCard from './InterviewCard';

/**
 * InterviewSection Component
 * Shows interviews for a specific application with scheduling capability
 */
export default function InterviewSection({ applicationId, talentName }) {
  const [showScheduler, setShowScheduler] = useState(false);

  const { data: interviews, isLoading } = useQuery({
    queryKey: ['application-interviews', applicationId],
    queryFn: () => getApplicationInterviews(applicationId),
    enabled: !!applicationId
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-amber-600" />
          <h3 className="font-semibold text-gray-900">Interviews</h3>
        </div>
        <button
          onClick={() => setShowScheduler(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Schedule Interview
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : interviews && interviews.length > 0 ? (
          <div className="space-y-3">
            {interviews.map((interview) => (
              <InterviewCard key={interview.id} interview={interview} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No interviews scheduled yet</p>
            <button
              onClick={() => setShowScheduler(true)}
              className="text-sm text-amber-600 hover:underline mt-2"
            >
              Schedule your first interview
            </button>
          </div>
        )}
      </div>

      {/* Scheduler Modal */}
      {showScheduler && (
        <InterviewScheduler
          applicationId={applicationId}
          talentName={talentName}
          onClose={() => setShowScheduler(false)}
        />
      )}
    </div>
  );
}
