import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import styles from './AuthLayout.module.css';

/**
 * Route-keyed back link shown beside the wordmark in the page header — the
 * actual top-left of the page, not the left edge of the centered panel below
 * it. A single-entry lookup is deliberate: there is exactly one auth sub-route
 * today (forgot-password). If a second one needs a back link, promote this to
 * route data instead of growing an ad hoc map.
 */
const HEADER_BACK_LINKS = {
  '/login/forgot-password': { to: '/login', label: 'Back to sign in' },
};

export default function AuthLayout() {
  const location = useLocation();
  const back = HEADER_BACK_LINKS[location.pathname];

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo} aria-label="Pholio">
          <span className={styles.logoWord}>PHOLIO</span>
        </Link>
        {back && (
          <Link to={back.to} className={styles.headerBack}>
            <ArrowLeft size={15} />
            <span>{back.label}</span>
          </Link>
        )}
      </header>

      <main className={styles.main}>
        <div className={styles.panel}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
