import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

import { rise } from './motion';

/**
 * One Overview section: a rule that draws in, a serif title in the Book's
 * grammar ("The *Book.*"), an optional quiet link, and its content rising on
 * a spring as it enters the viewport.
 */
export function Section({ id, title, accent, link, aside, className = '', children }) {
  const reduce = useReducedMotion();
  const ref = React.useRef(null);
  // `animate` (not `whileInView`) so rows that mount after the entrance, once
  // their data lands, inherit the shown state instead of staying hidden.
  const inView = useInView(ref, { once: true, margin: '0px 0px -12% 0px' });
  return (
    <motion.section
      ref={ref}
      className={`ov-sec ${className}`}
      aria-labelledby={id}
      initial={reduce ? false : 'hidden'}
      animate={inView || reduce ? 'shown' : 'hidden'}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.07 } } }}
    >
      <motion.div
        className="ov-sec-rule"
        aria-hidden
        variants={{ hidden: { scaleX: 0 }, shown: { scaleX: 1, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } } }}
      />
      <motion.header className="ov-sec-head" variants={rise}>
        <h2 id={id} className="ov-sec-title">
          {title} <em>{accent}</em>
        </h2>
        {aside}
        {link && (
          <Link to={link.to} className="ov-sec-link">
            {link.label} <ArrowUpRight size={12} aria-hidden />
          </Link>
        )}
      </motion.header>
      {children}
    </motion.section>
  );
}

/** Text link with the talent gold underline sweep. */
export function ActionLink({ to, href, children, className = '' }) {
  const content = (
    <>
      <span className="ov-act-label">{children}</span>
      <span className="ov-act-arrow" aria-hidden>→</span>
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`ov-act ${className}`}>
        {content}
      </a>
    );
  }
  return (
    <Link to={to} className={`ov-act ${className}`}>
      {content}
    </Link>
  );
}
