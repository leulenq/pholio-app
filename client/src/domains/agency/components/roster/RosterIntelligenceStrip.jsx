import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Sparkles } from 'lucide-react';
import './RosterIntelligenceStrip.css';

const INTELLIGENCE = [
  {
    id: 'idle-bench',
    type: 'attention',
    title: '3 talents idle 90+ days',
    body: "Marcus Webb, Kofi Mensah, and Tom Bradley haven't been submitted to any board in over 3 months. A targeted outreach window may prevent attrition.",
    cta: 'Review bench',
  },
  {
    id: 'editorial-gap',
    type: 'opportunity',
    title: 'Runway opportunity gap',
    body: 'Isabelle Laurent and Yuki Tanaka match 2 active runway board briefs by profile and measurements. Neither has been submitted yet.',
    cta: 'View matches',
  },
  {
    id: 'profile-gap',
    type: 'growth',
    title: 'Profile gaps limiting discoverability',
    body: 'Chloe Anderson and Alex Chen have incomplete profiles. Completing measurement fields improves placement in semantic casting searches.',
    cta: 'Review profiles',
  },
];

const TYPE_CONFIG = {
  attention:   { accent: '#C0392B', bg: 'rgba(192,57,43,0.035)',  label: 'Attention'   },
  opportunity: { accent: '#C9A55A', bg: 'rgba(201,165,90,0.06)',  label: 'Opportunity' },
  growth:      { accent: '#2D8A56', bg: 'rgba(45,138,86,0.04)',   label: 'Growth'      },
};

export default function RosterIntelligenceStrip() {
  const [open, setOpen] = useState(true);

  return (
    <div className="rs-intel">
      <button className="rs-intel-header" onClick={() => setOpen(o => !o)}>
        <div className="rs-intel-header-left">
          <Sparkles size={12} className="rs-intel-sparkle" />
          <span className="rs-intel-label">Roster Intelligence</span>
          <span className="rs-intel-count">{INTELLIGENCE.length}</span>
        </div>
        <ChevronDown
          size={13}
          className={`rs-intel-chevron${open ? ' rs-intel-chevron--open' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="cards"
            className="rs-intel-cards"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {INTELLIGENCE.map((item, i) => {
              const cfg = TYPE_CONFIG[item.type];
              return (
                <motion.div
                  key={item.id}
                  className="rs-intel-card"
                  style={{ '--card-accent': cfg.accent, '--card-bg': cfg.bg }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.2 }}
                >
                  <div className="rs-intel-card-accent" />
                  <div className="rs-intel-card-body">
                    <span className="rs-intel-card-type">{cfg.label}</span>
                    <span className="rs-intel-card-title">{item.title}</span>
                    <p className="rs-intel-card-text">{item.body}</p>
                    <button className="rs-intel-card-cta">{item.cta} →</button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
