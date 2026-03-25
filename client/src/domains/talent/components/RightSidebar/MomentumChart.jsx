import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useAnalytics } from '../../hooks/useAnalytics';
import './SidebarWidget.css';

export const MomentumChart = () => {
  const [period, setPeriod] = useState('7d');
  const { timeseries, isLoading } = useAnalytics();

  // Get the last 7 days of data from the timeseries
  const last7Days = timeseries.slice(-7);
  
  const data = last7Days.map(item => {
    const date = new Date(item.date);
    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    return {
      day: dayNames[date.getDay()],
      fullDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      views: item.views
    };
  });

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="chart-tooltip" style={{ position: 'relative', bottom: 'auto', left: 'auto', transform: 'none', minWidth: 'auto' }}>
          <p className="tooltip-date">{payload[0].payload.fullDate}</p>
          <p className="tooltip-val">{payload[0].value} views</p>
        </div>
      );
    }
    return null;
  };

  const totalViews = data.reduce((acc, curr) => acc + curr.views, 0);

  return (
    <div className="sidebar-widget momentum-widget">
      {/* Header with Title */}
      <div className="widget-header">
        <h3 className="widget-title">Your Momentum</h3>
      </div>
      
      {/* Headline Stat */}
      <div className="momentum-headline">
        <span className="momentum-value">{totalViews}</span>
        <span className="momentum-label">views this week</span>
      </div>
      
      {/* Task 3: Segmented Period Toggle (Placed below title as per new layout or kept in header? User prompt says "Sidebar Period Toggles Need Refinement" and shows "Your Momentum" then toggles below in text or same line? The ASCII art didn't specify position, but typically it replaces the old toggle. Let's put it under title or same line. Let's keep structure but style it right.) */}
      {/* Actually, user didn't strictly say MOVE it, just REFINE it. Let's keep in header for space or move to body if crowded. The requested visual showed "Your Momentum" then "7D 30D" below it?? "Your Momentum" header, then "7D 30D" bars. Let's stick to header right for compact. */}
      {/* Wait, standard Recharts doesn't handle the "Segmented Control" styling itself. We do that with HTML/CSS. */}
      
      <div style={{ marginBottom: '1rem' }}>
        <div className="periodToggle">
          <button 
            className={period === '7d' ? 'active' : ''} 
            onClick={() => setPeriod('7d')}
          >
            7D
          </button>
          <button 
            className={period === '30d' ? 'active' : ''} 
            onClick={() => setPeriod('30d')}
          >
            30D
          </button>
        </div>
      </div>

      {/* Task 1: Vertical Bar Chart */}
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
             <XAxis 
               dataKey="day" 
               axisLine={false} 
               tickLine={false} 
               tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
               dy={10}
             />
             <YAxis hide />
             <RechartsTooltip 
               content={<CustomTooltip />} 
               cursor={{ fill: 'rgba(201, 165, 90, 0.04)' }}
             />
             <Bar 
               dataKey="views" 
               fill="#C9A55A" 
               radius={[6, 6, 0, 0]} 
               barSize={12}
             />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-stat-footer" style={{ marginTop: '1rem' }}>
        {/* Percentile comparison - future feature */}
        {totalViews > 0 && (
          <p className="percentile-text">
            You're gaining momentum! Keep sharing your portfolio.
          </p>
        )}
      </div>
    </div>
  );
};
