import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Section } from './Section';
import { rise } from './motion';

// The quota window is a UTC month, so its reset day is read in UTC; local time
// would print the evening before for anyone west of Greenwich.
function resetDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Where next: agencies on Pholio you have not submitted to whose published
 * height and age ranges include yours. The range is printed on the row, so
 * the reason a name appears is on the page, not implied.
 */
export default function WhereNext({ next, quota }) {
  const quotaLine =
    quota && Number.isFinite(quota.limit)
      ? `${quota.remaining} of ${quota.limit} submissions left this month. Open-call submissions do not count. Resets ${resetDay(quota.periodEnd)}.`
      : null;

  return (
    <Section
      id="ov-next-heading"
      title="Where"
      accent="next."
      className="ov-next"
      link={{ to: '/dashboard/talent/applications', label: 'All agencies' }}
    >
      <ul className="ov-next-list">
        {next.agencies.map((agency) => (
          <motion.li key={agency.id} variants={rise}>
            <Link to={agency.to} className="ov-next-row">
              <span className="ov-next-name">{agency.name}</span>
              <span className="ov-next-city">{agency.city}</span>
              <span className="ov-next-boards">{agency.boards.join(' · ')}</span>
              <span className="ov-next-range">{agency.range}</span>
              <span className="ov-next-go">
                Start a submission <span aria-hidden>→</span>
              </span>
            </Link>
          </motion.li>
        ))}
      </ul>
      {quotaLine && (
        <motion.p className="ov-next-quota" variants={rise}>
          {quotaLine}
        </motion.p>
      )}
    </Section>
  );
}
