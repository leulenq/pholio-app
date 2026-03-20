import React from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

/**
 * Mini Sparkline Chart for metric cards
 */
export default function SparklineChart({ data, color = '#C9A55A' }) {
  // Simple check for data
  if (!data || data.length === 0) return null;

  // Format data for Recharts
  // Create a safe ID for the gradient (IDs shouldn't contain #)
  const safeId = `gradient-${color.replace('#', '')}-${Math.random().toString(36).substr(2, 9)}`;
  const chartData = data.map((val, idx) => ({ value: val, idx }));

  return (
    <div className="metric-mini-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={safeId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fillOpacity={1}
            fill={`url(#${safeId})`}
            isAnimationActive={true}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
