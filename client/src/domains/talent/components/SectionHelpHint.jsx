import React from 'react';
import styles from '../pages/ProfilePage/ProfilePage.module.css';

export function SectionHelpHint({ description, hintId }) {
  if (!description) return null;

  const tooltipId = `${hintId}-hint`;

  return (
    <span className={styles.sectionHelpWrap}>
      <button
        type="button"
        className={styles.sectionHelpBtn}
        aria-describedby={tooltipId}
        aria-label="About this section"
      >
        <svg
          className={styles.sectionHelpIcon}
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="5.75" stroke="currentColor" strokeWidth="0.85" />
          <path
            d="M7 6.35V9.15M7 4.85h.01"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <span id={tooltipId} role="tooltip" className={styles.sectionHelpTooltip}>
        {description}
      </span>
    </span>
  );
}
