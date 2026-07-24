import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { moderationApi } from '../../../shared/lib/moderation-api';
import './ModerationQueuePage.css';

const TABS = [
  { id: 'queue', label: 'Images' },
  { id: 'reports', label: 'Reports' },
  { id: 'csam', label: 'CSAM review' },
];

function formatFlags(flags) {
  if (!flags || typeof flags !== 'object') return '—';
  return Object.entries(flags)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' · ') || '—';
}

export default function ModerationQueuePage() {
  const [tab, setTab] = useState('queue');
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [items, setItems] = useState([]);
  const [reports, setReports] = useState([]);
  const [csamItems, setCsamItems] = useState([]);
  const [actingId, setActingId] = useState(null);
  const [enforceUserId, setEnforceUserId] = useState('');
  const [enforceReason, setEnforceReason] = useState('');

  // Initial data load — all setState calls happen inside async callbacks, not synchronously.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await moderationApi.getMe();
        if (!active) return;
        if (!me?.data?.isModerator) {
          setAllowed(false);
          setLoading(false);
          return;
        }
        setAllowed(true);
        const [queue, reportRows, csam] = await Promise.all([
          moderationApi.getQueue('pending'),
          moderationApi.getReports('pending'),
          moderationApi.getCsamEscalations(),
        ]);
        if (!active) return;
        setItems(queue?.data || []);
        setReports(reportRows?.data || []);
        setCsamItems(csam?.data || []);
      } catch (error) {
        if (!active) return;
        toast.error(error.message || 'Could not load moderation data');
        setAllowed(false);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const handleReview = async (id, action) => {
    setActingId(id);
    try {
      await moderationApi.reviewQueueItem(id, action);
      toast.success(action === 'approve' ? 'Image approved' : 'Image rejected');
      setItems((prev) => prev.filter((row) => row.id !== id));
    } catch (error) {
      toast.error(error.message || 'Action failed');
    } finally {
      setActingId(null);
    }
  };

  const handleReport = async (id, status) => {
    setActingId(id);
    try {
      await moderationApi.updateReport(id, status);
      toast.success(`Report marked ${status}`);
      setReports((prev) => prev.filter((row) => row.id !== id));
    } catch (error) {
      toast.error(error.message || 'Could not update report');
    } finally {
      setActingId(null);
    }
  };

  const handleCsam = async (id, status) => {
    setActingId(id);
    try {
      await moderationApi.updateCsamEscalation(id, status, 'Reviewed in moderation console');
      toast.success(`Escalation marked ${status.replace('_', ' ')}`);
      setCsamItems((prev) => prev.filter((row) => row.id !== id));
    } catch (error) {
      toast.error(error.message || 'Could not update escalation');
    } finally {
      setActingId(null);
    }
  };

  const handleEnforce = async (action) => {
    if (!enforceUserId.trim() || !enforceReason.trim()) {
      toast.error('User ID and reason are required');
      return;
    }
    setActingId('enforce');
    try {
      if (action === 'suspend') {
        await moderationApi.suspendUser(enforceUserId.trim(), enforceReason.trim());
        toast.success('User suspended');
      } else {
        await moderationApi.banUser(enforceUserId.trim(), enforceReason.trim());
        toast.success('User banned');
      }
      setEnforceUserId('');
      setEnforceReason('');
    } catch (error) {
      toast.error(error.message || 'Enforcement failed');
    } finally {
      setActingId(null);
    }
  };

  if (loading) {
    return (
      <div className="mod-page">
        <p className="mod-muted">Loading moderation console…</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mod-page">
        <h1 className="mod-title">Moderation</h1>
        <p className="mod-muted">Access denied. This area is for Pholio moderators only.</p>
      </div>
    );
  }

  return (
    <div className="mod-page">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="mod-header"
      >
        <h1 className="mod-title">Moderation console</h1>
        <p className="mod-lead">
          Review flagged images, user reports, and CSAM escalations. Suspend or ban accounts when
          needed.
        </p>
      </motion.header>

      <div className="mod-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`mod-tab${tab === t.id ? ' mod-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'queue' && (
        items.length === 0 ? (
          <p className="mod-muted">No images awaiting review.</p>
        ) : (
          <ul className="mod-list">
            {items.map((item, index) => (
              <motion.li
                key={item.id}
                className="mod-row"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04, duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="mod-thumb-wrap">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="mod-thumb" />
                  ) : (
                    <div className="mod-thumb mod-thumb--empty">No preview</div>
                  )}
                </div>
                <div className="mod-meta">
                  <p className="mod-meta-line">
                    Submitted {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
                  </p>
                  {item.moderationReason && (
                    <p className="mod-meta-line">Reason: {item.moderationReason}</p>
                  )}
                  <p className="mod-meta-flags">{formatFlags(item.flags)}</p>
                </div>
                <div className="mod-actions">
                  <button
                    type="button"
                    className="mod-btn mod-btn-approve"
                    disabled={actingId === item.id}
                    onClick={() => handleReview(item.id, 'approve')}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="mod-btn mod-btn-reject"
                    disabled={actingId === item.id}
                    onClick={() => handleReview(item.id, 'reject')}
                  >
                    Reject
                  </button>
                </div>
              </motion.li>
            ))}
          </ul>
        )
      )}

      {tab === 'reports' && (
        reports.length === 0 ? (
          <p className="mod-muted">No pending reports.</p>
        ) : (
          <ul className="mod-list">
            {reports.map((report) => (
              <li key={report.id} className="mod-row mod-row--stack">
                <div className="mod-meta">
                  <p className="mod-meta-line">
                    {report.target_type} · {report.target_id}
                  </p>
                  <p className="mod-meta-line">Reason: {report.reason}</p>
                  {report.details && <p className="mod-meta-flags">{report.details}</p>}
                  <p className="mod-meta-line mod-muted">
                    {report.created_at ? new Date(report.created_at).toLocaleString() : '—'}
                  </p>
                </div>
                <div className="mod-actions">
                  <button
                    type="button"
                    className="mod-btn mod-btn-approve"
                    disabled={actingId === report.id}
                    onClick={() => handleReport(report.id, 'actioned')}
                  >
                    Actioned
                  </button>
                  <button
                    type="button"
                    className="mod-btn"
                    disabled={actingId === report.id}
                    onClick={() => handleReport(report.id, 'dismissed')}
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'csam' && (
        csamItems.length === 0 ? (
          <p className="mod-muted">No CSAM escalations awaiting review.</p>
        ) : (
          <ul className="mod-list">
            {csamItems.map((row) => (
              <li key={row.id} className="mod-row mod-row--stack">
                <div className="mod-meta">
                  <p className="mod-meta-line">
                    Severity: {row.severity} · Image {row.imageId}
                  </p>
                  <p className="mod-meta-flags">{formatFlags(row.flags)}</p>
                </div>
                <div className="mod-actions">
                  <button
                    type="button"
                    className="mod-btn"
                    disabled={actingId === row.id}
                    onClick={() => handleCsam(row.id, 'false_positive')}
                  >
                    False positive
                  </button>
                  <button
                    type="button"
                    className="mod-btn mod-btn-approve"
                    disabled={actingId === row.id}
                    onClick={() => handleCsam(row.id, 'cleared')}
                  >
                    Cleared
                  </button>
                  <button
                    type="button"
                    className="mod-btn mod-btn-reject"
                    disabled={actingId === row.id}
                    onClick={() => handleCsam(row.id, 'escalated')}
                  >
                    Escalate
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      <section className="mod-enforce">
        <h2 className="mod-subtitle">Account enforcement</h2>
        <p className="mod-muted">Suspend or ban a user by UUID. Document the reason for audit.</p>
        <div className="mod-enforce-form">
          <input
            type="text"
            className="mod-input"
            placeholder="User ID"
            value={enforceUserId}
            onChange={(e) => setEnforceUserId(e.target.value)}
          />
          <textarea
            className="mod-input mod-textarea"
            placeholder="Reason"
            value={enforceReason}
            onChange={(e) => setEnforceReason(e.target.value)}
            rows={2}
          />
          <div className="mod-actions">
            <button
              type="button"
              className="mod-btn"
              disabled={actingId === 'enforce'}
              onClick={() => handleEnforce('suspend')}
            >
              Suspend
            </button>
            <button
              type="button"
              className="mod-btn mod-btn-reject"
              disabled={actingId === 'enforce'}
              onClick={() => handleEnforce('ban')}
            >
              Ban
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
