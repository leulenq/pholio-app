import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * Sessions by Time Bar Chart
 */
export default function SessionsBarChart({ data = [] }) {
  const hasData = data.length > 0;
  const totalSessions = hasData ? data.reduce((acc, curr) => acc + curr.value, 0) : 0;

  return (
    <div className="sessions-chart-card">
      <div className="chart-header">
        <h3 className="chart-title">Visitor Sessions</h3>
        <div className="flex flex-col items-end">
          <span className="text-2xl font-bold text-slate-900">
            {totalSessions.toLocaleString()}
          </span>
          <span className="text-xs text-slate-400">Total in period</span>
        </div>
      </div>
      
      <div className="h-[240px] mt-4">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                formatter={(value) => [value, 'Sessions']}
              />
              <Bar
                dataKey="value"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                barSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#94a3b8',
            textAlign: 'center'
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ marginBottom: '1rem', opacity: 0.3 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2"/>
              <line x1="9" y1="9" x2="9" y2="15" strokeWidth="2"/>
              <line x1="15" y1="9" x2="15" y2="15" strokeWidth="2"/>
            </svg>
            <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>No session data yet</p>
            <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>Share your profile to start tracking visitors</p>
          </div>
        )}
      </div>
    </div>
  );
}
