/**
 * The comp card's place in the Book: the saved card, front and back, and the
 * way into the comp card page. Rendered inside MediaWorkspace (.mw-root), so
 * it speaks the Book's section language.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import PholioButton from '../../shared/components/ui/PholioButton';
import { apiClient } from '../../shared/lib/api-client';
import CardPage from '../render/CardPage';
import { fontsReady } from '../render/fonts';
import './entry.css';

const MM_PX = 96 / 25.4;
const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

export default function CompCardEntry() {
  const [card, setCard] = useState(undefined);
  const reduce = useReducedMotion();
  useEffect(() => {
    let alive = true;
    apiClient
      .get('/compcard', { skipRedirect: true })
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
  const scale = 0.42;
  return (
    <section className="mw-section cce" aria-label="Comp card">
      <div className="mw-section__head">
        <h2 className="mw-h2">Comp card</h2>
        <div className="mw-section__aside">
          <PholioButton variant={scene ? 'secondary' : 'primary'} to="/dashboard/talent/comp-card">
            {scene ? 'Open the card' : 'Make your card'}
          </PholioButton>
        </div>
      </div>
      <p className="mw-sub mw-section__blurb">
        {scene ? 'The card agencies receive with your submissions.' : 'Composed from your book, front and back, ready to print or send.'}
      </p>
      {scene && (
        <Link to="/dashboard/talent/comp-card" className="cce-sheets" aria-label="Open the comp card">
          {scene.pages.map((pg, i) => (
            <motion.span
              key={pg.name}
              className="cce-sheet"
              style={{ width: scene.format.w * MM_PX * scale, height: scene.format.h * MM_PX * scale }}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={reduce ? undefined : { y: -6 }}
              transition={{ ...SPRING, delay: reduce ? 0 : i * 0.06 }}
            >
              <span style={{ display: 'block', transform: `scale(${scale})`, transformOrigin: '0 0' }}>
                <CardPage page={pg} format={scene.format} />
              </span>
            </motion.span>
          ))}
        </Link>
      )}
    </section>
  );
}
