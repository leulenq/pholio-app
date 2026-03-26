import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronDown, Inbox, ArrowUpRight } from 'lucide-react';

import { TalentMatchRing } from '../../components/ui/TalentMatchRing';
import {
  acceptApplication,
  declineApplication,
  shortlistApplication,
} from '../../api/agency';

const STATUS_COLORS = {
  submitted: '#64748b',
  shortlisted: '#0f172a',
  booked: '#10b981',
  passed: '#e2e8f0',
  declined: '#ef4444',
  accepted: '#16a34a',
};

export default function RecentActivity({
  itemVariants,
  displayApplicants,
  submittedCount,
  pulse,
  onInlineAction,
}) {
  return (
    <motion.div className="ov-row-2" variants={itemVariants}>
      <motion.div className="ov-card ov-card--apps">
        <div className="ov-card-header">
          <div className="ov-card-title-group">
            <Inbox size={16} className="ov-card-icon" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 className="ov-card-title">Recent Applications</h2>
              <span className="ov-app-count-badge">{submittedCount}</span>
            </div>
          </div>
          <button className="ov-sort-btn" type="button">
            Newest <ChevronDown size={14} />
          </button>
        </div>

        <div className="ov-app-list">
          {displayApplicants.map((t, idx) => (
            <motion.div
              key={t.id}
              className="ov-app-row"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                to={`/dashboard/agency/inbox?applicationId=${t.id}`}
                className="ov-app-row-link"
                style={{ display: 'contents' }}
              >
                <div className={`ov-app-avatar-wrap ${t.status === 'submitted' ? 'ov-app-avatar-wrap--new' : ''}`}>
                  <img src={t.avatar} alt={t.name} className="ov-app-avatar" />
                  <span className="ov-status-dot" style={{ background: STATUS_COLORS[t.status] }} />
                </div>
                <div className="ov-app-info">
                  <span className="ov-app-name">{t.name}</span>
                  <span className="ov-app-meta">
                    <span className="ov-app-badge ov-badge--editorial">{t.archetypeLabel}</span>
                    {t.city} · {t.applied}
                  </span>
                </div>
                <div className="ov-app-match-col">
                  <TalentMatchRing score={t.match || 0} size="sm" />
                </div>
              </Link>
              <div className="ov-app-quick-actions" onClick={e => e.stopPropagation()}>
                <button
                  className="ov-quick-btn ov-quick-btn--accept"
                  type="button"
                  title="Accept"
                  aria-label="Accept"
                  onClick={() => onInlineAction(t.id, acceptApplication, { status: 'accepted', archetypeLabel: 'Accepted' })}
                >
                  ✓
                </button>
                <button
                  className="ov-quick-btn ov-quick-btn--shortlist"
                  type="button"
                  title="Shortlist"
                  aria-label="Shortlist"
                  onClick={() => onInlineAction(t.id, shortlistApplication, { status: 'shortlisted', archetypeLabel: 'Shortlisted' })}
                >
                  →
                </button>
                <button
                  className="ov-quick-btn ov-quick-btn--decline"
                  type="button"
                  title="Decline"
                  aria-label="Decline"
                  onClick={() => onInlineAction(t.id, declineApplication, { status: 'declined', archetypeLabel: 'Declined' })}
                >
                  ✕
                </button>
              </div>
            </motion.div>
          ))}
          {displayApplicants.length === 0 && (
            <div className="ov-app-row" style={{ cursor: 'default' }}>
              <div className="ov-app-info">
                <span className="ov-app-name">No recent applications yet.</span>
                <span className="ov-app-meta">New submissions will appear here.</span>
              </div>
            </div>
          )}
        </div>

        <Link to="/dashboard/agency/inbox" className="ov-view-all">
          View all applications <ArrowUpRight size={14} />
        </Link>
      </motion.div>

      <motion.div className="ov-promo">
        <div className="ov-promo-particles">
          {[...Array(8)].map((_, i) => (
            <span key={i} className="ov-particle" style={{ '--i': i }} />
          ))}
        </div>
        <div className="ov-promo-content">
          <span className="ov-promo-eyebrow">DISCOVER</span>
          <h3 className="ov-promo-heading">
            {pulse.discoverableCount != null
              ? `${pulse.discoverableCount} profiles ready to discover`
              : 'Explore New Talent'}
          </h3>
          <p className="ov-promo-body">
            {pulse.newTalentWeek != null
              ? `${pulse.newTalentWeek} new talent joined this week. Updated in real time.`
              : 'Browse curated talent from our network. Updated in real time.'}
          </p>
          <Link to="/dashboard/agency/discover" className="ov-promo-cta">
            <span className="ov-cta-text">Discover</span>
            <ArrowUpRight size={14} />
            <span className="ov-cta-shimmer" />
          </Link>
        </div>
        <div className="ov-promo-glow" />
        <div className="ov-promo-glow ov-promo-glow--2" />
        <div className="ov-promo-glow ov-promo-glow--3" />
      </motion.div>
    </motion.div>
  );
}
