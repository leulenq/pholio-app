import React from 'react';
import { Bell, Clock } from 'lucide-react';
import './AgencyEngagementHero.css';

export const AgencyEngagementHero = ({ activityStream = [] }) => {
  const activities = activityStream;

  // Condition 1: Empty State
  if (!activities || activities.length === 0) {
    return (
      <section className="mb-0">
         <h2 
           className="text-xl text-slate-900 mb-4"
           style={{ fontFamily: 'var(--font-display)' }}
         >
           Activity Stream
         </h2>
         <div className="bg-white rounded-xl shadow-sm p-12 text-center border-2 border-dashed border-slate-200">
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
               <Bell className="w-5 h-5 text-slate-300" />
            </div>
            <p className="text-slate-900 font-medium text-sm">All caught up</p>
            <p className="text-slate-400 text-xs mt-1">When agencies view your profile, it will appear here.</p>
         </div>
      </section>
    );
  }

  // Condition 2: Populated State
  return (
    <section className="mb-0">
       <h2 
         className="text-xl text-slate-900 mb-4"
         style={{ fontFamily: 'var(--font-display)' }}
       >
         Activity Stream
       </h2>

       {/* List Container */}
       <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col divide-y divide-slate-100 overflow-hidden"> 
          {activities.map((item, idx) => (
             <div 
                key={idx} 
                className="flex items-center justify-between p-4 bg-white transition-colors hover:bg-slate-50"
             >
                <div className="flex items-center flex-1 min-w-0">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 mr-3 flex-shrink-0 object-cover border border-slate-200">
                    {item.initials || (item.name ? item.name.substring(0,2).toUpperCase() : '??')}
                  </div>

                  {/* Text */}
                  <p className="text-sm truncate">
                    <span className="font-semibold text-slate-900 block">{item.name}</span> 
                    <span className="font-normal text-slate-500 text-xs">{item.action}</span>
                  </p>
                </div>

                {/* Time */}
                <div className="text-xs text-slate-400 ml-4 whitespace-nowrap flex-shrink-0 font-medium">
                  {item.time || 'just now'}
                </div>
             </div>
          ))}
       </div>
    </section>
  );
};
