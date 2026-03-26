import React from 'react';
import { Building2, Clock } from 'lucide-react';
import './SidebarWidget.css';

export const AgencyInterest = () => {
  // Task 1.3: Limit to 2-3 items max
  const agencies = [
    { name: 'Elite Models', views: 2, initials: 'EM' },
    { name: 'IMG', views: 1, initials: 'IM' },
    { name: 'Ford Models', views: 1, initials: 'FM' },
  ].slice(0, 3);

  return (
    <div className="sidebar-widget">
      <div className="widget-header">
        <h3 className="widget-title">Who's Interested</h3>
      </div>
      
      <div className="agency-list">
        {agencies.map((agency, idx) => (
          <div key={idx} className="agency-card">
            <div className="agency-logo">
              {agency.initials}
            </div>
            <div className="agency-info">
               <h4>{agency.name}</h4>
               {/* Task 4.2: Update context text */}
               {/* Task 10.3: Timestamp with Icon */}
               <div className="agency-timestamp">
                  <Clock size={12} className="agency-time-icon" />
                  <span>Last viewed: {agency.views * 2}h ago</span>
               </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
