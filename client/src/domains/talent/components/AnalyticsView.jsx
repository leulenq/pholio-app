import React, { useState } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAuth } from '../../auth/hooks/useAuth';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { Sparkles, Check, Download, Settings } from 'lucide-react';

// Import detailed components (Studio+)
import MetricCardDetailed from './MetricCardDetailed';
import SessionsBarChart from './SessionsBarChart';
import CohortHeatmap from './CohortHeatmap';

// Import free tier components
import WeeklyBarChart from './WeeklyBarChart';
import InsightCard from './InsightCard';


/**
 * Single Stat Card Component (Enhanced for free users)
 */
function StatCard({ title, value, subtext, trend, icon }) {
  const getIcon = () => {
    if (icon) return icon;
    if (title.includes('View')) return '👁️';
    if (title.includes('Download')) return '📄';
    if (title.includes('Complete')) return '✓';
    return '📊';
  };

  const getTrendColor = () => {
    if (trend === undefined || trend === 0) return 'text-slate-400';
    return trend > 0 ? 'text-emerald-600' : 'text-slate-400';
  };

  const getTrendIcon = () => {
    if (trend === undefined || trend === 0) return '→';
    return trend > 0 ? '↑' : '↓';
  };

  return (
    <div className="stat-card enhanced">
      <div className="stat-header">
        <div className="stat-icon-badge">{getIcon()}</div>
        <h3 className="stat-title">{title}</h3>
      </div>
      <div className="stat-body">
        <span className="stat-value-enhanced">{value}</span>
        {trend !== undefined && (
           <div className={`stat-trend-enhanced ${getTrendColor()}`}>
             <span className="trend-arrow">{getTrendIcon()}</span>
             <span className="trend-text">{Math.abs(trend)} this week</span>
           </div>
        )}
      </div>
      {subtext && <p className="stat-subtext">{subtext}</p>}
    </div>
  );
}

/**
 * Activity Item Component
 */
function ActivityItem({ activity }) {
    const getIcon = (type) => {
        switch(type) {
            case 'view': return '👁️';
            case 'download': return '📄';
            default: return '✨';
        }
    };

   return (
     <div className="activity-item">
       <div className="activity-icon">
         {activity.icon || getIcon(activity.type)}
       </div>
       <div className="activity-content">
          <p className="activity-message">{activity.message}</p>
          <p className="activity-time">{activity.timeAgo}</p>
       </div>
     </div>
   );
}

/**
 * Performance Chart Component
 */
function PerformanceChart({ data, timeRange = 30 }) {
  // Handle empty data
  if (!data || data.length === 0) {
    return (
      <div className="chart-empty-state">
        <p>Not enough data to display trends yet. Keep building your profile!</p>
      </div>
    );
  }

  // Format data for Recharts
  const chartData = data.map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    views: item.views || 0,
    downloads: item.downloads || 0
  }));

  // Get time range label
  const timeRangeLabel = timeRange === 7 ? 'Last 7 days' : timeRange === 30 ? 'Last 30 days' : 'Last 90 days';

  return (
    <div className="performance-chart-container">
      <div className="chart-header">
        <h3 className="chart-title">Growth Analytics</h3>
        <span className="chart-subtitle">{timeRangeLabel}</span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#C9A55A" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#C9A55A" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorDownloads" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="date" 
            axisLine={false}
            tickLine={false}
            stroke="#94a3b8"
            style={{ fontSize: '0.75rem' }}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            stroke="#94a3b8"
            style={{ fontSize: '0.75rem' }}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '0.875rem',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
            }}
          />
          <Legend 
            wrapperStyle={{ fontSize: '0.875rem', paddingTop: '1rem' }}
          />
          <Area 
            type="monotone" 
            dataKey="views" 
            stroke="#C9A55A" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorViews)"
            name="Profile Views"
          />
          <Area 
            type="monotone" 
            dataKey="downloads" 
            stroke="#6366f1" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorDownloads)"
            name="Comp Card Downloads"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Time Range Selector Component
 */
