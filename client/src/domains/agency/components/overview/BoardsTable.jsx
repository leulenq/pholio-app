import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

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

// The cross-board work surface: every active board with its live pipeline.
export default function BoardsTable({ boards, stages = [] }) {
  const rows = boards.filter((b) => b.is_active !== false);
  const funnelTotal = stages.reduce((s, x) => s + x.count, 0);

  return (
    <section className="ov-module">
      <div className="ov-module-head">
        <h2 className="ov-module-title">Boards{rows.length ? <span className="ov-module-count">{rows.length}</span> : null}</h2>
        <Link to="/dashboard/agency/casting" className="ov-module-link">Manage all</Link>
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
        <div className="ov-empty">No active boards yet — create one to start casting across your roster.</div>
      ) : (
        <div className="ov-table" role="table">
          <div className="ov-tr ov-tr--head" role="row">
            <span role="columnheader">Board</span>
            <span role="columnheader">Closes</span>
            <span role="columnheader" className="ov-td-r">In review</span>
            <span role="columnheader" className="ov-td-r">Booked</span>
            <span role="columnheader" className="ov-td-r">Total</span>
            <span role="columnheader">Pipeline</span>
            <span role="columnheader" aria-label="Open" />
          </div>
          {rows.map((b) => {
            const total = b.application_count ?? 0;
            const inReview = b.submitted_count ?? 0;
            const booked = b.booked_count ?? 0;
            const rest = Math.max(0, total - inReview - booked);
            const c = closesLabel(b.closes_at);
            const soon = c && /(today|tomorrow|^[123]d$)/.test(c);
            return (
              <Link key={b.id} to="/dashboard/agency/casting" className="ov-tr" role="row">
                <span className="ov-td-name">{b.name}</span>
                <span className={`ov-td-closes${soon ? ' is-soon' : ''}`}>{c || '—'}</span>
                <span className="ov-td-num ov-td-r">{inReview}</span>
                <span className="ov-td-num ov-td-r">{booked}</span>
                <span className="ov-td-num ov-td-muted ov-td-r">{total}</span>
                <span className="ov-minibar">
                  {total > 0 && (
                    <>
                      <i style={{ width: `${(inReview / total) * 100}%`, background: '#C9A55A' }} />
                      <i style={{ width: `${(booked / total) * 100}%`, background: '#7d9b82' }} />
                      <i style={{ width: `${(rest / total) * 100}%`, background: '#d8cfbb' }} />
                    </>
                  )}
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
