import React from 'react';
import styles from '../pages/ProfilePage/ProfilePage.module.css';

/**
 * Section Component
 * Provides consistent styling for profile form sections
 */
export const Section = ({
  id,
  title,
  description,
  children,
  showDivider = true,
  headerAction
}) => (
  <section id={id} className={styles.section}>
    {showDivider && <hr className={styles.sectionDivider} />}
    <div className={styles.sectionHeader}>
      <div className={styles.sectionTitleGroup}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {description && <p className={styles.sectionDescription}>{description}</p>}
      </div>
      {headerAction && <div className={styles.sectionHeaderAction}>{headerAction}</div>}
    </div>
    {children}
  </section>
);
