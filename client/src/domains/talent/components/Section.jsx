import React from 'react';
import styles from '../pages/ProfilePage/ProfilePage.module.css';

function renderTitle(title, titleEmphasis) {
  if (!titleEmphasis || !title.includes(titleEmphasis)) {
    return <h2 className={styles.sectionTitle}>{title}</h2>;
  }
  const idx = title.indexOf(titleEmphasis);
  const before = title.slice(0, idx);
  const after = title.slice(idx + titleEmphasis.length);
  return (
    <h2 className={styles.sectionTitle}>
      {before}
      <em className={styles.sectionTitleEm}>{titleEmphasis}</em>
      {after}
    </h2>
  );
}

export const Section = ({
  id,
  title,
  titleEmphasis,
  description,
  children,
  showDivider = true,
  headerAction,
}) => (
  <section id={id} className={styles.section}>
    {showDivider && <hr className={styles.sectionDivider} aria-hidden="true" />}
    <div className={styles.sectionHeader}>
      <div className={styles.sectionTitleGroup}>
        {title ? renderTitle(title, titleEmphasis) : null}
        {description && <p className={styles.sectionDescription}>{description}</p>}
      </div>
      {headerAction && <div className={styles.sectionHeaderAction}>{headerAction}</div>}
    </div>
    <div className={styles.sectionBody}>{children}</div>
  </section>
);