function TimeRangeSelector({ value, onChange, isStudioPlus }) {
  const ranges = [
    { value: 7, label: '7 Days', proOnly: false },
    { value: 30, label: '30 Days', proOnly: true },
    { value: 90, label: '90 Days', proOnly: true }
  ];

  return (
    <div className="time-range-selector">
      {ranges.map(range => (
        <button
          key={range.value}
          className={`time-range-btn ${value === range.value ? 'active' : ''}`}
          onClick={() => onChange(range.value)}
          disabled={range.proOnly && !isStudioPlus}
          title={range.proOnly && !isStudioPlus ? 'Studio+ required' : ''}
        >
          {range.label}
          {range.proOnly && !isStudioPlus && <span className="lock-icon">🔒</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Upgrade Banner Component (Refined for Free Users)
 */
function UpgradeBanner() {
  return (
    <div className="upgrade-banner editorial">
      <div className="upgrade-header">
        <h3 className="editorial-title" style={{ fontFamily: 'var(--font-display)' }}>
          Ready for Deeper Insights?
        </h3>
        <p className="editorial-subtitle">
          Studio+ unlocks 90-day history, advanced breakdowns, and export capabilities.
        </p>
      </div>

      <div className="premium-benefits-flex">
         {[
           '90-Day Analytics',
           'Source Breakdowns',
           'Cohort Analysis',
           'Export Reports'
         ].map((benefit, i) => (
           <div key={i} className="benefit-pill">
              <Check size={14} className="text-[#C9A55A]" />
              <span>{benefit}</span>
           </div>
         ))}
      </div>

      <button className="upgrade-action-editorial" onClick={() => window.location.href = '/pricing'}>
        Upgrade to Studio+
      </button>
    </div>
  );
}

export default function AnalyticsView() {
  const { subscription } = useAuth();
  const searchParams = new URLSearchParams(window.location.search);
  
  // Customization State
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState({
    sessions: true,
    cohorts: true,
    performance: true
  });

  const toggleWidget = (widget) => {
    setVisibleWidgets(prev => ({
      ...prev,
      [widget]: !prev[widget]
    }));
  };
  const isDebugPro = searchParams.get('debug') === 'pro';
  const isStudioPlus = subscription?.isPro || isDebugPro || false;
  
  // Default to 7 days for free users, 30 days for Studio+ users
  const [timeRange, setTimeRange] = useState(isStudioPlus ? 30 : 7);
  
  const { analytics, activities, summary, timeseries, detailedStats, insights, sessions, cohorts, isLoading } = useAnalytics(timeRange);

  if (isLoading) {
    return (
      <div className="stats-grid">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton-loader"></div>
        ))}
      </div>
    );
  }

  // Fallback defaults
  const views = analytics?.views || { total: 0, thisWeek: 0, thisMonth: 0 };
  const downloads = analytics?.downloads || { total: 0, thisWeek: 0, thisMonth: 0 };
  const activityList = activities || [];
  const completeness = summary?.completeness || { percentage: 0, missingItems: [] };

  // Use the detailedStats from the hook or fallback to defaults
  // Robust fallback for each key to prevent crashes if hook returns partial data
  const detailedStatsData = {
    profileViews: detailedStats?.profileViews || { value: 0, trend: 0, sparkline: [], breakdown: [] },
    engagement: detailedStats?.engagement || { value: 0, trend: 0, sparkline: [], chartLabel: 'Engagement' },
    retention: detailedStats?.retention || { value: 0, trend: 0, sparkline: [], chartLabel: 'Retention' }
  };

  return (
    <div className="analytics-view">
      
      {/* Studio+ Header Controls */}
      {isStudioPlus && (
        <section className="mb-8">
            <div className="flex justify-between items-center">
                <div className="flex gap-4">
                    <TimeRangeSelector 
                        value={timeRange} 
                        onChange={setTimeRange}
                        isStudioPlus={isStudioPlus}
                    />
                </div>
            <div className="flex gap-2 relative">
                {/* Customization Menu */}
                {isCustomizing && (
                  <div className="absolute right-0 top-12 bg-white p-4 rounded-xl shadow-xl border border-slate-100 z-20 w-64 animate-in fade-in slide-in-from-top-2">
                    <h4 className="font-serif font-medium mb-3 text-slate-900">Visible Charts</h4>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-slate-50 rounded-lg">
                        <input 
                          type="checkbox" 
                          checked={visibleWidgets.performance} 
                          onChange={() => toggleWidget('performance')}
                          className="accent-[#C9A55A]"
                        />
                        <span className="text-sm text-slate-700">Performance Over Time</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-slate-50 rounded-lg">
                        <input 
                          type="checkbox" 
                          checked={visibleWidgets.sessions} 
                          onChange={() => toggleWidget('sessions')}
                          className="accent-[#C9A55A]"
                        />
                        <span className="text-sm text-slate-700">Weekly Sessions</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-slate-50 rounded-lg">
                        <input 
                          type="checkbox" 
                          checked={visibleWidgets.cohorts} 
                          onChange={() => toggleWidget('cohorts')}
                          className="accent-[#C9A55A]"
                        />
                        <span className="text-sm text-slate-700">Visitor Retention</span>
                      </label>
                    </div>
                  </div>
                )}
            
                <button 
                  className={`time-range-btn ${isCustomizing ? 'bg-slate-100' : ''}`}
                  onClick={() => setIsCustomizing(!isCustomizing)}
                  aria-label="Customize Analytics Widgets"
                >
                    <Settings size={16} /> Customize Widget
                </button>
                <button 
                  className="time-range-btn" 
                  aria-label="Export Analytics Data"
                  onClick={() => window.location.href = `/api/talent/analytics/export${window.location.search}`}
                >
                    <Download size={16} /> Export Data
                </button>
            </div>
            </div>
        </section>
      )}

      {/* Main Stats Section */}
      <section className="mb-12">
        {isStudioPlus ? (
            <div className="detailed-stats-grid">
                <MetricCardDetailed 
                    title="Total Profile Views"
                    value={detailedStatsData.profileViews.value}
                    trend={detailedStatsData.profileViews.trend}
                    chartData={detailedStatsData.profileViews.sparkline}
                    breakdown={detailedStatsData.profileViews.breakdown}
                    chartLabel="Views Over Time"
                />
                <MetricCardDetailed 
                    title="Avg. Engagement Value"
                    value={detailedStatsData.engagement.value}
                    trend={detailedStatsData.engagement.trend}
                    chartData={detailedStatsData.engagement.sparkline}
                    chartLabel={detailedStatsData.engagement.chartLabel}
                />
                <MetricCardDetailed 
                    title="Return Visitor Rate"
                    value={detailedStatsData.retention.value}
                    trend={detailedStatsData.retention.trend}
                    chartData={detailedStatsData.retention.sparkline}
                    chartLabel={detailedStatsData.retention.chartLabel}
                />
            </div>
        ) : (
            <>
                <div className="stats-grid">
                    <StatCard 
                        title="Profile Views" 
                        value={views.total}
                        trend={views.thisWeek}
                        subtext={`${views.thisMonth} views this month`}
                    />
                    <StatCard 
                        title="Comp Card Downloads" 
                        value={downloads.total}
                        trend={downloads.thisWeek}
                        subtext={`${downloads.thisMonth} downloads this month`}
                    />
                    <StatCard 
                        title="Profile Completeness" 
                        value={`${completeness.percentage}%`}
                        subtext={completeness.missingItems?.length > 0 
                            ? `Missing: ${completeness.missingItems.slice(0, 2).join(', ')}` 
                            : 'Profile complete!'}
                    />
                </div>
                
                {/* Free Tier: Education/Discovery Area */}
                {/* Free Tier: Education/Discovery Area - Removed */}

            </>
        )}
      </section>

      {/* Visualizations Section */}
      <section className="mb-12">
        {isStudioPlus ? (
            <div className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {visibleWidgets.sessions && <SessionsBarChart data={sessions} />}
                    <MetricCardDetailed 
                        title="Profile Funnel Performance"
                        value={detailedStats.funnel.value}
                        trend={1.23}
                        chartLabel="Conversion Rate"
                        breakdown={detailedStats.funnel.breakdown}
                    />
                </div>
                {visibleWidgets.cohorts && <CohortHeatmap data={cohorts} />}
                {visibleWidgets.performance && <PerformanceChart data={timeseries} timeRange={timeRange} />}
            </div>
        ) : (
            <div className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <WeeklyBarChart data={timeseries.slice(-7).map(item => ({
                        day: new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' }),
                        value: item.views || 0
                    }))} />
                    <InsightCard insights={insights} />
                </div>
                <UpgradeBanner />
            </div>
        )}
      </section>

      {/* Activity & Support Section */}
      <section className="mt-16">
        <div className="layout-grid">
           {/* Activity Feed */}
           <div className="activity-feed">
              <div className="activity-card">
                 <div className="card-header">
                    <h3>Recent Activity</h3>
                    <span>Last 10 events</span>
                 </div>
                 <div className="activity-list">
                    {activityList.length > 0 ? (
                      activityList.map(item => (
                        <ActivityItem key={item.id} activity={item} />
                      ))
                    ) : (
                      <div className="empty-state">
                        No recent activity recorded.
                      </div>
                    )}
                 </div>
              </div>
           </div>
  
           {/* Side Widget (Prompts or Insights) */}
           <div className="insights-sidebar">
              <div className="insights-widget">
               <h3 className="insights-title">Pro Tip</h3>
                 <p className="insights-text">
                    Talent with at least 5 photos and a complete bio get 3x more views from agencies.
                 </p>
                 <button
                   className="insights-btn"
                   onClick={() => window.location.href = '/dashboard/talent/media'}
                 >
                    Update Portfolio
                 </button>
              </div>
           </div>
        </div>
      </section>
    </div>
  );
}

