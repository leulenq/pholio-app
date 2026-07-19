import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

const BOARD_STAGE_LABELS = {
  submitted: 'Submitted',
  pending: 'Submitted',
  shortlisted: 'Shortlisted',
  requested_more: 'Shortlisted',
  meeting_requested: 'Shortlisted',
  development: 'New Face — Development',
  accepted: 'Signed',
  represented: 'Represented',
  booked: 'Represented',
  passed: 'Passed',
  declined: 'Declined',
  archived: 'Passed',
};

function closesLabel(closesAt) {
  if (!closesAt) return null;
  const d = new Date(closesAt);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'closed';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 14) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function boardStageMix(board, stages) {
  const counts = new Map();
  (board.pipeline_counts || []).forEach(({ status, count }) => {
    const label = BOARD_STAGE_LABELS[String(status || '').toLowerCase()];
    if (!label) return;
    counts.set(label, (counts.get(label) || 0) + (Number(count) || 0));
  });

  return stages
    .map((stage) => ({ ...stage, count: counts.get(stage.label) || 0 }))
    .filter((stage) => stage.count > 0);
}

// The cross-board work surface: every active board with its live pipeline.
export default function BoardsTable({ boards, stages = [] }) {
  const rows = boards.filter((b) => b.is_active !== false);
  const funnelTotal = stages.reduce((s, x) => s + x.count, 0);

  return (
    <section className="ov-module">
      <div className="ov-module-head">
        <h2 className="ov-module-title">Boards</h2>
        <Link to="/dashboard/agency/signing" className="ov-module-link">Manage all</Link>
      </div>

      {funnelTotal > 0 && (
        <div className="ov-funnel">
          <div className="ov-funnel-bar">
            {stages.map((s) => (
              <span key={s.label} style={{ width: `${(s.count / funnelTotal) * 100}%`, background: s.color }} title={`${s.label}: ${s.count}`} />
            ))}
          </div>
          <div className="ov-funnel-legend">
            {stages.map((s) => <span key={s.label}>{s.label} · {s.count}</span>)}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="ov-empty">No active signing boards yet.</div>
      ) : (
        <div className="ov-table" role="table">
          <div className="ov-tr ov-tr--head" role="row">
            <span role="columnheader">Board</span>
            <span role="columnheader">Closes</span>
            <span role="columnheader" className="ov-td-r">In review</span>
            <span role="columnheader" className="ov-td-r">Represented</span>
            <span role="columnheader" className="ov-td-r">Total</span>
            <span role="columnheader" className="ov-td-r">Stage mix</span>
            <span role="columnheader" aria-label="Open" />
          </div>
          {rows.map((b) => {
            const total = b.application_count ?? 0;
            const inReview = b.submitted_count ?? 0;
            const booked = b.booked_count ?? 0;
            const c = closesLabel(b.closes_at);
            const soon = c && /(today|tomorrow|^[123]d$)/.test(c);
            const stageMix = boardStageMix(b, stages);
            const stageTotal = stageMix.reduce((sum, stage) => sum + stage.count, 0);
            const stageSummary = stageMix.map((stage) => `${stage.label}: ${stage.count}`).join(' · ');
            return (
              <Link key={b.id} to="/dashboard/agency/signing" className="ov-tr" role="row">
                <span className="ov-td-board">
                  <span className="ov-td-name">{b.name}</span>
                </span>
                <span className={`ov-td-closes${soon ? ' is-soon' : ''}`}>{c || '—'}</span>
                <span className="ov-td-num ov-td-r">{inReview}</span>
                <span className="ov-td-num ov-td-r">{booked}</span>
                <span className="ov-td-num ov-td-muted ov-td-r">{total}</span>
                <span
                  className="ov-stage-mix"
                  title={stageSummary || 'No submissions in pipeline'}
                  aria-label={stageSummary || 'No submissions in pipeline'}
                  role="img"
                >
                  {stageTotal > 0
                    ? stageMix.map((stage) => (
                      <i
                        key={stage.label}
                        style={{ width: `${(stage.count / stageTotal) * 100}%`, background: stage.color }}
                      />
                    ))
                    : <i className="is-empty" />}
                </span>
                <span className="ov-td-open"><ArrowUpRight size={14} /></span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
