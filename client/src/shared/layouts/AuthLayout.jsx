import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import styles from './AuthLayout.module.css';

export default function AuthLayout() {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo} aria-label="Pholio">
          <span className={styles.logoWord}>PHOLIO</span>
        </Link>
      </header>

      <main className={styles.main}>
        <div className={styles.panel}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
