/**
 * The comp card on the Media page: the saved card itself, and the way into
 * the studio. Renders with the same renderer as the studio and the PDF.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { apiClient } from '../../shared/lib/api-client';
import CardPage from '../render/CardPage';
import { fontsReady } from '../render/fonts';
import './entry.css';

const MM_PX = 96 / 25.4;

export default function CompCardEntry() {
  const [card, setCard] = useState(undefined);
  const reduce = useReducedMotion();
  useEffect(() => {
    let alive = true;
    apiClient
      .get('/compcard')
      .then(async (res) => {
        const p = res.data.profile;
        await fontsReady([p.first_name, p.last_name, p.city, res.data.agency?.name].filter(Boolean).join(' '));
        if (alive) setCard(res.card || null);
      })
      .catch(() => alive && setCard(null));
    return () => {
      alive = false;
    };
  }, []);

  const scene = card?.scene;
  const scale = 0.34;
  return (
    <div className="cce">
      <div className="cce-head">
        <h2 className="cce-title">Comp card</h2>
        <Link className="cce-open" to="/dashboard/talent/comp-card">{scene ? 'Edit card' : 'Make your card'}</Link>
      </div>
      <Link to="/dashboard/talent/comp-card" className="cce-sheets" aria-label="Open comp card">
        {scene ? (
          scene.pages.map((pg, i) => (
            <motion.div
              key={pg.name}
              className="cce-sheet"
              style={{ width: scene.format.w * MM_PX * scale, height: scene.format.h * MM_PX * scale }}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={reduce ? undefined : { y: -4 }}
              transition={{ type: 'spring', stiffness: 55, damping: 16, delay: i * 0.06 }}
            >
              <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
                <CardPage page={pg} format={scene.format} />
              </div>
            </motion.div>
          ))
        ) : (
          <div className="cce-empty">{card === undefined ? '' : 'Pholio composes your card from your photos and measurements.'}</div>
        )}
      </Link>
    </div>
  );
}
