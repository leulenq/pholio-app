import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MARKETING_SITE_URL } from '../lib/logout';
import { getConsent, setConsent } from '../lib/cookie-consent';
import './CookieConsentBanner.css';

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getConsent()) {
      setVisible(true);
    }
  }, []);

  const dismiss = (analytics) => {
    setConsent({ necessary: true, analytics });
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible ? (
        <motion.aside
          role="region"
          aria-label="Cookie consent"
          className="app-cookie-banner"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 55, damping: 16 }}
        >
          <div className="app-cookie-inner">
            <p className="app-cookie-text">
              We use cookies to keep Pholio secure and remember your preferences.
              Read our{' '}
              <a href={`${MARKETING_SITE_URL}/cookies`} target="_blank" rel="noopener noreferrer">
                Cookie Policy
              </a>{' '}
              and{' '}
              <a href={`${MARKETING_SITE_URL}/privacy`} target="_blank" rel="noopener noreferrer">
                Privacy Policy
              </a>
              .
            </p>
            <div className="app-cookie-actions">
              <button type="button" className="app-cookie-btn app-cookie-btn-primary" onClick={() => dismiss(true)}>
                Accept all
              </button>
              <button type="button" className="app-cookie-btn" onClick={() => dismiss(false)}>
                Necessary only
              </button>
              <a className="app-cookie-link" href={`${MARKETING_SITE_URL}/cookies`} target="_blank" rel="noopener noreferrer">
                Manage
              </a>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
