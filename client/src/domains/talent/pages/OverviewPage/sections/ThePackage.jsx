import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { SPRING } from './motion';

const item = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: SPRING },
};

/**
 * The Package: what an agency receives when you submit, read as one plate.
 * Name and stats in convention order, then each material with its state.
 * It replaces a readiness score with the thing the score was about.
 */
export default function ThePackage({ pkg, loading }) {
  const reduce = useReducedMotion();
  return (
    <motion.aside
      className="ov-pkg"
      aria-labelledby="ov-pkg-heading"
      initial={reduce ? false : 'hidden'}
      animate="shown"
      variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.06, delayChildren: 0.2 } } }}
    >
      <motion.div className="ov-pkg-header" variants={item}>
        <h2 id="ov-pkg-heading" className="ov-book-title-text">
          The <em>Package.</em>
        </h2>
        <span className="ov-book-count">What agencies receive</span>
      </motion.div>

      <motion.div className="ov-pkg-plate" variants={item}>
        {loading ? (
          <span className="ov-skel ov-skel--name-sm" aria-hidden />
        ) : (
          <>
            <p className="ov-pkg-name">{pkg.name || 'Your name'}</p>
            {pkg.stats.length > 0 ? (
              <p className="ov-pkg-stats">
                {pkg.stats.map((stat) => (
                  <span key={stat.key} title={stat.hint}>
                    {stat.value}
                  </span>
                ))}
              </p>
            ) : (
              <Link to="/dashboard/talent/profile?tab=appearance" className="ov-pkg-stats ov-pkg-stats--absent">
                Add your stats
              </Link>
            )}
            {pkg.city && <p className="ov-pkg-city">{pkg.city}</p>}
          </>
        )}
      </motion.div>

      <dl className="ov-pkg-lines">
        {pkg.lines.map((line) => (
          <motion.div key={line.key} className={`ov-pkg-line ov-pkg-line--${line.tone}`} variants={item}>
            <dt className="ov-pkg-term">{line.term}</dt>
            <dd className="ov-pkg-reading">
              {line.href ? (
                <a href={line.href} target="_blank" rel="noopener noreferrer" className="ov-pkg-site">
                  {line.reading} <ArrowUpRight size={11} aria-hidden />
                </a>
              ) : (
                <Link to={line.to} className="ov-pkg-value">
                  <span>{line.reading}</span>
                  <span className="ov-pkg-go">{line.action}</span>
                </Link>
              )}
              {line.note && (
                <Link to={line.noteTo} className="ov-pkg-note">
                  {line.note}
                </Link>
              )}
            </dd>
          </motion.div>
        ))}
      </dl>
    </motion.aside>
  );
}
