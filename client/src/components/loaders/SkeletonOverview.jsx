import React from 'react';
import '../../routes/talent/OverviewPage.css'; // Reuse the grid layout

export const SkeletonOverview = () => {
  return (
    <div className="overview-page-layout">
      
      {/* 1. Left Sidebar Skeleton */}
      <aside className="overview-left-sidebar hidden lg:block">
        <div className="h-full w-full">
           {/* Placeholder for Nav or condensed rail */}
           <div className="animate-pulse flex flex-col gap-4">
              <div className="h-8 w-8 bg-slate-100 rounded-full mb-8"></div>
              {[1,2,3,4,5].map(i => (
                  <div key={i} className="h-8 w-8 bg-slate-100 rounded-md"></div>
              ))}
           </div>
        </div>
      </aside>

      {/* 2. Center Feed Skeleton */}
      <main className="overview-feed">
        <div className="overview-feed-content animate-pulse">
          
          {/* Hero Section */}
          <div className="mb-12">
             <div className="h-12 w-1/3 bg-slate-200 rounded-md mb-4"></div>
             <div className="h-5 w-1/2 bg-slate-100 rounded-md"></div>
          </div>

          {/* Activity Stream Title */}
          <div className="h-6 w-1/4 bg-slate-200 rounded-md mb-4"></div>

          {/* Activity Stream Items */}
          <div className="flex flex-col gap-0 w-full mb-8 rounded-sm overflow-hidden border border-slate-100">
             {[1, 2, 3].map(i => (
               <div key={i} className="h-20 w-full bg-slate-50 border-b border-slate-100 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 w-full">
                      <div className="h-8 w-8 rounded-full bg-slate-200"></div>
                      <div className="h-4 w-1/2 bg-slate-200 rounded"></div>
                  </div>
               </div>
             ))}
          </div>

          {/* Performance Summary Placeholder */}
          <div className="h-64 w-full bg-slate-50 rounded-lg"></div>

        </div>
      </main>

      {/* 3. Right Sidebar Skeleton */}
      <aside className="overview-right-sidebar">
         <div className="animate-pulse flex flex-col gap-6">
            
            {/* Next Priority Card */}
            <div className="h-32 w-full bg-white rounded-xl border-l-4 border-slate-200 shadow-sm p-5">
               <div className="h-3 w-1/3 bg-slate-200 rounded mb-4"></div>
               <div className="h-6 w-2/3 bg-slate-200 rounded"></div>
            </div>

            {/* Quick Actions */}
            <div>
               <div className="h-4 w-1/3 bg-slate-200 rounded mb-4"></div>
               <div className="space-y-3 pl-2">
                  <div className="h-8 w-3/4 bg-slate-100 rounded"></div>
                  <div className="h-8 w-3/4 bg-slate-100 rounded"></div>
               </div>
            </div>

            {/* Momentum Chart */}
            <div className="mt-4">
                <div className="h-4 w-1/4 bg-slate-200 rounded mb-4"></div>
                <div className="h-48 w-full bg-slate-50 rounded-lg"></div>
            </div>

         </div>
      </aside>
      
    </div>
  );
};
