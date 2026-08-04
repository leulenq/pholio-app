import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MARKETING_SITE_URL } from '../lib/logout';
import { getConsent, setConsent, onConsentChange } from '../lib/cookie-consent';
import PholioButton from './ui/PholioButton';
import './CookieConsentBanner.css';

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(() => !getConsent());

  // Withdrawing consent (the "Cookie preferences" control, here or in Settings)
  // deletes the record and re-raises this banner, so withdrawal is no harder
  // than granting.
  useEffect(() => onConsentChange(() => setVisible(!getConsent())), []);

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
              We use cookies to keep Pholio secure, remember your preferences, and
              understand how the platform is used. Read our{' '}
              <a href={`${MARKETING_SITE_URL}/cookies`} target="_blank" rel="noopener noreferrer">
                Cookie Policy
              </a>{' '}
              and{' '}
              <a href={`${MARKETING_SITE_URL}/privacy`} target="_blank" rel="noopener noreferrer">
                Privacy Policy
              </a>{' '}
              for details.
            </p>
            <div className="app-cookie-actions">
              <PholioButton type="button" variant="primary" className="app-cookie-btn app-cookie-btn-primary" onClick={() => dismiss(true)}>
                Accept all
              </PholioButton>
              <PholioButton type="button" variant="secondary" className="app-cookie-btn" onClick={() => dismiss(false)}>
                Necessary only
              </PholioButton>
              {/* Jumps straight to the "Change your choice" control on
                  /cookies, not just the top of the policy page above it. */}
              <PholioButton as="a" variant="meta" className="app-cookie-link" href={`${MARKETING_SITE_URL}/cookies#preferences`} target="_blank" rel="noopener noreferrer">
                Manage
              </PholioButton>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
