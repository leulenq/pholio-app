import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

/**
 * Next moves — the desk's agenda. Each move is a hairline-ruled row in the
 * Overview's own vocabulary: a serif figure, a statement, and the destination
 * it opens. The whole row is the link; tone colors the figure only.
 */
export default function NextMoves({ moves }) {
  return (
    <section className="ov-module">
      <div className="ov-module-head"><h2 className="ov-module-title">Next moves</h2></div>
      {moves.length === 0 && <div className="ov-empty">No moves flagged — you're ahead of the board.</div>}
      <div className="ov-agenda">
        {moves.map((m) => (
          <Link key={m.id} to={m.to} className={`ov-agenda-row ov-agenda-row--${m.tone}`}>
            <span className="ov-agenda-fig">{m.figure}</span>
            <span className="ov-agenda-body">
              <span className="ov-agenda-text">{m.text}</span>
              <span className="ov-agenda-where">{m.where}</span>
            </span>
            <ArrowUpRight className="ov-agenda-go" size={14} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
