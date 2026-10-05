import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Section } from './Section';
import { rise } from './motion';

/**
 * This week: seven days from today, set like a call sheet. Only dated facts
 * land here (open-call hours, answer-by times, event days, review windows
 * closing, digitals leaving the current window). Days with nothing stay
 * blank; a week with nothing at all is not rendered by the page.
 */
export default function ThisWeek({ week }) {
  return (
    <Section
      id="ov-week-heading"
      title="This"
      accent="week."
      className="ov-week"
      link={{ to: '/dashboard/talent/open-calls', label: 'All open calls' }}
    >
      <ol className="ov-week-grid">
        {week.days.map((day) => (
          <motion.li
            key={day.key}
            className={`ov-week-day${day.isToday ? ' ov-week-day--today' : ''}${day.entries.length ? '' : ' ov-week-day--empty'}`}
            variants={rise}
          >
            <p className="ov-week-date">
              <span className="ov-week-num">{day.date}</span>
              <span className="ov-week-name">{day.isToday ? 'Today' : day.weekday}</span>
            </p>
            {day.entries.length > 0 && (
              <ul className="ov-week-entries">
                {day.entries.map((entry) => (
                  <li key={entry.key}>
                    <Link to={entry.to} className={`ov-week-entry${entry.strong ? ' ov-week-entry--strong' : ''}`}>
                      <span className="ov-week-title">{entry.title}</span>
                      {entry.detail && <span className="ov-week-detail">{entry.detail}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </motion.li>
        ))}
      </ol>
    </Section>
  );
}
