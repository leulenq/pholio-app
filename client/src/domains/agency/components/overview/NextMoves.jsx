import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

export default function NextMoves({ moves }) {
  if (!moves.length) return null;
  return (
    <section className="ov-module">
      <div className="ov-module-head"><h2 className="ov-module-title">Next moves</h2></div>
      <div className="ov-moves">
        {moves.map((m) => (
          <Link key={m.id} to={m.cta.to} className={`ov-move ov-move--${m.tone}`}>
            <span className="ov-move-text">{m.text}</span>
            <span className="ov-move-cta">{m.cta.label} <ArrowUpRight size={12} /></span>
          </Link>
        ))}
      </div>
    </section>
  );
}
