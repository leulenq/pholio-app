import React from 'react';
import { Eye, Download, Edit, Clock, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import './RecentActivity.css';

// Mock hook since backend endpoint doesn't exist yet
const useRecentActivity = () => {
  // Simulate loading and data
  const data = [
    { id: 1, type: 'view', description: 'Agency "Elite Models" viewed your profile', time: '2 hours ago' },
    { id: 2, type: 'download', description: 'Scout downloaded your comp card', time: 'Yesterday' },
    { id: 3, type: 'update', description: 'You updated your measurements', time: '2 days ago' },
    { id: 4, type: 'view', description: 'Anonymous agency viewed your portfolio', time: '3 days ago' },
    { id: 5, type: 'view', description: 'Casting Director checked your availability', time: '5 days ago' },
  ];
  return { data, isLoading: false };
};

export const RecentActivity = () => {
  const { data: activities, isLoading } = useRecentActivity();

  const getIcon = (type) => {
    switch(type) {
      case 'view': return <Eye size={16} />;
      case 'download': return <Download size={16} />;
      case 'update': return <Edit size={16} />;
      default: return <Clock size={16} />;
    }
  };

  const getColorClass = (type) => {
    switch(type) {
      case 'view': return 'icon-blue';
      case 'download': return 'icon-purple';
      case 'update': return 'icon-gold';
      default: return 'icon-slate';
    }
  };

  return (
    <section className="recent-activity-section">
      <div className="activity-header">
        <div>
          <h2 className="activity-title">Recent Activity</h2>
          <span className="activity-subtitle">Last 7 days</span>
        </div>
        <Link to="/dashboard/talent/analytics" className="activity-link">
          View All →
        </Link>
      </div>

      <div className="activity-list">
        {isLoading ? (
          // Skeleton
          [1,2,3].map(i => <div key={i} className="activity-item skeleton-item"></div>)
        ) : activities.length > 0 ? (
          activities.map((item) => (
            <div key={item.id} className="activity-item">
              <div className={`activity-icon-circle ${getColorClass(item.type)}`}>
                {getIcon(item.type)}
              </div>
              <div className="activity-content">
                <p className="activity-desc">{item.description}</p>
              </div>
              <span className="activity-time">{item.time}</span>
            </div>
          ))
        ) : (
          // Empty State
          <div className="activity-empty">
             <AlertCircle size={24} className="text-slate-400 mb-2" />
             <p>No recent activity yet. Your portfolio is ready to be discovered!</p>
          </div>
        )}
      </div>
    </section>
  );
};
