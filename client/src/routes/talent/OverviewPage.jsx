import React from 'react';
import { Download, Wallet } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { talentApi } from '../../api/talent';
import { useProfileStrength } from '../../hooks/useProfileStrength';
import { useQuery } from '@tanstack/react-query';
import { SkeletonOverview } from '../../components/loaders/SkeletonOverview';
import { AgencyEngagementHero } from '../../components/AgencyEngagementHero/AgencyEngagementHero';
import { PerformanceSummary } from '../../components/PerformanceOverview/PerformanceSummary';
import { RightSidebar } from '../../components/RightSidebar/RightSidebar';
import './OverviewPage.css';

export default function OverviewPage() {
  const { profile } = useAuth();
  const officialStrength = useProfileStrength();

  const { data, isLoading, error } = useQuery({
    queryKey: ['talent-overview'],
    queryFn: () => talentApi.getOverview(),
    retry: 1
  });

  if (error) {
    console.error('Error fetching overview data:', error);
  }
  
  // Greeting Logic
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (isLoading || !data) {
     return <SkeletonOverview />;
  }

  // Safety fallbacks
  const nextPriority = data?.nextPriority || { title: 'Welcome', action: 'Update Profile', link: '/profile/edit' };
  const profileStrengthLabel = data?.profileStrength?.label || 'Beginner';
  const activityStream = data?.activityStream || [];

  return (
    <div className="overview-page-layout">
      
      {/* 2. Center Feed: Main Content */}
      <main className="overview-feed">
        <div className="overview-feed-content">
          
          {/* Refactored Hero Section */}
          <div className="mb-6"> 
             <h1 
                className="text-5xl font-bold mb-3 tracking-tight"
                style={{ 
                  fontFamily: 'var(--font-display)',
                  background: 'linear-gradient(135deg, #1a1818 20%, #C9A55A 80%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  color: '#1a1a1a'
                }}
             >
               {getGreeting()}, {profile?.first_name || 'Talent'}!
             </h1>
              <div className="flex flex-wrap gap-3 mt-4">
                <button 
                  onClick={() => window.location.href = '/api/talent/comp-card/download'}
                  className="inline-flex items-center gap-2.5 px-6 py-3 bg-[#C9A55A] hover:bg-[#b08d45] text-white font-semibold text-base rounded-lg transition-all duration-200 shadow-[0_4px_12px_rgba(201,165,90,0.2)] hover:shadow-[0_6px_16px_rgba(201,165,90,0.3)] hover:-translate-y-[1px]"
                >
                  <Download size={18} strokeWidth={2.5} />
                  Download Comp Card
                </button>
                
                <button 
                  onClick={() => window.location.href = '/talent/apple-wallet'}
                  className="inline-flex items-center gap-2.5 px-6 py-3 bg-white hover:bg-[#faf9f7] text-[#0f172a] font-semibold text-base rounded-lg border border-[#e2e8f0] hover:border-[#cbd5e1] transition-all duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:-translate-y-[1px]"
                >
                  <Wallet size={18} strokeWidth={2.5} />
                  Add to Apple Wallet
                </button>
              </div>
          </div>

          {/* Agency Engagement / Activity Stream */}
          <AgencyEngagementHero activityStream={activityStream} />

          {/* Actionable Guidance (Empty/Hidden) */}
          <section className="actionable-guidance-section hidden">
          </section>

          {/* Performance Summary */}
          <PerformanceSummary />
        </div>
      </main>

      {/* 3. Right Sidebar: Action Center */}
      <aside className="overview-right-sidebar">
        <RightSidebar nextPriority={nextPriority} />
      </aside>
      
    </div>
  );
}
