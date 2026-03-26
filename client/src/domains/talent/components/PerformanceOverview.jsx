import React, { useEffect, useMemo, useId, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ArrowUp, ArrowDown, ExternalLink, Search, Globe, Share2, AlertCircle } from 'lucide-react';
import { useAnalytics } from '../hooks/useAnalytics';
import './PerformanceOverview.css';

function iconForSourceLabel(label) {
  const l = String(label || '').toLowerCase();
  if (l.includes('direct')) return Globe;
  if (l.includes('search')) return Search;
  if (l.includes('social')) return Share2;
  return ExternalLink;
}

function isValidChartDate(value) {
  if (value == null || value === '') return false;
  const t = new Date(value).getTime();
  return !Number.isNaN(t);
}

export const PerformanceOverview = () => {
  const {
    timeseries,
    isSummaryLoading,
    isTimeseriesLoading,
    timeseriesError,
    analytics,
    refetch,
    isAnalyticsRefetching,
  } = useAnalytics(7);

  const reactId = useId();
  const viewsGradientId = `perf-views-gradient-${reactId.replace(/:/g, '')}`;
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const data = useMemo(() => {
    if (!Array.isArray(timeseries)) return [];
    return timeseries
      .filter((item) => isValidChartDate(item?.date))
      .map((item) => {
        const d = new Date(item.date);
        return {
          ts: d.getTime(),
          day: d.getDate(),
          views: Number(item.views) || 0,
          date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        };
      })
      .sort((a, b) => a.ts - b.ts);
  }, [timeseries]);

  const totalViews = data.reduce((acc, curr) => acc + curr.views, 0);
  const trendFromWindow = (() => {
    if (data.length < 2) {
      return { direction: 'neutral', changeLabel: '0%' };
    }

    const first = Number(data[0]?.views || 0);
    const last = Number(data[data.length - 1]?.views || 0);

    if (first === 0) {
      if (last === 0) return { direction: 'neutral', changeLabel: '0%' };
      return { direction: 'up', changeLabel: '100%' };
    }

    const delta = ((last - first) / first) * 100;
    const rounded = Math.round(Math.abs(delta));
    if (delta > 0) return { direction: 'up', changeLabel: `${rounded}%` };
    if (delta < 0) return { direction: 'down', changeLabel: `${rounded}%` };
    return { direction: 'neutral', changeLabel: '0%' };
  })();

  const trendIsPositive = trendFromWindow.direction === 'up';

  const sourceBreakdown = useMemo(() => {
    const raw = analytics?.views?.latestSourceBreakdown;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return [...raw].sort((a, b) => (Number(b?.percentage) || 0) - (Number(a?.percentage) || 0));
  }, [analytics?.views?.latestSourceBreakdown]);

  const hasSourceBreakdown = sourceBreakdown.length > 0;

  if (isSummaryLoading || isTimeseriesLoading) {
    return (
      <div className="performance-overview-section">
        <div className="skeleton-loader" style={{ height: '300px' }}></div>
      </div>
    );
  }

  if (timeseriesError) {
    return (
      <div className="performance-overview-section">
        <div
          role="alert"
          style={{ padding: '1rem', textAlign: 'center' }}
        >
          <AlertCircle size={22} color="#94a3b8" aria-hidden />
          <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
            Couldn't load trend chart data right now.
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
      </div>
    );
  }
  
  return (
    <div className="performance-overview-section">
      <div className="stats-header">
        <div className="stat-main">
          <span className="stat-label">Total Views (7d)</span>
          <div className="stat-value-group">
            <h2 className="stat-hero-number">{totalViews.toLocaleString()}</h2>
            <span
              className={`stat-pill ${
                trendIsPositive ? 'positive' : trendFromWindow.direction === 'down' ? 'negative' : ''
              }`}
              style={
                trendIsPositive || trendFromWindow.direction === 'down'
                  ? undefined
                  : { backgroundColor: 'rgba(100, 116, 139, 0.1)', color: '#64748b' }
              }
            >
              {trendIsPositive ? <ArrowUp size={14} /> : trendFromWindow.direction === 'down' ? <ArrowDown size={14} /> : null}{' '}
              {trendFromWindow.changeLabel}
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

      <div className="chart-wrapper" role="img" aria-label="7 day profile views trend chart">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={viewsGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#C9A55A" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#C9A55A" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(201, 165, 90, 0.08)" strokeDasharray="4 4" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12, fill: '#94a3b8' }} 
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis 
               tick={{ fontSize: 12, fill: '#94a3b8' }} 
               axisLine={false}
               tickLine={false}
            />
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
              cursor={{ stroke: '#C9A55A', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey="views"
              stroke="#C9A55A"
              strokeWidth={3}
              fillOpacity={1}
              fill={`url(#${viewsGradientId})`}
              isAnimationActive={!prefersReducedMotion}
              dot={{ r: 0, strokeWidth: 0 }}
              activeDot={{ r: 8, stroke: '#fff', strokeWidth: 2, fill: '#C9A55A', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="breakdown-grid">
        {!hasSourceBreakdown ? (
          <div
            role="status"
            style={{
              gridColumn: '1 / -1',
              margin: 0,
              padding: '1rem 0.5rem',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
              Source breakdown not available
            </p>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b', lineHeight: 1.5, maxWidth: '36rem', marginLeft: 'auto', marginRight: 'auto' }}>
              Referrer data appears here after visitors view your portfolio in this period. If you have no views yet,
              check back once traffic comes in.
            </p>
          </div>
        ) : (
          sourceBreakdown.map((row, index) => {
            const Icon = iconForSourceLabel(row.label);
            const pct = Math.min(100, Math.max(0, Math.round(Number(row.percentage) || 0)));
            const labelKey = String(row.label ?? '').trim() || 'unknown';
            return (
              <div key={`src-${index}-${labelKey}`} className="metric-card-wrapper">
                <div className="metric-card-header">
                  <div className="metric-icon-bg">
                    <Icon size={16} />
                  </div>
                  <div className="metric-info">
                    <span className="count">{pct}%</span>
                    <span className="desc">{row.label}</span>
                  </div>
                </div>
                <div className="metric-progress-bg">
                  <div className="metric-progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
