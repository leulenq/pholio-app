import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ArrowUp, ArrowDown, ExternalLink, Search, Globe } from 'lucide-react';
import { useAnalytics } from '../../hooks/useAnalytics';
import './PerformanceOverview.css';

// Task 3.2: Performance Overview Component
export const PerformanceOverview = () => {
  const { timeseries, summary, isLoading } = useAnalytics(7);

  // Transform API data for the chart
  const data = timeseries.map(item => ({
    day: new Date(item.date).getDate(),
    views: item.views,
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }));

  const totalViews = data.reduce((acc, curr) => acc + curr.views, 0);
  const trendIsPositive = summary?.views?.trend === 'up';
  const trendChange = summary?.views?.change || '0%';

  if (isLoading) {
    return (
      <div className="performance-overview-section">
        <div className="skeleton-loader" style={{ height: '300px' }}></div>
      </div>
    );
  }
  
  return (
    <div className="performance-overview-section">
      {/* 1. Stats Summary Bar */}
      <div className="stats-header">
        <div className="stat-main">
          <span className="stat-label">Total Views (7d)</span>
          <div className="stat-value-group">
            <h2 className="stat-hero-number">{totalViews.toLocaleString()}</h2>
            <span className={`stat-pill ${trendIsPositive ? 'positive' : 'neutral'}`}>
              {trendIsPositive ? <ArrowUp size={14} /> : summary?.views?.trend === 'down' ? <ArrowDown size={14} /> : null} {trendChange}
            </span>
          </div>
        </div>
        
        <div className="stat-secondary">
          <div className="mini-stat">
            <span className="label">Avg Daily</span>
            <span className="value">{data.length > 0 ? Math.round(totalViews / data.length) : 0}</span>
          </div>
          <div className="mini-stat">
             <span className="label">Peak Day</span>
             <span className="value">{data.length > 0 ? (() => {
               const peak = data.reduce((max, curr) => curr.views > max.views ? curr : max, data[0]);
               return `${peak?.date || 'N/A'} (${peak?.views || 0})`;
             })() : 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* 2. Interactive Chart */}
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            {/* Task 8.1: Enhanced Gradient */}
            <defs>
              <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#C9A55A" stopOpacity={0.25}/> {/* 25% Opacity */}
                <stop offset="95%" stopColor="#C9A55A" stopOpacity={0.02}/> {/* 2% Opacity */}
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(201, 165, 90, 0.08)" strokeDasharray="4 4" /> {/* Task 8.2: Dashed Gold Grid */}
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12, fill: '#94a3b8' }} 
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis 
               tick={{ fontSize: 12, fill: '#94a3b8' }} 
               axisLine={false}
               tickLine={false}
            />
            {/* Task 7.1: Custom Tooltip */}
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="custom-chart-tooltip" style={{ 
                      background: 'white', 
                      padding: '0.75rem 1rem', 
                      borderRadius: '8px', 
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      border: '1px solid rgba(0,0,0,0.1)'
                    }}>
                      <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>
                        {payload[0].payload.date}
                      </p>
                      <p style={{ fontSize: '1.125rem', fontWeight: '600', color: '#0f172a', margin: 0 }}>
                        {payload[0].value} views
                      </p>
                    </div>
                  );
                }
                return null;
              }}
              cursor={{ stroke: '#C9A55A', strokeWidth: 1, strokeDasharray: '4 4' }} /* Task 7.2: Crosshair */
            />
            <Area 
              type="monotone" 
              dataKey="views" 
              stroke="#C9A55A" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorViews)" 
              dot={{ r: 0, strokeWidth: 0 }} /* Hidden by default */
              activeDot={{ r: 8, stroke: '#fff', strokeWidth: 2, fill: '#C9A55A', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} /* Task 7.3: Active Dot */
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 3. Engagement Breakdown Cards (Task 8: Progress Bars) */}
      <div className="breakdown-grid">
        <div className="metric-card-wrapper">
           <div className="metric-card-header">
             <div className="metric-icon-bg"><Globe size={16} /></div>
             <div className="metric-info">
               <span className="count">45%</span>
               <span className="desc">Direct</span>
             </div>
           </div>
           <div className="metric-progress-bg">
             <div className="metric-progress-fill" style={{ width: '45%' }}></div>
           </div>
        </div>
        
        <div className="metric-card-wrapper">
           <div className="metric-card-header">
             <div className="metric-icon-bg"><Search size={16} /></div>
             <div className="metric-info">
               <span className="count">32%</span>
               <span className="desc">Agency Search</span>
             </div>
           </div>
           <div className="metric-progress-bg">
             <div className="metric-progress-fill" style={{ width: '32%' }}></div>
           </div>
        </div>
        
        <div className="metric-card-wrapper">
           <div className="metric-card-header">
             <div className="metric-icon-bg"><ExternalLink size={16} /></div>
             <div className="metric-info">
               <span className="count">23%</span>
               <span className="desc">Referrals</span>
             </div>
           </div>
           <div className="metric-progress-bg">
             <div className="metric-progress-fill" style={{ width: '23%' }}></div>
           </div>
        </div>
      </div>
    </div>
  );
};
