import React from 'react';
import { motion } from 'framer-motion';
import styles from './MatchScore.module.css';

/**
 * MatchScore Component
 * A premium, radial visualization for talent match percentages.
 * 
 * @param {number} score - The match percentage (0-100)
 * @param {string} size - 'sm', 'md', 'lg' (default: 'md')
 */
const MatchScore = ({ score = 0, size = 'md' }) => {
  const isHighMatch = score >= 90;
  const isMedMatch = score >= 75 && score < 90;

  const sizeClass = styles[`size-${size}`] || styles['size-md'];
  const matchClass = isHighMatch ? styles.highMatch : isMedMatch ? styles.medMatch : styles.lowMatch;

  return (
    <div className={`${styles.container} ${sizeClass} ${matchClass}`}>
      <div className={styles.content}>
        <span className={styles.percentage}>{score}</span>
        <span className={styles.label}>%</span>
      </div>
    </div>
  );
};

export default MatchScore;
