import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { useAnalytics } from '../../hooks/useAnalytics';
import './SidebarWidget.css';

const DAY_LETTERS = ['S', 'M', 'Tu', 'W', 'Th', 'F', 'S'];

function formatShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Weekly tick positions for 30D: start + every 7th bar + last day if not already included. */
function buildWeeklyAxisTicks(dateKeys) {
  if (!dateKeys.length) return undefined;
  const idx = new Set([0, 7, 14, 21, 28].filter((i) => i < dateKeys.length));
  idx.add(dateKeys.length - 1);
  return [...idx].sort((a, b) => a - b).map((i) => dateKeys[i]);
}

function MomentumTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    return (
      <div className="chart-tooltip" style={{ position: 'relative', bottom: 'auto', left: 'auto', transform: 'none', minWidth: 'auto' }}>
        <p className="tooltip-date">{payload[0].payload.fullDate}</p>
        <p className="tooltip-val">{payload[0].value} views</p>
      </div>
    );
  }
  return null;
}

export const MomentumChart = () => {
  const [period, setPeriod] = useState('7d');
  const days = period === '30d' ? 30 : 7;
  const { timeseries, isTimeseriesLoading, timeseriesError, refetch, isAnalyticsRefetching } =
    useAnalytics(days);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const periodSeries = useMemo(() => {
    if (!Array.isArray(timeseries)) return [];
    return [...timeseries]
      .filter((item) => !Number.isNaN(new Date(item?.date).getTime()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-days);
  }, [timeseries, days]);

  const data = useMemo(
    () =>
      periodSeries.map((item) => {
        const date = new Date(item.date);
        return {
          dateKey: item.date,
          fullDate: formatShortDate(date),
          views: Number(item.views) || 0
        };
      }),
    [periodSeries]
  );

  const xAxisTicks = useMemo(
    () => (period === '30d' ? buildWeeklyAxisTicks(data.map((d) => d.dateKey)) : undefined),
    [period, data]
  );

  const xAxisTickFormatter = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    if (period === '30d') return formatShortDate(date);
    return DAY_LETTERS[date.getDay()];
  };

  const totalViews = data.reduce((acc, curr) => acc + curr.views, 0);

  if (isTimeseriesLoading) {
    return (
      <div className="sidebar-widget momentum-widget">
        <div className="widget-header">
          <h3 className="widget-title">Your Momentum</h3>
        </div>
        <div className="skeleton-loader" style={{ height: '180px' }} />
      </div>
    );
  }

  if (timeseriesError) {
    return (
      <div className="sidebar-widget momentum-widget" role="alert">
        <div className="widget-header">
          <h3 className="widget-title">Your Momentum</h3>
        </div>
        <p className="percentile-text" style={{ marginTop: '1rem' }}>
          Couldn't load momentum data.
        </p>
        <button
          type="button"
          className="step-action"
          style={{ marginTop: '0.75rem' }}
          onClick={() => refetch()}
          disabled={isAnalyticsRefetching}
          aria-busy={isAnalyticsRefetching}
        >
          {isAnalyticsRefetching ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar-widget momentum-widget">
      {/* Header with Title */}
      <div className="widget-header">
        <h3 className="widget-title">Your Momentum</h3>
      </div>
      
      {/* Headline Stat */}
      <div className="momentum-headline">
        <span className="momentum-value">{totalViews}</span>
        <span className="momentum-label">
          {period === '30d' ? 'views in last 30 days' : 'views in last 7 days'}
        </span>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div className="periodToggle" role="group" aria-label="Chart period">
          <button 
            type="button"
            className={period === '7d' ? 'active' : ''} 
            onClick={() => setPeriod('7d')}
            aria-pressed={period === '7d'}
          >
            7D
          </button>
          <button 
            type="button"
            className={period === '30d' ? 'active' : ''} 
            onClick={() => setPeriod('30d')}
            aria-pressed={period === '30d'}
          >
            30D
          </button>
        </div>
      </div>

      {/* Task 1: Vertical Bar Chart */}
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            margin={{ top: 10, right: 0, left: -25, bottom: period === '30d' ? 6 : 0 }}
          >
             <XAxis
               dataKey="dateKey"
               ticks={xAxisTicks}
               axisLine={false}
               tickLine={false}
               tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
               tickFormatter={xAxisTickFormatter}
               dy={10}
               interval={period === '7d' ? 0 : undefined}
             />
             <YAxis hide />
             <RechartsTooltip 
               content={<MomentumTooltip />} 
               cursor={{ fill: 'rgba(201, 165, 90, 0.04)' }}
             />
             <Bar 
               dataKey="views" 
               fill="#C9A55A" 
               radius={[6, 6, 0, 0]} 
               barSize={12}
               isAnimationActive={!prefersReducedMotion}
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
