import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Clock, 
  CheckCircle, 
  MessageSquare, 
  Tag, 
  UserPlus, 
  FileText,
  AlertCircle,
  Loader2,
  ChevronRight
} from 'lucide-react';
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import { Link } from 'react-router-dom';
import { getAgencyActivity } from '../../api/agency';
import './ActivityPage.css';

const ACTIVITY_STYLES = {
  status_change: {
    icon: CheckCircle,
    color: 'var(--ag-gold-base)',
    bgColor: 'rgba(201, 165, 90, 0.1)',
  },
  note_added: {
    icon: MessageSquare,
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
  },
  application_created: {
    icon: UserPlus,
    color: '#6366f1',
    bgColor: 'rgba(99, 102, 241, 0.1)',
  },
  profile_viewed: {
    icon: FileText,
    color: '#06b6d4',
    bgColor: 'rgba(6, 182, 212, 0.1)',
  }
};

function getActivityStyle(type) {
  return ACTIVITY_STYLES[type] || {
    icon: Clock,
    color: 'var(--ag-text-3)',
    bgColor: 'var(--ag-bg-elevated)',
  };
}

function groupActivitiesByDate(activities) {
  return activities.reduce((groups, activity) => {
    const date = new Date(activity.created_at);
    let label = format(date, 'MMMM d, yyyy');
    
    if (isToday(date)) label = 'Today';
    else if (isYesterday(date)) label = 'Yesterday';
    
    if (!groups[label]) groups[label] = [];
    groups[label].push(activity);
    return groups;
  }, {});
}

export default function ActivityPage() {
  const { data: activities = [], isLoading, isError } = useQuery({
    queryKey: ['agency', 'activity'],
    queryFn: getAgencyActivity,
    refetchInterval: 60000,
  });

  const grouped = groupActivitiesByDate(activities);

  return (
    <div className="st-activity-page">
      <div className="st-page-grain" />
      <div className="st-activity-container">
        <header className="st-activity-header">
          <div className="st-activity-header-left">
            <h1 className="st-activity-title">Activity Feed</h1>
            <p className="st-activity-subtitle">Keep track of every movement across your roster.</p>
          </div>
        </header>

        <div className="st-activity-content">
          {isLoading ? (
            <div className="st-activity-loading">
              <Loader2 className="animate-spin" size={32} />
              <p>Fetching latest activity...</p>
            </div>
          ) : isError ? (
            <div className="st-activity-error">
              <AlertCircle size={40} />
              <p>Failed to load activity feed. Please try again later.</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="st-activity-empty">
              <Clock size={48} strokeWidth={1} />
              <h3>No activity yet</h3>
              <p>Events will appear here as your team interacts with talent.</p>
            </div>
          ) : (
            Object.entries(grouped).map(([dateLabel, items]) => (
              <section key={dateLabel} className="st-activity-group">
                <h2 className="st-activity-date-label">{dateLabel}</h2>
                <div className="st-activity-items">
                  {items.map((item) => {
                    const style = getActivityStyle(item.activity_type);
                    const Icon = style.icon;
                    
                    return (
                      <div key={item.id} className="st-activity-item">
                        <div className="st-activity-icon-col">
                          <div className="st-activity-icon-wrap" style={{ color: style.color, background: style.bgColor }}>
                            <Icon size={18} />
                          </div>
                          <div className="st-activity-line" />
                        </div>
                        
                        <div className="st-activity-main">
                          <div className="st-activity-body">
                            <span className="st-activity-talent">{item.talentName}</span>
                            <span className="st-activity-desc">{item.description}</span>
                            {item.activity_type === 'status_change' && item.metadata?.new_status && (
                              <span className="st-activity-status-tag" data-status={item.metadata.new_status}>
                                {item.metadata.new_status}
                              </span>
                            )}
                          </div>
                          
                          <div className="st-activity-meta">
                            <span className="st-activity-context">{item.application_label}</span>
                            <span className="st-activity-dot" />
                            <span className="st-activity-time">
                              {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>

                        <Link to={`/dashboard/agency/applicants?id=${item.application_id}`} className="st-activity-arrow">
                          <ChevronRight size={18} />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
