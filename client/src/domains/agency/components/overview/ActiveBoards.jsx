import React from 'react';
import { Link } from 'react-router-dom';

function closesLabel(closesAt) {
  if (!closesAt) return null;
  const d = new Date(closesAt);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'closed';
  if (days === 0) return 'closes today';
  if (days === 1) return 'closes tomorrow';
  if (days <= 14) return `closes in ${days}d`;
  return `closes ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export default function ActiveBoards({ boards }) {
  const active = boards.filter((b) => b.is_active !== false).slice(0, 6);
  return (
    <section className="ov-module">
      <div className="ov-module-head">
        <h2 className="ov-module-title">Active Boards</h2>
        <Link to="/dashboard/agency/casting" className="ov-module-link">All boards</Link>
      </div>
      {active.length === 0 ? (
        <div className="ov-empty">No active boards yet.</div>
      ) : (
        <div className="ov-boards">
          {active.map((b) => {
            const closes = closesLabel(b.closes_at);
            const soon = closes && /(today|tomorrow|in [123]d)/.test(closes);
            return (
              <Link key={b.id} to="/dashboard/agency/casting" className="ov-board">
                <div className="ov-board-top">
                  <span className="ov-board-name">{b.name}</span>
                  {closes && <span className={`ov-board-closes${soon ? ' is-soon' : ''}`}>{closes}</span>}
                </div>
                <div className="ov-board-stats">
                  <span><b>{b.submitted_count ?? 0}</b> in review</span>
                  <span><b>{b.booked_count ?? 0}</b> booked</span>
                  <span className="ov-board-total">{b.application_count ?? 0} total</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
