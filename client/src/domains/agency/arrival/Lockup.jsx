import React, { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { nameScale, resolveAssetUrl } from './model';

const EASE_OUT = [0.16, 1, 0.3, 1];
const DOCK = { type: 'spring', stiffness: 55, damping: 16, mass: 1 };
const DOCK_INSET = { x: 28, y: 24 };
const DOCKED_NAME_PX = 19;

/**
 * PHOLIO | AGENCY.
 *
 * One element for the whole first run. At the opening a line of light draws
 * itself and both names are born out of it, Pholio to the left, the agency
 * to the right. When the questions begin the same lockup docks into the
 * corner and stays there, renaming itself as the agency edits its name and
 * taking the agency's mark the moment one is placed. On the way out it
 * returns to the centre, the names withdraw, and the line becomes the seam
 * the stage opens along.
 *
 * The lockup is laid out once at full size and moved as a single transform,
 * so the type never reflows mid-flight.
 */
export default function Lockup({ phase, name, logoPath, animateIn, reduceMotion }) {
  const docked = phase === 'docked';
  const leaving = phase === 'leaving';
  const opening = phase === 'opening';
  const at = (seconds) => (reduceMotion || !animateIn ? 0 : seconds);
  const logo = resolveAssetUrl(logoPath);
  const ref = useRef(null);
  const nameRef = useRef(null);
  const [box, setBox] = useState(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const namePx = parseFloat(window.getComputedStyle(nameRef.current).fontSize) || 60;
      const rule = el.querySelector('.arv-rule-box');
      setBox({
        w: el.offsetWidth,
        h: el.offsetHeight,
        ruleX: rule ? rule.offsetLeft + rule.offsetWidth / 2 : el.offsetWidth / 2,
        vw: window.innerWidth,
        vh: window.innerHeight,
        dockScale: Math.min(0.6, DOCKED_NAME_PX / namePx),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // The pair is centred as one composition. On the way out the rule moves to
  // the exact centre line, because that is where the stage splits.
  let target = { x: 0, y: 0, scale: 1, opacity: 0 };
  if (box) {
    target = docked
      ? { x: DOCK_INSET.x, y: DOCK_INSET.y, scale: box.dockScale, opacity: 1 }
      : leaving
        ? { x: box.vw / 2 - box.ruleX, y: (box.vh - box.h) / 2, scale: 1, opacity: 1 }
        : // The pair is the subject of the opening: centred, a little above
          // the middle so the verdict can sit beneath it.
          { x: (box.vw - box.w) / 2, y: box.vh * 0.42 - box.h / 2, scale: 1, opacity: 1 };
  }
  const wordsOut = leaving ? { opacity: 0, filter: 'blur(8px)' } : { opacity: 1, filter: 'blur(0px)' };

  return (
    <motion.div
      ref={ref}
      className={`arv-lockup${docked ? ' is-docked' : ''}${leaving ? ' is-leaving' : ''}`}
      style={{ '--arv-name-scale': nameScale(name), originX: 0, originY: 0 }}
      aria-label={`Pholio and ${name}`}
      role="img"
      initial={false}
      animate={target}
      transition={box ? { ...DOCK, opacity: { duration: 0 } } : { duration: 0 }}
    >
      <motion.span className="arv-lockup-side arv-lockup-side--pholio" animate={wordsOut} transition={{ duration: 0.5 }}>
        <motion.span
          className="arv-word arv-word--pholio"
          initial={animateIn ? { x: '108%', letterSpacing: '0.7em' } : false}
          animate={{ x: 0, letterSpacing: '0.18em' }}
          transition={{ delay: at(1.05), duration: reduceMotion ? 0.01 : 1.6, ease: EASE_OUT }}
        >
          PHOLIO
        </motion.span>
      </motion.span>

      <span className="arv-rule-box">
        <motion.span
          className="arv-rule"
          initial={animateIn ? { scaleY: 0, opacity: 0 } : false}
          animate={{ scaleY: leaving ? 40 : 1, opacity: leaving ? [1, 1, 0] : 1 }}
          transition={{
            scaleY: { delay: leaving ? 0.1 : at(0.2), duration: reduceMotion ? 0.01 : leaving ? 0.8 : 0.95, ease: [0.65, 0, 0.35, 1] },
            opacity: leaving ? { duration: 1.7, times: [0, 0.7, 1] } : { delay: at(0.2), duration: 0.3 },
          }}
        />
        <motion.span
          className="arv-rule-flare"
          initial={{ opacity: 0 }}
          animate={{ opacity: docked ? 0 : leaving ? [0.4, 1, 0] : [0, 1, 0.35] }}
          transition={{ delay: leaving ? 0 : at(0.3), duration: reduceMotion ? 0.01 : leaving ? 1.6 : 2.2, times: [0, 0.35, 1] }}
        />
      </span>

      <motion.span className="arv-lockup-side arv-lockup-side--agency" animate={wordsOut} transition={{ duration: 0.5 }}>
        <motion.span
          className="arv-word arv-word--agency"
          initial={animateIn ? { x: '-104%' } : false}
          animate={{ x: 0 }}
          transition={{ delay: at(1.15), duration: reduceMotion ? 0.01 : 1.7, ease: EASE_OUT }}
        >
          {/* The opening is the two names alone; the mark joins once docked. */}
          {logo && !opening ? (
            <motion.img
              key={logo}
              src={logo}
              alt=""
              className="arv-mark"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 55, damping: 16, delay: 0.5 }}
            />
          ) : null}
          <span ref={nameRef} className="arv-word-name">
            {name}
          </span>
        </motion.span>
      </motion.span>
    </motion.div>
  );
}
