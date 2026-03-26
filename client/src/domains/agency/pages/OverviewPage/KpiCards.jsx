import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { AreaChart, Area, RadialBarChart, RadialBar, Label, ResponsiveContainer, YAxis } from 'recharts';

function AnimatedNumber({ value, duration = 1.2 }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(mv, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsub = rounded.on('change', (v) => setDisplay(v));
    return () => { controls.stop(); unsub(); };
  }, [value]);

  return <span>{display}</span>;
}

function BentoGrid({ children, variants }) {
  return (
    <motion.div className="ov-kpi-grid" variants={variants}>
      {children}
    </motion.div>
  );
}

function EditorialCard({ children, urgent }) {
  return (
    <motion.div
      className={`ov-kpi ${urgent ? 'ov-kpi--urgent' : ''}`}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
    >
      {children}
    </motion.div>
  );
}

function MicroLabel({ children }) {
  return <span className="ov-kpi-label">{children}</span>;
}

function StatNumeral({ value, align = 'left' }) {
  return (
    <div className="ov-kpi-number" style={{ margin: 'auto 0', textAlign: align }}>
      <AnimatedNumber value={value} />
    </div>
  );
}

function StatusMicroPill({ children }) {
  return <span className="ov-kpi-badge-amber">{children}</span>;
}

export default function KpiCards({
  itemVariants,
  pendingReview,
  activeCastings,
  rosterSize,
  rosterGrowth,
  utilization,
  utilizationData,
  prefersReducedMotion,
}) {
  return (
    <BentoGrid variants={itemVariants}>

      <EditorialCard urgent>
        <div className="ov-kpi-head">
          <MicroLabel>Pending Review</MicroLabel>
        </div>
        <StatNumeral value={pendingReview.count} />
        <div className="ov-kpi-urgent-sub" style={{ fontSize: '11px', color: '#9CA3AF' }}>
          Oldest: {pendingReview.oldestDaysAgo == null ? 'none' : `${pendingReview.oldestDaysAgo} days ago`}
        </div>
        <div className="ov-kpi-bg-numeral">{pendingReview.count}</div>
      </EditorialCard>

      <EditorialCard>
        <div className="ov-kpi-head">
          <MicroLabel>Active Castings</MicroLabel>
          <StatusMicroPill>{activeCastings.closingToday} closing today</StatusMicroPill>
        </div>
        <StatNumeral value={activeCastings.count} />
        <div className="ov-kpi-dots-row">
          {Array.from({ length: Math.max(activeCastings.count, 1) }).slice(0, 8).map((_, index) => (
            <span
              key={index}
              className={`ov-kpi-dot ${index < activeCastings.closingToday ? 'glow' : ''}`}
            />
          ))}
        </div>
      </EditorialCard>

      <EditorialCard>
        <div className="ov-kpi-head">
          <MicroLabel>Roster Size</MicroLabel>
        </div>
        <StatNumeral value={rosterSize.count} align="center" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="ov-roster-growth-chart" style={{ width: '100%', height: 36 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rosterGrowth.length ? rosterGrowth : [{ value: 0 }]} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="rosterGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C9A55A" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#C9A55A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={['dataMin - 5', 'dataMax + 5']} hide />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#C9A55A"
                  strokeWidth={2.5}
                  fill="url(#rosterGradient)"
                  isAnimationActive={!prefersReducedMotion}
                  animationDuration={1000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <span className="ov-kpi-change positive" style={{ color: '#16a34a', background: 'transparent', padding: 0, fontSize: '0.75rem', alignSelf: 'flex-start' }}>
            ↑ {rosterSize.changeThisMonth} this month
          </span>
        </div>
      </EditorialCard>

      <EditorialCard>
        <div className="ov-kpi-head">
          <MicroLabel>Roster Active</MicroLabel>
        </div>
        <div className="ov-kpi-body--center" style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="ov-placement-hero">
            <div className="ov-placement-halo" />
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="72%"
                outerRadius="90%"
                startAngle={90}
                endAngle={-270}
                data={utilizationData}
                barSize={12}
                style={{ margin: '0 auto' }}
              >
                <RadialBar
                  dataKey="value"
                  cornerRadius={5}
                  isAnimationActive={!prefersReducedMotion}
                />
                <Label
                  value={`${utilization.pct || 0}%`}
                  position="center"
                  style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, fill: '#C9A55A' }}
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <span className="ov-placement-caption" style={{ marginTop: 8, fontSize: '10px', letterSpacing: '0.08em', color: '#9CA3AF' }}>
            OF ROSTER SUBMITTED
          </span>
          <span className="ov-placement-season">
            {utilization.active} of {utilization.total} active in 30 days
          </span>
        </div>
      </EditorialCard>
    </BentoGrid>
  );
}
