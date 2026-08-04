import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import styles from './AuthLayout.module.css';

/**
 * Route-keyed back link shown in the page header — the actual top-left of the
 * page, not the left edge of the centered panel below it. A small lookup, not
 * route data, because both entries point at the same place for the same
 * reason (abandon this step, sign in normally instead) — if a future entry
 * needs different behavior, promote this to route data.
 */
const HEADER_BACK_LINKS = {
  '/login/forgot-password': { to: '/login', label: 'Back to sign in' },
  '/reset-password': { to: '/login', label: 'Back to sign in' },
};

// Only the primary entry point keeps the wordmark. The sub-routes below it
// (forgot-password, reset-password) are quick, single-purpose stops someone
// arrives at with a specific task already in mind, and HEADER_BACK_LINKS
// already gives them an escape hatch — a second top-left element next to it
// added clutter without adding anything a "Back to sign in" doesn't already
// say.
const WORDMARK_ROUTES = new Set(['/login']);

export default function AuthLayout() {
  const location = useLocation();
  const back = HEADER_BACK_LINKS[location.pathname];
  const showWordmark = WORDMARK_ROUTES.has(location.pathname);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        {showWordmark && (
          <Link to="/" className={styles.logo} aria-label="Pholio">
            <span className={styles.logoWord}>PHOLIO</span>
          </Link>
        )}
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
