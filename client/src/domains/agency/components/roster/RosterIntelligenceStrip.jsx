import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import './RosterIntelligenceStrip.css';

const SIGNALS = [
  {
    id: 'idle-bench',
    type: 'attention',
    title: '3 talents idle 90+ days',
    body: "Marcus Webb, Kofi Mensah, and Tom Bradley haven't been submitted to any board in over 3 months. A targeted outreach window may prevent attrition.",
    cta: 'Review bench',
  },
  {
    id: 'runway-gap',
    type: 'opportunity',
    title: 'Runway opportunity gap',
    body: 'Isabelle Laurent and Yuki Tanaka match 2 active runway board briefs by profile and measurements. Neither has been submitted yet.',
    cta: 'View matches',
  },
  {
    id: 'profile-gap',
    type: 'growth',
    title: 'Profile gaps limiting reach',
    body: 'Chloe Anderson and Alex Chen have incomplete profiles. Completing measurement fields improves placement in semantic casting searches.',
    cta: 'Complete profiles',
  },
];

const TYPE = {
  attention:   { accent: '#C0392B', bg: 'rgba(192,57,43,0.042)',  border: 'rgba(192,57,43,0.14)', label: 'Attention'   },
  opportunity: { accent: '#C9A55A', bg: 'rgba(201,165,90,0.055)', border: 'rgba(201,165,90,0.22)', label: 'Opportunity' },
  growth:      { accent: '#2D8A56', bg: 'rgba(45,138,86,0.042)',  border: 'rgba(45,138,86,0.14)', label: 'Growth'      },
};

export default function RosterIntelligenceStrip() {
  return (
    <div className="rs-intel">
      <div className="rs-intel-header">
        <Sparkles size={11} className="rs-intel-spark" aria-hidden="true" />
        <span className="rs-intel-label">Roster Intelligence</span>
      </div>
      <div className="rs-intel-grid">
        {SIGNALS.map((signal, i) => {
          const cfg = TYPE[signal.type];
          return (
            <motion.div
              key={signal.id}
              className={`rs-signal-card rs-signal-card--${signal.type}`}
              style={{
                '--sig-accent': cfg.accent,
                '--sig-bg':     cfg.bg,
                '--sig-border': cfg.border,
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.09, duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="rs-signal-bar" />
              <div className="rs-signal-content">
                <span className="rs-signal-type">{cfg.label}</span>
                <strong className="rs-signal-title">{signal.title}</strong>
                <p className="rs-signal-text">{signal.body}</p>
                <button className="rs-signal-cta">{signal.cta} →</button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
